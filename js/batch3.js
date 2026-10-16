// Referrals, banker referrals, sublease hunter, new business leads, test-the-price teaser, 1031 matchmaker, paperwork, distress with a clock.
import { $, $$, esc, fmt, kmoney, today, addDays, daysBetween, toast, uid } from './util.js';
import { S, val, setting, setSetting, firm } from './store.js';
import { deal, sfOf, matchOne, scoreOf } from './scoring.js';
import { modal } from './ui.js';
import { nc, x1031Buyers } from './extras.js';
import { vacancyOf } from './sheets.js';
import { likelyBuyers } from './buyers.js';

let kvp; const kv = () => kvp || (kvp = new Promise((res, rej) => { const r = indexedDB.open('omi-cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
const kvGet = async k => { const db = await kv(); return new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
const kvSet = async (k, v) => { const db = await kv(); return new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); };
const sms = (ph, body) => `sms:${String(ph || '').replace(/[^\d+]/g, '')}${/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(body)}`;
const copyBtn = t => `<button class="btn sm" data-copytxt="${esc(t)}">Copy</button>`;
export function bindCopy(root) { $$('[data-copytxt]', root).forEach(b => b.onclick = () => navigator.clipboard?.writeText(b.dataset.copytxt).then(() => toast('Copied'))); }
const agentWord = () => { const f = firm(); return /^real\b/i.test(f) ? 'Real' : f; };

// ---------- 1. Referrals screen (local only) ----------
const RST = ['Contacted', 'Sent a client', 'In progress', 'Closed', 'Fee paid'];
export function referralText() { return `I handle commercial for ${agentWord()} agents in Chicagoland. Send me any client who owns or needs a business property, warehouse, retail or apartment building, and you get a referral fee.`; }
export function referralsView(el) {
  const A = setting('agents', []) || [], R = setting('refs', []) || [], owed = R.filter(r => r.stage !== 'Fee paid').reduce((a, r) => a + (+r.fee || 0), 0);
  el.innerHTML = `<div class="page narrow"><h1>Referrals</h1><p class="explain">Residential agents who can send you commercial clients. Saved only on this device.</p>
   <section class="card" style="padding:12px"><b>Ready-to-copy text</b><p>${esc(referralText())}</p><div class="btnrow">${copyBtn(referralText())}</div>
   <label class="xs">Your brokerage (Settings) <input id="firm" value="${esc(firm())}"></label></section>
   <h2 class="plan-h">Agents <span class="cnt">${A.length}</span></h2><button class="btn primary" id="addag" style="width:100%">+ Add agent</button>
   ${A.map(a => `<div class="pcall"><div class="pc-top"><div class="pc-who"><b>${esc(a.name)}</b><span class="xs muted">${esc(a.firm || '')} · ${esc(a.phone || '')} · contacted ${esc(a.d || '')}</span></div>${a.phone ? `<a class="bact primary" href="${sms(a.phone, referralText())}">Text</a>` : ''}</div><div class="btnrow"><button class="btn sm ghost" data-edag="${esc(a.id)}">Edit</button><button class="btn sm ghost" data-addref="${esc(a.id)}">+ Referral</button></div></div>`).join('')}
   <h2 class="plan-h">Referral tracker <span class="cnt">${R.length}</span></h2><div class="xs muted">Fees owed (not yet paid): <b>${kmoney(owed) || '$0'}</b></div>
   ${R.map(r => `<div class="deal"><div class="dl-h"><b>${esc(r.client || 'Client')}</b> <span class="xs muted">from ${esc((A.find(a => a.id === r.agent) || {}).name || '')}</span></div><div class="dl-f"><select data-rf="stage" data-rid="${esc(r.id)}">${RST.map(s => `<option ${s === r.stage ? 'selected' : ''}>${s}</option>`).join('')}</select><label>Fee owed $<input data-rf="fee" data-rid="${esc(r.id)}" type="number" inputmode="numeric" value="${esc(r.fee || '')}"></label><button class="btn sm ghost" data-rdel="${esc(r.id)}">Remove</button></div></div>`).join('')}</div>`;
  const re = () => referralsView(el); bindCopy(el);
  $('#firm', el).onchange = async e => { await setSetting('brokerage', e.target.value.trim() || 'Real Brokerage'); re(); };
  const edit = a => modal(`<h2>${a.id ? 'Edit' : 'Add'} agent</h2><div class="fgrid2">${[['name', 'Name'], ['firm', 'Brokerage'], ['phone', 'Phone'], ['email', 'Email'], ['d', 'Date contacted']].map(([k, l]) => `<label>${l}<input data-ag="${k}" ${k === 'd' ? 'type="date"' : ''} value="${esc(a[k] || (k === 'd' ? today() : ''))}"></label>`).join('')}</div><div class="mfoot"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="sag">Save</button></div>`, (m, close) => {
    $('#sag', m).onclick = async () => { const o = { ...a, id: a.id || uid('ag') }; $$('[data-ag]', m).forEach(i => o[i.dataset.ag] = i.value.trim()); const L = (setting('agents', []) || []).filter(x => x.id !== o.id); L.unshift(o); await setSetting('agents', L); close(); re(); }; });
  $('#addag', el).onclick = () => edit({});
  $$('[data-edag]', el).forEach(b => b.onclick = () => edit(A.find(a => a.id === b.dataset.edag)));
  $$('[data-addref]', el).forEach(b => b.onclick = async () => { const c = prompt('Client name / property'); if (!c) return; await setSetting('refs', [{ id: uid('rf'), agent: b.dataset.addref, client: c, stage: 'Sent a client', fee: '', d: today() }, ...R]); re(); });
  $$('[data-rf]', el).forEach(i => i.onchange = async () => { await setSetting('refs', (setting('refs', []) || []).map(r => r.id === i.dataset.rid ? { ...r, [i.dataset.rf]: i.value } : r)); re(); });
  $$('[data-rdel]', el).forEach(b => b.onclick = async () => { await setSetting('refs', R.filter(r => r.id !== b.dataset.rdel)); re(); });
}
// ---------- 2. Banker referrals (SBA 504 FOIA data already in the app) ----------
export function bankersHTML() {
  const g = new Map();
  for (const p of S.props) { if (!p.sba) continue; const m = String(p.sba).match(/lender ([^;]+);/), b = String(p.sba).match(/ to (.+?), \$/); if (!m) continue; const k = m[1].trim(); const e = g.get(k) || { n: 0, who: [] }; e.n++; if (b && e.who.length < 6) e.who.push(b[1]); g.set(k, e); }
  const L = [...g.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15); if (!L.length) return '<div class="muted xs">No SBA 504 loans in the data.</div>';
  const scr = `Hi, it's [your name] with ${firm()}. I'm an industrial broker in Chicagoland. When one of your borrowers needs space or wants to sell the building, I can move fast. Could we grab coffee?`;
  return `<div class="xs muted">Lenders ranked by SBA 504 loans on industrial parcels in your territory (SBA FOIA). <a href="https://data.sba.gov/dataset/7-a-504-foia" target="_blank" rel="noopener">source</a></div>${L.map(([k, e], i) => `<div class="nbr"><div><b>${i + 1}. ${esc(k)}</b> · ${e.n} loans<div class="xs muted">Borrowers: ${esc(e.who.join('; '))}</div></div></div>`).join('')}
   <details class="pc-sc"><summary>Loan-officer script</summary><p>${esc(scr)}</p>${copyBtn(scr)}</details>`;
}
// ---------- 3. Sublease hunter ----------
export function subleaseHTML() {
  const L = S.props.map(p => ({ p, v: vacancyOf(p) })).filter(x => x.p.warn || (x.v && x.v.likely)).slice(0, 40);
  if (!L.length) return '<div class="muted xs">No WARN notices or likely-vacant flags right now.</div>';
  const reqs = [...S.requirements.values()].filter(r => (r.status || 'Active') === 'Active' && r.dealType === 'Lease');
  const scr = `Hi, it's [your name] with ${firm()}. Are you paying for space you don't use? I can sublease it.`;
  return `<details class="pc-sc"><summary>Script</summary><p>${esc(scr)}</p>${copyBtn(scr)}</details>${L.map(({ p, v }) => { const t = reqs.filter(r => matchOne(r, p)).slice(0, 3);
    return `<div class="pcall"><div class="pc-top"><div class="pc-who"><a href="#/property/${esc(p.id)}"><b>${esc(nc(val(p, 'address') || p.pin))}</b></a><span class="xs muted">${esc(nc(val(p, 'city') || ''))}${sfOf(p).sf ? ' · ' + fmt(sfOf(p).sf) + ' SF' : ''}</span></div><button class="bact primary pc-call" data-call="${esc(p.id)}">Call</button></div><div class="pc-why">${esc(p.warn ? 'WARN notice: ' + p.warn : v.R[0].t)}${p.warn ? ` · <a href="https://ides.illinois.gov/employment-training/workforce-development/warn-notices.html" target="_blank" rel="noopener">source</a>` : ''}</div>${t.length ? `<div class="xs">Your tenants who fit: ${t.map(r => `<a href="#/requirement/${esc(r.id)}">${esc(r.name)}</a>`).join(', ')}</div>` : ''}</div>`; }).join('')}`;
}
// ---------- 4. New business leads (City of Chicago business licenses, live, free Socrata API) ----------
const LIC = ['Manufacturing Establishments', 'Wholesale Food Establishment', 'Shared Kitchen User (Long Term)', 'Towing - Storage Lot', 'Commercial Garage', 'Motor Vehicle Services License', 'Retail Food Establishment', 'Limited Business License'];
export async function bizLeadsHTML() {
  const since = addDays(today(), -60), w = `application_type='ISSUE' AND date_issued > '${since}' AND license_description in(${LIC.map(x => `'${x.replace(/'/g, "''")}'`).join(',')})`;
  const url = `https://data.cityofchicago.org/resource/r5kz-chrr.json?$select=legal_name,doing_business_as_name,address,license_description,date_issued&$where=${encodeURIComponent(w)}&$order=date_issued DESC&$limit=150`;
  let L, c = await kvGet('bizlic'); if (c && c.ts > Date.now() - 7 * 864e5) L = c.L; else { try { L = await fetch(url).then(r => r.json()); if (Array.isArray(L)) await kvSet('bizlic', { ts: Date.now(), L }); } catch (e) { L = c ? c.L : null; } }
  if (!L) return '<div class="muted xs">Could not reach the City of Chicago data portal (offline?).</div>';
  if (!Array.isArray(L) || !L.length) return '<div class="muted xs">No new licenses in these categories in the last 60 days.</div>';
  const pri = d => LIC.indexOf(d); L.sort((a, b) => pri(a.license_description) - pri(b.license_description));
  return `<div class="xs muted">${L.length} new City of Chicago business licenses (last 60 days): manufacturing, wholesale food, food production, auto/garage, retail food and general. New businesses often need space soon. <a href="https://data.cityofchicago.org/Community-Economic-Development/Business-Licenses/r5kz-chrr" target="_blank" rel="noopener">source</a>. Contractor licenses are not in this dataset.</div>
   ${L.slice(0, 60).map(x => `<div class="nbr"><div><b>${esc(nc(x.doing_business_as_name || x.legal_name))}</b><div class="xs muted">${esc(nc(x.address || ''))}, Chicago · ${esc(x.license_description)} · issued ${esc(String(x.date_issued).slice(0, 10))}</div></div><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent('"' + (x.doing_business_as_name || x.legal_name) + '" Chicago phone')}">Find phone</a></div>`).join('')}`;
}
// ---------- 6. 1031 matchmaker ----------
export function x1031HTML() {
  const L = x1031Buyers().filter(e => e.d45 > 0 && e.total >= 1e6).slice(0, 12); if (!L.length) return '<div class="muted xs">No $1M+ industrial sellers in the last 45 days.</div>';
  return `<div class="xs muted">Sellers of $1M+ industrial property in the last 45 days (IL PTAX-203 / county sales). They MAY be doing a 1031 exchange: 45 days to identify, 180 to close. Picks: off-market properties worth 0.8x to 2.2x the sale (estimate), same county first.</div>${L.map(e => {
    const sold = e.props[0], co = sold.p.co, ids = new Set(e.props.map(x => x.p.id));
    const picks = S.props.filter(p => { if (ids.has(p.id)) return false; const v = deal(p).value; return v >= e.total * .8 && v <= e.total * 2.2 && scoreOf(p).score >= 45; }).map(p => ({ p, k: (p.co === co ? 1000 : 0) + scoreOf(p).score })).sort((a, b) => b.k - a.k).slice(0, 3).map(x => x.p);
    const t = `Saw you sold ${nc(val(sold.p, 'address') || '')}. If you're doing a 1031, I have 3 off-market options that fit. Want them?`;
    return `<div class="pcall"><div class="pc-who"><b>${esc(nc(e.seller))}</b><span class="xs muted">sold ${kmoney(e.total)} on ${esc(e.sd)}</span></div><div style="display:flex;gap:4px;flex-wrap:wrap;margin:4px 0"><span class="tag" style="background:#fde68a">ID window: ${e.d45} days left</span><span class="tag">Close by ${esc(e.c180)} (${e.d180} days)</span></div><div class="xs">Fits: ${picks.map(p => `<a href="#/property/${esc(p.id)}">${esc(nc(val(p, 'address')))}</a> (${kmoney(deal(p).value)} est.)`).join('; ') || 'none found'}</div><details class="pc-sc"><summary>Draft text</summary><p>${esc(t)}</p>${copyBtn(t)} <a class="btn sm" href="${sms('', t)}">Open in Messages</a></details></div>`; }).join('')}`;
}
// ---------- 8. Distress with a clock ----------
export const mustSolve = p => !!(p.tdel && (+p.bv > 0 || +p.v311 > 0));
export function mustSolveHTML() {
  const L = S.props.filter(mustSolve).sort((a, b) => deal(b).value - deal(a).value).slice(0, 30); if (!L.length) return '<div class="muted xs">None right now.</div>';
  const scr = `Hi, it's [your name] with ${firm()}. I can get you a quick, quiet sale before this gets worse.`;
  return `<div class="xs muted">In the Cook County Clerk delinquent-tax file (unpaid prior-year taxes) AND open City of Chicago building violations or vacant-building 311 complaints. <a href="https://www.cookcountyclerkil.gov/property-taxes/delinquent-taxes" target="_blank" rel="noopener">tax source</a> · <a href="https://data.cityofchicago.org/Buildings/Building-Violations/22u3-xenr" target="_blank" rel="noopener">violations source</a> · <a href="https://data.cityofchicago.org/Service-Requests/311-Service-Requests/v6vf-nfxy" target="_blank" rel="noopener">311 source</a></div><details class="pc-sc"><summary>Script</summary><p>${esc(scr)}</p>${copyBtn(scr)}</details>
   ${L.map(p => `<div class="pcall"><div class="pc-top"><span class="tag" style="background:#dc2626;color:#fff">Must solve soon</span><div class="pc-who"><a href="#/property/${esc(p.id)}"><b>${esc(nc(val(p, 'address') || p.pin))}</b></a><span class="xs muted">delinquent file ${esc(p.tdel)}${+p.bv ? ` · ${p.bv} open violations` : ''}${+p.v311 ? ` · ${p.v311} vacant-building 311 complaints` : ''}</span></div><button class="bact primary pc-call" data-call="${esc(p.id)}">Call</button></div></div>`).join('')}`;
}
// ---------- 5. Test the price (property page) ----------
export function testPrice(p) {
  const d = deal(p), sf = sfOf(p).sf, lo = d.value * .9, hi = d.value * 1.1, type = p.vac ? 'Industrial land' : (val(p, 'propType') || 'Industrial building');
  const teaser = `Off-market ${type.toLowerCase()}${sf ? `, about ${fmt(Math.round(sf / 1000) * 1000)} SF` : ''}${d.acres ? ` on ${d.acres.toFixed(1)} acres` : ''} in the ${nc(val(p, 'city') || val(p, 'county') || 'Chicagoland')} area. Price guidance ${kmoney(lo)}–${kmoney(hi)} (estimate). Interested?`;
  const reqs = [...S.requirements.values()].filter(r => (r.status || 'Active') === 'Active').map(r => ({ r, m: matchOne(r, p) })).filter(x => x.m);
  const lb = likelyBuyers(p, 5), xs = x1031Buyers().filter(e => e.d180 > 0 && d.value && d.value >= e.total * .5 && d.value <= e.total * 1.6).slice(0, 5);
  modal(`<h2>Test the price</h2><div class="xs muted">Teaser with no address. Price range is an estimate (±10% of ${esc(d.kind)}).</div><p class="card" style="padding:10px">${esc(teaser)}</p>${copyBtn(teaser)}
    <h3>Your buyers who match (${reqs.length})</h3>${reqs.map(({ r }) => `<div class="nbr"><div><b>${esc(r.name)}</b><div class="xs muted">${esc(r.clientName || '')}</div></div>${r.phone ? `<a class="btn sm primary" href="${sms(r.phone, teaser)}">Text</a>` : r.email ? `<a class="btn sm" href="mailto:${esc(r.email)}?subject=Off-market%20opportunity&body=${encodeURIComponent(teaser)}">Email</a>` : ''}</div>`).join('') || '<div class="muted xs">None saved that fit.</div>'}
    <h3>Active public buyers of this size here</h3>${lb.map(x => `<div class="xs">${esc(nc(x.b.name))}</div>`).join('') || '<div class="muted xs">None found.</div>'}
    <h3>1031 exchangers (sold in last 180 days, similar size)</h3>${xs.map(e => `<div class="xs">${esc(nc(e.seller))} · sold ${kmoney(e.total)} ${esc(e.sd)}</div>`).join('') || '<div class="muted xs">None found.</div>'}
    <div class="mfoot"><button class="btn" data-close>Close</button></div>`, m => bindCopy(m));
}
// ---------- 7. Paperwork (print-to-PDF draft templates) ----------
const DOCS = [['listing', 'Listing agreement'], ['trep', 'Tenant rep agreement'], ['loip', 'LOI: purchase'], ['loil', 'LOI: lease'], ['reg', 'Commission registration letter']];
export function paperworkHTML() { return `<div class="btnrow" style="flex-wrap:wrap">${DOCS.map(([k, l]) => `<button class="btn sm" data-doc="${k}">${l}</button>`).join('')}</div><div class="xs muted">Draft templates only: use your firm's approved forms and get attorney review.</div>`; }
export function bindPaperwork(root, p) { $$('[data-doc]', root).forEach(b => b.onclick = () => printDoc(b.dataset.doc, p)); }
function printDoc(k, p) {
  const o = S.owners.get(p.ownerId) || {}, addr = `${nc(val(p, 'address') || '')}, ${nc(val(p, 'city') || '')}, IL ${val(p, 'zip') || ''}`, own = nc(o.name || val(p, 'taxpayer') || '________'), sf = sfOf(p).sf, d = deal(p), F = firm(), L = '__________';
  const body = {
    listing: `<p>Owner: <b>${esc(own)}</b> ("Owner") grants ${esc(F)} ("Broker") the exclusive right to ${'sell / lease'} the property at <b>${esc(addr)}</b> (PIN ${esc(p.pin || L)}${sf ? ', approx. ' + fmt(sf) + ' SF' : ''}).</p><p>Term: from ${L} to ${L}. List price: $${L}. Commission: ${L}% of gross sale price / ${L}% of aggregate lease value, earned on closing.</p><p>Protection period: ${L} days after expiration for prospects registered in writing.</p>`,
    trep: `<p>Client: ${L} ("Tenant") engages ${esc(F)} ("Broker") as exclusive tenant representative to locate industrial space of approx. ${L} SF in ${L} for a term of ${L}.</p><p>Term of agreement: ${L} to ${L}. Broker's fee is paid by the landlord where possible; otherwise ${L}.</p>`,
    loip: `<p>Re: <b>${esc(addr)}</b> (PIN ${esc(p.pin || L)})</p><p>Buyer: ${L}. Seller: ${esc(own)}. Purchase price: $${L}. Earnest money: $${L}. Due diligence: ${L} days. Closing: ${L} days after due diligence. Brokers: ${esc(F)}.</p><p>This letter is non-binding except for confidentiality.</p>`,
    loil: `<p>Re: <b>${esc(addr)}</b>${sf ? ' · approx. ' + fmt(sf) + ' SF' : ''}</p><p>Tenant: ${L}. Landlord: ${esc(own)}. Premises: ${L} SF. Term: ${L} months. Base rent: $${L}/SF/yr NNN, escalations ${L}%. Free rent: ${L}. TI: ${L}. Commencement: ${L}. Brokers: ${esc(F)}.</p><p>Non-binding.</p>`,
    reg: `<p>To: ${esc(own)}</p><p>${esc(F)} registers the following prospect(s) for <b>${esc(addr)}</b>: ${L}. Commission per separate agreement: ${L}%. Registration valid for ${L} days.</p>`,
  }[k];
  const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print');
  w.document.write(`<title>${esc(DOCS.find(x => x[0] === k)[1])}</title><body style="font:14px Georgia,serif;max-width:700px;margin:30px auto;line-height:1.6"><div style="border:2px solid #b91c1c;color:#b91c1c;padding:8px;font:bold 13px system-ui">DRAFT TEMPLATE: use your firm's approved forms / attorney review before signing.</div><h1 style="font-size:20px">${esc(DOCS.find(x => x[0] === k)[1])}</h1><p>Date: ${today()}</p>${body}<p style="margin-top:40px">______________________ &nbsp; Date ______<br>______________________ &nbsp; Date ______</p><script>print()<\/script></body>`); w.document.close();
}
// ---------- 2.8 Fleets outgrowing the yard (FMCSA power units at the address, snapshot per data refresh on this device) ----------
const fleetNow = () => { const m = {}; for (const p of S.props) if (p.fm) for (const x of String(p.fm).matchAll(/\(USDOT (\d+), (\d+) power units\)/g)) m[x[1]] = { n: +x[2], pid: p.id }; return m; };
export async function fleetSnapshot() { const g = S.meta && S.meta.generated; if (!g) return; const H = (await kvGet('fleet')) || []; if (H.some(h => h.g === g)) return; const m = fleetNow(), u = {}; for (const k in m) u[k] = m[k].n; H.push({ g, u }); await kvSet('fleet', H.slice(-12)); }
export async function fleetHTML() {
  await fleetSnapshot(); const H = (await kvGet('fleet')) || [], prev = H.length > 1 ? H[H.length - 2].u : null, now = fleetNow(), out = [];
  for (const dot in now) { const { n, pid } = now[dot], p = S.prop.get(pid), lsf = +val(p, 'landSf') || 0, was = prev && prev[dot]; const R = [];
    if (was && n >= was * 1.2 && n - was >= 2) R.push(`fleet grew ${was} → ${n} trucks since ${H[H.length - 2].g.slice(0, 10)}`);
    if (lsf && n > lsf / 1500) R.push(`${n} trucks on ${fmt(lsf)} SF of land (more than 1 per 1,500 SF)`);
    if (R.length) out.push({ p, n, R, name: (String(p.fm).match(new RegExp('([^;]+) \\(USDOT ' + dot)) || [])[1] || '' }); }
  out.sort((a, b) => b.n - a.n); const scr = `Hi, it's [your name] with ${firm()}. Looks like your fleet has outgrown the yard. I can find you a bigger yard or outdoor storage nearby. Worth a quick look?`;
  return `<div class="xs muted">FMCSA power units registered at each address. ${H.length > 1 ? `Growth compares the last two data refreshes on this device.` : 'Growth needs two refreshes on this device; density check works now.'} <a href="https://safer.fmcsa.dot.gov/" target="_blank" rel="noopener">source</a></div><details class="pc-sc"><summary>Script</summary><p>${esc(scr)}</p>${copyBtn(scr)}</details>${out.slice(0, 30).map(x => `<div class="pcall"><div class="pc-top"><div class="pc-who"><a href="#/property/${esc(x.p.id)}"><b>${esc(nc(val(x.p, 'address') || x.p.pin))}</b></a><span class="xs muted">${esc(nc(x.name.trim()))}</span></div><button class="bact primary pc-call" data-call="${esc(x.p.id)}">Call</button></div><div class="pc-why">${esc(x.R.join(' · '))}</div></div>`).join('') || '<div class="muted xs">No fleets flagged yet.</div>'}`;
}
// ---------- Today group (rendered lazily when opened) ----------
export const TODAY_SECS = [['mustsolve', 'Must solve soon (distress with a clock)', mustSolveHTML], ['x1031', '1031 matchmaker', x1031HTML], ['sublease', 'Sublease hunter', subleaseHTML], ['bizlic', 'New business leads (Chicago licenses)', bizLeadsHTML], ['fleet', 'Fleets outgrowing the yard', fleetHTML], ['bankers', 'Banker referrals (SBA 504 lenders)', bankersHTML]];
export function todayGroupHTML() { return `<h2 class="plan-h">More ways to find deals</h2>${TODAY_SECS.map(([k, l]) => `<details class="feedmore" data-b3="${k}"><summary><b>${l}</b></summary><div class="b3body xs muted">Loading…</div></details>`).join('')}<a class="btn" href="#/referrals" style="display:block;text-align:center;margin:8px 0">Referrals from residential agents ›</a>`; }
export function bindTodayGroup(root) { fleetSnapshot().catch(() => {}); $$('[data-b3]', root).forEach(d => d.addEventListener('toggle', async () => { if (!d.open || d.dataset.done) return; d.dataset.done = 1; const f = TODAY_SECS.find(x => x[0] === d.dataset.b3)[2]; const b = d.querySelector('.b3body'); b.classList.remove('muted'); b.innerHTML = await f(); bindCopy(b); }, { passive: true })); }
