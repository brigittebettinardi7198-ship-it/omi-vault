// Cook County residential (2-02..2-12, 2-34, 2-78, 2-95) + apartments/retail/mixed-use/hotel (class 3xx, 5xx) for HIS TERRITORY ZIPs.
// Free Cook open data (Socrata, no key): Parcel Universe pabr-t5kh (class, location ONLY: no census/demographic fields are requested),
// Parcel Addresses 3723-97qp (owner/mailing), Parcel Sales wvhk-k5uv (sales). Cached on this device in IndexedDB 'omi-cre'.
// Scores use property and ownership facts only. No demographic data, ever.
import { esc, fmt, kmoney, today, addDays, daysBetween } from './util.js';
import { S, setting, setSetting } from './store.js';
import { takeHomeValue, cfg, terr } from './money.js';

const B = 'https://datacatalog.cookcountyil.gov/resource/';
export const RESI = ['202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '234', '278', '295'];
const CRE_W = "(starts_with(class,'3') OR class in('517','522','523','529','531','590','591','592','597'))";
export const kindOf = c => RESI.includes(c) ? 'resi' : 'cre';
export const isMulti = c => c === '211' || c === '212';   // 2-6 unit apartments / mixed-use
export const classLabel = c => ({ 211: '2-6 unit apartment', 212: 'Small mixed-use (2-6 units)', 234: 'Split-level home', 278: 'Two-story home', 295: 'Townhome / row house' })[c] || (RESI.includes(c) ? 'Single-family home' : c[0] === '3' ? 'Apartment building (7+ units)' : c === '529' ? 'Hotel / motel' : 'Commercial / retail');
// ---- tiny private store ----
let dbp; const idb = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('omi-cre', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
const get = async k => { const db = await idb(); return new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
const put = async (k, v) => { const db = await idb(); return new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); };
async function pages(ds, params, onRows, max = 60000) { let off = 0; for (;;) { const u = B + ds + '.json?' + new URLSearchParams({ ...params, $limit: 10000, $offset: off }); const L = await fetch(u).then(r => r.json()); if (!Array.isArray(L)) throw new Error(L && L.message || 'Cook data error'); onRows(L); off += L.length; if (L.length < 10000 || off >= max) return off; } }
const zips = () => String(terr().zips || '').split(',').map(s => s.trim()).filter(z => /^6\d{4}$/.test(z)).slice(0, 6);
const q = a => a.map(x => `'${x}'`).join(',');
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
// ---- load territory (run from Deals > Territory) ----
export async function loadTerritory(progress = () => {}) {
  const Z = zips(); if (!Z.length) throw new Error('Add 1 to 6 Cook County ZIPs in Territory first.');
  const P = new Map(), nb = new Set();
  progress('Parcels…');
  await pages('pabr-t5kh', { $select: 'pin,class,zip_code,lat,lon,nbhd_code', $where: `year='2026' AND zip_code in(${q(Z)}) AND (class in(${q(RESI)}) OR ${CRE_W})` }, L => { for (const r of L) { P.set(r.pin, { pin: r.pin, c: r.class, z: r.zip_code, lat: +r.lat || 0, lon: +r.lon || 0 }); if (r.nbhd_code) nb.add(r.nbhd_code); } });
  if (P.size > 45000) throw new Error(`${fmt(P.size)} parcels is too many for a phone. Use fewer ZIPs.`);
  progress(`Owners for ${fmt(P.size)} parcels…`);
  await pages('3723-97qp', { $select: 'pin,prop_address_full,prop_address_city_name,mail_address_name,mail_address_full,mail_address_city_name,mail_address_state,owner_address_name', $where: `year='2026' AND prop_address_zipcode_1 in(${q(Z)})` }, L => { for (const r of L) { const p = P.get(r.pin); if (!p) continue; p.a = r.prop_address_full || ''; p.city = r.prop_address_city_name || ''; p.own = r.owner_address_name || r.mail_address_name || ''; p.ma = r.mail_address_full || ''; p.mc = r.mail_address_city_name || ''; p.ms = r.mail_address_state || ''; } });
  progress('Sales history…');
  const N = [...nb]; const recent = [];
  for (let i = 0; i < N.length; i += 40) await pages('wvhk-k5uv', { $select: 'pin,sale_date,sale_price,class,buyer_name,seller_name', $where: `nbhd in(${q(N.slice(i, i + 40))}) AND sale_date > '2000-01-01' AND sale_price > 10000` }, L => { for (const r of L) { const p = P.get(r.pin), d = String(r.sale_date).slice(0, 10); if (p && (!p.sd || d > p.sd)) { p.sd = d; p.sp = +r.sale_price; } if (d >= addDays(today(), -1095)) recent.push({ pin: r.pin, d, sp: +r.sale_price, c: r.class, b: r.buyer_name || '', s: r.seller_name || '' }); } }, 200000);
  const list = [...P.values()].filter(p => p.a);
  await put('parcels', list); await put('recent', recent); await setSetting('creLoaded', { d: today(), zips: Z.join(','), n: list.length });
  CACHE = null; return list.length;
}
// ---- scoring (3.2) ----
const ENT = /\b(LLC|L L C|INC|CORP|CO|COMPANY|LP|LTD|BANK|HOLDINGS|PROPERTIES|INVESTMENTS|REALTY|MANAGEMENT|GROUP|PARTNERS|FUND|CHURCH)\b/;
let CACHE = null;
export async function scored() {
  if (CACHE && CACHE.v === S.version) return CACHE;
  const list = await get('parcels'), recent = (await get('recent')) || []; if (!list) return CACHE = { v: S.version, top: [], recent: [], all: 0 };
  const byOwner = new Map(); for (const p of list) { const k = norm(p.ma) || norm(p.own); if (k) byOwner.set(k, (byOwner.get(k) || 0) + 1); }
  // value estimate: median recent sale by class (estimate)
  const med = {}; { const g = {}; for (const r of recent) if (r.sp > 20000) (g[r.c] = g[r.c] || []).push(r.sp); for (const c in g) { if (g[c].length < 8) continue; const a = g[c].sort((x, y) => x - y); med[c] = a[Math.floor(a.length / 2)]; } } // only classes with 8+ recent sales
  const t = today(), out = [];
  for (const p of list) {
    const R = []; let s = 0; const own = norm(p.own), ent = ENT.test(own), yrs = p.sd ? daysBetween(p.sd, t) / 365.25 : 26, nOwn = byOwner.get(norm(p.ma) || own) || 1;
    const abs = p.ma && norm(p.ma) !== norm(p.a); if (abs) { s += 15; R.push('Absentee owner (tax bill mails elsewhere)'); }
    if (abs && p.ms && p.ms !== 'IL') { s += 10; R.push(`Out-of-state owner (${p.ms})`); }
    if (yrs >= 15) { s += 15; R.push(p.sd ? `Owned ${Math.floor(yrs)} years` : 'No recorded sale since 2000'); }
    if (/\b(TRUST|TRUSTEE|TR|ESTATE|EST OF|HEIRS)\b/.test(own)) { s += 15; R.push('Trust / estate owner'); }
    if (isMulti(p.c) && yrs >= 20 && !ent) { s += 15; R.push('2-6 unit owned 20+ years by an individual'); }
    if (nOwn >= 3) { s += 12; R.push(`Owner holds ${nOwn} properties here (portfolio)`); }
    if (s < 30) continue;
    const kind = kindOf(p.c), v = med[p.c] || 0, comm = kind === 'cre' || nOwn >= 3 || isMulti(p.c) || ent;
    out.push({ p, s, R, kind, v, th: v ? takeHomeValue(v, kind === 'resi' ? 'resi' : 'sale') : 0, comm, nOwn });
  }
  out.sort((a, b) => (b.th || 1) * b.s - (a.th || 1) * a.s);
  { const seen = new Set(); const ded = []; for (const x of out) { const k = norm(x.p.own); if (seen.has(k)) continue; seen.add(k); ded.push(x); } out.length = 0; out.push(...ded); }
  CACHE = { v: S.version, top: out.slice(0, 300), recent, all: list.length, med, list: null }; return CACHE;
}
// ---- 2.1 apartment/retail sellers ($1M+, last 45 days, countywide) ----
export async function creSellers() {
  const c = await get('x1031cre'); if (c && c.ts > Date.now() - 864e5) return c.L;
  const since = addDays(today(), -180); let L = [];   // Cook sales post ~2 months late, so look back 180 days
  try { L = await fetch(B + 'wvhk-k5uv.json?' + new URLSearchParams({ $select: 'pin,sale_date,sale_price,class,seller_name,buyer_name', $where: `sale_date > '${since}' AND sale_price >= 1000000 AND ${CRE_W}`, $limit: 200 })).then(r => r.json()); } catch (e) { return c ? c.L : []; }
  if (!Array.isArray(L)) return [];
  try { const pins = [...new Set(L.map(r => r.pin))]; if (pins.length) { const A = await fetch(B + '3723-97qp.json?' + new URLSearchParams({ $select: 'pin,prop_address_full,prop_address_city_name', $where: `year='2026' AND pin in(${q(pins)})`, $limit: 500 })).then(r => r.json()); const m = new Map((Array.isArray(A) ? A : []).map(a => [a.pin, a])); L.forEach(r => { const a = m.get(r.pin); if (a) r.addr = `${a.prop_address_full}, ${a.prop_address_city_name}`; }); } } catch (e) {}
  L = L.map(r => { const sd = String(r.sale_date).slice(0, 10), age = daysBetween(sd, today()); return { pin: r.pin, addr: r.addr || '', sd, total: +r.sale_price, c: r.class, seller: r.seller_name || '', d45: 45 - age, d180: 180 - age, c180: addDays(sd, 180) }; }).filter(x => x.seller && x.d180 > 0);
  await put('x1031cre', { ts: Date.now(), L }); return L;
}
// ---- 3.4 just-sold circle ----
const mi = (a, b) => Math.hypot((a.lat - b.lat) * 69, (a.lon - b.lon) * 51.5);
export async function justSold() {
  const list = await get('parcels'), recent = (await get('recent')) || []; if (!list) return [];
  const byPin = new Map(list.map(p => [p.pin, p])), since = addDays(today(), -120), out = [];   // Cook sales post ~2 months late
  for (const r of recent.filter(r => r.d >= since && RESI.includes(r.c)).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 8)) { const p = byPin.get(r.pin); if (!p || !p.lat) continue; const grp = isMulti(r.c);
    const nb = list.filter(x => x.pin !== p.pin && x.lat && isMulti(x.c) === grp && RESI.includes(x.c)).map(x => ({ x, d: mi(p, x) })).sort((a, b) => a.d - b.d).slice(0, 10); out.push({ r, p, nb }); }
  return out;
}
// ---- 3.5 investor buyers (2-6 unit buyers, last 3 yrs) ----
export async function investorBuyers() { const recent = (await get('recent')) || [], g = new Map(); for (const r of recent) if (isMulti(r.c) && r.b) { const k = norm(r.b); const e = g.get(k) || { name: r.b, n: 0, last: '' }; e.n++; if (r.d > e.last) e.last = r.d; g.set(k, e); }
  return [...g.values()].filter(e => e.n >= 2).sort((a, b) => b.n - a.n).slice(0, 25).map(e => ({ ...e, grade: e.n >= 5 ? 'A' : e.n >= 3 ? 'B' : 'C' })); }
