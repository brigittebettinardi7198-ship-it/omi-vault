import { tdelWeight } from './util.js';
// Master spec section 4 (Reach and credibility): one-tap call labels (4.1), residential CMA (4.3), Text buyer (4.4),
// editable paperwork templates (4.6), notes + tags (4.8), inbound speed-to-lead (4.9), portfolio review (4.11).
// Imported phones stay in memory on this device only (from IndexedDB imports); nothing is uploaded.
import { $, $$, esc, fmt, kmoney, today, addDays, toast, uid } from './util.js';
import { S, val, setting, setSetting, ownerProps, firm, addFollowup } from './store.js';
import { deal, sfOf } from './scoring.js';
import { nc } from './extras.js';

const dig = t => String(t || '').replace(/[^\d+]/g, '');
const na = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\b(STREET|ST|AVENUE|AVE|ROAD|RD|DRIVE|DR|BLVD|COURT|CT|PLACE|PL|LANE|LN|NORTH|SOUTH|EAST|WEST|N|S|E|W)\b/g, '').replace(/\s+/g, ' ').trim();
const ENT = /\b(LLC|L L C|INC|CORP|CORPORATION|LP|LLP|LTD|COMPANY|CO|HOLDINGS|PROPERTIES|INVESTMENTS|REALTY|PARTNERS|TRUST|TR)\b/i;
export const SOS = 'https://apps.ilsos.gov/businessentitysearch/';
// ---- 4.1 phones from his CoStar / MLS imports (this device only) ----
let PH = null;
export async function loadPhones() { if (PH) return PH; PH = new Map(); try { const { allSnaps } = await import('./costar.js'); for (const s of await allSnaps()) for (const r of s.rows || []) if (r.phone && r.address) PH.set(na(r.address), { t: r.phone, n: r.name || r.owner || '', src: s.kind === 'mls' ? 'MLS' : 'CoStar' }); } catch (e) {} return PH; }
export const resetPhones = () => { PH = null; };
const first = n => { const s = nc(String(n || '')).replace(/,.*$/, '').trim(); if (!s || ENT.test(s)) return ''; return s.split(/\s+/)[0]; };
const findLinks = (name, city) => { const n = nc(name || ''), g = `https://www.google.com/search?q=${encodeURIComponent(`"${n}" ${nc(city || '')} phone`)}`;
  return `<a class="bact primary pc-call" target="_blank" rel="noopener" href="${g}" title="Search for this owner's phone number">Find #</a>`; };   // IL SOS link lives under the card's More
// commercial card (owner o, property p): imported phone > saved / business phone (call panel) > Find number
export function callBtn(o, p) {
  const ph = PH && p && PH.get(na(val(p, 'address')));
  if (ph) return `<a class="bact primary pc-call" href="tel:${esc(dig(ph.t))}" title="${esc(ph.src)} phone (your import)">☎ ${esc(first(ph.n) || first(o && o.name) || 'Call')}</a>`;
  let has = !!(o && o.phone); if (!has) for (const q of ownerProps(o.id)) if ((q.bph || []).length) { has = true; break; }
  if (has) return `<button class="bact primary pc-call" data-call="o:${esc(o.id)}">☎ ${o.phone ? esc(first(o.contactName || o.name) || 'Call') : 'Business'}</button>`;
  return findLinks(o.name, val(p, 'city'));
}
export function resiCallBtn(x) { const ph = PH && PH.get(na(x.p.a)); if (ph && window.__isDNC && window.__isDNC(ph.t)) return `<span class="bact pc-call" style="background:#fee2e2;color:#b91c1c;border-color:#fca5a5;font-size:13px" title="This number is on the National Do Not Call Registry. Mail or door-knock instead.">On DNC list</span>`; return ph ? `<a class="bact primary pc-call" href="tel:${esc(dig(ph.t))}">☎ ${esc(first(ph.n) || first(x.p.own) || 'Call')}</a>` : findLinks(x.p.own, x.p.mc || x.p.city); }
// ---- 4.8 relationship memory: notes + tags (last note on top of card) ----
const NOTES = () => setting('rnotes', {}) || {};
export function memTop(oid) { const n = (NOTES()[oid] || [])[0], t = ((setting('rtags', {}) || {})[oid] || []); if (!n && !t.length) return '';
  return `<div class="xs" style="background:#fef9c3;border-radius:8px;padding:6px 8px;margin:4px 0">${t.map(x => `<span class="tag" style="background:#e0e7ff">${esc(x.t)}</span>`).join(' ')}${n ? `<div><b>Last note ${esc(n.d)}:</b> ${esc(n.t)}</div>` : ''}</div>`; }
