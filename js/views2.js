import { nc } from './extras.js';
import { $, $$, esc, fmt, money, kmoney, today, addDays, d8, badge, CONF, toast, toCSV, download, uid, scorePill, loadScript, daysBetween } from './util.js';
import { S, save, remove, val, OPT, STAGES, ownerProps, activitiesFor, setting, setSetting, addFollowup, FIELDS, FBY, loadAll } from './store.js';
import { downloadBackup, restoreFromFile } from './backup.js';
import { allScores, sellersForReq, matches, expansion, EXP, leaseInfo, deal, ownerDeal, isBuySide, WEIGHT_DEFS, weights, scoreOf, priorityOf } from './scoring.js';
import { table, modal, confSelect, stageSelect, prioSelect, kindTag, quickLogHTML, bindQuickLog, activityHTML, linksHTML } from './ui.js';
import { companyLinks, MARKET } from './markets.js';
import { VARS } from './templates.js';
import * as db from './db.js';
import { helpers, propRow, ownerRow, DISCLAIMER } from './views.js';
const oName = (...a) => helpers.oName(...a), dealCell = (...a) => helpers.dealCell(...a), commCell = (...a) => helpers.commCell(...a), sfAc = (...a) => helpers.sfAc(...a), bigTag = (...a) => helpers.bigTag(...a), stageTag = (...a) => helpers.stageTag(...a);
const DEAL_TYPES = ['Buy (owner-user)', 'Investment', 'Lease', 'Land'];

