import { $, $$, esc, toast } from './util.js';
import { bindLstat } from './lstat.js';
import { S, loadAll, val, setting, setSetting, save } from './store.js';
import { ensureSeed } from './seed.js';
import { backupDue, downloadBackup, restoreFromFile } from './backup.js';
import { scoreOf, deal } from './scoring.js';
import * as V from './views.js';
import * as X from './extras.js';
import { nearView, favView } from './near.js';
import { bindFavs } from './favs.js';
import { bindCall } from './callpanel.js';
import { scoreHelp } from './ui.js';

const NAV = [
  ['big', 'Big Deals', 'M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5L5.5 21l2-7.5L2 9h7z'],
  ['offmarket', 'Off-Market', 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z'],
  ['ask', 'Ask (smart search)', 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1016 9.5a6.5 6.5 0 01-1.6 4.2l.3.3v.8l5 5 1.5-1.5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z'],
  ['prospect', 'Prospecting', 'M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 013 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z'],
  ['properties', 'Properties', 'M3 21V9l9-6 9 6v12h-6v-7H9v7z'],
  ['owners', 'Owners', 'M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-3 0-8 1.5-8 4.5V21h16v-2.5c0-3-5-4.5-8-4.5z'],
  ['requirements', 'Buyers & Reqs', 'M10 18h4v-2h-4zM3 6v2h18V6zm3 7h12v-2H6z'],
  ['companies', 'Tenants', 'M12 7V3H2v18h20V7zM6 19H4v-2h2zm0-4H4v-2h2zm0-4H4V9h2zm0-4H4V5h2zm4 12H8v-2h2zm0-4H8v-2h2zm0-4H8V9h2zm0-4H8V5h2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8z'],
  ['leases', 'Leases', 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14c0 1.1.9 2 2 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V9h14z'],
  ['crm', 'Follow-ups', 'M13 3a9 9 0 00-9 9H1l4 4 4-4H6a7 7 0 117 7 7 7 0 01-4.9-2l-1.4 1.4A9 9 0 1013 3zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8z'],
  ['comps', 'Comps & Listings', 'M3 17h4V9H3zm7 0h4V5h-4zm7 0h4v-6h-4zM3 21h18v-2H3z'],
  ['brief', 'Market brief', 'M4 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z'],
  ['occupants', "Who's inside (tenants)", 'M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13z'],
  ['stack', 'Stacked opportunities', 'M12 2l10 5-10 5L2 7zm0 13l-8-4-2 1 10 5 10-5-2-1zm0-4l-8-4-2 1 10 5 10-5-2-1z'],
  ['slb', 'Sale-leaseback targets', 'M4 10h16v10H4zM12 3l9 6H3z'],
  ['favs', 'Saved properties (★)', 'M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z'],
  ['lists', 'Saved lists', 'M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z'],
  ['templates', 'Templates', 'M14 2H6a2 2 0 00-2 2v16c0 1.1.9 2 2 2h12a2 2 0 002-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z'],
  ['tools', 'Tools & Data', 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z'],
];
const MORE_D = 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z';
const ico = k => NAV.find(x => x[0] === k)[2];
// Five primary destinations; everything else lives under More (nothing removed)
const PRIMARY = [['today', 'Today', 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14c0 1.1.9 2 2 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V9h14zM7 11h5v5H7z'], ['properties', 'Search', ico('properties')], ['deals', 'Deals', ico('offmarket')], ['more', 'Tools', ico('tools')]];
const SECTION = { buyerrep: 'today', referrals: 'more', deals: 'deals', tools: 'more', crm: 'today', leases: 'deals', comps: 'properties', templates: 'more', lists: 'more', brief: 'more', stats: 'more', big: 'deals', today: 'today', stack: 'deals', property: 'properties', owner: 'deals', owners: 'deals', requirements: 'deals', requirement: 'deals', companies: 'deals', occupants: 'deals', slb: 'deals', company: 'deals', command: 'deals', offmarket: 'deals', prospect: 'deals', ask: 'properties', properties: 'properties', near: 'properties', favs: 'favs' };
const PEOPLE = [['requirements', 'Buyers'], ['owners', 'Owners'], ['companies', 'Tenants']];
function shell() {
  document.body.innerHTML = `
  <header class="topnav"><a class="tn-logo" href="#/today"><img src="icons/icon-192.png" alt=""><span><b>Chicagoland</b> Industrial</span></a>
    <nav class="tn-tabs">${PRIMARY.map(([k, l]) => `<a href="#/${k}" data-r="${k}">${l}</a>`).join('')}</nav>
    <div class="search"><input id="gsearch" type="search" placeholder="Search or ask a question" autocomplete="off"><div id="gresults" class="gresults hidden"></div></div><button class="btn sm hidden" id="install">Install app</button></header>
  <div id="bkbanner"></div><main id="view"></main>
  <nav class="mnav">${PRIMARY.map(([k, l, d]) => `<a href="#/${k}" data-r="${k}"><svg viewBox="0 0 24 24"><path d="${d}"/></svg>${l}</a>`).join('')}</nav>`;
  bindSearch();
}
function bindSearch() {
  const inp = $('#gsearch'), box = $('#gresults'); let t, BS = null; import('./sheets.js').then(M => { BS = M; });
  const nc0 = s => String(s || '').replace(/\w\S*/g, w => w.length > 3 || !/^[A-Z]+$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w);
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => run(inp.value.trim().toLowerCase()), 150); });
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') { box.classList.add('hidden'); inp.blur(); } if (e.key === 'Enter') { const a = $('a', box); if (a) { location.hash = a.getAttribute('href'); box.classList.add('hidden'); } } });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) box.classList.add('hidden'); });
  document.addEventListener('click', e => { const q = e.target.closest('[data-sclegend]'); if (q) { e.preventDefault(); e.stopPropagation(); scoreHelp(); } });
  function run(q) {
    if (q.length < 2) { box.classList.add('hidden'); return; }
    const res = [], dq = q.replace(/\D/g, '');
    for (const p of S.props) { if (res.length >= 12) break; const hay = ((val(p, 'address') || '') + ' ' + (val(p, 'city') || '') + ' ' + (val(p, 'taxpayer') || '')).toLowerCase(); if (hay.includes(q) || (dq.length >= 6 && String(p.pin || '').replace(/\D/g, '').includes(dq))) res.push(['Property', `#/property/${p.id}`, `${val(p, 'address') || p.pin}, ${val(p, 'city') || ''}`, `${val(p, 'taxpayer') || ''} · score ${scoreOf(p).score}`]); }
    if (BS) for (const x of BS.businessSearch(q, 10)) res.push(['Business', `#/property/${x.p.id}`, nc0(x.n), `${x.src} · at ${val(x.p, 'address') || x.p.pin}, ${val(x.p, 'city') || ''}`]);
    let n = 0; for (const o of S.owners.values()) { if (n >= 8) break; if ((o.name + ' ' + (o.entities || []).join(' ') + ' ' + (o.contactName || '')).toLowerCase().includes(q)) { n++; res.push(['Owner', `#/owner/${o.id}`, o.name, (o.stage || 'New') + (o.inferred ? ' · inferred group' : '')]); } }
    for (const c of S.companies.values()) if ((c.name || '').toLowerCase().includes(q)) res.push(['Tenant', `#/company/${c.id}`, c.name, c.industry || '']);
    for (const r of S.requirements.values()) if (((r.name || '') + ' ' + (r.clientName || '')).toLowerCase().includes(q)) res.push(['Buyer/Req', `#/requirement/${r.id}`, r.name, r.dealType || '']);
    const raw = inp.value.trim(); if (raw.split(/\s+/).length >= 3 || !res.length) res.unshift(['Ask', `#/ask/${encodeURIComponent(raw)}`, `Ask: “${raw}”`, 'Smart search: finds sellers, buyers and properties from plain English']);
    box.innerHTML = res.length ? res.slice(0, 25).map(r => `<a href="${r[1]}"><span class="rt">${r[0]}</span><b>${esc(r[2])}</b><small>${esc(r[3])}</small></a>`).join('') : '<div class="muted pad">No matches</div>';
    box.classList.remove('hidden'); $$('a', box).forEach(a => a.onclick = () => { box.classList.add('hidden'); inp.value = ''; });
  }
}
async function route() {
  const [r, id] = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  const sec = SECTION[r] || (r ? 'more' : 'today'); $$('[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === sec));
  for (const k of ['__omiMap', '__omiMini']) if (window[k]) { try { window[k].remove(); } catch (e) {} window[k] = null; }   // release Leaflet maps between screens (memory)
  document.querySelectorAll('.modal').forEach(m => m.remove());
  X.cmpTray();
  const el = $('#view'); el.scrollTop = 0; window.scrollTo(0, 0); backupBanner();
  const fn = { deals: (el) => import('./money.js').then(M => M.dealsView(el)), referrals: (el) => import('./batch3.js').then(M => M.referralsView(el)), big: (el) => import('./bigdeals.js').then(M => M.bigView(el)), buyerrep: (el) => import('./buyerrep.js').then(M => M.buyerRepView(el)), stack: (el) => import('./pro.js').then(M => M.stackView(el)), occupants: (el) => import('./adv.js').then(M => M.occView(el)), slb: (el) => import('./adv.js').then(M => M.slbView(el)), today: (el, id) => import('./plan.js').then(M => M.planView(el, id)), command: V.command, offmarket: V.command, prospect: V.prospect, properties: V.properties, property: V.property, owners: V.owners, owner: V.owner, requirements: V.requirements, requirement: V.requirement, companies: V.companies, company: V.company, leases: V.leases, crm: V.crm, templates: V.templatesView, tools: V.tools, more: V.more, comps: V.compsView, ask: V.askView, compare: X.compareView, lists: X.listsView, brief: X.briefView, stats: X.statsView, near: nearView, favs: favView }[r] || V.command;
  try { await fn(el, id && decodeURIComponent(id)); polish(el, r, id); try { (await import('./pro.js')).enhance(el, r, id); } catch (e) { console.error(e); } if ((r === 'owner' || r === 'property') && id) try { const M = await import('./money.js'), pg = el.querySelector('.page'), p0 = r === 'property' ? S.prop.get(id) : null, o = r === 'owner' ? S.owners.get(id) : p0 && S.owners.get(p0.ownerId); if (pg && !pg.querySelector('.dncbox')) { const h = pg.querySelector('h1'); if (h) { h.insertAdjacentHTML('afterend', `<div class="dncbox btnrow" style="margin:6px 0">${o ? `<label class="fchip" style="min-height:44px"><input type="checkbox" id="dncchk" ${o.dnc ? 'checked' : ''}> Do not call (DNC)</label>` : ''}${p0 ? M.pinBtn(p0.id) + ' ' + M.chip(deal(p0).value) : ''}</div>`); const c = $('#dncchk', pg); if (c) c.onchange = async () => { o.dnc = c.checked; await save('owners', o); toast(o.dnc ? 'Marked DNC: hidden from call lists' : 'DNC removed'); }; M.bindMoney(pg, () => route()); } } } catch (e) { console.error(e); } if (r === 'property' && id) try { const E = await import('./edge.js'), p = S.prop.get(id), pg = el.querySelector('.page'); if (p && pg && !pg.querySelector('.edge')) { const an = pg.querySelector('.pr-intel') || pg.querySelector('.tiles4') || pg.querySelector('.phead5'); if (an) { an.insertAdjacentHTML('afterend', E.propertyEdgeHTML(p)); E.bindEstate(pg, () => route()); } } const I = await import('./costar.js'), h = await I.propertyCompsHTML(p); if (h && !pg.querySelector('#bovimp')) { (pg.querySelector('.edge') || pg.querySelector('.pr-intel') || pg.querySelector('.phead5')).insertAdjacentHTML('afterend', h); I.bindPropertyComps(pg, p); } const B = await import('./batch3.js'); if (!pg.querySelector('#b3tools')) { const an = pg.querySelector('.edge') || pg.querySelector('.pr-intel') || pg.querySelector('.phead5'); an.insertAdjacentHTML('afterend', `<section class="card" id="b3tools" style="margin:12px 0;padding:14px">${B.mustSolve(p) ? '<div class="tag" style="background:#dc2626;color:#fff;display:inline-block;margin-bottom:6px">Must solve soon: tax-delinquent file + open city violations</div>' : ''}<button class="btn primary" id="tprice" style="width:100%">Test the price</button><div style="margin-top:10px"><b>Paperwork</b>${B.paperworkHTML()}</div></section>`); $('#tprice', pg).onclick = () => B.testPrice(p); B.bindPaperwork(pg, p); } if (!pg.querySelector('#bizcalc')) { const Z = await import('./biz.js'); $('#b3tools', pg).insertAdjacentHTML('afterend', Z.bizCalcHTML(Math.round(deal(p).value || 0) || '')); Z.bindBizCalc(pg); } } catch (e) { console.error(e); } try { if ((r === 'more' && !id) || r === 'owner' && id) { const RC = await import('./reach.js'), pg = el.querySelector('.page'); if (pg && r === 'more' && !pg.querySelector('#bizcalc')) { const Z = await import('./biz.js'); pg.insertAdjacentHTML('beforeend', Z.bizCalcHTML()); Z.bindBizCalc(pg); } if (pg && r === 'more' && !pg.querySelector('#doctpl')) { pg.insertAdjacentHTML('beforeend', RC.templatesToolHTML()); RC.bindTemplatesTool(pg); } if (pg && r === 'owner' && !pg.querySelector('[data-pfrev]')) { const h = pg.querySelector('.dncbox') || pg.querySelector('h1'); if (h) { h.insertAdjacentHTML('afterend', RC.portfolioBtn(id) + RC.memTop(id)); RC.bindPortfolio(pg); } } } } catch (e) { console.error(e); } tabBadge(); if (['owners', 'requirements', 'companies'].includes(r) && !id) { const pg = $('.page', el); if (pg) pg.insertAdjacentHTML('afterbegin', `<div class="seg peopleseg">${PEOPLE.map(([k, l]) => `<a class="${k === r ? 'on' : ''}" href="#/${k}">${l}</a>`).join('')}</div>`); } } catch (e) { console.error(e); el.innerHTML = `<div class="page"><h2>Something went wrong</h2><pre>${esc(e.stack || e)}</pre></div>`; }
}
function backupBanner() {
  const b = $('#bkbanner'); if (!b) return;
  if (!backupDue()) { b.innerHTML = ''; return; }
  const last = setting('lastBackup', '');
  b.innerHTML = `<div class="bkban"><span>💾 ${last ? 'Last backup ' + new Date(last).toLocaleDateString() + '.' : 'Not backed up yet.'} Your notes live only on this device.</span><button class="btn sm primary" id="bkb">Download backup</button><label class="btn sm ghost">Restore<input type="file" id="bkr" accept=".json,.zip" hidden></label><button class="btn sm ghost" id="bks">Later</button></div>`;
  $('#bkb').onclick = async () => { await downloadBackup(); backupBanner(); };
  $('#bkr').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await restoreFromFile(f); backupBanner(); route(); } catch (err) { alert('Restore failed: ' + err.message); } };
  $('#bks').onclick = async () => { await setSetting('backupSnooze', Date.now() + 864e5); backupBanner(); };
}
function dataStamp() { const d = $('#dstamp'); if (d && S.meta) d.innerHTML = `Public data last updated <b>${esc(S.meta.generated)}</b> CT`; }
async function boot() {
  document.documentElement.dataset.theme = localStorage.getItem('omi_theme5') || 'light';
  shell(); bindFavs(); bindCall(); bindLstat(); setTimeout(() => intro(), 0);
  $('#view').innerHTML = '<div class="boot"><div class="spinner"></div><div id="bootmsg">Opening local database…</div></div>';
  await loadAll();
  const th = setting('theme5', null); if (th) { document.documentElement.dataset.theme = th; }
  const first = !S.props.length;
  const sync = ensureSeed(m => { const b = $('#bootmsg'); if (b) b.textContent = m; }).catch(e => { console.error(e); toast('Could not check for new public data (offline?)'); return false; });
  if (first) await sync; // first run must download; later opens show local data at once and merge any refresh in the background
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  window.addEventListener('hashchange', route); route(); dataStamp();
  if (!first) sync.then(changed => { dataStamp(); if (changed) { toast(`Public data updated (${S.meta.generated} CT). Your notes and edits were kept.`); route(); } else if (S.changes.ev.length) route(); });
}
// theme remembered for first paint
new MutationObserver(() => localStorage.setItem('omi_theme5', document.documentElement.dataset.theme)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
// PWA install
let deferred; window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; const b = $('#install'); if (b) { b.classList.remove('hidden'); b.onclick = async () => { deferred.prompt(); await deferred.userChoice; b.classList.add('hidden'); }; } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__omi = { S }; window.__omiTheme = t => { document.documentElement.dataset.theme = t; setSetting('theme5', t); }; // for diagnostics/tests
boot();

// ---------- native-feel helpers: one-line explainer per screen, Back on detail screens, slide-in, first-launch intro ----------
var EXPLAIN = {
  properties: 'Find any industrial building or piece of land in Chicagoland. Tap one to see the owner, sales and value.',
  offmarket: 'Owners most likely to sell before a property is listed, who to call next, and early warning signs.',
  command: 'Owners most likely to sell before a property is listed, who to call next, and early warning signs.',
  prospect: 'Your call list, one owner at a time: why to call, the phone number and their properties.',
  requirements: 'Who is buying: active buyers from public sale records (graded A, B, C) and your own buyer clients.',
  owners: 'Everyone who owns industrial property here, grouped by company and mailing address.',
  occupants: 'Likely occupant of each building, matched from FMCSA carrier, SBA 504 loan and IL WARN notice addresses. Exact = address match; fuzzy = mapped near the site.',
  slb: 'Owner-occupied buildings ranked for a sale-leaseback pitch: owner name matches the occupant, long hold, recent SBA loan. Estimated.',
  companies: 'Businesses that occupy these buildings (tenants), from public records and your notes.',
  favs: 'Properties you saved with the star. Kept on this device.',
  more: 'Everything else: maps, lists, tools, settings and backup.',
  deals: 'Your pipeline, take-home after split and cap, deadlines and commission protection.',
  referrals: 'Residential agents who send you commercial clients, and the fees you owe them.',
  big: 'The largest buildings with a public reason to sell or lease, ranked by estimated fee. Tap Call script before you dial.',
  stack: 'Properties where three or more independent reasons to transact overlap.',
  ask: 'Type what you need in plain words, like “30,000 sq ft warehouse near I-55”.',
  near: 'Properties closest to where you are right now.',
};
var DETAIL = ['property', 'owner', 'company', 'requirement'];
function polish(el, r, id) {
  const pg = el.querySelector('.page'); if (!pg) return;
  const ex = EXPLAIN[r];
  if (ex && !id && !pg.querySelector('.explain')) { const h = pg.querySelector('h1'); const host = h ? (h.closest('.ph > div, .hello') || h) : null; if (host) host.insertAdjacentHTML(host === h ? 'afterend' : 'beforeend', `<p class="explain">${ex}</p>`); }
  if (DETAIL.includes(r) && !pg.querySelector('.backbtn')) {
    pg.insertAdjacentHTML('afterbegin', '<button class="backbtn" type="button" aria-label="Back">‹ Back</button>');
    pg.querySelector('.backbtn').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/properties'; };
    el.classList.remove('slidein'); void el.offsetWidth; el.classList.add('slidein');
  } else el.classList.remove('slidein');
}
var INTRO = [
  ['Search every industrial property', 'Look up any building or piece of land in the 8 Chicagoland counties: owner, size, sales and estimated value, all from free public records.'],
  ['Find owners likely to sell', 'The Off-Market tab ranks owners by their chance to sell and tells you who to call next and why.'],
  ['See who is buying', 'Buyers shows who has been buying industrial property, graded A, B, C. Star properties to keep them in Saved. Everything stays on this device.'],
];
export function intro(force) {
  if (!force && localStorage.getItem('omi_intro_done')) return;
  let i = 0; const ov = document.createElement('div'); ov.className = 'intro'; document.body.appendChild(ov);
  const done = () => { localStorage.setItem('omi_intro_done', '1'); ov.remove(); };
  const draw = () => { const [t, d] = INTRO[i]; ov.innerHTML = `<div class="intro-c" role="dialog" aria-modal="true" aria-label="Welcome"><div class="intro-dots">${INTRO.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div><h2>${t}</h2><p>${d}</p><div class="intro-b"><button class="btn ghost" data-skip>Skip</button><button class="btn primary" data-next>${i < INTRO.length - 1 ? 'Next' : 'Get started'}</button></div></div>`;
    ov.querySelector('[data-skip]').onclick = done; ov.querySelector('[data-next]').onclick = () => { if (i < INTRO.length - 1) { i++; draw(); } else done(); }; };
  draw();
}

// red badge on the Today tab = follow-ups due today or overdue
function tabBadge() { import('./plan.js').then(M => { const n = M.dueCount(); $$('[data-r="today"]').forEach(a => { let b = a.querySelector('.tbadge'); if (!n) { if (b) b.remove(); return; } if (!b) { b = document.createElement('span'); b.className = 'tbadge'; a.appendChild(b); } b.textContent = n > 99 ? '99+' : n; }); }); }