export function notesBox(oid, pid = '') { return `<details class="pc-sc"><summary>Notes${(NOTES()[oid] || []).length ? ' (' + NOTES()[oid].length + ')' : ''}</summary><textarea rows="2" data-note="${esc(oid)}" data-pid="${esc(pid)}" placeholder="Type or tap the mic on your keyboard to dictate" style="width:100%;font-size:16px"></textarea><button class="btn sm" data-notesave="${esc(oid)}" style="min-height:44px">Save note</button>${(NOTES()[oid] || []).slice(0, 5).map(n => `<div class="xs muted">${esc(n.d)}: ${esc(n.t)}</div>`).join('')}</details>`; }
export function bindNotes(root, re) { $$('[data-notesave]', root).forEach(b => b.onclick = async () => { const ta = b.parentElement.querySelector('textarea'), t = ta.value.trim(); if (!t) return; const A = { ...NOTES() }; A[b.dataset.notesave] = [{ t, d: today() }, ...(A[b.dataset.notesave] || [])].slice(0, 50); await setSetting('rnotes', A); toast('Note saved'); re && re(); }); }
// ---- 4.4 Text buyer (sms: only, never auto-send) ----
export const smsHref = (phone, body) => `sms:${dig(phone)}&body=${encodeURIComponent(body)}`;
export function textBuyerBtn(phone, teaser) { return phone ? `<a class="bact pc-call" href="${esc(smsHref(phone, teaser))}">Text buyer</a>` : ''; }
export async function resiBuyerAlertsHTML() { const L = (setting('rbuyers', []) || []).filter(b => b.phone && !b.closed); if (!L.length) return '';
  const { scored } = await import('./cre.js'), { top } = await scored(); if (!top.length) return ''; const D = setting('dncResi', {}) || {};
  const rng = t => { const n = String(t || '').toUpperCase().match(/[\d.]+\s*[KM]?/g) || []; const v = n.map(x => parseFloat(x) * (/M/.test(x) ? 1e6 : /K/.test(x) || parseFloat(x) < 10000 ? 1e3 : 1)); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
  const hits = []; for (const b of L) { const r = rng(b.range), a = String(b.area || '').toLowerCase(); for (const x of top) { if (D[x.p.pin] || !x.v) continue; if (r && (x.v < r[0] * .9 || x.v > r[1] * 1.1)) continue; if (a && !(a.includes(x.p.z) || a.includes(String(x.p.city).toLowerCase()))) continue; hits.push({ b, x }); break; } }
  if (!hits.length) return '';
  return `<h2 class="plan-h">Buyer alerts: residential <span class="cnt">${hits.length}</span></h2>${hits.slice(0, 6).map(({ b, x }) => { const teaser = `Hi ${first(b.name) || ''}, it's ${(setting('profile', {}) || {}).name || 'your agent'} with ${firm()}. I may have an off-market ${kindWord(x)} near ${nc(x.p.city)} around ${kmoney(x.v)} (estimate). Want me to reach out to the owner for you?`;
    return `<div class="pcall"><div class="pc-top"><div class="pc-who"><b>${esc(nc(x.p.a))}</b><span class="xs muted">Fits your buyer <b>${esc(b.name)}</b> · ${esc(b.range || '')} · est. ${kmoney(x.v)}</span></div></div><div class="btnrow" style="flex-wrap:wrap">${resiCallBtn(x).replace('Find number', 'Call owner: find number')}${textBuyerBtn(b.phone, teaser)}</div></div>`; }).join('')}`; }
const kindWord = x => { const c = x.p.c; return c === '211' || c === '212' ? '2-6 unit building' : c[0] === '3' ? 'apartment building' : c[0] === '5' ? 'commercial building' : 'home'; };
// ---- 4.3 CMA (residential), printable via window.print + print stylesheet ----
export async function printCMA(pin) {
  const { creParcel, compsNear, classLabel } = await import('./cre.js'); const p = await creParcel(pin); if (!p) return toast('Load your territory first');
  const C = await compsNear(p, 6), ps = C.map(c => c.r.sp).sort((a, b) => a - b), mid = ps.length ? ps[Math.floor(ps.length / 2)] : 0, lo = ps.length >= 3 ? ps[Math.floor(ps.length * .25)] : 0, hi = ps.length >= 3 ? ps[Math.ceil(ps.length * .75) - 1] : 0;
  const pf = setting('profile', {}) || {}, me = pf.name || '', mp = pf.phone || '';
  const html = `<div class="letter cma"><h1 style="font-size:22px">Comparative Market Analysis</h1><p><b>${esc(nc(p.a))}, ${esc(nc(p.city))}, IL ${esc(p.z)}</b><br>${esc(classLabel(p.c))} · PIN ${esc(p.pin)}${p.sd ? ` · last sold ${esc(p.sd)}${p.sp ? ' for ' + kmoney(p.sp) : ''}` : ''}</p>
    <p><b>Estimated value range: ${lo && hi ? kmoney(lo) + ' to ' + kmoney(hi) : mid ? 'about ' + kmoney(mid) : 'not enough nearby sales'}</b> (estimate from nearby recorded sales of the same property class; not an appraisal)</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px"><tr><th align="left">Address</th><th>Sold</th><th align="right">Price</th><th align="right">Distance</th></tr>${C.map(c => `<tr><td>${esc(nc(c.x.a || c.r.pin))}</td><td align="center">${esc(c.r.d)}</td><td align="right">${kmoney(c.r.sp)}</td><td align="right">${c.d.toFixed(2)} mi</td></tr>`).join('')}</table>
    <p class="xs">Sales: Cook County Parcel Sales (open data; posts about 2 months late). Square footage is not in this public file, so no $/SF is shown.</p>
    <p style="margin-top:24px"><b>${esc(me || '________')}</b>${mp ? ' · ' + esc(mp) : ''}<br>${esc(firm())}</p></div>`;
  printHTML(html);
}
export function printHTML(html) { const w = document.createElement('div'); w.id = 'printarea'; w.innerHTML = html; document.body.appendChild(w); document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); w.remove(); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); setTimeout(() => { window.print(); setTimeout(done, 1500); }, 50); }
// ---- 4.6 editable paperwork templates (Tools) ----
export const DOC_NAMES = [['listing', 'Listing agreement'], ['trep', 'Tenant rep agreement'], ['brepr', 'Buyer rep (residential)'], ['brepc', 'Buyer rep (commercial)'], ['loip', 'LOI: purchase'], ['loil', 'LOI: lease'], ['reg', 'Commission registration letter']];
export const REAL_NOTE = 'Real Brokerage official forms take priority (ask John Boska or the Real transaction team). Use these only as drafts and get attorney review.';
export const DOC_DEF = {
  brepr: 'Buyer: {blank} ("Buyer") engages {firm} ("Broker") as exclusive buyer representative to locate residential property in {blank} up to ${blank}.\nTerm: {date} to {blank}. Compensation: {blank}% of purchase price, paid by seller where offered, otherwise by Buyer.\nProtection period: {blank} days.',
  brepc: 'Client: {blank} ("Buyer") engages {firm} ("Broker") as exclusive buyer representative to locate commercial property (type {blank}, size {blank} SF, area {blank}) up to ${blank}.\nTerm: {date} to {blank}. Compensation: {blank}% of purchase price, paid by seller where offered, otherwise by Client.\nProtection period: {blank} days after expiration for properties shown.'
};
export const docTpl = k => (setting('docTpl', {}) || {})[k] || DOC_DEF[k] || '';
export function fillTpl(t, v) { return esc(t).replace(/\{(\w+)\}/g, (m, k) => k === 'blank' ? '__________' : v[k] != null ? `<b>${esc(v[k])}</b>` : m).replace(/\n/g, '</p><p>'); }
export function templatesToolHTML() { return `<section class="card" id="doctpl" style="margin:12px 0;padding:14px"><h2 style="margin-top:0">Paperwork templates</h2><div class="xs muted">${esc(REAL_NOTE)} Placeholders: {owner} {address} {pin} {sf} {firm} {date} {blank}. Leave a box empty to use the built-in draft.</div>
  ${DOC_NAMES.map(([k, l]) => `<details class="pc-sc"><summary>${esc(l)}</summary><textarea rows="5" data-tpl="${k}" style="width:100%;font-size:16px" placeholder="${esc(DOC_DEF[k] || 'Built-in draft (tap to write your own)')}">${esc((setting('docTpl', {}) || {})[k] || '')}</textarea></details>`).join('')}</section>`; }
export function bindTemplatesTool(root) { $$('[data-tpl]', root).forEach(t => t.onchange = async () => { const A = { ...(setting('docTpl', {}) || {}) }; if (t.value.trim()) A[t.dataset.tpl] = t.value; else delete A[t.dataset.tpl]; await setSetting('docTpl', A); toast('Template saved on this device'); }); }
// ---- 4.9 inbound speed-to-lead ----
export const SOURCES = ['LoopNet', 'Crexi', 'Sign call', 'Zillow lead', 'Referral', 'Open house', 'Other'];
export function avgResponse(L) { const m = today().slice(0, 7), D = L.filter(b => b.contacted && b.ts && new Date(b.ts).toISOString().slice(0, 7) === m); if (!D.length) return ''; const avg = D.reduce((a, b) => a + (b.contacted - b.ts), 0) / D.length / 60000;
  return `Average response this month: ${avg < 60 ? Math.round(avg) + ' min' : (avg / 60).toFixed(1) + ' h'} (${D.length} lead${D.length > 1 ? 's' : ''})`; }
export const waitTxt = ts => { const m = Math.floor((Date.now() - ts) / 60000); return m < 60 ? m + ' min' : m < 2880 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : Math.floor(m / 1440) + ' days'; };
let TICK = null; export function startTimers() { clearInterval(TICK); TICK = setInterval(() => { const L = $$('[data-wait]'); if (!L.length) { clearInterval(TICK); return; } L.forEach(s => s.textContent = waitTxt(+s.dataset.wait)); }, 30000); }
// ---- 4.11 portfolio review (3+ properties) ----
export function portfolioRows(oid) { const L = ownerProps(oid); if (L.length < 3) return null; const yr = new Date().getFullYear();
  const R = L.map(p => { const v = Math.round(deal(p).value || +p.mv || 0), bought = +p.sp || 0, by = p.sd ? +p.sd.slice(0, 4) : 0, held = by ? yr - by : Math.floor(+p.hold || 0);
    // equity estimate: assume a 70% loan at purchase on a 25-year payoff; free and clear after 25 years (estimate, no loan data)
    const loan = bought && by ? Math.max(0, bought * .7 * (1 - (yr - by) / 25)) : held >= 25 ? 0 : null, eq = v && loan != null ? Math.max(0, v - loan) : null;
    const gain = v && bought ? v / bought : 0, s = (gain > 1 ? Math.min(gain, 4) * 10 : 0) + Math.min(held, 40) + (p.tdel ? tdelWeight(p.tdel, 15) : 0) + (p.vac ? 8 : 0);
    return { p, v, bought, by, held, eq, s }; }).sort((a, b) => b.s - a.s);
  return { R, tv: R.reduce((a, x) => a + x.v, 0), te: R.reduce((a, x) => a + (x.eq || 0), 0), unk: R.filter(x => x.eq == null).length }; }
export function portfolioBtn(oid) { return ownerProps(oid).length >= 3 ? `<button class="btn sm" data-pfrev="${esc(oid)}" style="min-height:44px">Portfolio review</button>` : ''; }
export function bindPortfolio(root) { $$('[data-pfrev]', root).forEach(b => b.onclick = () => openPortfolio(b.dataset.pfrev)); }
export async function openPortfolio(oid) { const P = portfolioRows(oid); if (!P) return; const o = S.owners.get(oid) || {}, { modal } = await import('./ui.js');
  const html = `<h2>Portfolio review</h2><div class="muted">${esc(nc(o.name || ''))} · ${P.R.length} properties</div>
    <div class="earn"><div><span>Total est. value</span><b>${kmoney(P.tv) || '–'}</b></div><div><span>Est. equity</span><b>${kmoney(P.te) || '–'}${P.unk ? '+' : ''}</b></div></div>
    <div class="xs muted">Estimates. Value from nearby recorded sales and assessor data. Equity assumes a 70% loan at purchase paid off over 25 years (no loan records used)${P.unk ? `; ${P.unk} with no purchase price left out` : ''}.</div>
    <h3>Sell first</h3><ol style="padding-left:18px">${P.R.slice(0, 12).map((x, i) => `<li style="margin:6px 0"><a href="#/property/${esc(x.p.id)}" data-close>${esc(nc(val(x.p, 'address') || x.p.pin))}</a><div class="xs muted">est. ${kmoney(x.v) || '?'}${x.bought ? ` · bought ${x.by} for ${kmoney(x.bought)}` : ''}${x.held ? ` · held ${x.held} yrs` : ''}${x.eq != null ? ` · equity ≈ ${kmoney(x.eq)}` : ''}${i === 0 ? ' · biggest gain and longest hold: easiest to sell' : ''}</div></li>`).join('')}</ol>
    <p class="xs">Pitch: "You own ${P.R.length} properties worth about ${kmoney(P.tv)} together. I can show you which one to sell first to free up cash, and how a 1031 exchange could defer the tax."</p><div class="mfoot"><button class="btn" data-close>Close</button></div>`;
  modal(html); }