// ================= BUYERS & REQUIREMENTS =================
export async function requirements(el, id) {
  if (id === 'new') { const r = { id: uid('r'), name: 'New buyer / requirement', dealType: 'Buy (owner-user)', status: 'Active', counties: [], created: Date.now() }; await save('requirements', r); location.replace(`#/requirement/${r.id}`); return; }
  const rows = [...S.requirements.values()];
  el.innerHTML = `<div class="page"><div class="ph"><div><h1>Buyers & requirements</h1><div class="muted">Owner-user buyers, investors, tenants and land buyers. Each one is matched against every parcel to produce a seller / owner call list.</div></div><div class="ph-act"><a class="btn primary" href="#/requirements/new">+ Buyer / requirement</a><button class="btn ghost" id="exp">Export CSV</button></div></div><div id="rt"></div></div>`;
  table($('#rt'), rows, [
    { k: 'name', l: 'Name', h: r => `<a href="#/requirement/${r.id}">${esc(r.name)}</a>${r.sample ? ' <span class="tag">SAMPLE</span>' : ''}<div class="xs muted">${esc(r.clientName || '')}</div>`, v: r => r.name },
    { k: 'dealType', l: 'Type', v: r => r.dealType }, { k: 'sf', l: 'SF range', h: r => `${r.sfMin ? fmt(r.sfMin) : '?'} – ${r.sfMax ? fmt(r.sfMax) : '?'}` },
    { k: 'area', l: 'Area', h: r => esc([...(r.counties || []), r.munis].filter(Boolean).join(', ')) },
    { k: 'budget', l: 'Budget', h: r => r.budgetMax ? kmoney(r.budgetMax) : r.maxRent ? '$' + r.maxRent + '/SF' : '' },
    { k: 'n', l: 'Matches (60+)', h: r => matches(r, 60).length }, { k: 'status', l: 'Status', v: r => r.status || 'Active' },
  ], { href: r => `#/requirement/${r.id}`, empty: 'No buyers or requirements yet.' });
  { const X = await import('./extras.js'); const xb = X.x1031Buyers(); const host = document.createElement('details'); host.className = 'sect'; host.dataset.sect = 'x1031';
    host.innerHTML = `<summary><span class="st-t"><h2>Possible 1031 replacement buyers</h2><span class="cnt">${xb.length}</span></span><span class="st-d">Recent industrial sellers who may need to buy</span></summary><div class="sect-b">${X.x1031List(xb.slice(0, 40))}</div>`;
    (el.querySelector('.page') || el).appendChild(host); }
  { const B = await import('./buyers.js'); const bp = B.buyerProfiles().filter(b => b.n >= 2); const host = document.createElement('details'); host.className = 'sect'; host.dataset.sect = 'bprof';
    host.innerHTML = `<summary><span class="st-t"><h2>Active industrial buyers (public sales)</h2><span class="cnt">${bp.length}</span></span><span class="st-d">Repeat buyers in the last ${B.BUYER_YEARS} years: deals, $, size, $/SF, areas</span></summary><div class="sect-b">${B.buyerProfilesHTML(60)}</div>`;
    (el.querySelector('.page') || el).appendChild(host); }
  $('#exp').onclick = () => download(`requirements-${today()}.csv`, toCSV(rows.map(({ id, ...r }) => ({ id, ...r, counties: (r.counties || []).join('|') }))));
}
export async function requirement(el, id) {
  const r = S.requirements.get(id); if (!r) { el.innerHTML = '<div class="page">Not found.</div>'; return; }
  const buy = isBuySide(r), res = sellersForReq(r, 300);
  const byOwner = new Map(); for (const m of res) if (m.p.ownerId) { const g = byOwner.get(m.p.ownerId) || { o: S.owners.get(m.p.ownerId), best: m, n: 0 }; g.n++; byOwner.set(m.p.ownerId, g); }
  const callers = [...byOwner.values()].filter(g => g.o && g.o.stage !== 'Do not contact');
  const inp = (k, l, t = 'text') => `<label>${l}<input name="${k}" type="${t}" value="${esc(r[k] ?? '')}"></label>`;
  el.innerHTML = `<div class="page"><div class="ph"><div><div class="crumb"><a href="#/requirements">Buyers & requirements</a></div><h1>${esc(r.name)}</h1><div class="muted">${esc(r.dealType)} · ${res.length} matching properties · ${callers.length} owners to call</div></div><div class="ph-act"><button class="btn ghost" id="del">Delete</button></div></div>
    <section class="card"><div class="ch"><h2>Criteria</h2></div><form id="rf" class="fgrid2">
      ${inp('name', 'Name')}${inp('clientName', 'Client (buyer / tenant)')}<label>Type<select name="dealType">${DEAL_TYPES.map(t => `<option ${t === r.dealType ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Asset type<select name="assetType"><option value="">Any</option>${OPT.propType.map(t => `<option ${t === r.assetType ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${inp('sfMin', 'Min SF', 'number')}${inp('sfMax', 'Max SF', 'number')}${inp('landMinAc', 'Min land (acres)', 'number')}
      ${inp('budgetMax', 'Max price / budget ($)', 'number')}${inp('maxRent', 'Max rent ($/SF/yr)', 'number')}${inp('clearMin', 'Min clear height (ft)', 'number')}${inp('docksMin', 'Min docks', 'number')}${inp('yearMin', 'Built after (year)', 'number')}
      <label class="full">Counties <span class="chips">${Object.keys(MARKET.counties).map(c => `<label class="chip"><input type="checkbox" name="county" value="${c}" ${(r.counties || []).includes(c) ? 'checked' : ''}> ${c}</label>`).join('')}</span></label>
      <label class="full">Submarkets / towns (comma separated)<input name="munis" value="${esc(r.munis || '')}" placeholder="e.g. Elk Grove Village, Bensenville, Itasca"></label>
      <label><span><input type="checkbox" name="muniStrict" ${r.muniStrict ? 'checked' : ''}> Only these towns</span></label>${inp('timing', 'Timing')}<label>Status<select name="status">${['Active', 'Paused', 'Closed'].map(s => `<option ${s === (r.status || 'Active') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      ${inp('contactPhone', 'Client phone', 'tel')}${inp('contactEmail', 'Client email', 'email')}<label class="full">Notes<textarea name="notes" rows="2">${esc(r.notes || '')}</textarea></label>
    </form><div class="mfoot"><span class="muted xs">Unknown clear height / docks don't exclude a property; they're flagged "verify".</span><button class="btn primary" id="svr">Save & re-match</button></div></section>
    <section class="card"><div class="ch"><h2>${buy ? 'Sellers to call for this buyer' : 'Owners to call for this requirement'}</h2><div><button class="btn sm" id="addfu">Add top 10 owners to today's follow-ups</button> <button class="btn sm ghost" id="expc">Export call list CSV</button></div></div>
      <div class="muted xs">Ranked by pair score: match quality × owner's off-market likelihood, weighted toward deal size. ${DISCLAIMER}</div><div id="mt"></div></section></div>`;
  table($('#mt'), res, [
    { k: 'pair', l: 'Pair', h: m => scorePill(m.pair), v: m => m.pair }, { k: 'score', l: 'Match', h: m => scorePill(m.score), v: m => m.score }, { k: 'om', l: 'Score', h: m => scorePill(m.om), v: m => m.om },
    { k: 'a', l: 'Property', h: m => `<a href="#/property/${m.p.id}">${esc(val(m.p, 'address') || m.p.pin)}</a> ${bigTag(m.d)}<div class="xs muted">${esc(val(m.p, 'city') || '')}, ${esc(val(m.p, 'county'))}</div>`, v: m => val(m.p, 'address') || '' },
    { k: 'sf', l: 'Size', h: m => sfAc(m.d), v: m => m.d.sf }, { k: 'v', l: 'Est. value', h: m => dealCell(m.d), v: m => m.d.value }, { k: 'c', l: 'Est. comm.', h: m => commCell(m.d), v: m => m.d.commission },
    { k: 'o', l: 'Owner to call', h: m => m.p.ownerId ? `<a href="#/owner/${m.p.ownerId}">${esc(oName(m.p.ownerId))}</a> ${stageTag(S.owners.get(m.p.ownerId)?.stage)}` : esc(val(m.p, 'taxpayer') || '') },
    { k: 'w', l: 'Why', h: m => `<div class="xs">${esc(m.reasons.join(' · '))}</div>` }, { k: 'go', l: '', h: m => m.p.ownerId ? `<a class="btn sm primary" href="#/prospect/${m.p.ownerId}">Call ▸</a>` : '' },
  ], { sort: 'pair', empty: 'No matches. Widen the size range or areas.' });
  $('#svr').onclick = async () => { const fd = new FormData($('#rf')); ['name', 'clientName', 'dealType', 'assetType', 'sfMin', 'sfMax', 'landMinAc', 'budgetMax', 'maxRent', 'clearMin', 'docksMin', 'yearMin', 'munis', 'timing', 'status', 'contactPhone', 'contactEmail', 'notes'].forEach(k => r[k] = (fd.get(k) || '').trim()); r.counties = fd.getAll('county'); r.muniStrict = !!fd.get('muniStrict'); await save('requirements', r); toast('Saved'); requirement(el, id); };
  $('#del').onclick = async () => { if (confirm('Delete this requirement?')) { await remove('requirements', id); location.hash = '#/requirements'; } };
  $('#addfu').onclick = async () => { let n = 0; for (const g of callers.slice(0, 10)) { await addFollowup({ ownerId: g.o.id, propertyId: g.best.p.id, due: today(), note: `Call re: ${r.name}` }); n++; } toast(`${n} follow-ups added for today`); };
  $('#expc').onclick = () => download(`call-list-${r.name.replace(/\W+/g, '-')}-${today()}.csv`, toCSV(callers.map(g => ({ owner: g.o.name, stage: g.o.stage || 'New', phone: g.o.phone || '', email: g.o.email || '', matching_parcels: g.n, best_property: val(g.best.p, 'address'), city: val(g.best.p, 'city'), building_sf: val(g.best.p, 'bldgSf') || '', pair_score: g.best.pair, match_score: g.best.score, off_market_score: g.best.om, est_value: Math.round(g.best.d.value || 0), est_commission: Math.round(g.best.d.commission || 0), reasons: g.best.reasons.join('; '), mailing: [g.o.mail?.addr, g.o.mail?.city, g.o.mail?.st, g.o.mail?.zip].filter(Boolean).join(', ') }))));
}

// ================= TENANTS / COMPANIES =================
export async function companies(el) {
  const rows = [...S.companies.values()];
  el.innerHTML = `<div class="page"><div class="ph"><div><h1>Tenants & companies</h1><div class="muted">Tenants and occupiers you track. Expansion signals are entered by you; nothing is monitored automatically.</div></div><div class="ph-act"><button class="btn primary" id="addc">+ Company</button><button class="btn ghost" id="exp">Export CSV</button></div></div><div id="ct"></div></div>`;
  table($('#ct'), rows, [
    { k: 'e', l: 'Expansion', h: c => scorePill(expansion(c).score), v: c => expansion(c).score },
    { k: 'name', l: 'Company', h: c => `<a href="#/company/${c.id}">${esc(c.name)}</a>${c.sample ? ' <span class="tag">SAMPLE</span>' : ''}`, v: c => c.name },
    { k: 'industry', l: 'Industry' }, { k: 'sf', l: 'Current SF', h: c => fmt(c.currentSf), v: c => +c.currentSf || 0 },
    { k: 'st', l: 'Stage', h: c => stageTag(c.stage), v: c => c.stage || '' }, { k: 'phone', l: 'Phone' },
  ], { sort: 'e', href: c => `#/company/${c.id}`, empty: 'No companies yet. Add tenants you know about, or import a list (Tools & Data).' });
  $('#addc').onclick = async () => { const c = { id: uid('c'), name: 'New company', signals: {}, stage: 'New' }; await save('companies', c); location.hash = `#/company/${c.id}`; };
  $('#exp').onclick = () => download(`companies-${today()}.csv`, toCSV(rows.map(c => ({ ...c, signals: Object.keys(c.signals || {}).filter(k => c.signals[k].on).join('|'), expansion_score: expansion(c).score }))));
}
export async function company(el, id) {
  const c = S.companies.get(id); if (!c) { el.innerHTML = '<div class="page">Not found.</div>'; return; }
  const X2 = await import('./extras.js'); const e = expansion(c), ls = [...S.leases.values()].filter(l => l.companyId === id); c.signals = c.signals || {};
  const inp = (k, l, t = 'text') => `<label>${l}<input name="${k}" type="${t}" value="${esc(c[k] ?? '')}"></label>`;
  el.innerHTML = `<div class="page"><div class="ph"><div><div class="crumb"><a href="#/companies">Tenants</a></div><h1>${esc(c.name)}</h1></div><div class="ph-act"><button class="btn" id="mkreq">Create requirement</button><button class="btn ghost" id="del">Delete</button></div></div>
    <div class="kpis"><div class="kpi"><b>${e.score}</b><span>Expansion score</span></div><div class="kpi"><b>${fmt(c.currentSf) || '–'}</b><span>Current SF</span></div><div class="kpi"><b>${ls.length}</b><span>Leases tracked</span></div></div>
    ${X2.companyPhonesHTML(c.name)}<div class="cols"><section class="card"><div class="ch"><h2>Company</h2></div><form id="cf" class="fgrid2">${inp('name', 'Name')}${inp('industry', 'Industry')}${inp('website', 'Website')}${inp('currentSf', 'Current SF', 'number')}${inp('contactName', 'Contact')}${inp('phone', 'Phone', 'tel')}${inp('email', 'Email', 'email')}<label>Stage${stageSelect(c.stage, 'name="stage"')}</label><label class="full">Notes<textarea name="notes" rows="3">${esc(c.notes || '')}</textarea></label></form>
      <h3>Expansion signals <span class="muted xs">(entered by you, with date and confidence)</span></h3>
      <div class="sigs">${EXP.map(([k, l, w]) => { const s = c.signals[k] || {}; return `<div class="sig"><label><input type="checkbox" data-sig="${k}" ${s.on ? 'checked' : ''}> ${l} <span class="muted xs">+${w}</span></label><input type="date" data-sigd="${k}" value="${esc(s.date || '')}">${confSelect('sigc_' + k, s.conf || 'unverified')}</div>`; }).join('')}</div>
      <div class="mfoot"><button class="btn primary" id="svc">Save</button></div></section>
      <section class="card"><div class="ch"><h2>Why this expansion score</h2></div><ul class="why">${e.reasons.map(r => `<li>${kindTag(r.kind)} ${esc(r.text)} <span class="muted xs">+${r.pts}</span></li>`).join('') || '<li class="muted">No signals entered.</li>'}</ul>
        <h3>Research</h3>${linksHTML(companyLinks(c))}<h3>Log</h3>${quickLogHTML('cql')}<h3>Leases</h3>${ls.map(l => `<div class="lrow">${l.propertyId ? `<a href="#/property/${l.propertyId}">${esc(val(S.prop.get(l.propertyId) || {}, 'address') || 'property')}</a>` : ''} · ${fmt(l.sf)} SF · expires ${esc(l.expiration || '?')} ${badge(l.conf)}</div>`).join('') || '<div class="muted">None. <a href="#/leases">Add in Leases</a>.</div>'}
        <h3>Activity</h3>${activityHTML(activitiesFor('companyId', id))}</section></div></div>`;
  bindQuickLog(el, { companyId: id }, () => company(el, id));
  $('#svc').onclick = async () => { const fd = new FormData($('#cf')); ['name', 'industry', 'website', 'currentSf', 'contactName', 'phone', 'email', 'stage', 'notes'].forEach(k => c[k] = (fd.get(k) || '').trim()); EXP.forEach(([k]) => { c.signals[k] = { on: $(`[data-sig="${k}"]`).checked, date: $(`[data-sigd="${k}"]`).value, conf: $(`[name="sigc_${k}"]`).value }; }); await save('companies', c); toast('Saved'); company(el, id); };
  $('#del').onclick = async () => { if (confirm('Delete company?')) { await remove('companies', id); location.hash = '#/companies'; } };
  $('#mkreq').onclick = async () => { const r = { id: uid('r'), name: `${c.name} requirement`, clientName: c.name, companyId: id, dealType: 'Lease', status: 'Active', counties: [], sfMin: c.currentSf ? Math.round(c.currentSf * 1.2) : '', sfMax: c.currentSf ? Math.round(c.currentSf * 2) : '' }; await save('requirements', r); location.hash = `#/requirement/${r.id}`; };
}

// ================= LEASES =================
export async function leases(el, id, pid) {
  const rows = [...S.leases.values()].map(l => ({ l, i: leaseInfo(l) }));
  el.innerHTML = `<div class="page"><div class="ph"><div><h1>Lease expiration tracker</h1><div class="muted">Known or estimated expirations. Recommended outreach = expiration minus ${MARKET.leaseLeadMonths(10000)}/${MARKET.leaseLeadMonths(50000)}/${MARKET.leaseLeadMonths(150000)} months for small/mid/large spaces.</div></div><div class="ph-act"><button class="btn primary" id="addl">+ Lease</button><button class="btn ghost" id="exp">Export CSV</button></div></div><div id="lt"></div></div>`;
  table($('#lt'), rows, [
    { k: 'u', l: 'Urgency', h: x => `<span class="urg u-${x.i.urgency.replace(/\W/g, '').toLowerCase()}">${x.i.urgency}</span>`, v: x => -x.i.rank },
    { k: 't', l: 'Tenant', h: x => x.l.companyId ? `<a href="#/company/${x.l.companyId}">${esc(S.companies.get(x.l.companyId)?.name || '')}</a>` : esc(x.l.tenantName || ''), v: x => x.l.tenantName || S.companies.get(x.l.companyId)?.name || '' },
    { k: 'p', l: 'Property', h: x => x.l.propertyId && S.prop.get(x.l.propertyId) ? `<a href="#/property/${x.l.propertyId}">${esc(val(S.prop.get(x.l.propertyId), 'address'))}</a>` : '' },
    { k: 'sf', l: 'SF', h: x => fmt(x.i.sf), v: x => x.i.sf }, { k: 'e', l: 'Expiration', h: x => `${esc(x.l.expiration || '?')} <span class="xs muted">${x.l.expType === 'known' ? 'known' : 'estimated'}</span>`, v: x => x.l.expiration || '' },
    { k: 'c', l: 'Confidence', h: x => badge(x.l.conf || 'unknown') }, { k: 'o', l: 'Outreach by', h: x => esc(x.i.outreach || ''), v: x => x.i.outreach || '' },
    { k: 'ed', l: '', h: x => `<button class="btn sm ghost" data-edit="${x.l.id}">Edit</button>` },
  ], { sort: 'u', empty: 'No leases yet.' });
  $$('[data-edit]', el).forEach(b => b.onclick = () => leaseForm(S.leases.get(b.dataset.edit)));
  $('#addl').onclick = () => leaseForm({ id: uid('l'), expType: 'estimated', conf: 'estimated' }, true);
  if (id === 'new') leaseForm({ id: uid('l'), propertyId: (location.hash.split('/')[3]) || '', expType: 'estimated', conf: 'estimated' }, true);
  $('#exp').onclick = () => download(`leases-${today()}.csv`, toCSV(rows.map(x => ({ ...x.l, property: x.l.propertyId ? val(S.prop.get(x.l.propertyId) || {}, 'address') : '', company: S.companies.get(x.l.companyId)?.name || '', recommended_outreach: x.i.outreach, urgency: x.i.urgency }))));
  function leaseForm(l, isNew) {
    const p = l.propertyId && S.prop.get(l.propertyId);
    modal(`<div class="ch"><h2>${isNew ? 'Add' : 'Edit'} lease</h2><button class="x" data-close>✕</button></div><form id="lf" class="fgrid2">
      <label class="full">Property <input id="lps" placeholder="Search address…" value="${esc(p ? val(p, 'address') + ', ' + (val(p, 'city') || '') : '')}"><input type="hidden" name="propertyId" value="${esc(l.propertyId || '')}"><div id="lpr" class="mres"></div></label>
      <label>Tenant (company)<select name="companyId"><option value="">–</option>${[...S.companies.values()].map(c => `<option value="${c.id}" ${c.id === l.companyId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>…or tenant name<input name="tenantName" value="${esc(l.tenantName || '')}"></label><label>Leased SF<input name="sf" type="number" value="${esc(l.sf || '')}"></label>
      <label>Start<input name="start" type="date" value="${esc(l.start || '')}"></label><label>Expiration<input name="expiration" type="date" value="${esc(l.expiration || '')}"></label>
      <label>Known or estimated<select name="expType"><option value="known" ${l.expType === 'known' ? 'selected' : ''}>Known</option><option value="estimated" ${l.expType !== 'known' ? 'selected' : ''}>Estimated</option></select></label>
      <label>Confidence${confSelect('conf', l.conf || 'estimated')}</label><label>Rent ($/SF/yr)<input name="rate" type="number" step="any" value="${esc(l.rate || '')}"></label>
      <label>Outreach date override<input name="outreachDate" type="date" value="${esc(l.outreachDate || '')}"></label><label class="full">Notes<textarea name="notes" rows="2">${esc(l.notes || '')}</textarea></label></form>
      <div class="mfoot">${isNew ? '' : '<button class="btn ghost" id="dl">Delete</button>'}<button class="btn" data-close>Cancel</button><button class="btn primary" id="sl">Save</button></div>`, (m, close) => {
      let t; $('#lps', m).oninput = e => { clearTimeout(t); t = setTimeout(() => { const q = e.target.value.toLowerCase(); if (q.length < 3) return; const r = S.props.filter(p => (val(p, 'address') || '').toLowerCase().includes(q)).slice(0, 8); $('#lpr', m).innerHTML = r.map(p => `<button type="button" class="btn sm ghost" data-p="${p.id}">${esc(val(p, 'address'))}, ${esc(nc(val(p, 'city') || ''))}</button>`).join(''); $$('[data-p]', m).forEach(b => b.onclick = () => { $('[name=propertyId]', m).value = b.dataset.p; $('#lps', m).value = b.textContent; $('#lpr', m).innerHTML = ''; }); }, 200); };
      $('#sl', m).onclick = async () => { const fd = new FormData($('#lf', m)); ['propertyId', 'companyId', 'tenantName', 'sf', 'start', 'expiration', 'expType', 'conf', 'rate', 'outreachDate', 'notes'].forEach(k => l[k] = (fd.get(k) || '').trim()); await save('leases', l); close(); toast('Lease saved'); location.hash = '#/leases'; leases(el); };
      const d = $('#dl', m); if (d) d.onclick = async () => { await remove('leases', l.id); close(); leases(el); };
    });
  }
}

// ================= FOLLOW-UPS & ACTIVITY (CRM) =================
export async function crm(el) {
  const now = today(), fus = [...S.followups.values()].filter(f => !f.done).sort((a, b) => a.due.localeCompare(b.due)), acts = [...S.activities.values()].sort((a, b) => b.ts - a.ts);
  const stages = STAGES.map(s => ({ s, n: [...S.owners.values()].filter(o => (o.stage || 'New') === s).length }));
  const who = x => x.ownerId ? `<a href="#/owner/${x.ownerId}">${esc(oName(x.ownerId))}</a>` : x.companyId ? `<a href="#/company/${x.companyId}">${esc(S.companies.get(x.companyId)?.name || '')}</a>` : '';
  el.innerHTML = `<div class="page"><div class="ph"><div><h1>Follow-ups & activity</h1><div class="muted">Follow-ups are created automatically from call results (e.g. voicemail → 3 days) and can be changed any time.</div></div><div class="ph-act"><button class="btn ghost" id="expa">Export activity CSV</button><button class="btn ghost" id="expf">Export follow-ups CSV</button></div></div>
    <div class="kpis">${stages.filter(x => x.s !== 'New').map(x => `<div class="kpi sm"><b>${x.n}</b><span>${x.s}</span></div>`).join('')}</div>
    <section class="card"><div class="ch"><h2>Open follow-ups (${fus.length})</h2></div><div id="ft"></div></section><section class="card"><div class="ch"><h2>Activity log</h2></div><div id="at"></div></section></div>`;
  table($('#ft'), fus, [
    { k: 'due', l: 'Due', h: f => `<span class="${f.due < now ? 'neg' : f.due === now ? 'warnc' : ''}">${d8(f.due)}</span>`, v: f => f.due }, { k: 'w', l: 'Who', h: who }, { k: 'note', l: 'Note' },
    { k: 'a', l: '', h: f => `${f.ownerId ? `<a class="btn sm primary" href="#/prospect/${f.ownerId}">Call</a>` : ''} <button class="btn sm ghost" data-sn="${f.id}">+3d</button> <button class="btn sm ghost" data-dn="${f.id}">Done</button>` },
  ], { sort: 'due', dir: 1, empty: 'No open follow-ups.' });
  table($('#at'), acts, [{ k: 'ts', l: 'When', h: a => new Date(a.ts).toLocaleString(), v: a => a.ts }, { k: 'type', l: 'Type' }, { k: 'result', l: 'Result' }, { k: 'w', l: 'Who', h: who }, { k: 'note', l: 'Note' }], { sort: 'ts', empty: 'No activity logged yet.' });
  $$('[data-dn]', el).forEach(b => b.onclick = async () => { const f = S.followups.get(b.dataset.dn); f.done = true; f.doneTs = Date.now(); await save('followups', f); crm(el); });
  $$('[data-sn]', el).forEach(b => b.onclick = async () => { const f = S.followups.get(b.dataset.sn); f.due = addDays(f.due < now ? now : f.due, 3); await save('followups', f); crm(el); });
  $('#expa').onclick = () => download(`activity-${today()}.csv`, toCSV(acts.map(a => ({ when: new Date(a.ts).toISOString(), type: a.type, result: a.result || '', owner: oName(a.ownerId), company: S.companies.get(a.companyId)?.name || '', property: a.propertyId ? val(S.prop.get(a.propertyId) || {}, 'address') : '', note: a.note || '' }))));
  $('#expf').onclick = () => download(`followups-${today()}.csv`, toCSV(fus.map(f => ({ due: f.due, owner: oName(f.ownerId), company: S.companies.get(f.companyId)?.name || '', note: f.note || '' }))));
}

// ================= TEMPLATES & LETTERS =================
export function fillVars(text, ctx) {
  const prof = setting('profile', {}); const p = ctx.p, o = ctx.o, r = ctx.r;
  const v = { owner_name: (o && (o.contactName || o.name)) || (p && val(p, 'taxpayer')) || 'Property Owner', owner_entity: (o && o.name) || (p && val(p, 'taxpayer')) || '', owner_mailing: o ? [o.mail?.addr, [o.mail?.city, o.mail?.st, o.mail?.zip].filter(Boolean).join(' ')].filter(Boolean).join('\n') : '', property_address: p ? val(p, 'address') : '', property_city: p ? (val(p, 'city') || val(p, 'municipality')) : '', building_sf: p ? fmt(val(p, 'bldgSf')) : '', land_acres: p && val(p, 'landSf') ? (val(p, 'landSf') / 43560).toFixed(1) : '', year_built: p ? (val(p, 'yearBuilt') || '') : '', requirement_name: r ? r.name : '', requirement_sf: r ? [r.sfMin && fmt(r.sfMin), r.sfMax && fmt(r.sfMax)].filter(Boolean).join('–') : '', requirement_area: r ? ([r.munis, ...(r.counties || [])].filter(Boolean).join(', ') || 'Chicagoland') : '', broker_name: prof.name || '[Your name]', broker_company: prof.company || '[Company]', broker_phone: prof.phone || '[Phone]', broker_email: prof.email || '[Email]', today: new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => v[k] != null && v[k] !== '' ? v[k] : m);
}
export async function templatesView(el) {
  const ts = [...S.templates.values()]; let cur = ts[0], ctx = {};
  const draw = () => {
    el.innerHTML = `<div class="page"><div class="ph"><div><h1>Templates & owner letters</h1><div class="muted">Fill {{variables}} from an owner, property and buyer. Copy, open in your own email app, or print / save a letter as PDF.</div></div><div class="ph-act"><button class="btn" id="nt">+ Template</button></div></div>
    <div class="cols"><section class="card"><div class="ch"><h2>Template</h2><select id="ts">${ts.map(t => `<option value="${t.id}" ${t.id === cur?.id ? 'selected' : ''}>${esc(t.kind)} · ${esc(t.name)}</option>`).join('')}</select></div>
      <form id="tf" class="fgrid2"><label>Name<input name="name" value="${esc(cur?.name || '')}"></label><label>Kind<select name="kind">${['Email', 'Call script', 'Text', 'Letter'].map(k => `<option ${k === cur?.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label><label class="full">Subject<input name="subject" value="${esc(cur?.subject || '')}"></label><label class="full">Body<textarea name="body" rows="14">${esc(cur?.body || '')}</textarea></label></form>
      <div class="xs muted">Variables: ${VARS.map(v => `<code>{{${v}}}</code>`).join(' ')}</div><div class="mfoot"><button class="btn ghost" id="dt">Delete</button><button class="btn primary" id="st">Save template</button></div></section>
      <section class="card"><div class="ch"><h2>Generate</h2></div>
        <div class="fgrid2"><label class="full">Property <input id="gp" placeholder="Search address…" value="${esc(ctx.p ? val(ctx.p, 'address') : '')}"><div id="gpr" class="mres"></div></label>
        <label class="full">Buyer / requirement<select id="gr"><option value="">–</option>${[...S.requirements.values()].map(r => `<option value="${r.id}" ${ctx.r && ctx.r.id === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label></div>
        <div class="xs muted">${ctx.o ? 'Owner: ' + esc(ctx.o.name) : 'Pick a property to fill the owner automatically.'}</div>
        <div class="out-subj" id="osub"></div><pre class="out" id="out"></pre>
        <div class="mfoot"><button class="btn" id="cp">Copy</button><button class="btn" id="ml">Open in email app</button><button class="btn primary" id="pr">Print / save PDF</button><button class="btn ghost" id="lg">Log as sent</button></div></section></div></div>`;
    const render = () => { const f = new FormData($('#tf')); $('#osub').textContent = f.get('subject') ? 'Subject: ' + fillVars(f.get('subject'), ctx) : ''; $('#out').textContent = fillVars(f.get('body') || '', ctx); };
    render(); $('#tf').oninput = render;
    $('#ts').onchange = e => { cur = S.templates.get(e.target.value); draw(); };
    $('#gr').onchange = e => { ctx.r = S.requirements.get(e.target.value); render(); };
    let t; $('#gp').oninput = e => { clearTimeout(t); t = setTimeout(() => { const q = e.target.value.toLowerCase(); if (q.length < 3) return; const r = S.props.filter(p => (val(p, 'address') || '').toLowerCase().includes(q)).slice(0, 8); $('#gpr').innerHTML = r.map(p => `<button class="btn sm ghost" data-p="${p.id}">${esc(val(p, 'address'))}, ${esc(nc(val(p, 'city') || ''))}</button>`).join(''); $$('[data-p]', el).forEach(b => b.onclick = () => { ctx.p = S.prop.get(b.dataset.p); ctx.o = ctx.p.ownerId && S.owners.get(ctx.p.ownerId); draw(); }); }, 200); };
    $('#st').onclick = async () => { const f = new FormData($('#tf')); Object.assign(cur, { name: f.get('name'), kind: f.get('kind'), subject: f.get('subject'), body: f.get('body') }); await save('templates', cur); toast('Template saved'); };
    $('#dt').onclick = async () => { if (confirm('Delete template?')) { await remove('templates', cur.id); templatesView(el); } };
    $('#nt').onclick = async () => { cur = { id: uid('t'), name: 'New template', kind: 'Email', subject: '', body: 'Hi {{owner_name}},\n\n' }; await save('templates', cur); ts.push(cur); draw(); };
    $('#cp').onclick = () => { navigator.clipboard.writeText(($('#osub').textContent ? $('#osub').textContent + '\n\n' : '') + $('#out').textContent).then(() => toast('Copied')); };
    $('#ml').onclick = () => { const to = ctx.o && ctx.o.email || ''; location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent($('#osub').textContent.replace(/^Subject: /, ''))}&body=${encodeURIComponent($('#out').textContent)}`; };
    $('#pr').onclick = () => { const w = document.createElement('div'); w.id = 'printarea'; w.innerHTML = `<div class="letter">${esc($('#out').textContent).replace(/\n/g, '<br>')}</div>`; document.body.appendChild(w); window.print(); setTimeout(() => w.remove(), 500); };
    $('#lg').onclick = async () => { const { addActivity } = await import('./store.js'); await addActivity({ type: cur.kind === 'Letter' ? 'Letter' : cur.kind === 'Text' ? 'Text' : 'Email', result: 'Sent', ownerId: ctx.o && ctx.o.id, propertyId: ctx.p && ctx.p.id, note: `${cur.name}` }); toast('Logged'); };
  };
  draw();
}

// ================= TOOLS: settings, commission, import/export, backup =================
export async function more(el) {
  const G = [['Work', [['ask', 'Ask (smart search)', 'Plain-English search for sellers, buyers and properties'], ['crm', 'Follow-ups & activity', 'Everything due and your call history'], ['leases', 'Lease tracker', 'Expirations and outreach dates'], ['templates', 'Templates & letters', 'Emails, scripts, printable owner letters']]],
    ['People', [['owners', 'Owners', 'Owner groups and contacts'], ['requirements', 'Buyers & requirements', 'What your clients need, matched to sellers'], ['companies', 'Tenants', 'Companies and expansion signals']]],
    ['Market', [['brief', 'Weekly market brief', 'One printable page: indicators, sales, permits, headlines'], ['comps', 'Comps & listings', 'Sale and lease comps, territory stats'], ['lists', 'Saved lists', 'Your own property lists'], ['compare', 'Compare properties', 'Up to 10 side by side']]],
    ['You', [['stats', 'Stats', 'Pipeline numbers and calling activity'], ['tools', 'Tools & data', 'Settings, score weights, import, export, backup']]]];
  el.innerHTML = `<div class="page narrow"><h1>More</h1>${G.map(([g, items]) => `<div class="lbl">${g}</div><div class="mlist">${items.map(([k, l, d]) => `<a href="#/${k}"><b>${l}</b><span>${d}</span><i>›</i></a>`).join('')}</div>`).join('')}
    <div class="lbl">Display & about</div><div class="mlist"><button id="thm"><b>Switch dark / light</b><span>Light is the default; dark is optional</span><i>›</i></button>
      <div class="about"><b>About this data</b><span>${S.meta ? `Public data last updated ${esc(S.meta.generated)} CT.` : ''} All your notes and contacts stay on this device. Public-record data must be verified before use.</span><span>${esc(DISCLAIMER)}</span></div></div></div>`;
  $('#thm', el).onclick = () => window.__omiTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}
export async function tools(el, sub) {
  const prof = setting('profile', {}), W = weights();
  el.innerHTML = `<div class="page"><div class="ph"><div><h1>Tools & data</h1><div class="muted">Everything is stored only in this browser (IndexedDB). Back up regularly.</div></div></div>
  <div class="cols">
   <section class="card" id="settings"><div class="ch"><h2>Settings</h2></div><form id="sf" class="fgrid2">
     <label>Your name<input name="name" value="${esc(prof.name || '')}"></label><label>Company<input name="company" value="${esc(prof.company || '')}"></label><label>Phone<input name="phone" value="${esc(prof.phone || '')}"></label><label>Email<input name="email" value="${esc(prof.email || '')}"></label>
     <label>Big deal: min SF<input name="bigSf" type="number" value="${setting('bigSf', 50000)}"></label><label>Big deal: min acres<input name="bigAcres" type="number" step="any" value="${setting('bigAcres', 5)}"></label><label>Big deal: min est. value ($)<input name="bigValue" type="number" value="${setting('bigValue', 5000000)}"></label>
     <label>Value estimate when unknown ($/SF bldg)<input name="psfBldg" type="number" value="${setting('psfBldg', 100)}"></label><label>Land value estimate ($/SF land)<input name="psfLand" type="number" step="any" value="${setting('psfLand', 8)}"></label><label>Commission rate for estimates (%)<input name="commRate" type="number" step="any" value="${setting('commRate', 3)}"></label>
     <label>Deal-size weight in rankings (0–100)<input name="sizeWeight" type="number" value="${setting('sizeWeight', 35)}"></label><label>Skip owners contacted in last N days<input name="recentDays" type="number" value="${setting('recentDays', 7)}"></label>
     <h3 class="full">Off-market score weights</h3>${WEIGHT_DEFS.map(([k, l, d, kind]) => `<label>${l} <span class="xs muted">(${kind === 'public' ? 'public record' : kind === 'bonus' ? 'public-record bonus' : 'broker / fresh bonus'}, default ${d})</span><input name="w_${k}" type="number" value="${W[k]}"></label>`).join('')}
   </form><div class="mfoot"><button class="btn ghost" id="rw">Reset weights</button><button class="btn primary" id="ss">Save settings</button></div></section>
   <section class="card"><div class="ch"><h2>Commission calculator</h2></div><div class="fgrid2" id="cc">
     <label>Deal type<select id="ct"><option>Sale</option><option>Lease</option></select></label><label>Sale price ($)<input id="cpz" type="number" value="10000000"></label>
     <label>Lease SF<input id="csf" type="number" value="100000"></label><label>Rent ($/SF/yr)<input id="crt" type="number" step="any" value="9"></label><label>Term (years)<input id="ctm" type="number" step="any" value="5"></label>
     <label>Commission (%)<input id="cpc" type="number" step="any" value="${setting('commRate', 3)}"></label><label>Co-broker share (%)<input id="cco" type="number" step="any" value="0"></label><label>Your split of your side (%)<input id="csp" type="number" step="any" value="60"></label></div>
     <div class="calc-out" id="cout"></div>
     <div class="ch"><h2>Data</h2></div>
     <div class="btnrow">${['properties', 'owners', 'requirements', 'companies', 'leases', 'activities', 'followups'].map(s => `<button class="btn sm ghost" data-exp="${s}">Export ${s} CSV</button>`).join('')}</div>
     <div class="xs">Last backed up: <b>${setting('lastBackup', '') ? new Date(setting('lastBackup')).toLocaleString() : 'never'}</b>. Your data lives only in this browser; back up weekly.</div><div class="btnrow"><button class="btn sm" id="bk">Download full backup (JSON)</button><button class="btn sm ghost" id="bkz">Backup as ZIP (JSON + CSVs)</button><label class="btn sm ghost">Restore backup<input type="file" id="rs" accept=".json,.zip" hidden></label></div>
     <div class="btnrow"><button class="btn sm ghost" id="sample">Load sample data (clearly labeled)</button><button class="btn sm ghost" id="unsample">Remove sample data</button><button class="btn sm ghost" id="reseed">Reload public-record data</button></div>
     <div class="xs muted" id="stor"></div></section>
  </div>
  <section class="card" id="import"><div class="ch"><h2>Import CSV / Excel</h2><span class="muted xs">Parsed in your browser; nothing is uploaded.</span></div>
    <div class="fgrid2"><label>File<input type="file" id="if" accept=".csv,.xlsx,.xls,.txt"></label><label>Import into<select id="it"><option value="properties">Properties (matches by PIN or address)</option><option value="owners">Owners / contacts</option><option value="companies">Tenants / companies</option><option value="leases">Leases</option><option value="requirements">Buyers / requirements</option><option value="comps">Comps / listings (lease, sale, listing)</option></select></label><label>Confidence for imported values${confSelect('iconf', 'unverified')}</label></div>
    <div id="imap"></div></section></div>`;
  // settings
  $('#ss').onclick = async () => { const f = new FormData($('#sf')); await setSetting('profile', { name: f.get('name'), company: f.get('company'), phone: f.get('phone'), email: f.get('email') }); for (const k of ['bigSf', 'bigAcres', 'bigValue', 'psfBldg', 'psfLand', 'commRate', 'sizeWeight', 'recentDays']) await setSetting(k, +f.get(k)); const w = {}; WEIGHT_DEFS.forEach(([k]) => w[k] = +f.get('w_' + k)); await setSetting('weights', w); toast('Settings saved. Scores recalculated.'); };
  $('#rw').onclick = async () => { await setSetting('weights', {}); tools(el); };
  if (sub === 'settings') setTimeout(() => $('#settings').scrollIntoView(), 50);
  // commission
  const calc = () => { const g = id => +$(id).value || 0; const gross = $('#ct').value === 'Sale' ? g('#cpz') * g('#cpc') / 100 : g('#csf') * g('#crt') * g('#ctm') * g('#cpc') / 100; const mySide = gross * (1 - g('#cco') / 100), mine = mySide * g('#csp') / 100; $('#cout').innerHTML = `<div><small>Gross commission</small><b>${money(gross)}</b></div><div><small>Your side</small><b>${money(mySide)}</b></div><div><small>Your take-home split</small><b class="pos">${money(mine)}</b></div>`; };
  $$('#cc input, #cc select').forEach(i => i.oninput = calc); calc();
  // exports
  const EXPF = { properties: () => S.props.filter(p => p.ed || p.priority || p.src !== 'public' || p.research).map(propRow), owners: () => [...S.owners.values()].filter(o => !o.inferred || o.stage || o.phone || o.notes).map(ownerRow) };
  $$('[data-exp]', el).forEach(b => b.onclick = () => { const s = b.dataset.exp; let rows = EXPF[s] ? EXPF[s]() : [...S[s === 'properties' ? 'prop' : s].values()]; if (s === 'properties' && !rows.length) rows = S.props.slice(0, 0); if (s === 'properties' && confirm('Export ALL properties (OK) or only ones you have edited / prioritized (Cancel)?')) rows = S.props.map(propRow); if (s === 'owners' && confirm('Export ALL owners (OK) or only ones you have worked (Cancel)?')) rows = [...S.owners.values()].map(ownerRow); download(`${s}-${today()}.csv`, toCSV(rows.map(r => { const o = {}; for (const k in r) o[k] = typeof r[k] === 'object' && r[k] ? JSON.stringify(r[k]) : r[k]; return o; }))); });
  // backup: broker-entered data only (public records reload from the server)
  $('#bk').onclick = async () => { await downloadBackup(); tools(el); };
  $('#bkz').onclick = async () => { const { downloadZipBackup } = await import('./extras.js'); downloadZipBackup(); };
  $('#rs').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await restoreFromFile(f); tools(el); } catch (err) { alert('Restore failed: ' + err.message); } };
  $('#reseed').onclick = async () => { if (!confirm('Reload the public-record parcels? Your edits, owners, notes and CRM data are kept.')) return; await setSetting('seedGenerated', ''); location.reload(); };
  $('#sample').onclick = async () => { await save('requirements', { id: 'sample_req1', sample: true, name: 'SAMPLE – Owner-user buyer, 60–120k SF, O\'Hare area', clientName: 'SAMPLE (not a real client)', dealType: 'Buy (owner-user)', sfMin: 60000, sfMax: 120000, budgetMax: 15000000, counties: ['Cook', 'DuPage'], munis: 'Elk Grove Village, Bensenville, Wood Dale, Franklin Park, Itasca', status: 'Active' }); await save('requirements', { id: 'sample_req2', sample: true, name: 'SAMPLE – Investor, 100k+ SF leased', clientName: 'SAMPLE (not a real client)', dealType: 'Investment', sfMin: 100000, sfMax: 400000, budgetMax: 40000000, counties: [], status: 'Active' }); await save('companies', { id: 'sample_co1', sample: true, name: 'SAMPLE Logistics Co (not real)', industry: '3PL', currentSf: 80000, signals: { hiring: { on: true, conf: 'unverified' }, outgrowing: { on: true, conf: 'broker' } } }); toast('Sample buyers + company loaded (labeled SAMPLE)'); };
  $('#unsample').onclick = async () => { for (const s of ['requirements', 'companies', 'leases']) for (const x of [...S[s].values()]) if (x.sample) await remove(s, x.id); toast('Sample data removed'); };
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => $('#stor').textContent = `Storage used on this device: ${(e.usage / 1e6).toFixed(0)} MB.`);
  // import wizard
  $('#if').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; let rows = [];
    try {
      if (/\.xlsx?$/i.test(f.name)) { await loadScript('vendor/xlsx.full.min.js'); const wb = XLSX.read(await f.arrayBuffer()); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); }
      else { await loadScript('vendor/papaparse.min.js'); rows = Papa.parse(await f.text(), { header: true, skipEmptyLines: true }).data; }
    } catch (err) { alert('Could not read file: ' + err.message); return; }
    importMap(rows, f.name);
  };
  function importMap(rows, fname) {
    const target = $('#it').value, cols = Object.keys(rows[0] || {});
    const T = { properties: FIELDS.flatMap(g => g[1]).map(f => [f.k, f.l]).concat([['ownerName', 'Owner name (links/creates owner)']]), owners: [['name', 'Owner name'], ['contactName', 'Decision-maker'], ['phone', 'Phone'], ['email', 'Email'], ['stage', 'Stage'], ['priority', 'Priority'], ['notes', 'Notes'], ['mailAddr', 'Mailing address'], ['mailCity', 'Mailing city'], ['mailSt', 'Mailing state'], ['mailZip', 'Mailing ZIP']], companies: [['name', 'Company'], ['industry', 'Industry'], ['website', 'Website'], ['currentSf', 'Current SF'], ['contactName', 'Contact'], ['phone', 'Phone'], ['email', 'Email'], ['notes', 'Notes']], comps: [['kind', 'Type: sale / lease / listing (default lease)'], ['date', 'Date'], ['address', 'Address'], ['city', 'City'], ['tenant', 'Tenant'], ['sf', 'SF'], ['rate', 'Rent $/SF/yr'], ['rateType', 'Rent type'], ['termMonths', 'Term (months)'], ['price', 'Sale price'], ['buyer', 'Buyer'], ['seller', 'Seller'], ['status', 'Listing status'], ['askingPrice', 'Asking price'], ['askingRent', 'Asking rent'], ['listingBroker', 'Listing broker'], ['url', 'Link'], ['notes', 'Source / notes']], leases: [['address', 'Property address (to link)'], ['pin', 'PIN (to link)'], ['tenantName', 'Tenant'], ['sf', 'SF'], ['start', 'Start'], ['expiration', 'Expiration'], ['rate', 'Rent'], ['notes', 'Notes']], requirements: [['name', 'Name'], ['clientName', 'Client'], ['dealType', 'Type'], ['assetType', 'Asset type'], ['sfMin', 'Min SF'], ['sfMax', 'Max SF'], ['landMinAc', 'Min acres'], ['budgetMax', 'Budget'], ['munis', 'Towns'], ['notes', 'Notes']] }[target];
    const guess = k => { const lab = T.find(t => t[0] === k)[1].toLowerCase(); return cols.find(c => { const cc = c.toLowerCase().replace(/[_\-]/g, ' '); return cc === k.toLowerCase() || cc === lab || cc.includes(lab) || lab.includes(cc) && cc.length > 2; }) || ''; };
    $('#imap').innerHTML = `<div class="muted sm pad">${rows.length} rows in ${esc(fname)}. Map your columns:</div><div class="fgrid2">${T.map(([k, l]) => `<label>${l}<select data-map="${k}"><option value="">– skip –</option>${cols.map(c => `<option ${guess(k) === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`).join('')}</div>
      <div class="tbl-wrap"><table class="grid"><thead><tr>${cols.slice(0, 8).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 3).map(r => `<tr>${cols.slice(0, 8).map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="mfoot"><button class="btn primary" id="go">Import ${rows.length} rows</button></div>`;
    $('#go').onclick = async () => {
      const map = {}; $$('[data-map]').forEach(s => { if (s.value) map[s.dataset.map] = s.value; }); const cf = $('[name=iconf]').value; let n = 0, upd = 0;
      const byPin = new Map(S.props.map(p => [String(p.pin || '').replace(/\D/g, ''), p])), byAddr = new Map(S.props.map(p => [(String(val(p, 'address') || '') + '|' + String(val(p, 'city') || '')).toUpperCase(), p]));
      const findProp = (pin, addr, city) => (pin && byPin.get(String(pin).replace(/\D/g, ''))) || (addr && (byAddr.get((addr + '|' + (city || '')).toUpperCase()) || S.props.find(p => (val(p, 'address') || '').toUpperCase() === String(addr).toUpperCase())));
      for (const row of rows) {
        const g = k => map[k] ? String(row[map[k]] ?? '').trim() : '';
        if (target === 'properties') {
          let p = findProp(g('pin'), g('address'), g('city'));
          if (!p) { p = { id: uid('p'), src: 'import', srcName: 'Imported: ' + fname, ed: {}, cf: {}, created: Date.now() }; n++; } else upd++;
          p.ed = p.ed || {}; p.cf = p.cf || {};
          for (const f of FIELDS.flatMap(x => x[1])) { const v = g(f.k); if (v !== '') { p.ed[f.k] = f.t === 'num' ? +String(v).replace(/[$,]/g, '') || v : v; p.cf[f.k] = cf; } }
          const on = g('ownerName'); if (on) { let o = [...S.owners.values()].find(x => x.name.toUpperCase() === on.toUpperCase()); if (!o) { o = { id: uid('o'), name: on, entities: [on], inferred: false, mail: {} }; await save('owners', o); } p.ownerId = o.id; p.ownerLocked = true; }
          await save('properties', p);
        } else if (target === 'owners') {
          const nm = g('name'); if (!nm) continue; let o = [...S.owners.values()].find(x => x.name.toUpperCase() === nm.toUpperCase() || (x.entities || []).some(e => e.toUpperCase() === nm.toUpperCase()));
          if (!o) { o = { id: uid('o'), name: nm, entities: [nm], inferred: false, mail: {} }; n++; } else upd++;
          ['contactName', 'phone', 'email', 'stage', 'priority', 'notes'].forEach(k => { if (g(k)) o[k] = g(k); }); o.cv = o.cv || {}; for (const k of ['phone', 'email', 'contactName']) if (g(k)) o.cv[k] = { st: cf === 'confirmed' ? 'Verified' : 'Unverified', src: 'Imported: ' + fname, dt: today() };
          if (g('mailAddr')) o.mail = { addr: g('mailAddr'), city: g('mailCity'), st: g('mailSt'), zip: g('mailZip') }; await save('owners', o);
        } else if (target === 'leases') {
          const p = findProp(g('pin'), g('address')); await save('leases', { id: uid('l'), propertyId: p ? p.id : '', tenantName: g('tenantName'), sf: g('sf'), start: g('start'), expiration: g('expiration') && !isNaN(new Date(g('expiration'))) ? new Date(g('expiration')).toISOString().slice(0, 10) : '', rate: g('rate'), notes: g('notes') + (p ? '' : (g('address') ? ' [address not matched: ' + g('address') + ']' : '')), expType: cf === 'confirmed' ? 'known' : 'estimated', conf: cf }); n++;
        } else if (target === 'comps') { const o = { id: uid('cm'), src: 'broker', imported: fname }; Object.keys(map).forEach(k => o[k] = g(k)); o.kind = /sale/i.test(o.kind) ? 'sale' : /list/i.test(o.kind) ? 'listing' : 'lease'; if (o.price) o.price = String(o.price).replace(/[$,]/g, ''); if (o.rate) o.rate = String(o.rate).replace(/[$,]/g, ''); const pp = findProp(g('pin'), o.address, o.city); if (pp) o.propertyId = pp.id; if (!o.address && !o.tenant && !o.price) continue; await save('comps', o); n++;
        } else { const o = { id: uid(target === 'companies' ? 'c' : 'r'), signals: {}, status: 'Active', counties: [], imported: fname }; Object.keys(map).forEach(k => o[k] = g(k)); if (!o.name) continue; await save(target, o); n++; }
      }
      toast(`Imported: ${n} new, ${upd} updated`); $('#imap').innerHTML = `<div class="ok pad">Done: ${n} new, ${upd} updated.</div>`;
    };
  }
}
