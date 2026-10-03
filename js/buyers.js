// Buyer profiles from public sales already in the data (IL PTAX-203 / county sales: last deed buyer, date, price per parcel).
import { S, val } from './store.js';
import { deal, scoreOf } from './scoring.js';
import { normEnt, isLandTrust } from './trueowner.js';
import { nc } from './extras.js';
import { AREAS } from './ask.js';
import { esc, kmoney, fmt, today, daysBetween } from './util.js';

export const BUYER_YEARS = 5;
const NON_BUYER = /\b(CITY OF|VILLAGE OF|COUNTY OF|STATE OF|UNITED STATES|SECRETARY OF|HUD|FEDERAL NATIONAL|FANNIE|FREDDIE|BANK|SHERIFF|JUDICIAL|RECEIVER|SCHOOL|DISTRICT|AUTHORITY|UNKNOWN|NOT AVAILABLE|NONE)\b/;
// Grouping key: normalized entity name without a trailing entity suffix ("ABC Holdings, L.L.C." = "ABC HOLDINGS LLC" = "ABC Holdings")
const stripTail = n => String(n || '').replace(/\s+C\/O\b.*$/i, '').replace(/,?\s+(A|AN)\s+[A-Z ]*(LIMITED LIABILITY COMPANY|CORPORATION|LIMITED PARTNERSHIP|COMPANY)\b.*$/i, '').replace(/[\s,]+$/, '');
export const buyerKey = n => normEnt(stripTail(n)).replace(/\s+(LLC|INC|CORP|CO|LP|LLP|LTD|L L C)$/, '').trim();
const areaOf = city => { const c = String(city || '').toLowerCase(); for (const [a, [, towns]] of Object.entries(AREAS)) if (towns.some(t => t.toLowerCase() === c)) return a; return ''; };
const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
let cache = null;
export function buyerProfiles() {
  if (cache && cache.v === S.version && cache.n === S.props.length) return cache.list;
  const cut = String(new Date().getFullYear() - BUYER_YEARS) + today().slice(4), by = new Map();
  for (const p of S.props) {
    const b = String(val(p, 'lastBuyer') || '').trim(), sd = String(val(p, 'lastSaleDate') || ''), sp = +val(p, 'lastSalePrice') || 0;
    if (!b || !sd || sd < cut || NON_BUYER.test(b.toUpperCase()) || isLandTrust(b) || /\b(TITLE|TRUST CO|TRUSTEE)\b/i.test(b)) continue; // land-trust trustees hide the real buyer
    const k = buyerKey(b); if (!k || k.length < 3) continue;
    const g = by.get(k) || { key: k, names: new Map(), tx: new Map() }; g.names.set(b.toUpperCase(), (g.names.get(b.toUpperCase()) || 0) + 1);
    // one buyer + one recording date = one purchase (portfolio / multi-parcel deeds); distinct prices that day are summed, repeated ones counted once
    const t = g.tx.get(sd) || { sd, sp: 0, prices: new Set(), sf: 0, ac: 0, props: [] }; const d = deal(p), r = Math.round(sp);
    if (r > 0 && !t.prices.has(r)) { t.prices.add(r); t.sp += r; } t.sf += d.sf || 0; t.ac += d.acres || 0; t.props.push(p); g.tx.set(sd, t); by.set(k, g);
  }
  const list = [];
  for (const g of by.values()) {
    const tx = [...g.tx.values()].sort((a, b) => b.sd.localeCompare(a.sd)), sizes = tx.map(t => t.sf).filter(x => x > 0), prices = tx.map(t => t.sp).filter(x => x > 0);
    const psf = tx.filter(t => t.props.length === 1 && t.sf > 0 && t.sp > 0).map(t => t.sp / t.sf).filter(x => x >= 5 && x <= 1000);
    const cities = new Map(), areas = new Map(), counties = new Map();
    for (const t of tx) { const p = t.props[0], c = nc(val(p, 'city') || val(p, 'municipality') || ''), a = areaOf(val(p, 'city')); if (c) cities.set(c, (cities.get(c) || 0) + 1); if (a) areas.set(a, (areas.get(a) || 0) + 1); counties.set(p.co, (counties.get(p.co) || 0) + 1); }
    const top = m => [...m.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const name = stripTail([...g.names.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]);
    list.push({ key: g.key, name: nc(name), variants: [...g.names.keys()].map(nc), n: tx.length, total: prices.reduce((a, b) => a + b, 0), sfMin: sizes.length ? Math.min(...sizes) : 0, sfMax: sizes.length ? Math.max(...sizes) : 0,
      sfLo: pct(sizes, .1), sfHi: pct(sizes, .9), pMin: prices.length ? Math.min(...prices) : 0, pMax: prices.length ? Math.max(...prices) : 0, psf: pct(psf, .5), cities: top(cities), areas: top(areas), counties: top(counties), latest: tx[0], tx, np: tx.reduce((a, t) => a + t.props.length, 0) });
  }
  list.sort((a, b) => b.total - a.total || b.n - a.n);
  cache = { v: S.version, n: S.props.length, list }; return list;
}
export const sizeRange = b => b.sfMin ? (b.n >= 5 && b.sfLo ? `${fmt(Math.round(b.sfLo / 1000))}k–${fmt(Math.round(b.sfHi / 1000))}k SF` : b.sfMin === b.sfMax ? `${fmt(Math.round(b.sfMin / 1000))}k SF` : `${fmt(Math.round(b.sfMin / 1000))}k–${fmt(Math.round(b.sfMax / 1000))}k SF`) : 'land / unknown size';
// "Likely buyers for this building": repeat buyers whose past purchases fit this property's size, price and area
export function likelyBuyers(p, k = 5) {
  const d = deal(p), sf = d.sf || 0, v = d.value || 0, city = nc(val(p, 'city') || ''), area = areaOf(val(p, 'city')), co = p.co;
  const mine = new Set([buyerKey(val(p, 'taxpayer')), buyerKey(val(p, 'lastBuyer')), p.ownerId && buyerKey(S.owners.get(p.ownerId)?.name)].filter(Boolean));
  const fit = (x, lo, hi) => !x || !lo ? .3 : x >= lo * .6 && x <= hi * 1.5 ? 1 : x >= lo * .35 && x <= hi * 2.5 ? .35 : 0;
  const out = [];
  for (const b of buyerProfiles()) {
    if (b.n < 2 || mine.has(b.key)) continue;
    const fs = fit(sf, b.sfLo || b.sfMin, b.sfHi || b.sfMax), fv = fit(v, b.pMin, b.pMax);
    const fa = city && b.cities.includes(city) ? 1 : area && b.areas.includes(area) ? .7 : b.counties.includes(co) ? .35 : 0;
    if (fs === 0 || fa === 0 || (fa < .5 && co === 'Cook')) continue; // Cook is too big for a county-only match
    const days = daysBetween(b.latest.sd, today()), rec = days <= 365 ? 1 : days <= 730 ? .6 : .3;
    const s = 35 * fs + 20 * fv + 25 * fa + 12 * Math.min(1, (b.n - 1) / 3) + 8 * rec;
    const where = fa === 1 ? `bought in ${city}` : fa > .5 ? `active in ${area}` : `active in ${co} County`;
    out.push({ b, s: Math.round(s), why: `${b.n} purchases${b.np > b.n ? ` (${b.np} parcels)` : ''} since ${b.tx[b.tx.length - 1].sd.slice(0, 4)} · ${sizeRange(b)} · ${where} · latest ${b.latest.sd}` });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, k);
}
export const likelyBuyersHTML = p => { const L = likelyBuyers(p); return L.length ? `<ul class="why lb">${L.map(x => `<li><b>${esc(x.b.name)}</b> <span class="xs muted">${esc(x.why)}</span></li>`).join('')}</ul><div class="xs muted">Fact: past purchases from IL PTAX-203 / county sales (last ${BUYER_YEARS} years, buyer names grouped when they differ only by punctuation or LLC/Inc). Fit to this building is inferred.</div>` : '<div class="muted">No repeat buyer in the public sales data fits this building\'s size and area.</div>'; };
export function buyerProfilesHTML(limit = 60) {
  const all = buyerProfiles(), rep = all.filter(b => b.n >= 2);
  const row = b => `<tr><td><b>${esc(b.name)}</b>${b.variants.length > 1 ? `<div class="xs muted" title="${esc(b.variants.join(' | '))}">${b.variants.length} name variants</div>` : ''}</td><td class="num">${b.n}${b.np > b.n ? `<div class="xs muted">${b.np} parcels</div>` : ''}</td><td class="num">${kmoney(b.total) || '–'}</td><td>${esc(sizeRange(b))}</td><td class="num">${b.psf ? '$' + Math.round(b.psf) : '–'}</td><td>${esc(b.cities.slice(0, 3).join(', '))}</td><td><a href="#/property/${b.latest.props[0].id}">${esc(nc(val(b.latest.props[0], 'address') || ''))}</a><div class="xs muted">${esc(b.latest.sd)}${b.latest.sp ? ' · ' + kmoney(b.latest.sp) : ''}</div></td></tr>`;
  return `<div class="xs muted">${rep.length} buyers with 2+ industrial purchases in the last ${BUYER_YEARS} years (${all.length} buyers in total), from IL PTAX-203 / county sales. Same buyer + same recording date counts as one purchase (portfolio deeds).</div>
    <div class="tbl-wrap"><table class="grid bprof"><thead><tr><th>Buyer</th><th class="num">Purchases</th><th class="num">Total $</th><th>Typical size</th><th class="num">Median $/SF</th><th>Areas</th><th>Most recent</th></tr></thead><tbody>${rep.slice(0, limit).map(row).join('')}</tbody></table></div>`;
}
