// Sale comps from county recorded sales (public record) + lease comps, listings and flyer data you enter.
// Public-record rows and broker-entered rows are always labeled separately. Nothing is scraped.
import { $, $$, esc, fmt, kmoney, today, uid, toast, download, toCSV } from './util.js';
import { S, save, remove, val, setting } from './store.js';
import { MARKET } from './markets.js';
const enc = encodeURIComponent, g = q => `https://www.google.com/search?q=${enc(q)}`;
export const SRC_PUB = '<span class="conf c-pub" title="County recorded sale (assessor sales data)">Public record</span>';
export const SRC_YOU = '<span class="conf c-brk" title="Entered or imported by you">You entered</span>';
const med = a => { const s = a.filter(x => x > 0).sort((x, y) => x - y); if (!s.length) return 0; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const median = med;
const miles = (a, b, c, d) => { const R = 3958.8, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
// One comp per recorded sale: parcels sharing date + price + buyer are combined (multi-parcel sales).
let cc = { v: -1, x: [] };
export function saleComps() {
  if (cc.v === S.version) return cc.x;
  const grp = new Map(), since = String(new Date().getFullYear() - setting('compYears', 7));
  for (const p of S.props) {
    if (!p.sp || !p.sd || p.sd < since || p.sp < 50000) continue;
    const k = [p.sd, p.sp, p.buyer || p.id].join('|'); let c = grp.get(k);
    if (!c) { c = { id: 'sc_' + p.id, src: 'public', d: p.sd, price: p.sp, buyer: p.buyer || '', seller: p.seller || '', deed: p.sdt || '', props: [], sf: 0, lsf: 0, snp: p.snp || 1, lat: p.lat, lon: p.lon, co: p.co, city: val(p, 'city') || p.muni || '' }; grp.set(k, c); }
    c.props.push(p); c.sf += +val(p, 'bldgSf') || 0; c.lsf += +val(p, 'landSf') || 0;
  }
  const out = [...grp.values()].map(c => { const p = c.props[0]; c.addr = val(p, 'address') + (c.props.length > 1 ? ` (+${c.props.length - 1} parcels)` : ''); c.pid = p.id;
    c.partial = c.snp > c.props.length; c.qc = /QUIT/i.test(c.deed);
    c.psf = c.sf && !c.partial ? c.price / c.sf : 0; c.plsf = c.lsf && !c.partial ? c.price / c.lsf : 0;
    c.flag = c.partial ? `Sale covered ${c.snp} parcels; only ${c.props.length} industrial in data, so $/SF not computed` : c.qc ? 'Quit-claim deed: often not an arm’s-length price' : ''; return c; });
  for (const b of S.comps.values()) if (b.kind === 'sale' && b.price) { const p = b.propertyId && S.prop.get(b.propertyId); out.push({ id: b.id, src: 'broker', d: b.date || '', price: +b.price, buyer: b.buyer || '', seller: b.seller || '', addr: b.address || (p ? val(p, 'address') : ''), city: b.city || (p ? val(p, 'city') : ''), co: p ? p.co : b.county || '', pid: b.propertyId || '', sf: +b.sf || 0, lsf: (+b.acres || 0) * 43560, psf: +b.sf ? +b.price / +b.sf : 0, plsf: 0, lat: p?.lat, lon: p?.lon, flag: b.notes || '' }); }
  out.sort((a, b) => b.d.localeCompare(a.d)); cc = { v: S.version, x: out }; return out;
}
export function leaseComps() { return [...S.comps.values()].filter(c => c.kind === 'lease').sort((a, b) => (b.date || '').localeCompare(a.date || '')); }
export function listings() { return [...S.comps.values()].filter(c => c.kind === 'listing').sort((a, b) => (b.date || '').localeCompare(a.date || '')); }
// Nearby recent sales of similar type and size (widens the radius until it finds enough)
export function nearbySales(p, n = 8) {
  if (!p.lat) return [];
  const sf = +val(p, 'bldgSf') || 0, land = !sf;
  const all = saleComps().filter(c => c.pid !== p.id && c.lat && !c.qc && !c.partial && (land ? !c.sf || c.plsf : c.sf && c.sf >= sf / 4 && c.sf <= sf * 4));
  for (const r of [2, 4, 8, 15]) { const x = all.map(c => ({ ...c, mi: miles(p.lat, p.lon, c.lat, c.lon) })).filter(c => c.mi <= r); if (x.length >= n || r === 15) return x.sort((a, b) => a.mi - b.mi).slice(0, n); }
  return [];
}
export function nearbyLease(p, n = 6) { if (!p.lat) return []; return leaseComps().map(c => { const q = c.propertyId && S.prop.get(c.propertyId); return { ...c, mi: q && q.lat ? miles(p.lat, p.lon, q.lat, q.lon) : 99 }; }).filter(c => c.mi <= 10).sort((a, b) => a.mi - b.mi).slice(0, n); }
// One-click manual listing checks (Google site: searches, no scraping)
export function listingLinks(p) {
  const a = val(p, 'address') || '', c = val(p, 'city') || '', q = `"${a}" ${c}`;
  return [['LoopNet', g(`site:loopnet.com ${q}`)], ['Crexi', g(`site:crexi.com ${q}`)], ['CoStar / Showcase (public)', g(`(site:costar.com OR site:showcase.com OR site:officespace.com) ${q}`)],
    ['“For sale”', g(`${q} IL industrial "for sale"`)], ['“For lease”', g(`${q} IL industrial "for lease" OR "for rent"`)], ['Broker flyers (PDF)', g(`${q} filetype:pdf`)]];
}
// Paste-a-flyer parser: pulls common industrial specs out of brochure text. You confirm before anything is saved.
export function parseFlyer(t) {
  const T = t.replace(/\u00a0/g, ' '), n = s => +String(s).replace(/[,$\s]/g, '');
  const pick = (re, f = n) => { const m = T.match(re); return m ? f(m[1]) : undefined; };
  const out = {
    bldgSf: pick(/([\d,]{4,})\s*(?:±|\+\/-)?\s*(?:total\s*)?(?:sq\.?\s*ft|square\s*feet|sf)\b(?!\s*(?:office|land|lot))/i) ?? pick(/(?:building|total|bldg)\s*(?:size|area|sf)?\s*[:\-]?\s*([\d,]{4,})/i),
    officeSf: pick(/office[^\d\n]{0,25}([\d,]{3,})\s*(?:sf|sq)/i) ?? pick(/([\d,]{3,})\s*(?:sf|sq\.?\s*ft)\s*(?:of\s*)?office/i),
    landSf: (() => { const ac = pick(/([\d.]+)\s*(?:±\s*)?acres?/i); return ac ? Math.round(ac * 43560) : pick(/(?:land|lot|site)[^\d\n]{0,20}([\d,]{5,})\s*(?:sf|sq)/i); })(),
    clearHeight: pick(/([\d.]+)\s*(?:'|’|ft|feet)?\s*(?:minimum\s*)?clear/i) ?? pick(/clear\s*(?:height|ht)?\s*[:\-]?\s*([\d.]+)/i),
    docks: pick(/(\d+)\s*(?:exterior\s*|interior\s*)?(?:dock|loading dock)/i) ?? pick(/docks?\s*[:\-]?\s*(\d+)/i),
    driveIns: pick(/(\d+)\s*(?:drive[\s-]*in|DID|grade[\s-]*level)/i),
    yearBuilt: pick(/(?:built|year built|constructed)\s*(?:in)?\s*[:\-]?\s*((?:19|20)\d\d)/i),
    askingPrice: pick(/(?:asking|sale|list|offering)\s*price\s*[:\-]?\s*\$?\s*([\d,.]+\s*(?:m|mm|million)?)/i, s => /m/i.test(s) ? Math.round(parseFloat(s) * 1e6) : n(s)),
    askingRent: pick(/\$\s*([\d.]+)\s*(?:\/|per)\s*(?:sf|sq|psf)/i),
    zoning: pick(/zon(?:ing|ed)\s*[:\-]?\s*([A-Z]{1,3}-?\d?[A-Z]?)/i, s => s),
    power: pick(/([\d,]+\s*amps?[^\n,;]{0,20})/i, s => s.trim()),
  };
  Object.keys(out).forEach(k => (out[k] === undefined || Number.isNaN(out[k])) && delete out[k]);
  return out;
}
