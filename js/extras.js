// Extras: compare (up to 10), saved lists, ownership network, area & access, news feed, opportunity signals,
// weekly market brief, ZIP backup. Everything reads existing public-record fields or free feeds; nothing is invented.
import { $, $$, esc, toast, fmt, money, kmoney, today, daysBetween, addDays, download, toCSV, scorePill, scoreColor } from './util.js';
import { S, val, setting, setSetting, ownerProps } from './store.js';
import { scoreOf, deal, priorityOf, callList, ownerTypeOf, dealPairs, ownerDeal } from './scoring.js';
import { modal } from './ui.js';
import { buildBackup, applyBackup } from './backup.js';

// ---------- lazy JSON feeds (decrypted transparently on the private site) ----------
const J = {};
export const feed = name => J[name] || (J[name] = fetch(`data/${name}.json`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null));

// ---------- compare ----------
const CMPK = 'omi_cmp';
export const cmpIds = () => { try { return JSON.parse(localStorage.getItem(CMPK) || '[]').filter(id => S.prop.has(id)); } catch { return []; } };
export function cmpToggle(id) {
  let a = cmpIds();
  if (a.includes(id)) a = a.filter(x => x !== id); else { if (a.length >= 10) { toast('Compare holds up to 10 properties. Remove one first.'); return false; } a.push(id); }
  localStorage.setItem(CMPK, JSON.stringify(a)); cmpTray(); return a.includes(id);
}
export function cmpTray() {
  let t = document.getElementById('cmptray'); const n = cmpIds().length;
  if (!n) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement('a'); t.id = 'cmptray'; t.className = 'cmptray'; t.href = '#/compare'; document.body.appendChild(t); }
  t.textContent = `Compare (${n})`;
}
const CMPF = [
  ['Off-market score', p => scorePill(scoreOf(p).score)], ['Deal priority', p => priorityOf(p)], ['City', p => esc(val(p, 'city') || '')], ['County', p => esc(p.co || '')],
  ['Building SF', p => fmt(deal(p).sf) || '–'], ['Land (acres)', p => deal(p).acres ? deal(p).acres.toFixed(2) : '–'], ['Year built', p => esc(val(p, 'yearBuilt') || '–')],
  ['Clear height', p => esc(val(p, 'clearHeight') || '–')], ['Docks', p => esc(val(p, 'docks') || '–')], ['Est. value', p => `${kmoney(deal(p).value) || '–'} <div class="xs muted">${esc(deal(p).kind || '')}</div>`],
  ['Est. commission', p => kmoney(deal(p).commission) || '–'], ['Owner (tax bill)', p => esc(val(p, 'taxpayer') || '–')], ['Mailing state', p => esc(val(p, 'mailState') || '–')],
  ['Last sale', p => esc([val(p, 'lastSaleDate'), val(p, 'lastSalePrice') ? money(val(p, 'lastSalePrice')) : ''].filter(Boolean).join(' · ') || '–')],
  ['Market status', p => esc(val(p, 'marketStatus') || 'Not checked')], ['Top reason', p => `<span class="xs">${esc(scoreOf(p).reasons[0]?.text || '–')}</span>`],
];
export async function compareView(el) {
  const ps = cmpIds().map(id => S.prop.get(id));
  el.innerHTML = `<div class="page wide"><div class="ph"><div><h1>Compare properties</h1><div class="muted">Up to 10 side by side. Add from any property page (More ▸ Add to compare).</div></div>
    <div class="ph-act">${ps.length ? '<button class="btn" id="cmpcsv">Export CSV</button><button class="btn ghost" id="cmpclr">Clear</button>' : ''}</div></div>
    ${ps.length ? `<div class="tbl-wrap cmpwrap"><table class="grid cmp"><thead><tr><th></th>${ps.map(p => `<th><a href="#/property/${p.id}">${esc(nc(val(p, 'address') || p.pin))}</a> <button class="btn sm ghost" data-rm="${p.id}" title="Remove">×</button></th>`).join('')}</tr></thead>
    <tbody>${CMPF.map(([l, f]) => `<tr><th class="rowh">${l}</th>${ps.map(p => `<td>${f(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<section class="card"><div class="muted">Nothing to compare yet. Open a property and choose More ▸ Add to compare.</div></section>'}</div>`;
  $$('[data-rm]', el).forEach(b => b.onclick = () => { cmpToggle(b.dataset.rm); compareView(el); });
  const c = $('#cmpclr'); if (c) c.onclick = () => { localStorage.setItem(CMPK, '[]'); cmpTray(); compareView(el); };
  const x = $('#cmpcsv'); if (x) x.onclick = () => download(`compare-${today()}.csv`, toCSV(ps.map(p => Object.fromEntries([['address', val(p, 'address')], ...CMPF.map(([l, f]) => [l, String(f(p)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()])]))));
}

// ---------- saved lists ----------
export const lists = () => setting('lists', {});
async function saveLists(L) { await setSetting('lists', L); }
export function addToListModal(id) {
  const L = lists(), names = Object.keys(L);
  modal(`<h2>Save to a list</h2><div class="muted xs">Lists are saved on this device and included in backups.</div>
    <div class="morelist">${names.map(n => `<label class="toggle"><input type="checkbox" data-ln="${esc(n)}" ${L[n].ids.includes(id) ? 'checked' : ''}> ${esc(n)} <span class="xs muted">${L[n].ids.length}</span></label>`).join('') || '<div class="muted">No lists yet.</div>'}</div>
    <div class="askbox mini"><input id="newl" placeholder="New list name, e.g. Elk Grove targets"><button class="btn primary" id="mkl">Create & add</button></div>
    <div class="mfoot"><button class="btn" data-close>Done</button></div>`, m => {
    $$('[data-ln]', m).forEach(c => c.onchange = async () => { const L2 = lists(), n = c.dataset.ln; const s = new Set(L2[n].ids); c.checked ? s.add(id) : s.delete(id); L2[n] = { ...L2[n], ids: [...s] }; await saveLists({ ...L2 }); toast('List updated'); });
    $('#mkl', m).onclick = async () => { const n = $('#newl', m).value.trim(); if (!n) return; const L2 = { ...lists() }; L2[n] = { ids: [...new Set([...(L2[n]?.ids || []), id])], created: today() }; await saveLists(L2); toast(`Added to "${n}"`); m.querySelector('[data-close]').click(); };
  });
}
export async function listsView(el, name) {
  const L = lists();
  if (name && L[name]) {
    const ps = L[name].ids.map(id => S.prop.get(id)).filter(Boolean).sort((a, b) => priorityOf(b) - priorityOf(a));
    el.innerHTML = `<div class="page wide"><div class="crumb"><a href="#/lists">Saved lists</a></div><div class="ph"><div><h1>${esc(name)}</h1><div class="muted">${ps.length} properties · created ${esc(L[name].created || '')}</div></div>
      <div class="ph-act"><button class="btn" id="lcmp">Compare first 10</button><button class="btn" id="lcsv">Export CSV</button><button class="btn ghost" id="ldel">Delete list</button></div></div>
      <div class="tcards">${ps.map(p => `<a class="tcard" href="#/property/${p.id}"><span class="tc-n">${scorePill(scoreOf(p).score)}</span><div class="tc-main"><div class="tc-top"><b class="tc-name">${esc(nc(val(p, 'address') || p.pin))}</b></div><div class="tc-why">${esc([val(p, 'city'), p.co, val(p, 'taxpayer')].filter(Boolean).join(' · '))}</div></div><div class="tc-score"></div><div class="tc-val"><b>${kmoney(deal(p).value) || ''}</b><span class="xs muted">${fmt(deal(p).sf) ? fmt(deal(p).sf) + ' SF' : ''}</span></div><span class="tc-go">Open ▸</span></a>`).join('') || '<div class="pad muted">Empty list.</div>'}</div></div>`;
    $('#lcmp').onclick = () => { localStorage.setItem(CMPK, JSON.stringify(ps.slice(0, 10).map(p => p.id))); cmpTray(); location.hash = '#/compare'; };
    $('#lcsv').onclick = () => download(`list-${name.replace(/\W+/g, '-')}-${today()}.csv`, toCSV(ps.map(p => ({ address: val(p, 'address'), city: val(p, 'city'), county: p.co, pin: p.pin, owner: val(p, 'taxpayer'), score: scoreOf(p).score, priority: priorityOf(p), bldg_sf: deal(p).sf, acres: deal(p).acres.toFixed(2), est_value: Math.round(deal(p).value || 0) }))));
    $('#ldel').onclick = async () => { if (!confirm(`Delete the list "${name}"? The properties stay in the database.`)) return; const L2 = { ...lists() }; delete L2[name]; await saveLists(L2); location.hash = '#/lists'; };
    return;
  }
  const names = Object.keys(L);
  el.innerHTML = `<div class="page"><div class="ph"><div><h1>Saved lists</h1><div class="muted">Group properties into your own lists (e.g. "Elk Grove targets"). Add from any property page: More ▸ Save to list.</div></div><div class="ph-act"><a class="btn" href="#/compare">Compare (${cmpIds().length})</a></div></div>
    <div class="tcards">${names.map(n => `<a class="tcard" href="#/lists/${encodeURIComponent(n)}"><span class="tc-n">${L[n].ids.length}</span><div class="tc-main"><b class="tc-name">${esc(n)}</b><div class="tc-why">created ${esc(L[n].created || '')}</div></div><div></div><div></div><span class="tc-go">Open ▸</span></a>`).join('') || '<div class="pad muted">No lists yet.</div>'}</div></div>`;
}

// ---------- ownership network (SVG) ----------
export function networkHTML(o) {
  const ps = ownerProps(o.id); if (!ps.length) return '<div class="muted">No parcels linked.</div>';
  const ents = [...new Set(ps.map(p => String(val(p, 'taxpayer') || o.name).trim()))].slice(0, 8);
  const shown = ps.slice().sort((a, b) => deal(b).value - deal(a).value).slice(0, 24);
  const W = 640, H = 420, cx = W / 2, cy = H / 2, r1 = 95, r2 = 175;
  const epos = ents.map((e, i) => { const a = (i / ents.length) * Math.PI * 2 - Math.PI / 2; return { e, x: cx + Math.cos(a) * r1 * (ents.length > 1 ? 1 : 0), y: cy + Math.sin(a) * r1 * (ents.length > 1 ? 1 : 0), a }; });
  const nodes = shown.map((p, i) => { const a = (i / shown.length) * Math.PI * 2 - Math.PI / 2; const e = epos.find(z => z.e === String(val(p, 'taxpayer') || o.name).trim()) || epos[0]; return { p, e, x: cx + Math.cos(a) * r2, y: cy + Math.sin(a) * r2 }; });
  const short = s => s.length > 22 ? s.slice(0, 21) + '…' : s;
  return `<div class="netwrap"><svg class="net" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ownership network">
    ${epos.map(e => `<line x1="${cx}" y1="${cy}" x2="${e.x}" y2="${e.y}" class="nl"/>`).join('')}
    ${nodes.map(n => `<line x1="${n.e.x}" y1="${n.e.y}" x2="${n.x}" y2="${n.y}" class="nl2"/>`).join('')}
    <circle cx="${cx}" cy="${cy}" r="30" class="nc"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" class="nt b">${esc(short(o.name))}</text>
    ${ents.length > 1 ? epos.map(e => `<g><circle cx="${e.x}" cy="${e.y}" r="9" class="ne"/><text x="${e.x}" y="${e.y - 13}" text-anchor="middle" class="nt">${esc(short(e.e))}</text></g>`).join('') : ''}
    ${nodes.map(n => `<a href="#/property/${n.p.id}"><circle cx="${n.x}" cy="${n.y}" r="${6 + Math.min(8, Math.sqrt((deal(n.p).sf || 0) / 20000))}" fill="${scoreColor(scoreOf(n.p).score)}" class="np"><title>${esc(nc(val(n.p, 'address') || n.p.pin))} · score ${scoreOf(n.p).score} · ${fmt(deal(n.p).sf) || 0} SF</title></circle></a>`).join('')}
  </svg><div class="xs muted">Center: owner group. Inner ring: tax-bill names (entities) in the group${ents.length > 1 ? '' : ' (one name)'}. Outer ring: ${shown.length} of ${ps.length} parcels, largest value first, colored by off-market score, sized by building SF. Tap a dot to open it. Grouping is inferred from names and mailing addresses, so confirm before relying on it.</div></div>`;
}

// ---------- access & area ----------
const NODES = [['O\'Hare Airport (ORD)', 41.9786, -87.9048], ['Midway Airport', 41.7855, -87.7517], ['I-55 / I-355 (Bolingbrook)', 41.736, -88.040], ['I-88 / I-355 (Lisle)', 41.834, -88.035],
  ['I-90 / I-294 (Rosemont)', 41.992, -87.882], ['I-80 / I-355 (New Lenox)', 41.553, -87.988], ['I-55 / I-80 (Channahon)', 41.488, -88.177], ['I-57 / I-80 (Country Club Hills)', 41.580, -87.728],
  ['BNSF Logistics Park (Elwood intermodal)', 41.3908, -88.1497]];
const mi = (a, b, c, d) => { const R = 3958.8, t = x => x * Math.PI / 180, dl = t(c - a), dn = t(d - b); const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
export const access = p => p.lat ? NODES.map(([n, la, lo]) => ({ n, d: mi(p.lat, p.lon, la, lo) })).sort((a, b) => a.d - b.d) : [];
const ftmi = ft => ft < 1000 ? `${Math.round(ft)} ft` : `${(ft / 5280).toFixed(1)} mi`;
const normCo = s => String(s || '').toUpperCase().trim();
export async function intelPane(el, p) {
  const o = p.ownerId && S.owners.get(p.ownerId), acc = access(p);
  const names = [...new Set([val(p, 'taxpayer'), o?.name, ...(o?.entities || [])].filter(Boolean).map(normCo))];
  el.innerHTML = `<div class="cols"><section class="card"><div class="ch"><h2>Owner in the news</h2><span class="muted xs" id="nwhen"></span></div><div id="onews" class="muted">Loading…</div></section>
    <section class="card"><div class="ch"><h2>Access (straight-line)</h2><span class="muted xs">Approximate points; not drive time</span></div>
      ${acc.length ? `<ul class="why">${acc.slice(0, 5).map(a => `<li>${esc(a.n)} <span class="muted">· ${a.d.toFixed(1)} mi</span></li>`).join('')}</ul>` : '<div class="muted">No map location.</div>'}
      ${p.prox ? `<div class="ch"><h2>Rail & highway (Cook Assessor)</h2></div><ul class="why">${p.prox.rail ? `<li>Nearest rail line: <b>${esc(p.prox.rail)}</b> <span class="muted">· ${ftmi(p.prox.railft)}</span></li>` : ''}${p.prox.hwy ? `<li>Nearest highway: <b>${esc(p.prox.hwy)}</b> <span class="muted">· ${ftmi(p.prox.hwyft)}${p.prox.aadt ? ' · ' + fmt(p.prox.aadt) + ' vehicles/day' : ''}</span></li>` : ''}</ul><div class="xs muted">Source: Cook County Assessor parcel proximity data (distance from parcel to line; rail data 2021, traffic 2023). A rail line nearby does not mean the building has a spur.</div>` : ''}
      <div class="ch"><h2>Flood zone (FEMA)</h2></div>${floodPre(p)}<div id="flood"><button class="btn sm" id="fz">Check FEMA flood zone</button> <span class="xs muted">Sends only this map point to FEMA's public flood map service.</span></div>
      <div class="xs muted">Map overlay: Properties ▸ Map ▸ layers ▸ FEMA flood zones. Official map: <a target="_blank" rel="noopener" href="https://msc.fema.gov/portal/search?AddressQuery=${p.lat},${p.lon}">FEMA Map Service Center ↗</a></div></section></div>
    ${p.cperm && p.cperm.length ? '' : ''}`;
  const fz = $('#fz', el); if (fz) fz.onclick = async () => {
    fz.disabled = true; fz.textContent = 'Checking…';
    try {
      const u = `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?geometry=${p.lon},${p.lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false&f=json`;
      const j = await (await fetch(u)).json(); const f = (j.features || []).map(x => x.attributes);
      const sfha = f.some(a => a.SFHA_TF === 'T');
      $('#flood', el).innerHTML = f.length ? `<div><b>${sfha ? 'In a FEMA Special Flood Hazard Area' : 'Not in a Special Flood Hazard Area'}</b> · zone ${esc([...new Set(f.map(a => a.FLD_ZONE))].join(', '))}${f[0].ZONE_SUBTY ? ` <span class="xs muted">${esc(f[0].ZONE_SUBTY)}</span>` : ''}</div><div class="xs muted">Source: FEMA National Flood Hazard Layer, checked ${today()}. Point check at the parcel's map pin; the parcel edge may differ.</div>`
        : `<div>No mapped flood zone at this point.</div><div class="xs muted">FEMA NFHL, checked ${today()}. Some areas are unmapped; confirm on the official map.</div>`;
    } catch (e) { $('#flood', el).innerHTML = `<div class="muted">FEMA service did not answer (${esc(e.message)}). Use the official map link.</div>`; }
  };
  const nw = await feed('news'); const box = $('#onews', el); if (!box) return;
  if (!nw) { box.innerHTML = 'News feed not loaded yet. Use the News research link.'; return; }
  $('#nwhen', el).textContent = `Google News RSS · ${nw.updated}`;
  const hit = names.map(n => nw.co[n]).find(Boolean);
  box.classList.remove('muted');
  box.innerHTML = hit ? newsList(hit.items) + `<div class="xs muted">Headline search for ${esc(hit.q)}. Same-name companies can mix in, so open the article to confirm.</div>`
    : `<div class="muted">No recent headlines for this owner name in the nightly feed (only the larger company owners are checked). <a target="_blank" rel="noopener" href="https://news.google.com/search?q=${encodeURIComponent('"' + (o?.name || val(p, 'taxpayer') || '') + '"')}">Search Google News ↗</a></div>`;
}
const newsList = items => `<ul class="why news">${items.map(i => `<li>${i.tag ? '<span class="tag sig">signal</span> ' : ''}<a target="_blank" rel="noopener" href="${esc(i.u)}">${esc(i.t)}</a> <span class="xs muted">${esc(i.s)} · ${esc(i.d)}</span></li>`).join('')}</ul>`;

// ---------- Chicago permits table (history tab) ----------
export const cpermHTML = p => p.cperm && p.cperm.length ? `<div class="tbl-wrap"><table class="grid"><thead><tr><th>Issued</th><th>Type</th><th class="num">Reported cost</th><th>Work</th><th>Status</th></tr></thead><tbody>${p.cperm.map(x => `<tr><td>${esc(x.d)}</td><td>${x.demo ? '<span class="tag hot">Demolition</span> ' : ''}${esc(x.type || '')}<div class="xs muted">${esc(x.no || '')}</div></td><td class="num">${x.amt ? money(x.amt) : '–'}</td><td class="xs">${esc(x.desc || '')}</td><td class="xs">${esc(x.st || '')}</td></tr>`).join('')}</tbody></table></div><div class="xs muted">Source: City of Chicago building permits (data.cityofchicago.org), $50k+ reported cost plus all wrecking/demolition, last 3 yrs, matched by PIN.</div>` : '';

// ---------- Cook Assessor income assumptions (building tab) ----------
export const jumpTxt = p => `assessed value ${kmoney(p.avprev)} (${esc(p.avprevs || p.avprevy || 'prior year')}) → ${kmoney(p.avt)} (${esc(p.avy || 'latest')}), ${p.avchg > 0 ? '+' : ''}${p.avchg}%`;
export const jumpHTML = p => p.avprev && p.avt && Math.abs(+p.avchg || 0) >= 15 ? `<div class="fr"><label>Assessment change</label><div class="fv">${jumpTxt(p)} <span class="xs muted">Cook Assessor</span></div></div>` : '';
export const appealHTML = p => p.appeal ? `<div class="fr"><label>Assessment appeal</label><div class="fv">Appealed ${p.appeal.y} · ${esc(p.appeal.chg || '')}${p.appeal.pct != null && p.appeal.pct !== 0 ? ` (${p.appeal.pct > 0 ? '+' : ''}${p.appeal.pct}%)` : ''} <span class="xs muted">Cook Assessor appeals data</span></div></div>` : '';
export const cvalHTML = p => p.cval ? `<section class="card"><div class="ch"><h2>Assessor's income view (estimate)</h2><span class="muted xs">Cook Assessor commercial valuation ${p.cval.y}${p.cval.twp ? ' · ' + esc(p.cval.twp) + ' township' : ''}</span></div>
  <div class="hfacts">${[['Assumed rent', '$' + p.cval.rent.toFixed(2) + '/SF'], ['Vacancy', Math.round(p.cval.vac * 100) + '%'], ['Cap rate', (p.cval.cap * 100).toFixed(2) + '%'], ['Value / SF', p.cval.mvsf ? '$' + Math.round(p.cval.mvsf) : '–'], ['Grade', p.cval.g || '–']].map(([l, v]) => `<div class="hf"><span>${l}</span><b>${v}</b></div>`).join('')}</div>
  <div class="xs muted">These are the Assessor's mass-appraisal assumptions used to set taxes, not actual lease terms. Useful as a sanity check on rent and cap rate; confirm with real comps.</div></section>` : '';

// ---------- site screens (computed from public fields; see README) ----------
// Data center candidate: 10+ acre lot within 1 mile of a transmission substation (138 kV+) mapped in OpenStreetMap.
export const dcOf = p => p.shv != null && p.shv <= 1 && (+p.lsf || 0) >= 435600;
// Outdoor storage (IOS) land: 1.5+ acres, assessor industrial class, building covers under 25% of the lot. Needs building SF (Cook, Lake).
export const iosOf = p => (+p.lsf || 0) >= 65340 && (+p.bsf || 0) > 0 && p.bsf / p.lsf < .25;
const ac = p => ((+p.lsf || 0) / 43560).toFixed(1);
const m1 = x => x < .1 ? '<0.1' : x.toFixed(1);
export const powerTxt = p => p.subd != null ? `${m1(p.subd)} mi to nearest substation${p.subn ? ' (' + esc(p.subn) + ')' : ''}${p.shv != null && p.shvn !== p.subn ? ` · ${m1(p.shv)} mi to 138 kV+ substation (${esc(p.shvn)})` : ''}${p.hvd != null ? ` · ${p.hvd < .1 ? '<0.1' : p.hvd.toFixed(1)} mi to a 138 kV+ line` : ''}` : '';
export const siteHTML = p => [p.subd != null ? `<div class="fr"><label>Power</label><div class="fv">${powerTxt(p)}${dcOf(p) ? ' · <b>Data center candidate</b>' : ''} <span class="xs muted">OpenStreetMap (Overpass), 2026-10</span></div></div>` : '',
  iosOf(p) ? `<div class="fr"><label>Outdoor storage</label><div class="fv">${ac(p)} ac lot, building covers ${Math.round(p.bsf / p.lsf * 100)}% · IOS candidate <span class="xs muted">assessor land & building SF</span></div></div>` : '',
  p.fed ? `<div class="fr"><label>Federal contracts</label><div class="fv">${esc(nc(p.fed.n))}: ${p.fed.k} award${p.fed.k > 1 ? 's' : ''}, ${kmoney(p.fed.amt)}, latest ${esc(p.fed.d)} (matched by ${esc(p.fed.how)}) <span class="xs muted">USAspending.gov</span></div></div>` : ''].join('');
export async function fedLeads() {
  const f = await feed('fed'); if (!f) return null; const by = new Map();
  for (const a of f.awards) { const g = by.get(a.n) || { n: a.n, amt: 0, k: 0, d: '', city: a.city, ids: new Set(), how: '', ag: new Set() }; g.amt += a.amt; g.k++; if (a.d > g.d) g.d = a.d; a.ids.forEach(i => g.ids.add(i)); if (a.how) g.how = a.how; g.ag.add(a.ag); by.set(a.n, g); }
  return { src: f.src, list: [...by.values()].sort((a, b) => b.amt - a.amt) };
}
const fedPane = async el => { const r = await fedLeads(); if (!r) { el.innerHTML = '<div class="muted xs">Federal awards feed not available.</div>'; return; }
  const co = new Set([...S.companies?.values?.() || []].map(c => String(c.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '')));
  el.innerHTML = `<ul class="why">${r.list.slice(0, 30).map(g => { const p = [...g.ids].map(i => S.prop.get(i)).find(Boolean), tracked = co.has(g.n.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    return `<li><b>${esc(nc(g.n))}</b> <span class="xs muted">· ${g.k} award${g.k > 1 ? 's' : ''} · ${kmoney(g.amt)} · latest ${esc(g.d)} · ${esc(nc(g.city || ''))}${p ? ` · at ${plink(p)} (${esc(g.how)})` : ''}${tracked ? ' · tracked tenant' : ''}</span></li>`; }).join('')}</ul>
  <div class="xs muted">Tenant-expansion leads: ${esc(r.src)}. Companies winning big federal contracts often need more space. Matched to a parcel by recipient address or owner name where possible.</div>`; };
// ---------- property type: Industrial / Office / Land / Data Center ----------
// Industrial = assessor industrial classes (not vacant); Land = vacant / industrial land classes; Data Center = candidate screen (dcOf);
// Office = Cook office parcels (Assessor commercial valuations, 20k+ SF or $5M+), lazy-loaded from data/office.json only when selected.
export const TYPE4 = [['ind', 'Industrial'], ['office', 'Office'], ['land', 'Land'], ['dc', 'Data Center']];
export const isType = (p, k) => k === 'office' ? !!p.office : k === 'land' ? !!p.vac && !p.office : k === 'dc' ? dcOf(p) : !p.office && !p.vac;
let OFFICE = null;
export const officeProps = () => OFFICE || [];
export async function loadOffice() { if (OFFICE) return OFFICE; const f = await feed('office'); OFFICE = (f && f.props) || []; OFFICE.forEach(p => { if (!S.prop.has(p.id)) S.prop.set(p.id, p); }); return OFFICE; }
let ptc = null;
export const typeCounts = () => { if (!ptc || ptc.n !== S.props.length || (OFFICE && ptc.o == null)) { const c = { ind: 0, land: 0, dc: 0 }; for (const p of S.props) { if (p.office) continue; if (p.vac) c.land++; else c.ind++; if (dcOf(p)) c.dc++; } if (OFFICE) c.office = OFFICE.length; ptc = { n: S.props.length, o: OFFICE ? OFFICE.length : null, c }; } return ptc.c; };
// ---------- public business phone lines (never owner numbers; only numbers printed in the source) ----------
const PH_SRC = { FMCSA: 'Phone from FMCSA motor carrier registry', OSM: 'Phone from OpenStreetMap' };
const phLi = (x, extra = '') => `<li><a class="btn sm tel" href="tel:${x.t.replace(/\D/g, '')}">☎ ${esc(x.t)}</a> <b>${esc(nc(x.n))}</b> <span class="xs muted">· business line, not the owner · ${PH_SRC[x.s] || esc(x.s)} (${esc(x.ref)}${x.how ? ', ' + esc(x.how) : ''})${extra}</span></li>`;
export const phonesHTML = p => p.bph && p.bph.length ? `<section class="card bphc"><div class="ch"><h2>Business phones at this address</h2><span class="muted xs">public registries</span></div><ul class="why">${p.bph.map(x => phLi(x)).join('')}</ul></section>` : '';
const nk = s => String(s || '').toUpperCase().replace(/\b(LLC|INC|CORP|CORPORATION|CO|COMPANY|LTD|LP)\b/g, '').replace(/[^A-Z0-9]/g, '');
export const companyPhonesHTML = name => { const k = nk(name); if (k.length < 4) return ''; const hits = [];
  for (const p of S.props) for (const x of p.bph || []) if (nk(x.n) === k && !hits.some(h => h.x.t === x.t)) hits.push({ x, p });
  return hits.length ? `<section class="card bphc"><div class="ch"><h2>Public business phone</h2></div><ul class="why">${hits.slice(0, 3).map(h => phLi(h.x, ` · at ${plink(h.p)}`)).join('')}</ul></section>` : ''; };
// ---------- opportunity signals (command center drawer) ----------
export function oppSignals() {
  const now = today(), out = { x1031: [], succ: [], demo: [], jump: [], appeal: [], dc: [], ios: [] };
  for (const p of S.props) {
    const d = deal(p);
    const sd = val(p, 'lastSaleDate'), sp = +val(p, 'lastSalePrice') || 0, seller = p.seller || val(p, 'lastSeller');
    if (sd && seller && sp >= 1e6) { const age = daysBetween(sd, now); if (age >= 0 && age <= 180) out.x1031.push({ p, seller, sd, sp, id45: addDays(sd, 45), c180: addDays(sd, 180), age }); }
    if (d.big) {
      const ot = ownerTypeOf(p).ot, hold = p.holdplus ? 27 : sd ? daysBetween(sd, now) / 365.25 : 0;
      if ((ot === 'individual' || ot === 'trust' || ot === 'estate') && hold >= 25) out.succ.push({ p, ot, hold });
      if (p.appeal) out.appeal.push({ p, a: p.appeal });
    }
    { const ac = +val(p, 'avChange'); if (ac >= 25 && p.avprev && p.avt) out.jump.push({ p, ac }); }
    if (dcOf(p)) out.dc.push(p); if (iosOf(p)) out.ios.push(p);
    if (p.cperm) { const x = p.cperm.find(c => c.demo && daysBetween(c.d, now) <= 365); if (x) out.demo.push({ p, x }); }
  }
  out.dc.sort((a, b) => b.lsf - a.lsf); out.ios.sort((a, b) => b.lsf - a.lsf);
  out.x1031.sort((a, b) => b.sp - a.sp); out.succ.sort((a, b) => deal(b.p).value - deal(a.p).value); out.demo.sort((a, b) => b.x.d.localeCompare(a.x.d)); out.jump.sort((a, b) => deal(b.p).value - deal(a.p).value); out.appeal.sort((a, b) => b.a.y - a.a.y || deal(b.p).value - deal(a.p).value);
  return out;
}
// 1031 replacement-buyer candidates: sellers of industrial property in the last 180 days, grouped by seller.
const SKIP_SELLER = /\b(CITY OF|VILLAGE OF|COUNTY OF|STATE OF|UNITED STATES|SECRETARY OF|HUD|FANNIE|FREDDIE|FEDERAL NATIONAL|DISTRICT|AUTHORITY|ESTATE OF|BANK|RECEIVER|SHERIFF|JUDICIAL)\b/;
export function x1031Buyers(list = oppSignals().x1031) {
  const g = new Map();
  for (const x of list) { const k = String(x.seller).toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); if (!k || SKIP_SELLER.test(k)) continue;
    const e = g.get(k) || { seller: x.seller, props: [], total: 0, sd: x.sd }; e.props.push(x); e.total += x.sp; if (x.sd > e.sd) e.sd = x.sd; g.set(k, e); }
  const now = today();
  return [...g.values()].map(e => { const age = daysBetween(e.sd, now); return { ...e, age, d45: 45 - age, d180: 180 - age, id45: addDays(e.sd, 45), c180: addDays(e.sd, 180) }; }).sort((a, b) => (b.d45 > 0) - (a.d45 > 0) || b.total - a.total);
}
export const x1031List = rows => rows.length ? `<ul class="why x1031">${rows.map(e => `<li><b>${esc(nc(e.seller))}</b> sold ${e.props.slice(0, 2).map(x => plink(x.p)).join(', ')}${e.props.length > 2 ? ` +${e.props.length - 2} more` : ''} · ${kmoney(e.total)} · ${esc(e.sd)}<div class="xs muted">${e.d45 > 0 ? `<b>${e.d45} days</b> left to name replacements (by ${e.id45})` : `45-day ID window passed ${e.id45}`} · <b>${e.d180} days</b> left to close (by ${e.c180})</div></li>`).join('')}</ul>
  <div class="xs muted">Fact: seller, price and date from IL PTAX-203 / county sales (industrial, $1M+, last 180 days; government, bank and estate sellers left out). Assumption: a seller of investment property MAY be doing a 1031 exchange and need to buy a replacement within 45 days (identify) and 180 days (close). Ask; don't presume.</div>` : '<div class="muted">No industrial sellers in the last 180 days.</div>';
const plink = p => `<a href="#/property/${p.id}">${esc(nc(val(p, 'address') || p.pin))}</a> <span class="xs muted">${esc(nc(val(p, 'city') || ''))}</span>`;
export function oppHTML() {
  const o = oppSignals();
  const tab = (k, l, n) => `<button class="${k === 'x1031' ? 'on' : ''}" data-otab="${k}">${l} <span class="xs muted">${n}</span></button>`;
  const ul = rows => rows.length ? `<ul class="why">${rows.join('')}</ul>` : '<div class="muted">None right now.</div>';
  return `<div class="tabs sm" role="tablist">${tab('x1031', '1031 window', o.x1031.length)}${tab('succ', 'Succession watch', o.succ.length)}${tab('demo', 'Demolition permits', o.demo.length)}${tab('jump', 'Assessment jumps', o.jump.length)}${tab('appeal', 'Tax appeals', o.appeal.length)}${tab('dc', 'Data center sites', o.dc.length)}${tab('ios', 'Outdoor storage land', o.ios.length)}${tab('fed', 'Federal contracts', '')}${tab('loans', 'Loan maturities (est.)', '')}${tab('vacant', 'Likely vacant', '')}</div>
   <div data-opane="x1031">${x1031List(x1031Buyers(o.x1031).slice(0, 25))}</div>
   <div data-opane="succ" hidden>${ul(o.succ.slice(0, 25).map(x => `<li>${plink(x.p)} · ${esc(val(x.p, 'taxpayer') || '')} <span class="xs muted">· ${x.ot} owner · held ${x.p.holdplus ? '27+' : Math.floor(x.hold)} yrs · ${kmoney(deal(x.p).value)}</span></li>`))}<div class="xs muted">Proxy only: very long hold plus an individual, trust or estate owner name (big deals). Owner age is not in public records; this flags possible estate or succession planning, not a fact.</div></div>
   <div data-opane="demo" hidden>${ul(o.demo.slice(0, 25).map(x => `<li>${plink(x.p)} <span class="xs muted">· demolition permit ${esc(x.x.d)} · ${esc(x.x.desc.slice(0, 90))}</span></li>`))}<div class="xs muted">City of Chicago wrecking/demolition permits in the last 12 months (data.cityofchicago.org). Often signals redevelopment or a site coming to market.</div></div>
   <div data-opane="jump" hidden>${ul(o.jump.slice(0, 30).map(x => `<li>${plink(x.p)} <span class="xs muted">· ${jumpTxt(x.p)} · ${kmoney(deal(x.p).value)}</span></li>`))}<div class="xs muted">Cook County Assessor assessed values (open data uzyt-m557), latest reassessment vs the prior year, +25% or more; biggest properties first. A higher tax bill is coming; owners may appeal, re-tenant or sell. Many 2026 jumps come from the area-wide reassessment. Other counties' free data has no prior-year values, so they aren't covered.</div></div>
   <div data-opane="dc" hidden>${ul(o.dc.slice(0, 30).map(p => `<li>${plink(p)} <span class="xs muted">· ${ac(p)} ac${p.bsf ? ' · ' + fmt(p.bsf) + ' SF' : ''} · ${powerTxt(p)}</span></li>`))}<div class="xs muted">Data center candidates: 10+ acre lots within 1 mile of a transmission substation (138 kV+) mapped in OpenStreetMap (Overpass API, fetched 2026-10-03; OSM coverage can be incomplete). A screen, not a utility capacity check.</div></div>
   <div data-opane="ios" hidden>${ul(o.ios.slice(0, 30).map(p => `<li>${plink(p)} <span class="xs muted">· ${ac(p)} ac · building ${fmt(p.bsf)} SF (${Math.round(p.bsf / p.lsf * 100)}% coverage) · ${esc(nc(val(p, 'city') || ''))}</span></li>`))}<div class="xs muted">Outdoor storage (IOS) candidates: 1.5+ acres, assessor industrial class (used in place of zoning, which isn't in free county data), building under 25% of the lot. Cook and Lake only: other counties' free data has no building SF. Also a filter on Properties.</div></div>
   <div data-opane="fed" hidden data-fed><div class="muted xs">Loading…</div></div>
   <div data-opane="loans" hidden data-lazy="loans"><div class="muted xs">Loading…</div></div>
   <div data-opane="vacant" hidden data-lazy="vacant"><div class="muted xs">Loading…</div></div>
   <div data-opane="appeal" hidden>${ul(o.appeal.slice(0, 25).map(x => `<li>${plink(x.p)} <span class="xs muted">· appealed ${x.a.y} · ${esc(x.a.chg || '')}${x.a.pct != null && x.a.pct !== 0 ? ` (${x.a.pct > 0 ? '+' : ''}${x.a.pct}%)` : ''} · ${kmoney(deal(x.p).value)}</span></li>`))}<div class="xs muted">Cook Assessor appeals for big industrial/commercial properties, last 3 years. An appeal shows the owner is actively fighting its tax bill: a cost-pressure clue, not a sale signal by itself.</div></div>`;
}
export function bindOpp(root) { $$('[data-lazy]', root).forEach(pn => $(`[data-otab="${pn.dataset.lazy}"]`, root).addEventListener('click', async () => { if (pn.dataset.f) return; pn.dataset.f = 1; const M = await import('./sheets.js');
    if (pn.dataset.lazy === 'loans') { const L = M.loanCalendar(10); pn.innerHTML = `<div class="xs muted">${L.length} SBA 504 loans with an ESTIMATED maturity in the next 10 years (approval date + term from SBA FOIA data; refinancing or prepayment isn't known). A maturing loan can mean a refinance or sale decision.</div>${M.loanCalHTML(L)}`; }
    else { const L = M.vacancyList(), nl = L.filter(x => x.v.likely).length; pn.innerHTML = `<div class="xs muted">${nl} likely vacant, ${L.length - nl} possibly vacant (properties flagged: ${L.length})</div>${M.vacancyHTML(L)}`; } }));
  const fp = $('[data-fed]', root); if (fp) $('[data-otab="fed"]', root).addEventListener('click', () => { if (!fp.dataset.f) { fp.dataset.f = 1; fedPane(fp); } });
  $$('[data-otab]', root).forEach(b => b.onclick = () => { $$('[data-otab]', root).forEach(x => x.classList.toggle('on', x === b)); $$('[data-opane]', root).forEach(p => p.hidden = p.dataset.opane !== b.dataset.otab); }); }

// ---------- weekly market brief ----------
export async function briefView(el) {
  const now = today(), [mk, nw, wn] = await Promise.all([feed('market'), feed('news'), feed('warn')]);
  const recent = (d, n) => d && daysBetween(d, now) >= 0 && daysBetween(d, now) <= n;
  const sales = S.props.filter(p => recent(val(p, 'lastSaleDate'), 30) && +val(p, 'lastSalePrice') > 0).sort((a, b) => +val(b, 'lastSalePrice') - +val(a, 'lastSalePrice'));
  const perms = S.props.flatMap(p => (p.cperm || []).filter(c => recent(c.d, 30)).map(c => ({ p, c }))).sort((a, b) => (b.c.amt || 0) - (a.c.amt || 0));
  const demos = perms.filter(x => x.c.demo);
  const warn = (wn?.ev || []).filter(e => recent(e.d || e.date, 60)).slice(0, 6);
  const calls = callList(5, true), opp = oppSignals();
  const ser = (mk?.series || []).map(s => { const o = s.obs, last = o[o.length - 1], yr = o.length > 12 ? o[o.length - 13] : null; return { ...s, last, chg: yr ? last[1] - yr[1] : null }; });
  const area = (nw?.area || []).flatMap(a => a.items).filter((x, i, A) => A.findIndex(y => y.t === x.t) === i).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 8);
  const sigNews = Object.entries(nw?.co || {}).flatMap(([k, v]) => v.items.filter(i => i.tag && recent(i.d, 30)).map(i => ({ k, i }))).sort((a, b) => b.i.d.localeCompare(a.i.d)).slice(0, 8);
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  const tw = {}; S.props.forEach(p => { if (p.cval && p.cval.twp) (tw[p.cval.twp] ||= []).push(p.cval); });
  const twp = Object.entries(tw).filter(([, a]) => a.length >= 15).map(([t, a]) => ({ t, n: a.length, rent: med(a.map(x => x.rent)), cap: med(a.map(x => x.cap).filter(Boolean)), vac: med(a.map(x => x.vac)), y: Math.max(...a.map(x => x.y)) })).sort((a, b) => b.n - a.n).slice(0, 12);
  el.innerHTML = `<div class="page brief"><div class="ph"><div><h1>Market brief</h1><div class="muted">Week of ${now} · Chicagoland industrial · built on this device from public records and free feeds</div></div><div class="ph-act"><button class="btn" id="bcopy">Copy text</button><button class="btn" id="bmail">Email to me</button><button class="btn primary" onclick="window.print()">Print / save PDF</button></div></div>
   <section class="card"><div class="ch"><h2>Indicators</h2><span class="xs muted">${esc(mk?.source || 'FRED')} · ${esc(mk?.updated || '')}</span></div>
     ${ser.length ? `<div class="kpis bk">${ser.map(s => `<div class="kpi"><b>${s.unit === '%' ? s.last[1].toFixed(1) + '%' : s.unit === 'k' ? s.last[1].toFixed(1) + 'k' : s.last[1].toFixed(1)}</b><span>${esc(s.name)}</span><small class="muted">${esc(s.last[0])}${s.chg != null ? ` · ${s.chg >= 0 ? '+' : ''}${s.chg.toFixed(1)}${s.unit === '%' ? ' pts' : ''} vs yr ago` : ''}</small></div>`).join('')}</div>` : '<div class="muted">Indicators not loaded.</div>'}</section>
   <div class="cols"><section class="card"><div class="ch"><h2>Recorded sales, last 30 days</h2><span class="xs muted">${sales.length} sales</span></div>${sales.length ? `<ul class="why">${sales.slice(0, 6).map(p => `<li>${plink(p)} · ${kmoney(+val(p, 'lastSalePrice'))} <span class="xs muted">${esc(val(p, 'lastSaleDate'))}${p.buyer ? ' · buyer ' + esc(p.buyer) : ''}</span></li>`).join('')}</ul>` : '<div class="muted">None recorded in the data yet (sales post with a lag).</div>'}</section>
   <section class="card"><div class="ch"><h2>Who to call</h2></div><ul class="why">${calls.map(x => `<li><a href="#/prospect/${x.o.id}">${esc(nc(x.o.name))}</a> <span class="xs muted">${esc(x.R[0]?.text || '')}</span></li>`).join('')}</ul></section></div>
   <div class="cols"><section class="card"><div class="ch"><h2>Chicago permits, last 30 days</h2><span class="xs muted">${perms.length} permits · ${demos.length} demolitions</span></div>${perms.length ? `<ul class="why">${perms.slice(0, 6).map(x => `<li>${x.c.demo ? '<span class="tag hot">Demo</span> ' : ''}${plink(x.p)} · ${x.c.amt ? kmoney(x.c.amt) : ''} <span class="xs muted">${esc(x.c.d)} · ${esc((x.c.desc || '').slice(0, 70))}</span></li>`).join('')}</ul>` : '<div class="muted">None in the last 30 days.</div>'}</section>
   <section class="card"><div class="ch"><h2>WARN notices, last 60 days</h2></div>${warn.length ? `<ul class="why">${warn.map(e => `<li>${esc(e.name || '')} <span class="xs muted">${esc(e.city || '')} · ${esc(e.d || e.date || '')}${e.n ? ' · ' + esc(e.n) + ' workers' : ''}</span></li>`).join('')}</ul>` : '<div class="muted">None in the last 60 days.</div>'}</section></div>
   <div class="cols"><section class="card"><div class="ch"><h2>Opportunity signals</h2></div><ul class="why"><li>${opp.x1031.length} sellers in a possible 1031 window (sold within 180 days, $1M+)</li><li>${opp.succ.length} big properties on succession watch</li><li>${opp.demo.length} demolition permits in the last 12 months</li><li>${opp.jump.length} Cook properties with a 25%+ assessment jump</li></ul></section>
   <section class="card"><div class="ch"><h2>Owner headlines (expansion, hiring, closings)</h2></div>${sigNews.length ? `<ul class="why news">${sigNews.map(x => `<li><a target="_blank" rel="noopener" href="${esc(x.i.u)}">${esc(x.i.t)}</a> <span class="xs muted">${esc(x.i.s)} · ${esc(x.i.d)}</span></li>`).join('')}</ul>` : '<div class="muted">No flagged owner headlines this month.</div>'}</section></div>
   ${twp.length ? `<section class="card"><div class="ch"><h2>Assessor-assumed industrial rents (Cook)</h2><span class="xs muted">Median by township · Cook Assessor commercial valuation · estimates, not leases</span></div><div class="tbl-wrap"><table class="grid"><thead><tr><th>Township</th><th class="num">Buildings</th><th class="num">Median rent $/SF</th><th class="num">Median cap rate</th><th class="num">Median vacancy</th><th class="num">Year</th></tr></thead><tbody>${twp.map(t => `<tr><td>${esc(t.t)}</td><td class="num">${t.n}</td><td class="num">$${t.rent.toFixed(2)}</td><td class="num">${(t.cap * 100).toFixed(1)}%</td><td class="num">${Math.round(t.vac * 100)}%</td><td class="num">${t.y}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
   <section class="card"><div class="ch"><h2>Area headlines</h2><span class="xs muted">Google News RSS · ${esc(nw?.updated || '')}</span></div>${area.length ? newsList(area) : '<div class="muted">Feed not loaded.</div>'}</section>
   <div class="disc xs">Facts come from public records and free feeds, each labeled with its source and date. Signals are leads to verify, not conclusions. Google News RSS is offered for personal, non-commercial use.</div></div>`;
  import('./sheets.js').then(M => M.bindBriefShare(el));
}

// ---------- ZIP backup (store-only ZIP, no library) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
export function zip(files) { // files: [[name, string]]
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const [name, text] of files) {
    const nb = enc.encode(name), db = enc.encode(text), c = crc32(db);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, c, true); h.setUint32(18, db.length, true); h.setUint32(22, db.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, db);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint32(16, c, true); ch.setUint32(20, db.length, true); ch.setUint32(24, db.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    cen.push(new Uint8Array(ch.buffer), nb); off += 30 + nb.length + db.length;
  }
  const csize = cen.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
export function unzipFile(buf, want) { // reads our own store-only ZIPs
  const v = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder(); let i = 0;
  while (i + 30 <= buf.byteLength && v.getUint32(i, true) === 0x04034b50) {
    const method = v.getUint16(i + 8, true), size = v.getUint32(i + 18, true), nl = v.getUint16(i + 26, true), xl = v.getUint16(i + 28, true);
    const name = dec.decode(u8.subarray(i + 30, i + 30 + nl)), start = i + 30 + nl + xl;
    if (name === want) { if (method !== 0) throw new Error('Compressed ZIP entries are not supported; use the JSON backup'); return dec.decode(u8.subarray(start, start + size)); }
    i = start + size;
  }
  return null;
}
export async function downloadZipBackup() {
  const bk = buildBackup(), files = [['backup.json', JSON.stringify(bk)], ['README.txt', `Off-Market Industrial backup ${today()}.\nRestore: Tools & data > Restore backup, choose this .zip (or backup.json inside it).\nCSV files are for spreadsheets; restore uses backup.json.`]];
  for (const k of ['owners', 'companies', 'leases', 'requirements', 'activities', 'followups', 'comps', 'properties']) if (bk[k] && bk[k].length) files.push([`${k}.csv`, toCSV(bk[k])]);
  const L = lists(); if (Object.keys(L).length) files.push(['lists.csv', toCSV(Object.entries(L).flatMap(([n, l]) => l.ids.map(id => ({ list: n, property_id: id, address: S.prop.get(id) ? val(S.prop.get(id), 'address') : '' }))))]);
  const a = document.createElement('a'); a.href = URL.createObjectURL(zip(files)); a.download = `omi-backup-${today()}.zip`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  await setSetting('lastBackup', new Date().toISOString()); toast('ZIP backup downloaded (backup.json + CSVs).');
}
export async function restoreAny(file) {
  if (/\.zip$/i.test(file.name)) { const t = unzipFile(await file.arrayBuffer(), 'backup.json'); if (!t) throw new Error('backup.json not found in the ZIP'); await applyBackup(JSON.parse(t)); }
  else await applyBackup(JSON.parse(await file.text()));
  toast('Backup restored');
}

// Precomputed flood flag (FEMA NFHL Special Flood Hazard Areas vs the parcel's center point; see sources.apply_flood)
export function floodPre(p) {
  const src = S.meta?.sources?.flood; if (!src) return '';
  const when = `FEMA NFHL, ${esc(src.fetched || '')}, parcel center point`;
  return p.flood ? `<div class="fr"><b>In a FEMA Special Flood Hazard Area</b> · zone ${esc(p.flood.z || '')}${p.flood.sub ? ` · ${esc(nc(p.flood.sub))}` : ''} <span class="xs muted">${when}</span></div>`
    : p.lat ? `<div class="fr">Parcel center is not in a mapped Special Flood Hazard Area <span class="xs muted">${when}. Edges of the parcel may still be; check below.</span></div>` : '';
}
// ---------- FEMA flood overlay for Leaflet maps ----------
export function floodLayer() {
  if (!window.L) return null;
  const T = L.TileLayer.extend({ getTileUrl(c) { const n = 2 ** c.z, s = 20037508.342789244 * 2 / n, x0 = -20037508.342789244 + c.x * s, y1 = 20037508.342789244 - c.y * s; return `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export?bbox=${x0},${y1 - s},${x0 + s},${y1}&bboxSR=3857&imageSR=3857&size=256,256&layers=show:28&format=png32&transparent=true&f=image`; } });
  return new T('', { opacity: .55, minZoom: 12, maxZoom: 19, attribution: 'Flood zones: FEMA NFHL' });
}

// ---------- activity stats (professional, no confetti) ----------
const CONNECT = new Set(['Call back later', 'Send info', 'Interested', 'Meeting set', 'Not interested']);
export function activityStats() {
  const day = ts => new Date(ts).toLocaleDateString('en-CA'), now = today();
  const wk = new Date(now + 'T12:00:00'); wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7)); const wkStart = wk.toLocaleDateString('en-CA');
  const calls = [...S.activities.values()].filter(a => a.type === 'Call' && a.ts);
  const callDays = new Set(calls.map(a => day(a.ts)));
  const week = calls.filter(a => day(a.ts) >= wkStart);
  let streak = 0; const d = new Date(now + 'T12:00:00'); if (!callDays.has(now)) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 400; i++) { const k = d.toLocaleDateString('en-CA'), wd = d.getDay(); if (callDays.has(k)) streak++; else if (wd !== 0 && wd !== 6) break; d.setDate(d.getDate() - 1); }
  const done = [...S.followups.values()].filter(f => f.done && f.doneAt && day(f.doneAt) >= wkStart).length;
  return { today: calls.filter(a => day(a.ts) === now).length, week: week.length, connects: week.filter(a => CONNECT.has(a.result)).length, meetings: week.filter(a => a.result === 'Meeting set').length, streak, done, goal: +setting('weeklyCallGoal', 50) || 50 };
}
export function statsHTML() {
  const s = activityStats(), pct = Math.min(100, Math.round(100 * s.week / s.goal));
  return `<div class="kpis bk"><div class="kpi"><b>${s.today}</b><span>Calls today</span></div><div class="kpi"><b>${s.week} / ${s.goal}</b><span>Calls this week</span><div class="pbar"><i style="width:${pct}%"></i></div></div><div class="kpi"><b>${s.connects}</b><span>Conversations this week</span><small class="muted">${s.week ? Math.round(100 * s.connects / s.week) : 0}% connect rate</small></div><div class="kpi"><b>${s.meetings}</b><span>Meetings set this week</span></div><div class="kpi"><b>${s.streak}</b><span>Calling streak (workdays)</span></div><div class="kpi"><b><input id="wgoal" type="number" min="5" step="5" value="${s.goal}" aria-label="Weekly call goal" class="goal-in"></b><span>Weekly call goal</span></div></div>
  <div class="xs muted">Counted from the calls you log on this device. Weeks start Monday.</div>`;
}
export function bindStats(root, redraw) { const g = $('#wgoal', root); if (g) g.onchange = async () => { await setSetting('weeklyCallGoal', Math.max(5, +g.value || 50)); redraw && redraw(); }; }
export const statsLine = () => { const s = activityStats(); return `Today ${s.today} calls · week ${s.week}/${s.goal} · ${s.connects} conversations · streak ${s.streak}`; };

// ---------- plain display helpers ----------
const KEEPUP = new Set(['LLC', 'LP', 'LLP', 'L.L.C.', 'USA', 'US', 'IL', 'NA', 'II', 'III', 'IV', 'PLC', 'REIT', 'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'ORD', 'PO', 'IHB', 'BNSF', 'CSX', 'UPS']);
// Title-case a public-record name or address ("KINDER MORGAN LIQUIDS LLC" -> "Kinder Morgan Liquids LLC")
const TITLE = new Set(['ST', 'RD', 'DR', 'CT', 'LN', 'PL', 'HWY', 'PKWY', 'BLVD', 'CTR', 'MT', 'FT', 'MFG', 'BLDG', 'DEPT', 'MGT', 'MGMT', 'CNTR', 'TWP']);
// Unambiguous truncations / typos in public-record owner names, expanded for display only (stored data unchanged)
const ABBR = [[/\bLAND TRU?S?T?$|\bLAND TR\b|\bLAND TRU\b/g, 'LAND TRUST'], [/\bPROP MGT\b/g, 'PROPERTY MANAGEMENT'], [/\bMGT\b|\bMGMT\b/g, 'MANAGEMENT'], [/\bENTERPPRISES\b/g, 'ENTERPRISES'],
  [/\bINTL\b/g, 'INTERNATIONAL'], [/\bNATL\b/g, 'NATIONAL'], [/\bHLDGS?\b/g, 'HOLDINGS'], [/\bP(?:R)?TNRS\b/g, 'PARTNERS'], [/\bPROPS\b/g, 'PROPERTIES'], [/\bINVS\b/g, 'INVESTMENTS'], [/\bASSOCS\b/g, 'ASSOCIATES'], [/\bCORPN\b/g, 'CORPORATION']];
const unabbr = s => { let u = String(s || ''); if (u !== u.toUpperCase()) return u; for (const [rx, r] of ABBR) u = u.replace(rx, r); return u; };
export const nc = s0 => String(unabbr(s0) || '').replace(/[A-Za-z][A-Za-z.']*/g, (w, i, all) => { const u = w.toUpperCase(); if (i > 0 && /\d/.test(all[i - 1])) return w.toLowerCase(); if (KEEPUP.has(u)) return u; if (TITLE.has(u)) return u[0] + u.slice(1).toLowerCase(); if (!/[AEIOUY]/.test(u) && u.length <= 4) return u; if (w !== u) return w; return u[0] + u.slice(1).toLowerCase(); }).replace(/\bMc([a-z])/g, (m, c) => 'Mc' + c.toUpperCase());
// One short plain phrase from the top reasons ("Owned 27+ yrs · Owner in TX")
export function shortWhy(reasons, max = 2) {
  const out = [];
  for (const r of (reasons || []).filter(r => r.pts > 0).sort((a, b) => b.pts - a.pts)) {
    const t = r.text || ''; let s = '';
    if (r.k === 'longHold') { const m = t.match(/(\d+)\+? yrs/); s = m ? `Owned ${m[1]}${/\+/.test(t) ? '+' : ''} yrs` : 'Long-time owner'; }
    else if (r.k === 'absentee') { const m = t.match(/out of state \((\w+)\)/); s = m ? `Owner based in ${m[1]}` : 'Absentee owner'; }
    else if (r.k === 'ownerType') s = /Estate/.test(t) ? 'Estate-owned' : /Trust/.test(t) ? 'Trust-owned' : /Individual/.test(t) ? 'Individual owner' : /Small LLC/.test(t) ? 'Small private owner' : '';
    else if (r.k === 'oldBuilding') { const m = t.match(/Built (\d{4})/); s = m ? `Built ${m[1]}` : ''; }
    else if (r.k === 'underused') s = /Vacant/.test(t) ? 'Vacant land' : 'Underused site';
    else if (r.k === 'multiParcel') s = '';
    else if (/Plant closing/.test(t)) s = 'Plant closing notice';
    else if (/Layoff/.test(t)) s = 'Layoff notice';
    else if (/Lease expires/.test(t)) s = 'Lease expiring';
    else if (/Motivation/.test(t)) s = 'Motivated owner';
    else if (/delinquent/i.test(t)) s = 'Back taxes on record';
    else if (/SBA 504/.test(t)) s = 'Loan coming due';
    else if (/Assessment up/.test(t)) s = 'Tax bill jumping';
    else if (/Distressed sale/.test(t)) s = 'Distressed sale';
    else if (/violations|311/.test(t)) s = 'Building violations';
    else if (/incentive class/.test(t)) s = 'Tax incentive may end';
    else if (r.kind === 'fresh' || /changed|Just sold/.test(t)) s = 'Recent record change';
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out.join(' · ');
}

// ---------- Stats page (numbers moved off the Today screen) ----------
export async function statsView(el) {
  const now = today(), fus = [...S.followups.values()].filter(f => !f.done);
  const overdue = fus.filter(f => f.due < now).length, due = fus.filter(f => f.due === now).length;
  const fresh = (S.changes?.ev || []).filter(e => daysBetween(e.d, now) <= 30 && S.prop.has(e.id) && e.t !== 'new').length;
  const reqs = [...S.requirements.values()].filter(r => (r.status || 'Active') === 'Active').length;
  const pipe = [...S.owners.values()].filter(o => ['Interested', 'Meeting set', 'Proposal / BOV', 'Listing / deal'].includes(o.stage)).reduce((s, o) => s + ownerDeal(o.id).commission, 0);
  const k = (n, l) => `<div class="kpi"><b>${n}</b><span>${l}</span></div>`;
  el.innerHTML = `<div class="page"><div class="ph"><div><h1>Stats</h1><div class="muted">Your pipeline and calling activity</div></div></div>
    <section class="card"><div class="ch"><h2>Pipeline</h2></div><div class="kpis bk">${k(overdue, 'Overdue follow-ups')}${k(due, 'Due today')}${k(fresh, 'Fresh signals (30 days)')}${k(reqs, 'Active buyers / reqs')}${k(dealPairs(999, setting('bigOnly', true)).length, 'Buyer ↔ seller pairs')}${k(kmoney(pipe) || '$0', 'Est. commission in active pipeline')}</div></section>
    <section class="card"><div class="ch"><h2>Your week</h2></div><div id="wkstats">${statsHTML()}</div></section></div>`;
  const w = $('#wkstats', el); bindStats(w, () => statsView(el));
}
