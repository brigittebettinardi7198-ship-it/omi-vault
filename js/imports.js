// CoStar / LoopNet / Crexi file imports. PRIVATE: parsed in this browser and stored ONLY in this device's IndexedDB
// (database "omi-imports"). Nothing is uploaded, sent to any server, cached by the service worker, or published.
import { $, $$, esc, fmt, kmoney, today, addDays, daysBetween, toast, uid, loadScript, normAddr } from './util.js';
import { S, val, save, addFollowup, firm } from './store.js';
import { sfOf, matches } from './scoring.js';
import { modal } from './ui.js';
import { takeHome, cfg } from './money.js';
import { nc } from './extras.js';

// ---------- tiny private store ----------
let dbp; const idb = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('omi-imports', 1); r.onupgradeneeded = () => r.result.createObjectStore('snaps', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('snaps', mode), q = fn(t.objectStore('snaps')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
export const allSnaps = () => tx('readonly', s => s.getAll()).then(a => (a || []).sort((x, y) => x.ts - y.ts));
const putSnap = o => tx('readwrite', s => s.put(o));
export const delSnap = id => tx('readwrite', s => s.delete(id));

// ---------- column auto-detect (common CoStar / LoopNet / Crexi headers) ----------
export const FIELDS = {
  address: [/^(property )?address$|street address|^address 1|building address|property street/], city: [/^city$|property city/], zip: [/^zip|postal/],
  owner: [/^(true |recorded )?owner( name)?$|owner contact|landlord/], status: [/status|listing type|for sale.*lease|^type$|sale or lease/],
  ask: [/asking price|list price|^price$|sale price ask|asking \$/], rent: [/asking rent|rent.*sf|rate.*sf|lease rate/],
  sf: [/^(rba|building sf|building size|total sf|size \(sf\)|sf|square feet|bldg sf|rentable building area|space available|available sf|total available)/],
  vacant: [/vacant sf|sf vacant|available space|space avail/], occ: [/occupancy|% leased|percent leased/],
  listDate: [/date (on market|listed)|list(ing)? date|date available|listed on/], dom: [/days on market|^dom$/],
  saleDate: [/sale date|closed date|close date|date sold/], salePrice: [/^sale price$|sold price|sale amount|closed price/], leaseDate: [/lease (sign|start|commence)/],
  lender: [/lender/], loan: [/loan amount|mortgage amount|original loan/], maturity: [/maturity|loan due/], purchaseDate: [/purchase date|acquisition date|last sale date/],
  name: [/^(contact |inquirer |buyer )?name$|first name|full name|contact$/], company: [/company|organization/], email: [/e-?mail/], phone: [/phone|mobile|cell/],
  sfMin: [/min.*(sf|size)|size from/], sfMax: [/max.*(sf|size)|size to/], priceMax: [/max.*(price|budget)|budget|price to/], ptype: [/property type|asset type|use/],
  tenant: [/^tenant( name)?$|tenant$|occupant|company name/], leaseExp: [/(lease )?expir|lease end|exp(iration)? date/],
  lat: [/^lat/], lon: [/^lon|^lng/],
};
const LABEL = { address: 'Address', city: 'City', zip: 'ZIP', owner: 'Owner', status: 'For sale / lease / status', ask: 'Asking price', rent: 'Asking rent', sf: 'Building / available SF', vacant: 'Vacant SF', occ: 'Occupancy %', listDate: 'Date listed / on market', dom: 'Days on market', saleDate: 'Sale date', salePrice: 'Sale price', leaseDate: 'Lease signed date', lender: 'Lender', loan: 'Loan amount', maturity: 'Loan maturity', purchaseDate: 'Purchase date', name: 'Contact name', company: 'Company', email: 'Email', phone: 'Phone', sfMin: 'Min SF wanted', sfMax: 'Max SF wanted', priceMax: 'Max price', ptype: 'Property type', lat: 'Latitude', lon: 'Longitude', tenant: 'Tenant', leaseExp: 'Lease expiration' };
const KINDS = { listing: ['Listings (for sale / for lease)', ['address', 'city', 'zip', 'owner', 'status', 'ask', 'rent', 'sf', 'vacant', 'occ', 'listDate', 'dom', 'lender', 'loan', 'maturity', 'purchaseDate', 'lat', 'lon']], inquiry: ['Buyer / tenant inquiries (LoopNet, Crexi)', ['name', 'company', 'email', 'phone', 'status', 'ptype', 'sfMin', 'sfMax', 'sf', 'priceMax', 'city', 'address']], tenant: ['Tenants / lease expirations (CoStar)', ['tenant', 'address', 'city', 'sf', 'leaseExp', 'rent', 'phone']], comp: ['Sale / lease comps', ['address', 'city', 'zip', 'status', 'sf', 'saleDate', 'salePrice', 'leaseDate', 'rent', 'lender', 'loan', 'maturity', 'lat', 'lon']] };
const guessKind = cols => { const c = cols.join(' ').toLowerCase(); return /tenant/.test(c) && /expir|lease end/.test(c) ? 'tenant' : /inquir|lead|e-?mail/.test(c) && !/sale price|asking price/.test(c) ? 'inquiry' : /sale date|sold|closed/.test(c) ? 'comp' : 'listing'; };
const guess = (cols, k) => cols.find(c => FIELDS[k].some(re => re.test(c.toLowerCase().trim()))) || '';
const num = v => { const n = parseFloat(String(v ?? '').replace(/[$,%\s]/g, '').replace(/^\((.*)\)$/, '-$1')); return isFinite(n) ? n : 0; };
const dt = v => { if (v === '' || v == null) return ''; if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10); const d = new Date(v); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
const key = r => normAddr(r.address) + '|' + String(r.city || '').toUpperCase().trim();
let PIDX = null; const propFor = r => { if (!PIDX || PIDX.v !== S.version) { PIDX = { v: S.version, m: new Map() }; for (const p of S.props) PIDX.m.set(normAddr(val(p, 'address')) + '|' + String(val(p, 'city') || '').toUpperCase(), p); } return PIDX.m.get(key(r)) || null; };

// ---------- import wizard ----------
export function importModal(after) {
  modal(`<h2>Import CoStar / LoopNet / Crexi file</h2><p class="sm">CSV or Excel. <b>Stays only on this phone/computer</b>: it is read here, saved in this browser, and never uploaded or published.</p>
    <input type="file" id="imf" accept=".csv,.xlsx,.xls,text/csv"><div id="imm"></div><div class="mfoot"><button class="btn ghost" data-close>Close</button></div>`, (m, close) => {
    $('#imf', m).onchange = async e => {
      const f = e.target.files[0]; if (!f) return; let rows;
      try { if (/\.xlsx?$/i.test(f.name)) { await loadScript('vendor/xlsx.full.min.js'); const wb = XLSX.read(await f.arrayBuffer()); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); }
        else { await loadScript('vendor/papaparse.min.js'); rows = Papa.parse(await f.text(), { header: true, skipEmptyLines: true }).data; } } catch (err) { alert('Could not read file: ' + err.message); return; }
      if (!rows.length) { alert('No rows found'); return; }
      const cols = Object.keys(rows[0]); let kind = guessKind(cols);
      const draw = () => { $('#imm', m).innerHTML = `<div class="sm" style="margin:8px 0">${rows.length} rows. What is this file? <select id="imk">${Object.entries(KINDS).map(([k, [l]]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="xs muted">Check the column matches (auto-detected):</div><div class="fgrid2">${KINDS[kind][1].map(k => `<label>${LABEL[k]}<select data-imap="${k}"><option value="">– none –</option>${cols.map(c => `<option ${guess(cols, k) === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`).join('')}</div>
        <label class="sm">Export date <input type="date" id="imd" value="${today()}"></label><div class="mfoot"><button class="btn primary" id="imgo">Save ${rows.length} rows on this device</button></div>`;
        $('#imk', m).onchange = ev => { kind = ev.target.value; draw(); };
        $('#imgo', m).onclick = async () => {
          const map = {}; $$('[data-imap]', m).forEach(s => { if (s.value) map[s.dataset.imap] = s.value; });
          const out = rows.map(r => { const o = {}; for (const k in map) { const v = r[map[k]]; o[k] = /^(ask|rent|sf|vacant|occ|dom|salePrice|loan|sfMin|sfMax|priceMax|lat|lon)$/.test(k) ? num(v) : /Date$|maturity|leaseExp/.test(k) ? dt(v) : String(v ?? '').trim(); } return o; }).filter(o => Object.values(o).some(Boolean));
          const snap = { id: uid('imp'), kind, date: $('#imd', m).value || today(), ts: Date.now(), fname: f.name, n: out.length, rows: out };
          await putSnap(snap); const msg = await afterImport(snap); toast(`Saved ${out.length} rows on this device. ${msg}`); close(); after && after();
        }; };
      draw();
    };
  });
}
const isLease = r => /lease|rent/i.test(r.status || '') || (!r.ask && r.rent);
// follow-ups + buyers created right after an import
async function afterImport(snap) {
  if (snap.kind === 'inquiry') {
    let n = 0, mt = 0;
    for (const r of snap.rows) { if (!r.name && !r.company) continue; const lease = /lease|rent/i.test((r.status || '') + (r.ptype || ''));
      const q = { id: uid('r'), name: `${r.name || r.company} (${/crexi/i.test(snap.fname) ? 'Crexi' : 'LoopNet'} inquiry ${snap.date})`, clientName: [r.name, r.company].filter(Boolean).join(', '), email: r.email || '', phone: r.phone || '', dealType: lease ? 'Lease' : 'Buy (owner-user)', status: 'Active', counties: [], munis: r.city || '', sfMin: r.sfMin || (r.sf ? Math.round(r.sf * .7) : ''), sfMax: r.sfMax || (r.sf ? Math.round(r.sf * 1.3) : ''), budgetMax: r.priceMax || '', notes: `Imported from ${snap.fname}${r.address ? '; asked about ' + r.address : ''}`, created: Date.now(), imported: snap.id };
      await save('requirements', q); n++; mt += matches(q, 60).length > 0 ? 1 : 0; }
    return `${n} buyers saved; ${mt} already match off-market leads (see Buyer alerts / Buyers).`;
  }
  if (snap.kind === 'listing') { let n = 0; for (const s of staleList([snap])) { if (s.fu) continue; const p = propFor(s.r); await addFollowup({ ownerId: p && p.ownerId || '', propertyId: p ? p.id : '', due: s.end, note: `Listing may expire around ${s.end} (estimate: ${s.basis}). ${s.r.address}, ${s.r.city}. Call only after it ends.` }); n++; } return n ? `${n} follow-ups set at expected listing end (estimate).` : ''; }
  return '';
}
// ---------- analysis ----------
const lastTwo = (S2, kind) => { const L = S2.filter(s => s.kind === kind); return [L[L.length - 1], L[L.length - 2]]; };
const domOf = (r, asOf) => r.dom || (r.listDate ? daysBetween(r.listDate, asOf) : 0);
function soldSince(r, since) { const p = propFor(r); return p && String(val(p, 'lastSaleDate') || '') >= since; }
export function expired(S2) { const [cur, prev] = lastTwo(S2, 'listing'); if (!cur || !prev) return []; const now = new Set(cur.rows.map(key));
  return prev.rows.filter(r => r.address && !now.has(key(r)) && !soldSince(r, prev.date)).map(r => ({ r, p: propFor(r), dom: domOf(r, cur.date), gone: cur.date })); }
export function staleList(S2) { const [cur, prev] = lastTwo(S2, 'listing'); if (!cur) return []; const pm = new Map((prev ? prev.rows : []).map(r => [key(r), r]));
  return cur.rows.map(r => { const d = domOf(r, cur.date), o = pm.get(key(r)), cut = o && o.ask && r.ask && r.ask < o.ask ? o.ask - r.ask : 0; if (d < 180 && !cut) return null;
    const start = r.listDate || addDays(cur.date, -d), m = isLease(r) ? 12 : 6, end = addDays(start, m * 30.4); return { r, d, cut, end: end < today() ? addDays(today(), 30) : end, basis: `listed ${start} + typical ${m}-month listing term` }; }).filter(Boolean); }
export function changes(S2) { const [cur, prev] = lastTwo(S2, 'listing'); if (!cur || !prev) return []; const pm = new Map(prev.rows.map(r => [key(r), r])), out = [];
  for (const r of cur.rows) { const o = pm.get(key(r)); if (!o) { out.push([3, r, 'New listing' + (r.ask ? ' at ' + kmoney(r.ask) : r.rent ? ` at $${r.rent}/SF` : '')]); continue; }
    if (r.owner && o.owner && r.owner.toUpperCase() !== o.owner.toUpperCase()) out.push([4, r, `New owner: ${r.owner} (was ${o.owner})`]);
    if (r.ask && o.ask && r.ask !== o.ask) out.push([3, r, `Price ${r.ask < o.ask ? 'cut' : 'raised'} ${kmoney(o.ask)} → ${kmoney(r.ask)}`]);
    if (r.occ && o.occ && r.occ < o.occ - 5) out.push([4, r, `Occupancy dropped ${o.occ}% → ${r.occ}%`]);
    if (r.vacant && o.vacant != null && r.vacant > (o.vacant || 0) * 1.2 && r.vacant - (o.vacant || 0) > 5000) out.push([3, r, `Vacant SF up ${fmt(o.vacant || 0)} → ${fmt(r.vacant)}`]); }
  return out.sort((a, b) => b[0] - a[0]).slice(0, 10); }
export function vacant9(S2) { const [cur] = lastTwo(S2, 'listing'); if (!cur) return []; return cur.rows.filter(r => isLease(r)).map(r => ({ r, mo: Math.floor(domOf(r, cur.date) / 30.4) })).filter(x => x.mo >= 9).sort((a, b) => b.mo - a.mo); }
const tenantsFor = sf => [...S.leases.values()].filter(l => +l.sf && sf && +l.sf >= sf * .6 && +l.sf <= sf * 1.5 && l.expiration && daysBetween(today(), l.expiration) <= 730 && daysBetween(today(), l.expiration) >= -30).slice(0, 5);
export function loanFlags(S2) { const out = [], seen = new Set(); for (const s of S2) for (const r of s.rows) { if (!r.maturity && !r.purchaseDate) continue; const k = key(r); if (seen.has(k)) continue; seen.add(k);
  const m = r.maturity ? daysBetween(today(), r.maturity) / 30.4 : 99, y = +String(r.purchaseDate || '').slice(0, 4); if ((m >= -3 && m <= 24) || (y >= 2019 && y <= 2022)) out.push({ r, m, y, src: s.fname }); }
  return out.sort((a, b) => a.m - b.m); }
export async function compsFor(p, n = 5) { if (!p.lat) return []; const S2 = await allSnaps(), sf = sfOf(p).sf, out = [];
  for (const s of S2) if (s.kind === 'comp') for (const r of s.rows) { const q = (!r.lat ? propFor(r) : null), lat = r.lat || (q && q.lat), lon = r.lon || (q && q.lon); if (!lat || (q && q.id === p.id)) continue;
    const mi = Math.hypot((lat - p.lat) * 69, (lon - p.lon) * 51.5); if (mi > 15) continue; out.push({ r, mi, psf: r.salePrice && r.sf ? r.salePrice / r.sf : 0 }); }
  return out.sort((a, b) => (a.mi + (sf && a.r.sf ? Math.abs(Math.log(a.r.sf / sf)) * 3 : 0)) - (b.mi + (sf && b.r.sf ? Math.abs(Math.log(b.r.sf / sf)) * 3 : 0))).slice(0, n); }

// ---------- 2.2 lease radar ----------
export function leaseRadar(S2) { const [cur] = lastTwo(S2, 'tenant'); if (!cur) return []; const [lst] = lastTwo(S2, 'listing'), spaces = lst ? lst.rows.filter(isLease) : [], rent = +cfg().rent || 8, t = today();
  return cur.rows.filter(r => r.sf >= 10000 && r.leaseExp).map(r => { const d = daysBetween(t, r.leaseExp); if (d < -60 || d > 540) return null; const th = takeHome(r.sf * (r.rent || rent) * 5 * cfg().lease / 100);
    return { r, d, th, sp: spaces.filter(s => (s.vacant || s.sf) >= r.sf * .7 && (s.vacant || s.sf) <= r.sf * 1.3).slice(0, 3) }; }).filter(Boolean).sort((a, b) => b.th - a.th); }
// ---------- Today section ----------
const row = (r, extra, p) => `<div class="pcall"><div class="pc-top"><div class="pc-who">${p ? `<a href="#/property/${esc(p.id)}"><b>${esc(r.address)}</b></a>` : `<b>${esc(r.address || r.name || '')}</b>`}<span class="xs muted">${esc(r.city || '')}${r.owner ? ' · ' + esc(r.owner) : p ? ' · ' + esc(nc(S.owners.get(p.ownerId)?.name || val(p, 'taxpayer') || '')) : ''}</span></div>${p ? `<button class="bact primary pc-call" data-call="${esc(p.id)}">Call</button>` : ''}</div><div class="pc-why">${extra}</div></div>`;
const sect = (t, n, note, body) => n ? `<details class="feedmore" ${n <= 3 ? 'open' : ''}><summary><b>${t}</b> <span class="cnt">${n}</span></summary>${note ? `<div class="xs muted" style="margin:4px 0 6px">${note}</div>` : ''}${body}</details>` : '';
export async function todayHTML() {
  const S2 = await allSnaps(); if (!S2.length) return `<div class="xs muted">No CoStar / LoopNet / Crexi files imported yet. Import one to unlock expired, stale and vacant-listing calls.</div>`;
  const lr = leaseRadar(S2), ex = expired(S2), st = staleList(S2), ch = changes(S2), va = vacant9(S2), lo = loanFlags(S2), last = S2[S2.length - 1];
  return `<div class="xs muted" style="margin-bottom:6px">${S2.length} private import${S2.length > 1 ? 's' : ''} on this device · latest ${esc(last.fname)} (${esc(last.date)})</div>
   ${sect('Lease radar', lr.length, `Tenants 10,000+ SF with leases ending in -60 to 540 days, ranked by your est. take-home (SF × rent × 5 yrs × lease % × split; rent $${+cfg().rent || 8}/SF if not in file).`, lr.slice(0, 40).map(x => row({ address: x.r.tenant || x.r.address, city: (x.r.address ? x.r.address + ', ' : '') + (x.r.city || '') }, `Lease ends ${esc(x.r.leaseExp)} (${x.d >= 0 ? x.d + ' days' : 'ended ' + -x.d + ' days ago'}) · ${fmt(x.r.sf)} SF · ≈ ${kmoney(x.th)} to you (est.)${x.r.phone ? ` · <a href="tel:${esc(String(x.r.phone).replace(/[^\d+]/g, ''))}">Call</a>` : ''}<details class="pc-sc"><summary>Script</summary><p>${esc(`Your lease is up ${new Date(x.r.leaseExp + 'T12:00').toLocaleDateString([], { month: 'long', year: 'numeric' })}. I'll get you options and leverage with your landlord before it's too late to move.`)}</p></details>${x.sp.length ? `<div class="xs">For-lease spaces that fit: ${x.sp.map(s => esc(s.address + (s.city ? ', ' + s.city : '') + ' ' + fmt(s.vacant || s.sf) + ' SF')).join('; ')}</div>` : ''}`, null)).join(''))}
   ${sect('What changed this week', ch.length, 'Latest listing export vs. the previous one.', ch.map(([, r, t]) => row(r, esc(t), propFor(r))).join(''))}
   ${sect('Listing expired', ex.length, 'In your previous export but gone now, with no recorded sale. Rule: never solicit an owner while an exclusive listing is active; call only after it has ended.', ex.map(x => row(x.r, `Was asking ${x.r.ask ? kmoney(x.r.ask) : x.r.rent ? '$' + x.r.rent + '/SF' : 'n/a'} · about ${fmt(x.dom)} days on market · gone by ${esc(x.gone)}`, x.p)).join(''))}
   ${sect('Stale listings', st.length, 'On market 180+ days or price cut. Follow-up set at expected listing end (estimate). Do not solicit while listed.', st.map(x => row(x.r, `${fmt(x.d)} days on market${x.cut ? ` · price cut ${kmoney(x.cut)}` : ''} · listing may end ~${esc(x.end)} (estimate: ${esc(x.basis)})`, propFor(x.r))).join(''))}
   ${sect('Vacant 9+ months (landlord calls)', va.length, '', va.map(x => { const t = tenantsFor(x.r.vacant || x.r.sf); return row(x.r, `For lease about ${x.mo} months${x.r.vacant || x.r.sf ? ' · ' + fmt(x.r.vacant || x.r.sf) + ' SF' : ''}<details class="pc-sc"><summary>Landlord script</summary><p>${esc(`Hi, it's [your name] with ${firm()}. Your space at ${x.r.address} has sat about ${x.mo} months. I'm tracking ${t.length || 'several'} tenants with leases ending soon in that size range, and I have a plan to get it leased. Can I show you the list?`)}</p></details>${t.length ? `<div class="xs">Tenants with leases ending (your lease list): ${t.map(l => esc(l.tenantName || 'Tenant') + ' ' + fmt(+l.sf) + ' SF, exp. ' + esc(l.expiration)).join('; ')}</div>` : ''}`, propFor(x.r)); }).join(''))}
   ${sect('Loan pressure', lo.length, 'From loan fields in your exports. Maturity within 24 months, or bought 2019-2022 (peak prices and low rates, so refinancing may hurt).', lo.slice(0, 30).map(x => row(x.r, `${x.m <= 24 ? `<b>Loan matures ${esc(x.r.maturity)}</b>` : ''}${x.y >= 2019 && x.y <= 2022 ? ` <span class="tag">Bought ${x.y}</span>` : ''}${x.r.lender ? ' · ' + esc(x.r.lender) : ''}${x.r.loan ? ' · ' + kmoney(x.r.loan) : ''}`, propFor(x.r))).join(''))}
   <details class="xs"><summary>Manage imports</summary>${S2.map(s => `<div>${esc(s.date)} · ${esc(KINDS[s.kind][0])} · ${esc(s.fname)} · ${s.n} rows <button class="btn sm ghost" data-delimp="${esc(s.id)}">Delete</button></div>`).join('')}</details>`;
}
export function bindToday(root, after) { $$('[data-delimp]', root).forEach(b => b.onclick = async () => { if (!confirm('Delete this import from this device?')) return; await delSnap(b.dataset.delimp); after(); }); }

// ---------- property page: comp book + BOV ----------
export async function propertyCompsHTML(p) {
  const C = await compsFor(p); if (!C.length) return '';
  return `<section class="card" style="margin:12px 0;padding:14px"><h2 style="margin:0 0 6px">Comp book <span class="xs muted">(your imported comps, private)</span></h2>
   ${C.map(c => `<div class="xs">${esc(c.r.address)}, ${esc(c.r.city || '')} · ${c.mi.toFixed(1)} mi · ${c.r.sf ? fmt(c.r.sf) + ' SF' : ''} · ${esc(c.r.saleDate || c.r.leaseDate || '')} · ${c.r.salePrice ? kmoney(c.r.salePrice) : c.r.rent ? '$' + c.r.rent + '/SF' : ''}${c.psf ? ` ($${Math.round(c.psf)}/SF)` : ''}</div>`).join('')}
   <button class="btn sm" id="bovimp" style="margin-top:8px">BOV one-pager with these comps</button></section>`;
}
export function bindPropertyComps(root, p) { const b = $('#bovimp', root); if (b) b.onclick = async () => { const C = await compsFor(p), ps = C.map(c => c.psf).filter(Boolean).sort((a, b) => a - b), sf = sfOf(p).sf;
  const med = ps.length ? ps[Math.floor(ps.length / 2)] : 0, lo = ps.length ? ps[0] : 0, hi = ps.length ? ps[ps.length - 1] : 0;
  const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print');
  w.document.write(`<title>BOV ${esc(val(p, 'address') || '')}</title><body style="font:14px system-ui;max-width:720px;margin:24px auto"><h1 style="font-size:20px">Broker opinion of value (estimate)</h1><p><b>${esc(nc(val(p, 'address') || ''))}, ${esc(nc(val(p, 'city') || ''))}</b>${sf ? ' · ' + fmt(sf) + ' SF' + (sfOf(p).est ? ' (estimated from roof footprint)' : '') : ''}</p>
   ${med && sf ? `<p style="font-size:18px">Estimated range: <b>${kmoney(lo * sf)} – ${kmoney(hi * sf)}</b> · midpoint about <b>${kmoney(med * sf)}</b> ($${Math.round(lo)}–$${Math.round(hi)}/SF, median $${Math.round(med)}/SF)</p>` : '<p>Not enough priced sale comps with SF to compute a range.</p>'}
   <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>Address</th><th>Miles</th><th>SF</th><th>Date</th><th>Price</th><th>$/SF</th></tr>${C.map(c => `<tr><td>${esc(c.r.address)}, ${esc(c.r.city || '')}</td><td>${c.mi.toFixed(1)}</td><td>${c.r.sf ? fmt(c.r.sf) : ''}</td><td>${esc(c.r.saleDate || c.r.leaseDate || '')}</td><td>${c.r.salePrice ? kmoney(c.r.salePrice) : c.r.rent ? '$' + c.r.rent + '/SF' : ''}</td><td>${c.psf ? '$' + Math.round(c.psf) : ''}</td></tr>`).join('')}</table>
   <p style="font-size:11px;color:#666">Estimate for discussion only; not an appraisal. Prepared by [your name], ${firm()}.</p><script>print()<\/script></body>`); w.document.close(); }; }
