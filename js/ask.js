import { nc } from './extras.js';
// "Ask": rules-based smart search. Runs entirely on this device. No cloud AI and no API; nothing typed leaves the browser.
// Plain English -> criteria (editable chips) -> the existing matching + off-market scoring engine -> ranked properties / owners.
import { $, $$, esc, fmt, kmoney, uid, toast, scorePill, toCSV, download, today, daysBetween } from './util.js';
import { S, val, save, OPT } from './store.js';
import { matchOne, scoreOf, deal, freshFor } from './scoring.js';
import { table, modal, scoreLegend } from './ui.js';
import { MARKET } from './markets.js';

export const EXAMPLES = [
  "buyer wants 100-200k SF warehouse near O'Hare, 30' clear, 10+ docks, under $25M, owned 20+ yrs",
  'sellers in Elk Grove with out-of-state owners',
  'trust or estate owners in DuPage, 5+ acres',
  'investor wants 50k+ SF building in Will County under $10M',
  "tenant needs 40-60k SF near I-55, 24' clear, 4 docks, 2 drive-ins, under $9/sf",
  'outdoor storage land 3-10 acres near Joliet',
  'plant closings or tax delinquent owners in Cook',
  'owners held 25+ years, built before 1980, absentee, Franklin Park',
];
// Landmark / corridor shorthand -> towns (shown as an editable chip, so you can see and change what "near O'Hare" means)
export const AREAS = {
  "O'Hare": [/o\s*'?\s*hare|ohare/, ['Elk Grove Village', 'Bensenville', 'Wood Dale', 'Franklin Park', 'Itasca', 'Des Plaines', 'Schiller Park', 'Rosemont', 'Northlake', 'Addison', 'Mount Prospect']],
  'Midway': [/\bmidway\b/, ['Bedford Park', 'Bridgeview', 'Summit', 'Burbank', 'Forest View', 'Chicago']],
  'I-55 corridor': [/\bi[- ]?55\b|\b55 corridor/, ['Bolingbrook', 'Romeoville', 'Joliet', 'Woodridge', 'Lemont', 'Willowbrook', 'Hodgkins', 'Mccook', 'Countryside', 'Channahon', 'Minooka', 'Plainfield', 'Elwood', 'Bedford Park']],
  'I-80 corridor': [/\bi[- ]?80\b/, ['Joliet', 'New Lenox', 'Mokena', 'Tinley Park', 'Frankfort', 'Minooka', 'Channahon', 'Matteson', 'Lansing', 'Hazel Crest']],
  'I-88 corridor': [/\bi[- ]?88\b/, ['Aurora', 'Naperville', 'Lisle', 'Downers Grove', 'Oak Brook', 'Batavia', 'North Aurora', 'Montgomery', 'Warrenville']],
  'I-90 / Northwest': [/\bi[- ]?90\b|\bnorthwest suburbs?\b/, ['Elgin', 'Hoffman Estates', 'Schaumburg', 'Rolling Meadows', 'Arlington Heights', 'Huntley', 'Hampshire', 'Elk Grove Village', 'East Dundee', 'Gilberts']],
  'I-94 / North': [/\bi[- ]?94\b|\bnorth shore\b/, ['Waukegan', 'Gurnee', 'Libertyville', 'Vernon Hills', 'Mundelein', 'Lake Bluff', 'North Chicago', 'Northbrook', 'Deerfield', 'Lincolnshire', 'Wheeling', 'Buffalo Grove', 'Lake Forest']],
  'South suburbs': [/\bsouth suburbs?\b|\bsouthland\b/, ['Chicago Heights', 'Harvey', 'Lansing', 'Alsip', 'Blue Island', 'Calumet City', 'South Holland', 'Markham', 'Tinley Park', 'University Park', 'Matteson']],
  'Fox Valley': [/\bfox (valley|river)\b/, ['Aurora', 'Batavia', 'Geneva', 'St Charles', 'Elgin', 'North Aurora', 'Montgomery', 'South Elgin', 'Carpentersville']],
  'West suburbs': [/\bwest(ern)? suburbs?\b/, ['Franklin Park', 'Melrose Park', 'Northlake', 'Bensenville', 'Addison', 'Elmhurst', 'Bellwood', 'Broadview', 'Hillside', 'Berkeley', 'Stone Park']],
};
const COUNTY_RE = { Cook: /\bcook\b/, DuPage: /\bdu\s?page\b/, Lake: /\blake (county|co\.?)\b/, McHenry: /\bmc\s?henry\b/, Kane: /\bkane\b/, Will: /\bwill (county|co\.?)\b/ };
const TYPES = [['Warehouse / distribution', /\b(warehouse|distribution|logistics|fulfillment)\b/], ['Manufacturing', /\b(manufacturing|plant|factory)\b(?! clos)/], ['Flex / light industrial', /\b(flex|light industrial)\b/],
  ['Truck terminal', /\b(truck terminal|cross[- ]?dock)\b/], ['Outdoor storage (IOS)', /\b(ios|outdoor storage|truck parking|trailer parking|storage yard|contractor yard)\b/], ['Cold storage', /\b(cold storage|freezer|cooler)\b/]];
const STOP_TOWNS = new Set(['golf', 'summit', 'justice', 'wayne', 'lily lake', 'virgil', 'burlington', 'hometown']);
const n = (v, suf) => { let x = parseFloat(v); suf = (suf || '').toLowerCase(); if (suf === 'k') x *= 1e3; else if (/^(m|mm|million)$/.test(suf)) x *= 1e6; else if (suf === 'b') x *= 1e9; return x; };
let TOWNS = null;
function towns() {
  if (TOWNS && TOWNS.v === S.props.length) return TOWNS.list;
  const set = new Map();
  for (const p of S.props) for (const t of [val(p, 'city'), val(p, 'municipality')]) { if (!t) continue; const T = String(t).trim(); const k = T.toLowerCase(); if (k.length < 4 || /unincorporated/.test(k)) continue; set.set(k, T); const short = k.replace(/\s+(village|vlg|city|township|twp)$/, ''); if (short !== k && short.length >= 4) set.set(short, T); }
  const list = [...set.entries()].filter(([k]) => !STOP_TOWNS.has(k)).sort((a, b) => b[0].length - a[0].length);
  TOWNS = { v: S.props.length, list }; return list;
}
// ---------- parser ----------
export function parseAsk(q) {
  const c = {}; let t = ' ' + String(q || '').toLowerCase().replace(/[–—]/g, '-').replace(/(\d),(\d{3})/g, '$1$2').replace(/’/g, "'") + ' ';
  const cut = re => { t = t.replace(re, ' '); };
  // intent
  const sellerW = /\b(sellers?|who (might|would|could|may) sell|likely to sell|off[- ]market owners?|prospects?|owners? (to call|who)|owners?\b)/.test(t);
  const buyerW = /\b(buyer|wants|looking for|needs?|purchase|buy|acquire|owner[- ]user)\b/.test(t);
  if (/\b(investor|investment|cap rate|nnn|income|leased building)\b/.test(t)) c.intent = 'Investment';
  else if (/\b(tenant|for lease|to lease|lease|rent|sublease)\b/.test(t) && !/sale[- ]leaseback/.test(t)) c.intent = 'Lease';
  else if (buyerW) c.intent = 'Buy (owner-user)';
  else if (sellerW) c.intent = 'sellers';
  // money first when explicitly $ (so "$25M" is never read as SF)
  t = t.replace(/\$\s*(\d+(?:\.\d+)?)\s*(k|m|mm|million|b)?\s*(?:\/\s*(?:sf|sq\.?\s*ft|psf|foot)|\s*psf|\s*per\s*(?:sf|square foot|foot))/g, (m, a, s) => { const v = n(a, s); if (c.intent === 'Lease') c.maxRent = v; else c.psfMax = v; return ' '; });
  const big$ = (v, s) => (!s && v < 1000 ? v * 1e6 : n(v, s));   // "$25" with no unit on a building = $25M
  t = t.replace(/\$\s*(\d+(?:\.\d+)?)\s*(k|m|mm|million)?\s*(?:-|to)\s*\$?\s*(\d+(?:\.\d+)?)\s*(k|m|mm|million)?\b/g, (m, a, sa, b, sb) => { c.budgetMax = big$(b, sb); return ' '; });
  t = t.replace(/(?:under|below|less than|max(?:imum)?|up to|budget(?:\s*of)?|<|no more than|at most)\s*\$?\s*(\d+(?:\.\d+)?)\s*(k|m|mm|million|b)\b/g, (m, a, s) => { c.budgetMax = n(a, s); return ' '; });
  t = t.replace(/(?:under|below|less than|max(?:imum)?|up to|budget(?:\s*of)?|<|no more than|at most)\s*\$\s*(\d+(?:\.\d+)?)/g, (m, a) => { c.budgetMax = big$(a); return ' '; });
  t = t.replace(/\$\s*(\d+(?:\.\d+)?)\s*(k|m|mm|million|b)?\b/g, (m, a, s) => { c.budgetMax = big$(a, s); return ' '; });
  // land acres
  t = t.replace(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:ac|acres?)\b/g, (m, a, b) => { c.acMin = +a; c.acMax = +b; return ' '; });
  t = t.replace(/(?:at least|min(?:imum)?|over|more than)?\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:ac|acres?)\b(\s*\+)?/g, (m, a) => { c.acMin = +a; return ' '; });
  // clear height
  t = t.replace(/(\d{2})\s*(?:'|ft|feet|foot)?\s*\+?\s*(?:min(?:imum)?\s*)?clear(?:\s*height)?/g, (m, a) => { c.clearMin = +a; return ' '; });
  t = t.replace(/clear(?:\s*height)?\s*(?:of\s*|min(?:imum)?\s*|>=?\s*|at least\s*)?(\d{2})\s*(?:'|ft|feet)?\+?/g, (m, a) => { c.clearMin = +a; return ' '; });
  // docks / drive-ins
  t = t.replace(/(\d+)\s*\+?\s*(?:or more\s*)?(?:dock[- ]high doors?|dock doors?|loading docks?|docks?|dh doors?|dh)\b/g, (m, a) => { c.docksMin = +a; return ' '; });
  t = t.replace(/(\d+)\s*\+?\s*(?:or more\s*)?(?:drive[- ]?ins?|drive[- ]in doors?|di doors?|grade[- ]level doors?|overhead doors?)\b/g, (m, a) => { c.driveMin = +a; return ' '; });
  // years owned / year built
  t = t.replace(/(?:owned|held|ownership|hold(?:ing)?|owners? (?:for|of))\s*(?:for\s*)?(?:over\s*|more than\s*|at least\s*|\+)?(\d+)\s*\+?\s*(?:yrs?|years?)\+?/g, (m, a) => { c.holdMin = +a; return ' '; });
  t = t.replace(/(\d+)\s*\+?\s*(?:yrs?|years?)\s*(?:\+\s*)?(?:owned|held|hold|ownership|of ownership)/g, (m, a) => { c.holdMin = +a; return ' '; });
  if (!c.holdMin && /\blong[- ]?(term|time)? ?(hold|owners?|ownership)\b/.test(t)) c.holdMin = 15;
  t = t.replace(/(?:built|constructed)\s*(?:after|since|in or after|post|>)\s*(\d{4})|(?:newer than|post[- ])(\d{4})/g, (m, a, b) => { c.yearMin = +(a || b); return ' '; });
  t = t.replace(/(?:built|constructed)\s*(?:before|prior to|pre|<)\s*(\d{4})|(?:older than|pre[- ])(\d{4})/g, (m, a, b) => { c.yearMax = +(a || b); return ' '; });
  // building size
  t = t.replace(/(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(k|m)?\s*(sf|sq\.?\s*ft|square\s*feet|sqft|s\.f\.)?/g, (m, a, sa, b, sb, u) => {
    if (!u && !sa && !sb) return m; const B = n(b, sb), A = n(a, sa || (sb && +a < +b ? sb : '')); if (B < 1000) return m; c.sfMin = A; c.sfMax = B; return ' '; });
  t = t.replace(/(at least|min(?:imum)?|over|above|more than|under|below|less than|max(?:imum)?|up to)?\s*(\d+(?:\.\d+)?)\s*(k|m)?\s*(\+)?\s*(sf|sq\.?\s*ft|square\s*feet|sqft|s\.f\.)\b(\s*\+)?/g, (m, w, a, s, plus, u, plus2) => {
    const v = n(a, s); if (v < 1000) return m;
    if (plus || plus2 || /least|min|over|above|more/.test(w || '')) c.sfMin = v; else if (/under|below|less|max|up to/.test(w || '')) c.sfMax = v; else { c.sfMin = Math.round(v * .8); c.sfMax = Math.round(v * 1.2); }
    return ' '; });
  t = t.replace(/(\d+(?:\.\d+)?)\s*k\s*(\+)?(?=\s|,|$)/g, (m, a, plus) => { const v = n(a, 'k'); if (plus) c.sfMin = v; else { c.sfMin = Math.round(v * .8); c.sfMax = Math.round(v * 1.2); } return ' '; });
  // owner traits
  if (/\bout[- ]of[- ]state\b|\boos\b/.test(t)) c.oos = true;
  else if (/\babsentee\b|\bnon[- ]local\b|\bnot local\b/.test(t)) c.absentee = true;
  const ot = []; if (/\btrusts?\b/.test(t)) ot.push('trust'); if (/\b(estates?|heirs|deceased)\b/.test(t)) ot.push('estate'); if (/\b(individuals?|private owners?|mom[- ]and[- ]pop|family[- ]owned|people)\b/.test(t)) ot.push('individual'); if (ot.length) c.ownerTypes = ot;
  if (/\b(non[- ]?institutional|no institutional|not institutional)\b/.test(t)) c.noInst = true;
  // flags / signals
  if (/\bvacant\b(?! land)/.test(t)) c.vacant = true;
  if (/\b(plant closings?|closings?|layoffs?|warn)\b/.test(t)) c.warn = true;
  if (/\b(tax[- ]?delinquent|delinquent|tax sale)\b/.test(t)) c.tdel = true;
  if (/\b(sba|loan matur\w*|maturing loans?)\b/.test(t)) c.sba = true;
  if (/\bsale[- ]leasebacks?\b/.test(t)) c.slb = true;
  if (/\b(just sold|fresh|new owners?|recent(ly)? (sold|changed))\b/.test(t)) c.fresh = true;
  if (/\btif\b/.test(t)) c.tif = true;
  if (/\bopportunity zones?\b|\boz\b/.test(t)) c.oz = true;
  if (/\b(hot|hottest|red)\b/.test(t)) c.minScore = 70;
  t.replace(/score\s*(?:over|above|>=?|of at least|at least)?\s*(\d{2})/, (m, a) => { c.minScore = +a; });
  if (/\b(big deals?|large|big)\b/.test(t)) c.big = true;
  // type / land
  for (const [ty, re] of TYPES) if (re.test(t)) { c.type = ty; break; }
  if (/\b(land|vacant land|development site|lot|acreage)\b/.test(t) && !c.sfMin && !c.sfMax && c.intent !== 'sellers') c.intent = c.intent === 'Lease' ? 'Lease' : 'Land';
  if (c.type === 'Outdoor storage (IOS)' && !c.sfMin && c.intent && c.intent !== 'sellers' && c.intent !== 'Lease') c.intent = 'Land';
  // places
  const tw = new Set(), areas = [];
  for (const [name, [re, list]] of Object.entries(AREAS)) if (re.test(t)) { areas.push(name); list.forEach(x => tw.add(x)); t = t.replace(re, ' '); }
  for (const [k, T] of towns()) { const re = new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\bst\.? /, 'st\\.? ') + '\\b'); if (re.test(t)) { tw.add(T); t = t.replace(re, ' '); } }
  const cos = Object.keys(COUNTY_RE).filter(k => COUNTY_RE[k].test(t)); if (cos.length) c.counties = cos;
  if (tw.size) c.towns = [...tw]; if (areas.length) c.areas = areas;
  if (!c.intent) c.intent = (c.holdMin || c.ownerTypes || c.oos || c.absentee || c.warn || c.tdel || c.sba) ? 'sellers' : (c.sfMin || c.sfMax || c.clearMin || c.docksMin) ? 'Buy (owner-user)' : 'sellers';
  return c;
}
// ---------- chips ----------
const money = v => kmoney(v);
const CH = {
  intent: ['Looking for', c => c.intent === 'sellers' ? 'Likely sellers (off-market owners)' : c.intent, 'select', ['sellers', 'Buy (owner-user)', 'Investment', 'Lease', 'Land']],
  sfMin: ['Min SF', c => fmt(c.sfMin), 'num'], sfMax: ['Max SF', c => fmt(c.sfMax), 'num'], acMin: ['Min acres', c => c.acMin, 'num'], acMax: ['Max acres', c => c.acMax, 'num'],
  clearMin: ['Clear height', c => c.clearMin + "'+", 'num'], docksMin: ['Docks', c => c.docksMin + '+', 'num'], driveMin: ['Drive-ins', c => c.driveMin + '+', 'num'],
  budgetMax: ['Budget', c => 'under ' + money(c.budgetMax), 'num'], psfMax: ['Max $/SF', c => '$' + c.psfMax + '/SF', 'num'], maxRent: ['Max rent', c => '$' + c.maxRent + '/SF/yr', 'num'],
  holdMin: ['Owned', c => c.holdMin + '+ yrs', 'num'], yearMin: ['Built after', c => c.yearMin, 'num'], yearMax: ['Built before', c => c.yearMax, 'num'],
  type: ['Type', c => c.type, 'select', OPT.propType], counties: ['County', c => c.counties.join(', '), 'list'], towns: ['Towns', c => (c.areas ? c.areas.join(' + ') + ': ' : '') + c.towns.slice(0, 4).join(', ') + (c.towns.length > 4 ? ` +${c.towns.length - 4}` : ''), 'list'],
  oos: ['Owner', () => 'Out-of-state tax bill', 'bool'], absentee: ['Owner', () => 'Absentee (bill mails elsewhere)', 'bool'], ownerTypes: ['Owner type', c => c.ownerTypes.join(' / '), 'list'], noInst: ['Owner', () => 'Not institutional', 'bool'],
  vacant: ['Vacant', () => 'Yes', 'bool'], warn: ['Signal', () => 'WARN layoff / closing', 'bool'], tdel: ['Signal', () => 'In Cook delinquent-tax file', 'bool'], sba: ['Signal', () => 'SBA 504 loan', 'bool'], slb: ['Signal', () => 'Sale-leaseback', 'bool'],
  fresh: ['Signal', () => 'Fresh change (120 days)', 'bool'], tif: ['Zone', () => 'TIF', 'bool'], oz: ['Zone', () => 'Opportunity Zone', 'bool'], minScore: ['Off-market score', c => c.minScore + '+', 'num'], big: ['Size', () => 'Big deals only', 'bool'],
};
const chipsHTML = c => Object.keys(CH).filter(k => c[k] != null && c[k] !== false && !(Array.isArray(c[k]) && !c[k].length)).map(k => `<span class="achip" data-k="${k}"><button type="button" class="ach-e" data-edit="${k}" title="Edit">${esc(CH[k][0])}: <b>${esc(CH[k][1](c))}</b></button>${k === 'intent' ? '' : `<button type="button" class="ach-x" data-del="${k}" aria-label="Remove ${esc(CH[k][0])}">✕</button>`}</span>`).join('');
// ---------- engine ----------
const holdYrs = p => { const sd = val(p, 'lastSaleDate'); return sd ? daysBetween(sd, today()) / 365.25 : p.holdplus ? 27 : null; };
function extra(p, c, R) {   // criteria the requirement matcher doesn't cover; returns false to exclude
  if (c.counties && c.counties.length && !c.counties.includes(val(p, 'county'))) return false;
  if (c.towns && c.towns.length) { const pm = [val(p, 'municipality'), val(p, 'city'), val(p, 'submarket')].join(' ').toLowerCase(); const hit = c.towns.find(x => pm.includes(x.toLowerCase())); if (!hit) return false; R.push('In ' + hit); }
  if (c.holdMin) { const y = holdYrs(p); if (y == null || y < c.holdMin) return false; R.push(p.holdplus && !val(p, 'lastSaleDate') ? 'No recorded sale since 1999' : `Owned ${Math.floor(y)} yrs (last sale ${val(p, 'lastSaleDate').slice(0, 4)})`); }
  const st = (val(p, 'mailState') || '').toUpperCase();
  if (c.oos) { if (!st || st === 'IL') return false; R.push(`Out-of-state tax bill (${st})`); }
  if (c.absentee) { if (!(p.abs || (st && st !== 'IL'))) return false; R.push('Absentee tax-bill address'); }
  if (c.ownerTypes && c.ownerTypes.length) { if (!c.ownerTypes.includes(p.ot)) return false; R.push(`${p.ot[0].toUpperCase() + p.ot.slice(1)} owner (from name)`); }
  if (c.noInst && p.ot === 'institutional') return false;
  if (c.yearMax) { const yb = +val(p, 'yearBuilt'); if (!yb || yb >= c.yearMax) return false; R.push('Built ' + yb); }
  if (c.driveMin) { const di = +val(p, 'driveIns'); if (di && di < c.driveMin) return false; R.push(di ? `${di} drive-ins` : 'Drive-ins unknown – verify'); }
  if (c.vacant && !(p.vac || /Vacant/.test(val(p, 'occupancy') || ''))) return false;
  if (c.warn || c.tdel || c.sba || c.slb || c.fresh) {   // several signals = any of them ("closings or tax delinquent")
    const hits = [];
    if (c.warn && p.warn) hits.push('WARN: ' + p.warn);
    if (c.tdel && p.tdel) hits.push(`In Cook delinquent-tax file (${p.tdel})`);
    if (c.sba && p.sba) hits.push(`SBA 504 loan, est. maturity ${p.sbamat || '?'} (estimate)`);
    if (c.slb && p.slb) hits.push('Sale-leaseback ' + p.slb);
    if (c.fresh) { const f = freshFor(p); if (f.length) hits.push('Fresh change ' + f[0].d); }
    if (!hits.length) return false; R.push(...hits);
  }
  if (c.tif && !p.tif) return false; if (c.oz && !p.oz) return false;
  if (c.big && !deal(p).big) return false;
  const om = scoreOf(p).score; if (c.minScore && om < c.minScore) return false;
  if (c.psfMax) { const d = deal(p); const v = +val(p, 'askingPrice') || d.value; if (d.sf && v && v / d.sf > c.psfMax * 1.15) return false; if (d.sf && v) R.push(`≈$${Math.round(v / d.sf)}/SF (${val(p, 'askingPrice') ? 'asking' : 'est.'})`); }
  return true;
}
export function runAsk(c, limit = 150) {
  const out = [], sellers = c.intent === 'sellers';
  const r = sellers ? null : { dealType: c.intent, sfMin: c.sfMin || '', sfMax: c.sfMax || '', landMinAc: c.acMin || '', clearMin: c.clearMin || '', docksMin: c.docksMin || '', budgetMax: c.budgetMax || '', maxRent: c.maxRent || '', yearMin: c.yearMin || '', assetType: c.type || '', counties: [], munis: '' };
  for (const p of S.props) {
    const R = []; if (!extra(p, c, R)) continue;
    const om = scoreOf(p).score, d = deal(p); let rank, ms = null;
    if (sellers) {
      const sf = d.sf, ac = d.acres;
      if (c.sfMin && !(sf >= c.sfMin)) continue; if (c.sfMax && !(sf && sf <= c.sfMax)) continue;
      if (c.acMin && !(ac >= c.acMin)) continue; if (c.acMax && !(ac && ac <= c.acMax)) continue;
      if (c.yearMin && !(+val(p, 'yearBuilt') >= c.yearMin)) continue;
      if (c.budgetMax && d.value > c.budgetMax * 1.2) continue;
      rank = Math.round(om * .8 + d.size * 20);
    } else {
      const m = matchOne(r, p); if (!m) continue;
      if (c.acMax && d.acres > c.acMax * 1.2) continue;
      ms = m.score; R.unshift(...m.reasons.filter(x => !/^Off-market score/.test(x))); rank = Math.round(ms * .55 + om * .45);
    }
    const top = scoreOf(p).reasons.filter(x => x.pts > 0).slice(0, 2).map(x => x.text);
    out.push({ p, rank, ms, om, d, R: [...new Set(R)], top });
  }
  return out.sort((a, b) => b.rank - a.rank || b.d.value - a.d.value).slice(0, limit);
}
// ---------- view ----------
let LAST = { q: '', c: null };
export async function askView(el, q) {
  if (q != null && q !== LAST.q) LAST = { q, c: parseAsk(q) };
  const c = LAST.c;
  el.innerHTML = `<div class="page wide"><div class="ph"><div><h1>Ask <span class="tag">smart search</span></h1><div class="muted">Type what you need in plain English. Rules and keyword patterns turn it into search criteria <b>on this device</b>. This is not cloud AI: nothing you type is sent anywhere. Check the chips to see how it was understood.</div></div></div>
    <form id="askf" class="askbox"><textarea id="askq" rows="2" placeholder="e.g. buyer wants 100-200k SF warehouse near O'Hare, 30' clear, 10+ docks, under $25M, owned 20+ yrs">${esc(LAST.q)}</textarea><button class="btn primary" type="submit">Search</button></form>
    ${c ? '' : `<section class="card"><div class="ch"><h2>Try one of these</h2></div><div class="askex">${EXAMPLES.map(x => `<button type="button" class="btn ghost sm" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="xs muted">Understands: SF ranges (100-200k SF, 50k+ SF), acres, clear height, docks, drive-ins, budget ($25M, under $9/sf), years owned, built before/after, towns, counties and areas (O'Hare, I-55, I-80, I-88, I-90, I-94, Midway, Fox Valley, south/west suburbs), out-of-state / absentee / trust / estate owners, property type, buy / lease / invest / sellers, and signals (closings, tax delinquent, SBA loans, sale-leaseback, fresh changes, TIF, Opportunity Zone, hot = score 70+).</div></section>`}
    <div id="askres"></div></div>`;
  const go = v => { location.hash = '#/ask/' + encodeURIComponent(v.trim()); };
  $('#askf').onsubmit = e => { e.preventDefault(); const v = $('#askq').value; if (v.trim()) { if (v.trim() === LAST.q) { LAST.c = parseAsk(v); askView(el); } else go(v); } };
  $('#askq').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#askf').requestSubmit(); } };
  $$('[data-ex]', el).forEach(b => b.onclick = () => go(b.dataset.ex));
  if (c) renderResults($('#askres'), c, el);
}
function renderResults(box, c, el) {
  const res = runAsk(c), sellers = c.intent === 'sellers';
  const owners = new Map(); res.forEach(x => { if (!x.p.ownerId) return; const o = owners.get(x.p.ownerId) || { id: x.p.ownerId, n: 0, best: x, value: 0 }; o.n++; o.value += x.d.value || 0; if (x.rank > o.best.rank) o.best = x; owners.set(x.p.ownerId, o); });
  const unset = Object.keys(CH).filter(k => c[k] == null || c[k] === false);
  box.innerHTML = `<section class="card"><div class="ch"><h2>Understood as</h2><span class="muted xs">Tap a chip to edit it, ✕ to remove it. Towns from an area name are listed so you can adjust them.</span></div>
      <div class="achips">${chipsHTML(c)}<select id="addc" aria-label="Add a criterion"><option value="">+ Add criterion</option>${unset.map(k => `<option value="${k}">${esc(CH[k][0])}${CH[k][2] === 'bool' ? ': ' + esc(CH[k][1](c)) : ''}</option>`).join('')}</select></div>
      <div class="cbtns">${sellers ? '' : '<button class="btn primary" id="savereq">Save as buyer requirement</button>'}<button class="btn ghost" id="askcsv">Export CSV</button>${sellers ? '<button class="btn ghost" id="flagq">Add top 25 owners to research queue</button>' : ''}</div>
      ${c.type ? '<div class="xs muted">Property type is only checked where you entered a type. Public records don\'t carry warehouse vs. manufacturing.</div>' : ''}</section>
    ${scoreLegend()}
    <section class="card"><div class="ch"><h2>${res.length >= 150 ? 'Top 150' : res.length} properties</h2><span class="muted xs">${sellers ? 'Ranked by off-market score, with a boost for deal size' : 'Ranked by match score (55%) and off-market score (45%), using the same engine as buyer requirements'}</span></div><div id="askt"></div></section>
    <section class="card"><div class="ch"><h2>Owners (${owners.size})</h2><span class="muted xs">Owner groups are inferred from tax-bill names and mailing addresses</span></div><div id="asko"></div></section>`;
  table($('#askt', box), res, [
    { k: 'rank', l: 'Rank', h: x => scorePill(x.rank), v: x => x.rank },
    { k: 'a', l: 'Property', h: x => `<a href="#/property/${x.p.id}">${esc(nc(val(x.p, 'address') || x.p.pin))}</a><div class="xs muted">${esc(nc(val(x.p, 'city') || ''))} · ${esc(x.p.co || '')}</div>`, v: x => val(x.p, 'address') },
    { k: 'sz', l: 'Size', h: x => x.d.sf ? fmt(x.d.sf) + ' SF' : x.d.acres ? x.d.acres.toFixed(1) + ' ac' : '–', v: x => x.d.sf || x.d.acres * 43560 },
    { k: 'v', l: 'Est. value', h: x => kmoney(x.d.value) || '–', v: x => x.d.value },
    { k: 'om', l: 'Off-mkt', h: x => scorePill(x.om), v: x => x.om },
    ...(sellers ? [] : [{ k: 'ms', l: 'Match', h: x => scorePill(x.ms), v: x => x.ms }]),
    { k: 'o', l: 'Owner', h: x => { const o = x.p.ownerId && S.owners.get(x.p.ownerId); return o ? `<a href="#/owner/${o.id}">${esc(nc(o.name))}</a>` : esc(val(x.p, 'taxpayer') || ''); }, v: x => val(x.p, 'taxpayer') },
    { k: 'w', l: 'Why it matched', h: x => `<span class="xs">${esc([...x.R, ...x.top].slice(0, 4).join(' · '))}</span>` },
  ], { empty: 'Nothing matched. Remove a chip or widen a range.' + ((c.counties || []).some(x => ['Will', 'Kane'].includes(x)) || (c.towns || []).length ? ' Note: Will and Kane public data has no building SF or year built, so building-size searches skip them, and Will parcels only include those sold since 2013. Their off-market scores also run lower because fewer fields are published.' : ''), page: 50 });
  table($('#asko', box), [...owners.values()].sort((a, b) => b.best.rank - a.best.rank), [
    { k: 'n', l: 'Owner', h: o => `<a href="#/owner/${o.id}">${esc(S.owners.get(o.id)?.name || '')}</a>`, v: o => S.owners.get(o.id)?.name },
    { k: 'c', l: 'Matching parcels', h: o => o.n, v: o => o.n }, { k: 'b', l: 'Best rank', h: o => scorePill(o.best.rank), v: o => o.best.rank },
    { k: 'v', l: 'Est. value (matches)', h: o => kmoney(o.value), v: o => o.value },
    { k: 'w', l: 'Top property', h: o => `<a href="#/property/${o.best.p.id}">${esc(val(o.best.p, 'address') || '')}</a>` },
  ], { empty: 'No owners.', page: 25 });
  const rerender = () => renderResults(box, c, el);
  $$('[data-del]', box).forEach(b => b.onclick = () => { delete c[b.dataset.del]; if (b.dataset.del === 'towns') delete c.areas; rerender(); });
  $$('[data-edit]', box).forEach(b => b.onclick = () => editChip(c, b.dataset.edit, rerender));
  $('#addc', box).onchange = e => { const k = e.target.value; if (!k) return; if (CH[k][2] === 'bool') { c[k] = true; rerender(); } else editChip(c, k, rerender); };
  const sr = $('#savereq', box); if (sr) sr.onclick = async () => {
    const notUsed = ['holdMin', 'oos', 'absentee', 'ownerTypes', 'yearMax', 'driveMin', 'psfMax', 'warn', 'tdel', 'sba', 'slb', 'fresh', 'tif', 'oz', 'minScore', 'big', 'acMax', 'vacant'].filter(k => c[k] != null && c[k] !== false).map(k => `${CH[k][0]}: ${CH[k][1](c)}`);
    const r = { id: uid('r'), name: (LAST.q || 'Smart search').slice(0, 70), clientName: '', dealType: c.intent, assetType: c.type || '', sfMin: c.sfMin || '', sfMax: c.sfMax || '', landMinAc: c.acMin || '', budgetMax: c.budgetMax || '', maxRent: c.maxRent || '', clearMin: c.clearMin || '', docksMin: c.docksMin || '', yearMin: c.yearMin || '', munis: (c.towns || []).join(', '), muniStrict: !!(c.towns && c.towns.length), counties: c.counties || [], status: 'Active', ask: { ...c }, created: Date.now(),
      notes: `Created from smart search on ${today()}: "${LAST.q}".` + (notUsed.length ? ` Not used by requirement matching (re-run the search for these): ${notUsed.join('; ')}.` : '') };
    await save('requirements', r); toast('Saved as buyer requirement'); location.hash = `#/requirement/${r.id}`;
  };
  $('#askcsv', box).onclick = () => download(`smart-search-${today()}.csv`, toCSV(res.map(x => ({ rank: x.rank, match: x.ms ?? '', off_market: x.om, address: val(x.p, 'address'), city: val(x.p, 'city'), county: x.p.co, pin: x.p.pin, bldg_sf: x.d.sf || '', acres: x.d.acres ? x.d.acres.toFixed(2) : '', est_value: Math.round(x.d.value || 0), owner: S.owners.get(x.p.ownerId)?.name || val(x.p, 'taxpayer'), why: [...x.R, ...x.top].join('; '), query: LAST.q }))));
  const fq = $('#flagq', box); if (fq) fq.onclick = async () => { let k = 0; for (const o of [...owners.values()].sort((a, b) => b.best.rank - a.best.rank).slice(0, 25)) { const ow = S.owners.get(o.id); if (ow && !ow.needsResearch) { ow.needsResearch = true; await save('owners', ow); k++; } } toast(`${k} owners added to the research queue`); };
}
function editChip(c, k, done) {
  const [label, , kind, opts] = CH[k];
  const cur = Array.isArray(c[k]) ? c[k].join(', ') : c[k] ?? '';
  const input = kind === 'select' ? `<select id="cv">${(opts || []).map(o => `<option value="${esc(o)}" ${o === cur ? 'selected' : ''}>${esc(o === 'sellers' ? 'Likely sellers (off-market owners)' : o)}</option>`).join('')}</select>`
    : k === 'counties' ? `<div class="checklist">${Object.keys(MARKET.counties).map(x => `<label><input type="checkbox" value="${x}" ${(c.counties || []).includes(x) ? 'checked' : ''}> ${x}</label>`).join('')}</div>`
    : k === 'ownerTypes' ? `<div class="checklist">${['individual', 'trust', 'estate', 'company', 'other'].map(x => `<label><input type="checkbox" value="${x}" ${(c.ownerTypes || []).includes(x) ? 'checked' : ''}> ${x}</label>`).join('')}</div>`
    : kind === 'list' ? `<textarea id="cv" rows="3" placeholder="Comma-separated">${esc(cur)}</textarea>` : `<input id="cv" type="number" step="any" inputmode="decimal" value="${esc(cur)}">`;
  modal(`<div class="ch"><h2>${esc(label)}</h2><button class="x" data-close>✕</button></div>${input}<div class="mfoot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="cvs">Apply</button></div>`, (m, close) => {
    $('#cvs', m).onclick = () => {
      if (k === 'counties' || k === 'ownerTypes') c[k] = $$('input:checked', m).map(i => i.value);
      else { const v = $('#cv', m).value.trim(); if (kind === 'list') c[k] = v.split(',').map(s => s.trim()).filter(Boolean); else if (kind === 'num') c[k] = v === '' ? undefined : +v; else c[k] = v; if (k === 'towns') delete c.areas; }
      if (c[k] == null || c[k] === '' || (Array.isArray(c[k]) && !c[k].length)) delete c[k];
      close(); done();
    };
  });
}
// compact box for the Command Center
export const askBoxHTML = () => `<form id="askmini" class="askbox mini"><input id="askmq" placeholder="Ask (smart search): e.g. sellers in Elk Grove with out-of-state owners" aria-label="Ask smart search"><button class="btn primary" type="submit">Ask</button></form><div class="xs muted askhint">Runs on this device with rules and keywords. No cloud AI. <a href="#/ask">Examples</a></div>`;
export function bindAskBox(root = document) { const f = $('#askmini', root); if (f) f.onsubmit = e => { e.preventDefault(); const v = $('#askmq', root).value.trim(); if (v) location.hash = '#/ask/' + encodeURIComponent(v); }; }
