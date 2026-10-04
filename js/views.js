import { trueOwnerHTML, bindTrueOwner, trueOwnerQueue, ownerEntities, linkedOwners, isLandTrust } from './trueowner.js';
import { favBtn, isFav, favIds } from './favs.js';
import { lstatBadge, lstatControl, lstatMatch, LSF } from './lstat.js';
import { likelyBuyersHTML, likelyBuyers } from './buyers.js';
import { TYPE4, isType, typeCounts, officeProps, loadOffice, phonesHTML, siteHTML, dcOf, iosOf, jumpHTML, appealHTML, shortWhy, nc, statsHTML, bindStats, statsLine, oppHTML, bindOpp, intelPane, cpermHTML, cvalHTML, networkHTML, cmpIds, cmpToggle, addToListModal, floodLayer } from './extras.js';
import { $, $$, esc, fmt, money, kmoney, today, addDays, daysBetween, d8, badge, CONF, toast, toCSV, download, uid, scorePill, normName, scoreColor, SCORE_BANDS } from './util.js';
import { S, save, val, conf, FIELDS, FBY, OPT, STAGES, CLOSED_STAGES, MOTIVATIONS, ownerProps, propLeases, ownerFollowups, activitiesFor, setting, setSetting, idx, addFollowup, addActivity } from './store.js';
import { FRESH, freshText, scoreOf, allScores, callList, quietSeller, dealPairs, matches, buyersForProp, possibleBuyers, buyerSignal, deal, priorityOf, ownerDeal, leaseInfo, activeMatchMap, isBuySide, WEIGHT_DEFS } from './scoring.js';
import { table, modal, scoreLegend, scoreHelpBtn, confSelect, stageSelect, prioSelect, kindTag, quickLogHTML, bindQuickLog, activityHTML, linksHTML } from './ui.js';
import { propertyLinks, MARKET } from './markets.js';
import { contactBadge, contactFormHTML, readContactForm, findOwnerHTML, bindFindOwner, froDone, FRO_STEPS, TAXNOTE, callablePhone, cstat, contactFound } from './contacts.js';
export { requirements, requirement, companies, company, leases, crm, templatesView, tools, more } from './views2.js';
export { compsView } from './views3.js';
export { askView } from './ask.js';
import { askBoxHTML, bindAskBox } from './ask.js';
import { compForm, flyerModal } from './views3.js';
import { nearbySales, nearbyLease, listingLinks, median, SRC_PUB, SRC_YOU } from './comps.js';

export const DISCLAIMER = 'Prospecting tool only. Scores rank which owners are worth a call based on public records and your notes. A high score is not a claim that the owner intends to sell.';
const oName = id => nc((S.owners.get(id) || {}).name || '');
const bigOn = () => setting('bigOnly', true);
const dealCell = d => d.value ? `<b>${kmoney(d.value)}</b><div class="xs muted">${esc(d.kind)}</div>` : '<span class="muted">–</span>';
const commCell = d => d.commission ? `<b class="pos">${kmoney(d.commission)}</b>` : '';
const sfAc = d => d.sf ? fmt(d.sf) + ' SF' : d.acres ? d.acres.toFixed(1) + ' ac' : '–';
const bigTag = d => '';   // v4: no BIG badges in lists (the Big deals filter is on by default)
const stageTag = s => `<span class="stage st-${(s || 'New').replace(/\W+/g, '').toLowerCase()}">${esc(s || 'New')}</span>`;
export const helpers = { oName, dealCell, commCell, sfAc, bigTag, stageTag };

function bigToggle(onChange) {
  return `<label class="toggle" title="Big deals: ${fmt(setting('bigSf', 50000))}+ SF, ${setting('bigAcres', 5)}+ acres, or ${kmoney(setting('bigValue', 5000000))}+ est. value (change in Tools → Settings)"><input type="checkbox" id="bigOnly" ${bigOn() ? 'checked' : ''}> Big deals only</label>`;
}
function wireBig(rerender) { const b = $('#bigOnly'); if (b) b.onchange = async () => { await setSetting('bigOnly', b.checked); rerender(); }; }

// ================= COMMAND CENTER =================
export async function command(el) {
  const big = bigOn(), now = today();
  const pairs = dealPairs(12, big), calls = callList(30, big);
  const fus = [...S.followups.values()].filter(f => !f.done).sort((a, b) => a.due.localeCompare(b.due));
  const overdue = fus.filter(f => f.due < now), due = fus.filter(f => f.due === now), soon = fus.filter(f => f.due > now && f.due <= addDays(now, 7));
  const reqs = [...S.requirements.values()].filter(r => (r.status || 'Active') === 'Active');
  const sc = allScores();
  const opps = S.props.filter(p => !big || deal(p).big).map(p => ({ p, pr: priorityOf(p) })).sort((a, b) => b.pr - a.pr).slice(0, 15);
  const buyers = possibleBuyers(12);
  const { lastAct } = idx();
  const stale = [...S.owners.values()].filter(o => o.stage && !CLOSED_STAGES.includes(o.stage) && o.stage !== 'New' && (!lastAct.get(o.id) || (Date.now() - lastAct.get(o.id)) / 864e5 > 45) && !ownerFollowups(o.id).length).slice(0, 15);
  const rq = callList(200, false).filter(c => !contactFound(c.o) && !c.o.needsResearch && (c.od?.big || (c.best?.x.score || 0) >= 70)).map(c => c.o);
  const toq = trueOwnerQueue(40, big);
  const research = [...S.owners.values()].filter(o => o.needsResearch).concat(rq).slice(0, 20);
  const fresh = (S.changes.ev || []).filter(e => daysBetween(e.d, now) <= 30 && S.prop.has(e.id) && e.t !== 'new').map(e => ({ e, p: S.prop.get(e.id) })).filter(x => !big || deal(x.p).big).sort((a, b) => b.e.d.localeCompare(a.e.d) || deal(b.p).value - deal(a.p).value);
  const pipeVal = [...S.owners.values()].filter(o => ['Interested', 'Meeting set', 'Proposal / BOV', 'Listing / deal'].includes(o.stage)).reduce((s, o) => s + ownerDeal(o.id).commission, 0);
  const warnN = S.warn && (S.warn.ev || []).length ? (S.warn.ev || []).length : 0, fuRows = overdue.concat(due, soon).slice(0, 20);
  const OPEN = JSON.parse(localStorage.getItem('omi_cc_open') || '{}');
  const sect = (id, title, n, desc, inner, def = false) => `<details class="sect" data-sect="${id}" ${(OPEN[id] ?? def) ? 'open' : ''}><summary><span class="st-t"><h2>${title}</h2>${n != null ? `<span class="cnt">${n}</span>` : ''}</span><span class="st-d">${desc}</span></summary><div class="sect-b">${inner}</div></details>`;
  const quiet = (S.settings?.todayShowInst ? calls : calls.filter(quietSeller)), top = quiet.slice(0, 5);
  const nx = top[0], fuDue = overdue.length + due.length, rest = quiet.slice(1, 5);
  const valOf = x => x.od.value ? kmoney(x.od.value) : x.props.length + ' parcel' + (x.props.length > 1 ? 's' : '');
  const why = x => { const r = x.fu && x.fu.due <= today() ? ['Follow-up due'] : []; const sw = x.best ? shortWhy(x.best.x.reasons) : ''; if (sw) r.push(sw); return r.join(' · ') || 'Top of your call list'; };
  el.innerHTML = `<div class="page cc today2">
  <div class="hello"><h1>Today</h1><div class="muted">${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div></div>
  ${nx ? `<section class="callnext"><div class="cn-l"><div class="cn-k">Call next</div><a class="cn-name" href="#/owner/${nx.o.id}">${esc(nc(nx.o.name))}</a><div class="cn-why">${esc(why(nx))}</div></div>
    <div class="cn-r"><div class="cn-v"><b>${valOf(nx)}</b><span>est. value</span></div><button class="btn primary big" data-call="o:${nx.o.id}">Call</button></div></section>` : '<section class="callnext"><div class="muted">Nothing ranked yet. Add a buyer or turn off "Big deals only" below.</div></section>'}
  ${rest.length ? `<section class="upnext"><div class="lbl">Up next</div>${rest.map(x => `<a class="un-row" href="#/prospect/${x.o.id}"><span class="un-n">${esc(nc(x.o.name))}</span><span class="un-v">${valOf(x)}</span></a>`).join('')}<a class="un-all" href="#/prospect">See the full call list</a></section>` : ''}<a class="btn nearbtn" href="#/near" aria-label="Near me: closest high-score properties">◎ Near me</a>
  ${fuDue ? `<a class="fucount due" href="#/crm"><b>${fuDue}</b> follow-up${fuDue === 1 ? '' : 's'} due${overdue.length ? ` <span>(${overdue.length} overdue)</span>` : ''}<span class="go">›</span></a>` : '<a class="fucount none" href="#/crm">No follow-ups due today<span class="go">›</span></a>'}
  <details class="allsects" data-sect="all" ${OPEN.all ? 'open' : ''}><summary>Pipeline, signals & research</summary>
  <div class="allbar">${bigToggle()}<a class="btn sm ghost" href="#/stats">Stats</a><a class="btn sm ghost" href="#/brief">Market brief</a></div>
  <div class="sects">
  ${sect('pairs', 'Deal pairs: buyer ↔ likely seller', reqs.length ? pairs.length : 0, 'Active buyer criteria matched to owners with high off-market scores, weighted to deal size', reqs.length ? '<div id="pairs"></div>' : `<div class="empty-cta">No active buyers yet. <a class="btn sm primary" href="#/requirements/new">Add a buyer or requirement</a> and the app will match it against every parcel and list the owners to call.</div>`, reqs.length > 0)}
  ${sect('fus', 'Follow-ups', fuRows.length, 'Overdue, due today and the next 7 days · <a href="#/crm">All follow-ups</a>', '<div id="fus"></div>', overdue.length + due.length > 0)}
  ${sect('fresh', 'Fresh signals: what changed in public records', fresh.length, `From the scheduled data refresh (last run ${esc(S.changes.updated || '–')} CT). New owners are possible buyers and sellers; mailing-address changes can mean new management or sale prep.`, '<div id="fresh"></div>')}
  ${warnN ? sect('warn', 'Layoff & closing notices (IL WARN)', warnN, `Last 12 months in your counties, from IL Dept of Commerce WARN reports (updated ${esc(S.warn.updated)}). A closing can free up a building or push an owner to sell.`, '<div id="warnl"></div>') : ''}
  ${sect('signals', 'Opportunity signals', null, 'Possible 1031 sellers, succession watch, Chicago demolition permits, tax jumps · <a href="#/brief">Weekly market brief</a>', '<div id="oppx" class="muted">Open to load…</div>')}
  ${sect('calls', 'Full call list', calls.length, 'Overdue follow-ups, off-market score, deal size, leases, requirement matches, your priority', '<div id="calls"></div>')}
  ${sect('research', 'Research queue: find the real owner', research.length, 'Big-deal or high-score owners with no verified phone / email, plus anything you flagged', '<div id="research"></div>')}
  ${sect('trueq', 'True owner not yet identified', toq.length, 'LLC, corporation and trust owners with no true owner saved, best opportunities first', '<div id="trueq"></div>')}
  ${sect('opps', 'Top off-market opportunities', opps.length, '<a href="#/properties">All properties</a>', '<div id="opps"></div>')}
  ${sect('reqs', 'Active buyers & requirements', reqs.length, '<a href="#/requirements">Manage</a>', '<div id="reqs"></div>')}
  ${sect('buyers', 'Possible buyers to qualify', buyers.length, 'Inferred: owners of several industrial parcels who bought in the last 5 years', '<div id="buyers"></div>')}
  ${sect('stale', 'Stale prospects', stale.length, 'Active stage, no activity in 45+ days, no follow-up', '<div id="stale"></div>')}
  </div>
  </details>
  <div class="disc">${DISCLAIMER}</div>
  </div>`;
  const oppD = $('details[data-sect="signals"]', el), oppFill = () => { const b = $('#oppx', el); if (b && !b.dataset.f) { b.dataset.f = 1; b.classList.remove('muted'); b.innerHTML = oppHTML(); bindOpp(b); } };
  if (oppD) { if (oppD.open) oppFill(); oppD.addEventListener('toggle', () => oppD.open && oppFill()); }
  $$('details.sect', el).forEach(d => d.addEventListener('toggle', () => { const o = JSON.parse(localStorage.getItem('omi_cc_open') || '{}'); o[d.dataset.sect] = d.open; localStorage.setItem('omi_cc_open', JSON.stringify(o)); }));
  wireBig(() => command(el));
  if (reqs.length) table($('#pairs'), pairs, [
    { k: 'pair', l: 'Pair', h: x => scorePill(x.pair), v: x => x.pair },
    { k: 'buyer', l: 'Buyer / requirement', h: x => `<a href="#/requirement/${x.r.id}">${esc(x.r.name)}</a><div class="xs muted">${esc(x.r.dealType || '')}</div>`, v: x => x.r.name },
    { k: 'prop', l: 'Seller property', h: x => `<a href="#/property/${x.p.id}">${esc(nc(val(x.p, 'address') || x.p.pin))}</a> ${bigTag(x.d)}<div class="xs muted">${esc(nc(val(x.p, 'city') || ''))} · ${sfAc(x.d)}</div>`, v: x => val(x.p, 'address') },
    { k: 'owner', l: 'Owner to call', h: x => `<a href="#/owner/${x.p.ownerId}">${esc(oName(x.p.ownerId))}</a><div>${stageTag(S.owners.get(x.p.ownerId)?.stage)}</div>`, v: x => oName(x.p.ownerId) },
    { k: 'score', l: 'Match', h: x => scorePill(x.score), v: x => x.score }, { k: 'om', l: 'Score', h: x => scorePill(x.om), v: x => x.om },
    { k: 'val', l: 'Est. value', h: x => dealCell(x.d), v: x => x.d.value }, { k: 'comm', l: 'Est. comm.', h: x => commCell(x.d), v: x => x.d.commission },
    { k: 'why', l: 'Why', h: x => `<div class="xs">${esc(x.reasons.slice(0, 3).join(' · '))}</div>` },
    { k: 'go', l: '', h: x => `<a class="btn sm primary" href="#/prospect/${x.p.ownerId}">Call ▸</a>` },
  ], { empty: 'No matches above the threshold yet. Loosen the buyer criteria or turn off "Big deals only".' });
  table($('#calls'), calls, [
    { k: 's', l: 'Rank', h: x => `<b class="rank">${x.s}</b>`, v: x => x.s },
    { k: 'o', l: 'Owner', h: x => `<a href="#/owner/${x.o.id}">${esc(nc(x.o.name))}</a><div class="xs muted">${x.props.length} parcel${x.props.length > 1 ? 's' : ''}${callablePhone(x.o) ? ' · ' + esc(x.o.phone) : ''}</div>${contactFound(x.o) ? contactBadge(x.o) : ''}`, v: x => x.o.name },
    { k: 'st', l: 'Stage', h: x => stageTag(x.o.stage), v: x => x.o.stage || '' },
    { k: 'v', l: 'Est. value / comm.', h: x => x.od.value ? `<b>${kmoney(x.od.value)}</b> · <b class="pos">${kmoney(x.od.commission)}</b><div class="xs muted">${fmt(x.od.sf)} SF total</div>` : '–', v: x => x.od.value },
    { k: 'r', l: 'Why call', h: x => `<ul class="why">${x.R.slice(0, 4).map(r => `<li>${kindTag(r.kind)} ${esc(r.text)}</li>`).join('')}</ul>` },
    { k: 'go', l: '', h: x => `<a class="btn sm primary" href="#/prospect/${x.o.id}">Call ▸</a>` },
  ], { page: 30, empty: 'Nothing ranked yet.' });
  table($('#fus'), fuRows, [
    { k: 'due', l: 'Due', h: f => `<span class="${f.due < now ? 'neg' : f.due === now ? 'warnc' : ''}">${d8(f.due)}</span>`, v: f => f.due },
    { k: 'who', l: 'Who', h: f => f.ownerId ? `<a href="#/owner/${f.ownerId}">${esc(oName(f.ownerId))}</a>` : f.companyId ? `<a href="#/company/${f.companyId}">${esc(S.companies.get(f.companyId)?.name || '')}</a>` : '' },
    { k: 'note', l: 'Note', h: f => esc(f.note || '') },
    { k: 'go', l: '', h: f => f.ownerId ? `<a class="btn sm" href="#/prospect/${f.ownerId}">Call</a>` : '' },
  ], { empty: 'No follow-ups due in the next 7 days.' });
  const mm = activeMatchMap();
  table($('#reqs'), reqs, [
    { k: 'name', l: 'Buyer / requirement', h: r => `<a href="#/requirement/${r.id}">${esc(r.name)}</a><div class="xs muted">${esc(r.dealType || '')} · ${r.sfMin ? fmt(r.sfMin) : '?'}–${r.sfMax ? fmt(r.sfMax) : '?'} SF</div>` },
    { k: 'n', l: 'Matches (60+)', h: r => { let n = 0; for (const [, v] of mm) if (v.some(m => m.req.id === r.id)) n++; return `<b>${n}</b>`; } },
  ], { empty: '<a href="#/requirements/new">Add your first buyer / requirement</a>' });
  table($('#opps'), opps, [
    { k: 'pr', l: 'Priority', h: x => `<b class="rank">${x.pr}</b>`, v: x => x.pr },
    { k: 'om', l: 'Score', h: x => scorePill(sc.get(x.p.id).score), v: x => sc.get(x.p.id).score },
    { k: 'a', l: 'Property', h: x => `<a href="#/property/${x.p.id}">${esc(nc(val(x.p, 'address') || x.p.pin))}</a> ${bigTag(deal(x.p))}<div class="xs muted">${esc(nc(val(x.p, 'city') || ''))}, ${esc(val(x.p, 'county'))}</div>` },
    { k: 'sf', l: 'Size', h: x => sfAc(deal(x.p)), v: x => deal(x.p).sf },
    { k: 'v', l: 'Est. value', h: x => dealCell(deal(x.p)), v: x => deal(x.p).value }, { k: 'c', l: 'Est. comm.', h: x => commCell(deal(x.p)), v: x => deal(x.p).commission },
    { k: 'o', l: 'Owner', h: x => x.p.ownerId ? `<a href="#/owner/${x.p.ownerId}">${esc(oName(x.p.ownerId))}</a>` : esc(val(x.p, 'taxpayer') || '') },
    { k: 'w', l: 'Top reasons', h: x => `<div class="xs">${esc(sc.get(x.p.id).reasons.slice(0, 3).map(r => r.text).join(' · '))}</div>` },
  ]);
  table($('#buyers'), buyers, [
    { k: 'o', l: 'Owner', h: x => `<a href="#/owner/${x.o.id}">${esc(nc(x.o.name))}</a>` },
    { k: 'b', l: 'Signal (inferred)', h: x => esc(x.b.text) }, { k: 'sf', l: 'Portfolio SF', h: x => fmt(ownerDeal(x.o.id).sf) },
  ]);
  table($('#stale'), stale, [{ k: 'o', l: 'Owner', h: o => `<a href="#/owner/${o.id}">${esc(nc(o.name))}</a>` }, { k: 's', l: 'Stage', h: o => stageTag(o.stage) }, { k: 'l', l: 'Last contact', h: o => esc(o.lastContact || '–') }], { empty: 'No stale prospects.' });
  const FT = { owner: 'tag match', sale: 'tag', mail: 'tag cunv', value: 'tag' };
  bindAskBox(el);
  const wl = $('#warnl'); if (wl) table(wl, (S.warn.ev || []).filter(e => !big || (e.pid && S.prop.has(e.pid) && deal(S.prop.get(e.pid)).big)).slice(0, 25), [{ k: 'd', l: 'Notice', h: e => esc(e.d) }, { k: 'n', l: 'Company', h: e => `${esc(e.name)}<div class="xs muted">${esc(e.ind || '')}</div>` }, { k: 'a', l: 'Address', h: e => e.pid && S.prop.has(e.pid) ? `<a href="#/property/${e.pid}">${esc(e.addr)}</a>` : esc(e.addr) + ' <span class="xs muted">(no parcel match)</span>' }, { k: 'c', l: 'City', h: e => esc(e.city) }, { k: 't', l: 'Type', h: e => esc(e.type) }, { k: 'w', l: 'Workers', h: e => esc(e.n || '') }], { empty: 'No notices.' });
  table($('#fresh'), fresh.slice(0, 40), [
    { k: 'd', l: 'Date', h: x => esc(x.e.d), v: x => x.e.d }, { k: 't', l: 'Signal', h: x => `<span class="${FT[x.e.t] || 'tag'}">${esc(FRESH[x.e.t] || x.e.t)}</span>` },
    { k: 'a', l: 'Property', h: x => `<a href="#/property/${x.p.id}">${esc(nc(val(x.p, 'address') || x.p.pin))}</a> ${bigTag(deal(x.p))}<div class="xs muted">${esc(nc(val(x.p, 'city') || ''))} · ${sfAc(deal(x.p))}</div>` },
    { k: 'c', l: 'Change', h: x => `<div class="xs">${esc(freshText(x.e))}</div>` },
    { k: 'o', l: 'Owner now', h: x => x.p.ownerId ? `<a href="#/owner/${x.p.ownerId}">${esc(oName(x.p.ownerId))}</a> ${contactBadge(S.owners.get(x.p.ownerId))}` : '' },
    { k: 'v', l: 'Est. value', h: x => dealCell(deal(x.p)), v: x => deal(x.p).value }, { k: 'cm', l: 'Est. comm.', h: x => commCell(deal(x.p)), v: x => deal(x.p).commission },
    { k: 'go', l: '', h: x => x.p.ownerId ? `<a class="btn sm primary" href="#/prospect/${x.p.ownerId}">Call ▸</a>` : '' },
  ], { empty: S.changes.runs?.length > 1 ? 'No changes in the last 30 days' + (big ? ' on big deals.' : '.') : 'No changes yet. The first comparison appears after the next scheduled refresh (Mon & Thu).' });
  table($('#trueq'), toq, [{ k: 'o', l: 'Owner', h: x => `<a href="#/owner/${x.o.id}">${esc(nc(x.o.name))}</a><div class="xs muted">${esc(x.ents.slice(0, 2).map(nc).join(' · '))}${x.lt ? ' · land trust' : ''}</div>` }, { k: 's', l: 'Score', h: x => scorePill(x.best.s), v: x => x.best.s }, { k: 'v', l: 'Est. value', cls: 'num', h: x => kmoney(x.value), v: x => x.value }, { k: 'go', l: '', h: x => `<a class="btn sm" href="#/owner/${x.o.id}">Look up ▸</a>` }], { empty: 'Every entity owner in view has a true owner saved.' });
  table($('#research'), research, [{ k: 'o', l: 'Owner', h: o => `<a href="#/owner/${o.id}">${esc(nc(o.name))}</a>` }, { k: 'c', l: 'Contact', h: o => contactBadge(o) }, { k: 'r', l: 'Why', h: o => o.needsResearch ? 'Flagged (e.g. wrong number)' : 'Big / high-score, no verified contact' }, { k: 'v', l: 'Est. value', h: o => kmoney(ownerDeal(o.id).value) }, { k: 'st', l: 'Steps', h: o => `${froDone(o)}/${FRO_STEPS.length}` }, { k: 'go', l: '', h: o => `<a class="btn sm" href="#/owner/${o.id}">Find owner ▸</a>` }], { empty: 'Research queue is empty.' });
}

// ================= DAILY PROSPECTING MODE =================
export async function prospect(el, startId) {
  const big = bigOn();
  let q = callList(150, big).map(c => c.o.id);
  if (startId) { q = [startId, ...q.filter(x => x !== startId)]; }
  let i = 0;
  const draw = () => {
    const oid = q[i];
    if (!oid) { el.innerHTML = `<div class="page"><div class="ph"><h1>Prospecting</h1>${bigToggle()}</div><div class="empty-cta">Queue is empty. Add buyers/requirements, set priorities, or turn off "Big deals only".</div></div>`; wireBig(() => prospect(el)); return; }
    const o = S.owners.get(oid), props = ownerProps(oid).sort((a, b) => priorityOf(b) - priorityOf(a)), od = ownerDeal(oid);
    const top = props[0], sc = top ? scoreOf(top) : null, bs = top ? buyersForProp(top) : [], bsig = buyerSignal(o);
    const fu = ownerFollowups(oid)[0];
    el.innerHTML = `<div class="page prospect">
      <div class="ph"><div><h1>Prospecting</h1><div class="muted">${i + 1} of ${q.length} in today's queue · <span class="xs">${statsLine()}</span></div></div><div class="ph-act">${bigToggle()}</div></div>
      <div class="pcard">
        <div class="pc-head"><div><h2>${esc(nc(o.name))}</h2><div>${stageTag(o.stage)} ${o.priority ? `<span class="tag">Priority ${o.priority}</span>` : ''} ${o.inferred ? '<span class="conf c-inf">Inferred owner group</span>' : ''}</div></div>
          <div class="pc-money"><div><small>Est. value</small><b>${kmoney(od.value) || '–'}</b></div><div><small>Est. commission</small><b class="pos">${kmoney(od.commission) || '–'}</b></div></div></div>
        <div class="pc-contact">${contactBadge(o)} ${callablePhone(o) ? `<a class="btn primary big-btn" href="tel:${esc(o.phone)}">Call ${esc(o.phone)}</a> <span class="xs muted">${esc(cstat(o, 'phone')?.st || '')}${cstat(o, 'phone')?.src ? ' · ' + esc(cstat(o, 'phone').src) : ''}</span>` : `<span class="muted">No usable phone on file.</span> <a class="btn sm" href="#/owner/${o.id}">Find the real owner ▸</a>`} ${o.email ? `<a class="btn ghost" href="mailto:${esc(o.email)}">Email</a>` : ''} ${o.contactName ? `<span>Contact: <b>${esc(o.contactName)}</b></span>` : ''}</div>
        ${fu ? `<div class="fu-note">Follow-up ${fu.due < today() ? 'overdue' : 'due'} ${d8(fu.due)}: ${esc(fu.note || '')}</div>` : ''}
        ${bsig ? `<div class="xs muted">Possible buyer too (inferred): ${esc(bsig.text)}</div>` : ''}
        <h3>Why call</h3><ul class="why">${(sc ? sc.reasons.slice(0, 5) : []).map(r => `<li>${kindTag(r.kind)} ${esc(r.text)}</li>`).join('')}${bs.length ? `<li><span class="kt k-match">match</span> Buyers for top property: ${bs.slice(0, 3).map(b => esc(b.r.name) + ' (' + b.score + ')').join(', ')}</li>` : ''}</ul>
        <h3>Properties (${props.length}) ${scoreHelpBtn()}</h3><div class="plist">${props.slice(0, 5).map(p => { const d = deal(p); return `<a href="#/property/${p.id}" class="prow"><span>${scorePill(scoreOf(p).score)}</span><span><b>${esc(nc(val(p, 'address') || p.pin))}</b>${lstatBadge(p)} ${favBtn(p.id)}<br><small>${esc(nc(val(p, 'city') || ''))} · ${sfAc(d)} · ${kmoney(d.value)}</small></span></a>`; }).join('')}</div>
        <div class="xs muted">Mailing: ${esc([o.mail?.addr, o.mail?.city, o.mail?.st, o.mail?.zip].filter(Boolean).join(', '))}</div>
        ${top ? linksHTML(propertyLinks(Object.fromEntries(['address', 'city', 'zip', 'county', 'pin', 'municipality', 'taxpayer'].map(k => [k, val(top, k)]).concat([['lat', top.lat], ['lon', top.lon]])), o).filter(l => ['Owner / entity', 'Owner + Illinois', 'County assessor', MARKET.sos.name, 'Street View'].includes(l[0]))) : ''}
        ${quickLogHTML('pql')}
        <div class="pc-nav"><button class="btn ghost" id="prev" ${i ? '' : 'disabled'}>◂ Previous</button><a class="btn ghost" href="#/owner/${oid}">Open owner</a><button class="btn" id="skip">Skip ▸</button></div>
        <div class="disc xs">${DISCLAIMER}</div>
      </div></div>`;
    wireBig(() => prospect(el));
    bindQuickLog(el, { ownerId: oid, propertyId: top && top.id }, () => { i++; draw(); });
    $('#skip').onclick = () => { i++; draw(); }; $('#prev').onclick = () => { if (i) { i--; draw(); } };
  };
  draw();
}

// ================= PROPERTIES =================
const PF = { county: '', q: '', type: '', minSf: '', minAc: '', minScore: '', buyer: false, fresh: false, noContact: false, dc: false, ios: false, favs: false, pt: [], ls: '' };
// all available list columns; the column chooser stores the visible set in settings
const PCOLS = (sc, mm) => [
  { k: 'pr', l: 'Priority', h: p => `<b class="rank">${priorityOf(p)}</b>`, v: p => priorityOf(p) },
  { k: 'om', l: 'Score', h: p => scorePill(sc.get(p.id).score), v: p => sc.get(p.id).score, def: 1 },
  { k: 'address', l: 'Address', h: p => `${favBtn(p.id)} <a href="#/property/${p.id}">${esc(nc(val(p, 'address') || p.pin))}</a>${lstatBadge(p)} ${bigTag(deal(p))}${mm.has(p.id) ? ' <span class="tag match">BUYER</span>' : ''}${S.chg.has(p.id) ? ' <span class="kt k-fresh">fresh</span>' : ''}<div class="sub">${esc(val(p, 'city') || val(p, 'municipality') || '')}${val(p, 'county') ? ' · ' + esc(val(p, 'county')) : ''}</div>`, v: p => val(p, 'address') || '', def: 1, fixed: 1 },
  { k: 'city', l: 'City', h: p => esc(val(p, 'city') || val(p, 'municipality') || ''), v: p => val(p, 'city') || '' },
  { k: 'co', l: 'County', h: p => esc(val(p, 'county')), v: p => val(p, 'county') },
  { k: 'sf', l: 'Bldg SF', cls: 'num', h: p => fmt(val(p, 'bldgSf')), v: p => +val(p, 'bldgSf') || null, def: 1 },
  { k: 'ac', l: 'Acres', cls: 'num', h: p => deal(p).acres ? deal(p).acres.toFixed(1) : '', v: p => deal(p).acres || null },
  { k: 'yb', l: 'Built', cls: 'num', h: p => esc(val(p, 'yearBuilt') || ''), v: p => +val(p, 'yearBuilt') || null },
  { k: 'ch', l: 'Clear ht', cls: 'num', h: p => esc(val(p, 'clearHeight') || ''), v: p => +val(p, 'clearHeight') || null },
  { k: 'cls', l: 'Class', h: p => esc(val(p, 'propClass') || ''), v: p => val(p, 'propClass') || '' },
  { k: 'sd', l: 'Last sale', h: p => esc(val(p, 'lastSaleDate') || (p.holdplus ? 'pre-1999' : '')), v: p => val(p, 'lastSaleDate') || (p.holdplus ? '1990' : null) },
  { k: 'sp', l: 'Sale price', cls: 'num', h: p => kmoney(val(p, 'lastSalePrice')), v: p => +val(p, 'lastSalePrice') || null },
  { k: 'v', l: 'Est. value', cls: 'num', h: p => kmoney(deal(p).value), v: p => deal(p).value || null, def: 1 },
  { k: 'c', l: 'Est. comm.', cls: 'num', h: p => `<span class="pos">${kmoney(deal(p).commission)}</span>`, v: p => deal(p).commission || null },
  { k: 'tax', l: 'Annual tax', cls: 'num', h: p => kmoney(val(p, 'annualTax')), v: p => +val(p, 'annualTax') || null },
  { k: 'o', l: 'Owner', h: p => p.ownerId ? `<a href="#/owner/${p.ownerId}">${esc(oName(p.ownerId))}</a>` : esc(val(p, 'taxpayer') || ''), v: p => oName(p.ownerId) || val(p, 'taxpayer') || '', def: 1 },
  { k: 'ms', l: 'Mail state', h: p => esc(val(p, 'mailState') || ''), v: p => val(p, 'mailState') || '' },
  { k: 'cf', l: 'Contact', h: p => p.ownerId ? contactBadge(S.owners.get(p.ownerId)) : '', v: p => contactFound(S.owners.get(p.ownerId)) ? 1 : 0 },
  { k: 'st', l: 'Stage', h: p => p.ownerId ? stageTag(S.owners.get(p.ownerId)?.stage) : '', v: p => S.owners.get(p.ownerId)?.stage || '' },
];
let OPENF = false;
export async function properties(el) {
  const big = bigOn(), sc = allScores(), mm = activeMatchMap();
  const view = setting('propView', 'split');
  const ALL = PCOLS(sc, mm), shownK = setting('propCols5', null) || ALL.filter(c => c.def).map(c => c.k);
  const chip = (id, on, label) => `<button class="fchip ${on ? 'on' : ''}" data-chip="${id}">${label}</button>`;
  const ptc = typeCounts(), ptChips = () => TYPE4.map(([k, l]) => `<button class="fchip ${PF.pt.includes(k) ? 'on' : ''}" data-pt="${k}" aria-pressed="${PF.pt.includes(k)}">${l}${ptc[k] != null ? ` <span class="xs muted">${fmt(ptc[k])}</span>` : k === 'office' ? ' <span class="xs muted">Cook</span>' : ''}</button>`).join('');
  const nAct = [PF.county, PF.type, PF.minScore, PF.buyer, PF.fresh, PF.noContact, PF.dc, PF.ios, PF.favs, PF.pt.length, PF.ls, PF.minSf, PF.minAc].filter(Boolean).length + (big ? 1 : 0);
  el.innerHTML = `<div class="page wide ${view === 'map' ? 'mapmode' : ''}"><div class="ph"><div><h1>Properties</h1><div class="muted" id="pcount"></div></div>
    <div class="ph-act"><button class="btn ${PF.favs ? 'primary' : ''}" data-chip="favs" aria-pressed="${PF.favs}">★ Favorites${favIds().length ? ' · ' + favIds().length : ''}</button><a class="btn" href="#/near">◎ Near me</a>${view !== 'map' ? '<button class="btn ghost colsb2" id="colsb">Columns</button>' : ''}<div class="seg" role="group" aria-label="View">${[['map', 'Map'], ['list', 'List'], ['split', 'Split']].map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-view="${k}">${l}</button>`).join('')}</div></div></div>
    <div class="pbar2"><input id="fq" placeholder="Search address, city, owner or PIN" value="${esc(PF.q)}">
      <details class="moref pfilt" ${OPENF ? 'open' : ''}><summary class="btn">Filters${nAct ? ` · ${nAct}` : ''}</summary>
        <div class="pf-panel"><div class="pf-row">${bigToggle()}</div>
          <div class="pf-lbl">County</div><div class="chips fchips">${chip('county:', !PF.county, 'All')}${Object.keys(MARKET.counties).map(c => chip('county:' + c, PF.county === c, c)).join('')}</div>
          <div class="pf-lbl">Show</div><div class="chips fchips">${chip('type:bldg', PF.type === 'bldg', 'Buildings')}${chip('type:land', PF.type === 'land', 'Land')}${chip('score', PF.minScore === '70', 'Score 70+')}${chip('buyer', PF.buyer, 'Buyer match')}${chip('fresh', PF.fresh, 'Fresh change')}${chip('noContact', PF.noContact, 'No verified contact')}${chip('dc', PF.dc, 'Data center site')}${chip('ios', PF.ios, 'Outdoor storage land')}</div>
          <div class="pf-lbl">Property type <span class="xs muted">(any selected)</span></div><div class="chips fchips">${ptChips()}</div>
          <div class="pf-lbl">Listing status <span class="xs muted">(set by you)</span></div><div class="chips fchips">${LSF.map(([k, l]) => `<button class="fchip ${PF.ls === k ? 'on' : ''}" data-ls="${k}" aria-pressed="${PF.ls === k}">${l}</button>`).join('')}</div>
          <div class="pf-lbl">Minimums</div><div class="mf-b"><input id="fsf" type="number" inputmode="numeric" placeholder="Min SF" value="${PF.minSf}"><input id="fac" type="number" inputmode="decimal" placeholder="Min acres" value="${PF.minAc}"><input id="fsc" type="number" inputmode="numeric" placeholder="Min score" value="${PF.minScore}"></div>
          <div class="pf-lbl">Tools</div><div class="btnrow"><button class="btn sm ghost" id="addp">+ Property</button><button class="btn sm ghost" id="exp">Export CSV</button></div></div></details></div>
    <div class="ptq" role="group" aria-label="Property type">${ptChips()}</div>
    ${scoreLegend('compact')}
    <div class="psplit v-${view}"><div class="plist" id="res"></div><div class="pmap"><div id="map" class="map"></div></div></div>
    <div class="disc xs">${DISCLAIMER}</div></div>`;
  const pfd = $('details.pfilt', el); if (pfd) pfd.addEventListener('toggle', () => { OPENF = pfd.open; });
  wireBig(() => properties(el));
  const rows = () => {
    const q = PF.q.toLowerCase(), dq = q.replace(/\D/g, ''), favSet = new Set(favIds()), OFF = PF.pt.includes('office') ? officeProps() : [];
    OFF.forEach(p => sc.has(p.id) || sc.set(p.id, scoreOf(p)));
    return (OFF.length ? S.props.concat(OFF) : S.props).filter(p => {
      const d = deal(p);
      if (big && !d.big) return false; if (PF.county && val(p, 'county') !== PF.county) return false;
      if (PF.type === 'land' && !p.vac) return false; if (PF.type === 'bldg' && p.vac) return false;
      if (PF.minSf && d.sf < +PF.minSf) return false; if (PF.minAc && d.acres < +PF.minAc) return false;
      if (PF.minScore && sc.get(p.id).score < +PF.minScore) return false; if (PF.buyer && !mm.has(p.id)) return false;
      if (PF.fresh && !S.chg.has(p.id)) return false; if (PF.noContact && contactFound(S.owners.get(p.ownerId))) return false; if (PF.dc && !dcOf(p)) return false; if (PF.favs && !favSet.has(p.id)) return false; if (PF.pt.length && !PF.pt.some(k => isType(p, k))) return false; if (PF.ios && !iosOf(p)) return false; if (PF.ls && !lstatMatch(p, PF.ls)) return false;
      if (q && !(((val(p, 'address') || '') + ' ' + (val(p, 'city') || '') + ' ' + (val(p, 'taxpayer') || '') + ' ' + oName(p.ownerId)).toLowerCase().includes(q) || (dq.length >= 6 && String(p.pin).replace(/\D/g, '').includes(dq)))) return false;
      return true;
    });
  };
  let mapObj = null, layer = null;
  const draw = () => {
    const r = rows(); $('#pcount').textContent = `${r.length.toLocaleString()} properties · best opportunities first`;
    if (view !== 'map') table($('#res'), r, ALL.filter(c => c.fixed || shownK.includes(c.k)), { sort: 'pr', sortCol: ALL.find(c => c.k === 'pr'), page: view === 'split' ? 100 : 200, href: p => `#/property/${p.id}`, ascKeys: ['address', 'city', 'co', 'o', 'st', 'cls', 'ms'] });
    if (view !== 'list') { if (!mapObj) mapObj = makeMap(); if (mapObj) { if (layer) layer.remove(); layer = plot(mapObj, r); setTimeout(() => mapObj.invalidateSize(), 50); } }
  };
  const deb = fn => { let t; return () => { clearTimeout(t); t = setTimeout(fn, 250); }; };
  const upd = () => { PF.q = $('#fq').value; PF.minSf = $('#fsf').value; PF.minAc = $('#fac').value; PF.minScore = $('#fsc').value; draw(); };
  $$('.filters input', el).forEach(i => i.addEventListener('input', deb(upd)));
  $$('[data-ls]', el).forEach(b => b.onclick = () => { PF.ls = b.dataset.ls; OPENF = true; properties(el); });
  $$('[data-pt]', el).forEach(b => b.onclick = async () => { const k = b.dataset.pt; PF.pt = PF.pt.includes(k) ? PF.pt.filter(x => x !== k) : [...PF.pt, k]; OPENF = !!b.closest('.pf-panel'); if (k === 'office' && PF.pt.includes(k) && !officeProps().length) { b.textContent = 'Loading office…'; await loadOffice(); } properties(el); });
  $$('[data-chip]', el).forEach(b => b.onclick = () => { const [k, v] = b.dataset.chip.split(':'); if (k === 'county') PF.county = v; else if (k === 'type') PF.type = PF.type === v ? '' : v; else if (k === 'score') PF.minScore = PF.minScore === '70' ? '' : '70'; else PF[k] = !PF[k]; properties(el); });
  $$('[data-view]', el).forEach(b => b.onclick = async () => { await setSetting('propView', b.dataset.view); properties(el); });
  const cb = $('#colsb'); if (cb) cb.onclick = () => modal(`<h2>Columns</h2><div class="checklist">${ALL.filter(c => !c.fixed).map(c => `<label><input type="checkbox" data-col="${c.k}" ${shownK.includes(c.k) ? 'checked' : ''}> ${c.l}</label>`).join('')}</div><div class="mfoot"><button class="btn ghost" id="cdef">Defaults</button><button class="btn primary" id="capp">Apply</button></div>`, (m, close) => {
    $('#capp', m).onclick = async () => { await setSetting('propCols5', $$('[data-col]:checked', m).map(c => c.dataset.col)); close(); properties(el); };
    $('#cdef', m).onclick = async () => { await setSetting('propCols5', null); close(); properties(el); }; });
  $('#exp').onclick = () => download(`properties-${today()}.csv`, toCSV(rows().map(p => propRow(p))));
  $('#addp').onclick = async () => { const p = { id: uid('p'), src: 'broker', srcName: 'Entered by broker', ed: { address: 'New property', county: 'Cook' }, cf: {}, created: Date.now() }; await save('properties', p); location.hash = `#/property/${p.id}`; };
  draw();
}
function makeMap() {
  if (!window.L) { $('#map').innerHTML = '<div class="muted pad">Map library not loaded (offline?).</div>'; return null; }
  const m = L.map('map', { preferCanvas: true }).setView(MARKET.center, MARKET.zoom);
  window.__omiMap = m;   // diagnostics/tests
  const lg = L.control({ position: 'bottomleft' }); lg.onAdd = () => { const d = L.DomUtil.create('div', 'maplegend'); d.innerHTML = SCORE_BANDS.map(b => `<span><i style="background:${b.color}"></i>${b.range === 'under 30' ? '<30' : b.range}</span>`).join('') + scoreHelpBtn(); L.DomEvent.disableClickPropagation(d); return d; }; lg.addTo(m);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
  const fl = floodLayer(); if (fl) L.control.layers(null, { 'FEMA flood zones (zoom in)': fl }, { position: 'topright', collapsed: true }).addTo(m);
  return m;
}
function plot(m, rows) {
  const pts = rows.filter(p => p.lat).map(p => ({ p, pr: priorityOf(p), om: scoreOf(p).score })).sort((a, b) => a.om - b.om || a.pr - b.pr).slice(-6000);   // dots colored by off-market score (same scale as badges); hottest drawn on top
  const g = L.layerGroup(), rend = L.canvas();
  pts.forEach(({ p, pr, om }) => L.circleMarker([p.lat, p.lon], { renderer: rend, radius: deal(p).big ? 6 : 4, weight: 1, color: '#0b1220', fillColor: scoreColor(om), fillOpacity: .9 }).bindPopup(`<b>${esc(nc(val(p, 'address') || p.pin))}</b><br>${esc(nc(val(p, 'city') || ''))} · ${sfAc(deal(p))}<br>Est. ${kmoney(deal(p).value)} · comm. ${kmoney(deal(p).commission)}<br>Priority ${pr} · Off-mkt ${scoreOf(p).score}<br><a href="#/property/${p.id}">Open property ▸</a> ${favBtn(p.id)}`).addTo(g));
  return g.addTo(m);
}
export function propRow(p) {
  const r = { id: p.id, source: p.srcName || p.src, off_market_score: scoreOf(p).score, deal_priority: priorityOf(p), est_value: Math.round(deal(p).value || 0) || '', est_value_basis: deal(p).kind, est_commission: Math.round(deal(p).commission || 0) || '', owner_group: oName(p.ownerId) };
  FIELDS.forEach(g => g[1].forEach(f => { const v = val(p, f.k); if (v != null && v !== '') { r[f.k] = v; r[f.k + '_confidence'] = CONF[conf(p, f.k)].label; } }));
  r.score_reasons = scoreOf(p).reasons.map(x => x.text).join('; ');
  return r;
}
let PTAB = 'summary';
const TABS = [['summary', 'Summary'], ['building', 'Building'], ['owner', 'Owner & Contacts'], ['history', 'Sales / History'], ['tenants', 'Tenants'], ['intel', 'News & area'], ['research', 'Research'], ['activity', 'Activity']];
const TABF = {
  building: ['propType', 'propClass', 'bldgSf', 'officeSf', 'landSf', 'clearHeight', 'docks', 'driveIns', 'yearBuilt', 'construction', 'sprinklers', 'power', 'rail', 'trailerParking', 'carParking', 'condition', 'description', 'address', 'city', 'municipality', 'county', 'zip', 'pin', 'submarket', 'corridor', 'zoning'],
  owner: ['taxpayer', 'ownerSource', 'mailAddress', 'mailCity', 'mailState', 'mailZip'],
  history: ['lastSaleDate', 'lastSalePrice', 'lastBuyer', 'lastSeller', 'deedType', 'saleSource', 'saleAdvertised', 'saleLeaseback', 'distressSale', 'marketValue', 'assessedTotal', 'assessedBldg', 'assessedLand', 'assessedYear', 'annualTax', 'taxDelinquent'],
  tenants: ['occupancy', 'tenantName', 'marketStatus', 'askingPrice', 'askingRent', 'notes'],
  signals: ['taxDelinqFile', 'sbaLoan', 'sbaMaturity', 'warnNotice', 'carriers'],
};
export async function property(el, id) {
  if (!S.prop.has(id) && /^OF/.test(id)) await loadOffice();
  const p = S.prop.get(id); if (!p) { el.innerHTML = '<div class="page">Property not found.</div>'; return; }
  const sc = scoreOf(p), d = deal(p), o = p.ownerId && S.owners.get(p.ownerId), bs = buyersForProp(p), fr = S.chg.get(p.id) || [];
  const R = p.research || {};
  const CHECK = [['assessor', 'Assessor record reviewed'], ['recorder', 'Deed / recorder checked (true owner)'], ['sos', 'LLC looked up with IL Secretary of State'], ['phone', 'Owner phone / email found'], ['street', 'Street View / aerial reviewed'], ['zoning', 'Zoning checked'], ['market', '"For sale" / "for lease" search done'], ['news', 'News & permits checked'], ['tenant', 'Tenant identified']];
  const fieldRow = f => { const v = val(p, f.k), c = conf(p, f.k); const shown = f.t === 'num' && v !== '' && v != null ? (/(Price|Value|assessed|Tax|Rent)/i.test(f.l) ? money(v) : fmt(v)) : v; return `<div class="fr"><label>${f.l}</label><div class="fv">${shown != null && shown !== '' ? esc(shown) : '<span class="muted">–</span>'} ${shown != null && shown !== '' ? badge(c) : ''}</div></div>`; };
  const fields = keys => `<div class="fgroup">${keys.map(k => FBY[k]).filter(Boolean).map(fieldRow).join('')}</div>`;
  const plain = Object.fromEntries(FIELDS.flatMap(g => g[1]).map(f => [f.k, val(p, f.k)]).concat([['lat', p.lat], ['lon', p.lon]]));
  const links = propertyLinks(plain, o), lk = n => links.find(l => l[0] === n)?.[1];
  const ns = nearbySales(p), nmed = d.sf ? median(ns.filter(c => c.psf).map(c => c.psf)) : 0, nl = nearbyLease(p);
  const fact = (l, v) => `<div class="hf"><span>${l}</span><b>${v || '–'}</b></div>`;
  const ownerCard = o ? `<div><b>${esc(nc(o.name))}</b> ${o.inferred ? '<span class="conf c-inf" title="Grouped automatically by taxpayer name / mailing address">Inferred group</span>' : ''} ${stageTag(o.stage)} ${contactBadge(o)}</div>
      <div class="cbtns">${callablePhone(o) ? `<a class="btn primary" href="tel:${esc(o.phone)}">📞 ${esc(o.phone)}</a>` : ''}${o.email ? `<a class="btn" href="mailto:${esc(o.email)}">✉ Email</a>` : ''}${o.linkedin ? `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(o.linkedin)}">LinkedIn</a>` : ''}<a class="btn ghost" href="#/owner/${o.id}">Find the real owner ▸</a></div>
      <div class="xs muted">${ownerProps(o.id).length} parcels in group${o.contactName ? ' · decision maker: ' + esc(o.contactName) + ' (' + esc(cstat(o, 'contactName')?.st || 'Unverified') + ')' : ''}</div>`
    : `<div class="muted">No owner linked.</div><button class="btn sm" id="mkowner">Create owner from tax-bill name</button>`;
  const panes = {
    summary: `<div class="cols"><section class="card"><div class="ch"><h2>Why this score</h2><a class="sm" href="#/tools/settings">Adjust weights</a></div>
        ${scoreLegend('compact')}
        <div class="muted xs">Public-record signals: ${sc.pub}/100 · broker / fresh bonuses: +${sc.bonus}</div>
        <ul class="why">${sc.reasons.map(r => `<li>${kindTag(r.kind)} ${esc(r.text)} <span class="muted xs">${r.pts < 0 ? '−' : '+'}${Math.abs(Math.round(r.pts))}</span></li>`).join('') || '<li class="muted">No signals.</li>'}</ul></section>
      <section class="card"><div class="ch"><h2>Buyers for this property</h2><a class="sm" href="#/requirements/new">+ Buyer</a></div>
        ${bs.length ? `<ul class="why">${bs.map(b => `<li>${scorePill(b.score)} <a href="#/requirement/${b.r.id}">${esc(b.r.name)}</a> <span class="muted xs">${esc(b.r.dealType || '')} · ${esc(b.reasons.slice(0, 3).join(' · '))}</span></li>`).join('')}</ul>` : '<div class="muted">No active buyer or requirement matches this property.</div>'}</section></div>
      <div class="cols"><section class="card"><div class="ch"><h2>Owner</h2></div>${ownerCard}${o ? quickLogHTML('pql') : ''}</section>
      <section class="card"><div class="ch"><h2>Fresh changes</h2></div>${fr.length ? `<ul class="why">${fr.map(e => `<li>${kindTag('fresh')} ${esc(freshText(e))}</li>`).join('')}</ul>` : '<div class="muted">No changes detected by the scheduled refresh.</div>'}</section></div>`,
    building: `<section class="card"><div class="ch"><h2>Building & site</h2><button class="btn sm" data-editf>Edit</button></div>${fields(TABF.building)}</section>${cvalHTML(p)}`,
    owner: `<section class="card"><div class="ch"><h2>Owner & contacts</h2>${o ? `<a class="sm" href="#/owner/${o.id}">Open owner page</a>` : ''}</div>${ownerCard}</section>
      ${phonesHTML(p)}
      ${trueOwnerHTML({ names: [val(p, 'taxpayer'), o && o.name], st: String(val(p, 'mailState') || '').toUpperCase(), p, o })}
      <section class="card"><div class="ch"><h2>Tax-bill record</h2><span class="muted xs">${TAXNOTE}</span></div>${fields(TABF.owner)}</section>`,
    history: `<section class="card"><div class="ch"><h2>Sales, value & tax</h2><button class="btn sm" data-editf>Edit</button></div>${fields(TABF.history)}</section>
      <section class="card"><div class="ch"><h2>Loans, tax & permits (public records)</h2><span class="muted xs">Each line names its source and date. SBA maturity is an estimate.</span></div>${fields(TABF.signals.slice(0, 3))}${jumpHTML(p)}${appealHTML(p)}${siteHTML(p)}
        ${p.perm && p.perm.length ? `<div class="tbl-wrap"><table class="grid"><thead><tr><th>Issued</th><th>Permit</th><th class="num">Amount</th><th>Work</th><th>Applicant</th></tr></thead><tbody>${p.perm.map(x => `<tr><td>${esc(x.d)}</td><td>${esc(x.job || '')}</td><td class="num">${money(x.amt)}</td><td class="xs">${esc(x.desc || '')}</td><td class="xs">${esc(x.app || '')}</td></tr>`).join('')}</tbody></table></div><div class="xs muted">Source: Cook County Assessor building permits (non-residential, $50k+, last 3 yrs). The applicant is often a contractor or tenant: a lead to who occupies the building.</div>` : `<div class="xs muted">${p.co === 'Cook' ? 'No non-residential permits of $50k+ in the last 3 yrs (Cook Assessor permits).' : 'Permit data is only loaded for Cook. Use the Permits research link.'}</div>`}</section>
      ${p.co === 'Cook' ? `<section class="card"><div class="ch"><h2>City of Chicago permits</h2><span class="muted xs">Building, renovation, new construction and demolition</span></div>${cpermHTML(p) || '<div class="xs muted">No City of Chicago permits ($50k+ or demolition) matched to this PIN in the last 3 yrs. Suburban parcels are not covered by this city dataset.</div>'}</section>` : ''}
      <section class="card"><div class="ch"><h2>Nearby recent sales</h2><span class="muted xs">Similar ${d.sf ? 'size buildings (¼×–4× SF)' : 'land'} sold within ${ns.length ? Math.ceil(Math.max(...ns.map(c => c.mi))) : '–'} mi in the last ${setting('compYears', 7)} yrs, nearest first. Excludes quit-claim and partial multi-parcel sales.</span></div>
        ${ns.length ? `<div class="tbl-wrap"><table class="grid"><thead><tr><th>Date</th><th>Address</th><th class="num">Price</th><th class="num">Bldg SF</th><th class="num">$/SF</th><th class="num">Mi</th><th>Source</th></tr></thead><tbody>${ns.map(c => `<tr><td>${esc(c.d)}</td><td>${c.pid ? `<a href="#/property/${c.pid}">${esc(c.addr)}</a>` : esc(c.addr)}<div class="xs muted">${esc(c.city)}</div></td><td class="num">${money(c.price)}</td><td class="num">${fmt(c.sf) || (c.lsf ? (c.lsf / 43560).toFixed(1) + ' ac' : '')}</td><td class="num">${c.psf ? '$' + c.psf.toFixed(0) : c.plsf ? '$' + c.plsf.toFixed(2) + ' land' : '–'}</td><td class="num">${c.mi.toFixed(1)}</td><td>${c.src === 'public' ? SRC_PUB : SRC_YOU}</td></tr>`).join('')}</tbody></table></div>` : `<div class="muted">No comparable recorded sales nearby${['DuPage', 'McHenry'].includes(p.co) ? `. ${esc(p.co)} doesn't publish sale prices in its free data, so add the comps you know` : ''}.</div>`}
        <div class="mfoot"><a class="sm" href="#/comps">All comps & territory stats</a><button class="btn sm" id="addsc">+ Sale comp</button></div></section>
      <section class="card"><div class="ch"><h2>Nearby lease comps ${SRC_YOU}</h2><button class="btn sm" id="addlc">+ Lease comp</button></div>${nl.length ? `<ul class="why">${nl.map(c => `<li>${esc(c.date || '')} · ${esc(c.address || '')} · ${esc(c.tenant || '')} · ${fmt(c.sf)} SF · ${c.rate ? '$' + (+c.rate).toFixed(2) + '/SF ' + esc(c.rateType || '') : ''} <span class="xs muted">${c.mi < 99 ? c.mi.toFixed(1) + ' mi' : ''}</span></li>`).join('')}</ul>` : '<div class="muted">No lease comps nearby yet.</div>'}</section>
      <section class="card"><div class="ch"><h2>Public-record changes</h2><span class="muted xs">Detected by comparing scheduled refreshes (last ${esc(S.changes.updated || '–')} CT)</span></div>${fr.length ? `<ul class="why">${fr.map(e => `<li>${esc(freshText(e))}</li>`).join('')}</ul>` : '<div class="muted">None detected yet.</div>'}</section>`,
    tenants: `<section class="card"><div class="ch"><h2>Occupancy & market</h2><button class="btn sm" data-editf>Edit</button></div>${fields(TABF.tenants)}</section>
      <section class="card"><div class="ch"><h2>Tenant clues from public records</h2><span class="muted xs">Matched by street address. Possible occupants, not confirmed tenants.</span></div>${fields(TABF.signals.slice(3))}</section>
      <section class="card"><div class="ch"><h2>Leases</h2><a class="sm" href="#/leases/new/${p.id}">+ Lease</a></div>${propLeases(p.id).map(l => { const li = leaseInfo(l); return `<div class="lrow"><b>${esc(l.tenantName || S.companies.get(l.companyId)?.name || 'Tenant')}</b> · expires ${esc(l.expiration || '?')} ${badge(l.conf || (l.expType === 'known' ? 'confirmed' : 'estimated'))} · outreach ${esc(li.outreach || '–')} · <span class="urg u-${li.urgency.replace(/\W/g, '').toLowerCase()}">${li.urgency}</span></div>`; }).join('') || '<div class="muted">No leases recorded. Tenant names are not in public records; add what you learn.</div>'}</section>`,
    research: `<section class="card"><div class="ch"><h2>Is it listed? Check manually</h2><span class="muted xs">Opens Google searches limited to each site. Nothing is scraped. Record what you find.</span></div>${linksHTML(listingLinks(p))}${lstatControl(p)}
      <div class="cbtns"><button class="btn sm" id="notlisted">Not listed (checked today)</button><button class="btn sm" id="lstat2">Mark as listed / add listing</button><button class="btn sm ghost" id="pfly2">Paste flyer</button></div><div class="xs muted">Market status: <b>${esc(val(p, 'marketStatus') || 'not checked')}</b>${p.listingChecked ? ' · last checked ' + esc(p.listingChecked) : ''}</div></section>
      <section class="card"><div class="ch"><h2>Research links</h2><label class="toggle"><input type="checkbox" id="needr" ${p.needsResearch ? 'checked' : ''}> In research queue</label></div>${linksHTML(links)}
      <div class="checklist">${CHECK.map(([k, l]) => `<label><input type="checkbox" data-ck="${k}" ${R[k] ? 'checked' : ''}> ${l}${R[k] ? ` <span class="xs muted">${d8(R[k])}</span>` : ''}</label>`).join('')}</div></section>`,
    intel: '<div id="intelp" class="muted">Loading…</div>',
    activity: `<section class="card"><div class="ch"><h2>Log a call / note</h2></div>${o ? quickLogHTML('aql') : '<div class="muted">Link an owner to log calls.</div>'}</section><section class="card"><div class="ch"><h2>Activity</h2></div>${activityHTML(activitiesFor('propertyId', p.id))}</section>`,
  };
  const why1 = shortWhy(sc.reasons), OPEN = JSON.parse(localStorage.getItem('omi_psec') || '{}');
  const sizeTxt = d.sf ? fmt(d.sf) + ' SF' + (d.acres >= .1 ? ` <small>${d.acres.toFixed(1)} ac</small>` : '') : d.acres ? d.acres.toFixed(1) + ' ac' : '–';
  const numbers = `<div class="hfacts">${fact('Building', d.sf ? fmt(d.sf) + ' SF' : '')}${fact('Land', d.acres ? d.acres.toFixed(2) + ' ac' : '')}${fact('Year built', esc(val(p, 'yearBuilt') || ''))}${fact('Clear height', esc(val(p, 'clearHeight') || ''))}${fact('Est. value', `${kmoney(d.value) || '–'} <span class="xs muted">${esc(d.kind || '')}</span>`)}${fact('Est. commission', kmoney(d.commission) || '')}${fact('Deal priority', priorityOf(p))}${fact('Comp $/SF (nearby median)', ns.length && nmed ? `$${nmed.toFixed(0)} <span class="xs muted">${ns.length} sales · ≈${kmoney(nmed * d.sf)}</span>` : '')}${fact('Market status', esc(val(p, 'marketStatus') || 'Not checked') + (p.listingChecked ? ` <span class="xs muted">checked ${esc(p.listingChecked)}</span>` : ''))}${fact('PIN', esc(p.pin || ''))}${fact('Data source', esc(p.srcName || 'broker'))}</div>`;
  const whyHTML = `<div class="muted xs">Public-record signals ${sc.pub}/100 · broker / fresh bonuses +${sc.bonus} · <a href="#/tools/settings">Adjust weights</a></div>${scoreLegend('compact')}
        <ul class="why">${sc.reasons.map(r => `<li>${kindTag(r.kind)} ${esc(r.text)} <span class="muted xs">${r.pts < 0 ? '−' : '+'}${Math.abs(Math.round(r.pts))}</span></li>`).join('') || '<li class="muted">No signals.</li>'}</ul>`;
  const buyersHTML = bs.length ? `<ul class="why">${bs.map(b => `<li>${scorePill(b.score)} <a href="#/requirement/${b.r.id}">${esc(b.r.name)}</a> <span class="muted xs">${esc(b.r.dealType || '')} · ${esc(b.reasons.slice(0, 3).join(' · '))}</span></li>`).join('')}</ul>` : '<div class="muted">No active buyer or requirement matches this property. <a href="#/requirements/new">Add a buyer</a></div>';
  const SECS = [
    ['why', 'Why this score', `${sc.reasons.filter(r => r.pts > 0).length} signals`, whyHTML],
    ['numbers', 'Key numbers', '', numbers],
    ['owner', 'Owner & contacts', o ? nc(o.name) : 'No owner linked', panes.owner],
    ['building', 'Building & site', '', panes.building],
    ['history', 'Sales, value & tax', val(p, 'lastSaleDate') ? 'last sale ' + esc(val(p, 'lastSaleDate')) : '', panes.history + `<section class="card"><div class="ch"><h2>Fresh changes</h2></div>${fr.length ? `<ul class="why">${fr.map(e => `<li>${kindTag('fresh')} ${esc(freshText(e))}</li>`).join('')}</ul>` : '<div class="muted">No changes detected by the scheduled refresh.</div>'}</section>`],
    ['tenants', 'Tenants & leases', '', panes.tenants],
    ['buyers', 'Matching buyers', bs.length ? bs.length + ' match' + (bs.length > 1 ? 'es' : '') : '', buyersHTML],
    ['likely', 'Likely buyers for this building', (() => { const n = likelyBuyers(p, 5).length; return n ? n + ' active buyer' + (n > 1 ? 's' : '') : ''; })(), likelyBuyersHTML(p)],
    ['intel', 'News & area', '', panes.intel],
    ['research', 'Research & listing check', '', panes.research],
    ['activity', 'Activity & notes', '', panes.activity],
  ];
  // CoStar-style header + 4 stat tiles + tabs. Every former section is still here, grouped under a tab (nothing removed).
  const PT = [['summary', 'Summary', ['numbers', 'building', 'tenants']], ['owner', 'Owner & Contacts', ['owner']], ['history', 'History / Sales', ['history']], ['signals', 'Signals', ['why', 'buyers', 'research']], ['nearby', 'Nearby', ['likely', 'intel']], ['notes', 'Notes', ['activity']]];
  let ptab = localStorage.getItem('omi_ptab') || 'summary'; if (!PT.some(t => t[0] === ptab)) ptab = 'summary';
  const tabOf = k => (PT.find(t => t[2].includes(k)) || PT[0])[0];
  const sub = [nc(val(p, 'city') || ''), val(p, 'submarket') || '', (val(p, 'county') || '') + ' County'].filter(Boolean).map(esc).join(' · ');
  el.innerHTML = `<div class="page wide prop2 prop5">
    <div class="crumb"><a href="#/properties">Properties</a> / ${esc(val(p, 'county') || '')}</div>
    <div class="phead5"><div class="ph5-l"><h1>${esc(nc(val(p, 'address') || p.pin || 'Property'))} ${favBtn(p.id, 'lg')}</h1><div class="ph5-sub">${sub}</div>
        <div class="ph-act"><button class="btn primary" data-call="${p.id}">Call owner</button><details class="actmore"><summary class="btn">More</summary><div class="actmenu"><select id="prio">${['', 'A', 'B', 'C'].map(x => `<option value="${x}" ${x === (p.priority || '') ? 'selected' : ''}>${x ? 'Priority ' + x : 'No priority'}</option>`).join('')}</select><button class="btn ghost" id="onep">One-pager (print / PDF)</button><button class="btn ghost" id="edit">Edit fields</button><button class="btn ghost" id="lstat">Listing status</button><button class="btn ghost" id="pfly">Paste flyer</button><button class="btn ghost" id="cmpb">${cmpIds().includes(p.id) ? 'Remove from compare' : 'Add to compare'}</button><button class="btn ghost" id="lstb">Save to list…</button><a class="btn ghost" href="#/compare">Open compare (${cmpIds().length})</a>${[['Street View', lk('Street View')], ['Google Maps', lk('Google Maps')], ['Aerial view', p.lat ? `https://www.google.com/maps/@${p.lat},${p.lon},300m/data=!3m1!1e3` : null]].filter(x => x[1]).map(([l, u]) => `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(u)}">${l} ↗</a>`).join('')}</div></details></div></div>
      <div class="pmap ph5-map"><div id="minimap"></div></div></div>
    <div class="tiles4"><div><span>Building SF</span><b>${sizeTxt}</b></div><div><span>Est. value</span><b>${kmoney(d.value) || '–'}</b></div><div><span>Owner</span><b>${o ? `<a href="#/owner/${o.id}">${esc(nc(o.name))}</a>` : esc(nc(val(p, 'taxpayer') || '–'))}</b></div>
      <div class="scoreline"><span>Score</span><b>${scorePill(sc.score)}${scoreHelpBtn()}</b><small>${esc(why1 || 'Few public-record signals')}</small></div></div>
    <div class="ptabs" role="tablist">${PT.map(([k, l, secs]) => `<button role="tab" class="${k === ptab ? 'on' : ''}" data-ptab="${k}" data-secs="${secs.join(' ')}">${l}</button>`).join('')}</div>
    <div class="psecs">${SECS.map(([k, l, hint, body]) => { const t = tabOf(k), solo = PT.find(x => x[0] === t)[2].length === 1; return `<details class="psec ${solo ? 'solo' : ''}" data-sec="${k}" data-in="${t}" open ${t === ptab ? '' : 'hidden'}><summary data-tab="${k}"><span class="ps-t">${l}</span><span class="ps-h">${hint}</span></summary><div class="psec-b">${body}</div></details>`; }).join('')}</div>
    <div class="disc xs">${DISCLAIMER}</div></div>`;
  const showTab = t => { ptab = t; localStorage.setItem('omi_ptab', t); $$('.ptabs [data-ptab]', el).forEach(b => b.classList.toggle('on', b.dataset.ptab === t)); $$('details.psec', el).forEach(dd => { dd.hidden = dd.dataset.in !== t; dd.open = true; }); if (t === 'nearby') { const ip = $('#intelp'); if (ip && !ip.dataset.f) { ip.dataset.f = 1; intelPane(ip, p); } } };
  $$('.ptabs [data-ptab]', el).forEach(b => b.onclick = () => showTab(b.dataset.ptab));
  // inside a tab, sections stay open (their titles are just headings)
  $$('details.psec > summary', el).forEach(sm => sm.addEventListener('click', e => e.preventDefault()));
  if (ptab === 'nearby') showTab('nearby');
  if (window.L && p.lat) { const m = L.map('minimap', { zoomControl: false, attributionControl: false, dragging: !matchMedia('(pointer: coarse)').matches, scrollWheelZoom: false }).setView([p.lat, p.lon], 16); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m); L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#e5484d', fillOpacity: 1 }).addTo(m); }
  $('#onep').onclick = () => import('./sheets.js').then(M => M.printOnePager(p));
  $('#cmpb').onclick = () => { const on = cmpToggle(p.id); $('#cmpb').textContent = on ? 'Remove from compare' : 'Add to compare'; };
  $('#lstb').onclick = () => addToListModal(p.id);
  $('#prio').onchange = async e => { p.priority = e.target.value; await save('properties', p); toast('Saved'); };
  const nr = $('#needr'); if (nr) nr.onchange = async e => { p.needsResearch = e.target.checked; await save('properties', p); };
  $$('[data-ck]', el).forEach(c => c.onchange = async () => { p.research = p.research || {}; if (c.checked) p.research[c.dataset.ck] = today(); else delete p.research[c.dataset.ck]; await save('properties', p); });
  if (o) bindQuickLog(el, { ownerId: o.id, propertyId: p.id }, () => property(el, id));
  bindTrueOwner(el, () => property(el, id));
  const mk = $('#mkowner'); if (mk) mk.onclick = async () => { const n = val(p, 'taxpayer') || 'Unknown owner'; const no = { id: uid('o'), name: n, inferred: false, entities: [n], mail: { addr: val(p, 'mailAddress'), city: val(p, 'mailCity'), st: val(p, 'mailState'), zip: val(p, 'mailZip') } }; await save('owners', no); p.ownerId = no.id; p.ownerLocked = true; await save('properties', p); property(el, id); };
  $('#edit').onclick = () => editFields(p, () => property(el, id));
  const rer = () => property(el, id), lst = () => compForm('listing', { propertyId: p.id, address: val(p, 'address'), city: val(p, 'city'), status: 'Listed for sale', sf: val(p, 'bldgSf') || '' }, rer);
  $('#lstat').onclick = lst; const l2 = $('#lstat2'); if (l2) l2.onclick = lst;
  $('#pfly').onclick = () => flyerModal(p, rer); const f2 = $('#pfly2'); if (f2) f2.onclick = () => flyerModal(p, rer);
  const nl2 = $('#notlisted'); if (nl2) nl2.onclick = async () => { p.ed = p.ed || {}; p.cf = p.cf || {}; p.ed.marketStatus = 'Off-market'; p.cf.marketStatus = 'broker'; p.listingChecked = today(); await save('properties', p); toast('Marked not listed (checked today)'); rer(); };
  const asc = $('#addsc'); if (asc) asc.onclick = () => compForm('sale', {}, rer); const alc = $('#addlc'); if (alc) alc.onclick = () => compForm('lease', {}, rer);
  $$('[data-editf]', el).forEach(b => b.onclick = () => editFields(p, () => property(el, id)));
}
function editFields(p, done) {
  modal(`<div class="ch"><h2>Edit property</h2><button class="x" data-close>✕</button></div><div class="muted xs">Leave a field blank to fall back to the public record. Pick how sure you are for each value you enter.</div>
    <form id="ef" class="fgrid">${FIELDS.map(([g, fs]) => `<div class="fgroup"><h3>${g}</h3>${fs.map(f => { const ev = p.ed && p.ed[f.k] != null ? p.ed[f.k] : ''; const pub = f.s && p[f.s] != null ? p[f.s] : ''; const input = f.o ? `<select name="${f.k}"><option value=""></option>${OPT[f.o].map(x => `<option ${x === ev ? 'selected' : ''}>${x}</option>`).join('')}</select>` : f.t === 'area' ? `<textarea name="${f.k}" rows="3">${esc(ev)}</textarea>` : `<input name="${f.k}" type="${f.t === 'num' ? 'number' : f.t === 'date' ? 'date' : 'text'}" step="any" value="${esc(ev)}" placeholder="${esc(pub)}">`; return `<div class="fr edit"><label>${f.l}${pub !== '' ? ` <span class="xs muted">(public: ${esc(String(pub).slice(0, 30))})</span>` : ''}</label><div class="fv">${input}${f.t === 'area' ? '' : confSelect('cf_' + f.k, (p.cf && p.cf[f.k]) || 'broker')}</div></div>`; }).join('')}</div>`).join('')}</form>
    <div class="mfoot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="sv">Save</button></div>`, (m, close) => {
    $('#sv', m).onclick = async () => {
      const fd = new FormData($('#ef', m)); p.ed = p.ed || {}; p.cf = p.cf || {};
      FIELDS.forEach(g => g[1].forEach(f => { let v = fd.get(f.k); if (v === null) return; v = String(v).trim(); if (v === '') { delete p.ed[f.k]; delete p.cf[f.k]; } else { p.ed[f.k] = f.t === 'num' ? +v : v; p.cf[f.k] = fd.get('cf_' + f.k) || 'broker'; } }));
      await save('properties', p); close(); toast('Property saved'); done();
    };
  });
}

// ================= OWNERS =================
const OF = { q: '', stage: '', buyers: false, minParcels: '' };
export async function owners(el) {
  const big = bigOn(), nf = [OF.stage, OF.minParcels, OF.buyers].filter(Boolean).length + (big ? 1 : 0);
  el.innerHTML = `<div class="page"><div class="ph"><div><h1>Owners</h1><div class="muted" title="One owner can hold many LLCs and parcels. Groups built from public records are labeled Inferred until you confirm them.">Owner groups from public records, biggest first</div></div><div class="ph-act"><button class="btn ghost colsb2" id="ocols">Columns</button><button class="btn" id="addo">+ Owner</button></div></div>
    <div class="pbar2 filters"><input id="oq" placeholder="Search owner, LLC or contact" value="${esc(OF.q)}">
      <details class="moref pfilt"><summary class="btn">Filters${nf ? ` · ${nf}` : ''}</summary><div class="pf-panel"><div class="pf-row">${bigToggle()}</div>
        <div class="pf-lbl">Stage</div><select id="ost"><option value="">Any stage</option>${STAGES.map(s => `<option ${OF.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <div class="pf-lbl">Minimum parcels</div><input id="omp" type="number" placeholder="Min parcels" value="${OF.minParcels}">
        <label class="toggle"><input type="checkbox" id="obu" ${OF.buyers ? 'checked' : ''}> Possible buyers (2+ parcels)</label>
        <div class="pf-lbl">Tools</div><div class="btnrow"><button class="btn sm ghost" id="exp">Export CSV</button></div></div></details></div>
    <div id="res"></div></div>`;
  wireBig(() => owners(el));
  const sc = allScores();
  const rows = () => { const q = OF.q.toLowerCase(); return [...S.owners.values()].filter(o => { const n = ownerProps(o.id).length; if (OF.minParcels && n < +OF.minParcels) return false; if (OF.buyers && (n < 2 || o.inst)) return false; if (OF.stage && (o.stage || 'New') !== OF.stage) return false; if (q && !((o.name + ' ' + (o.entities || []).join(' ') + ' ' + (o.contactName || '')).toLowerCase().includes(q))) return false; if (big && !ownerDeal(o.id).big) return false; return true; }); };
  const maxScore = o => Math.max(0, ...ownerProps(o.id).map(p => sc.get(p.id)?.score || 0));
  const draw = () => { const r = rows(); $('#res').innerHTML = `<div class="muted sm pad">${r.length.toLocaleString()} owners</div><div id="ot"></div>`;
    table($('#ot'), r, OCOLS().filter(c => c.k === 'n' || oShown().includes(c.k)), { sort: 'v', sortCol: OCOLS().find(c => c.k === 'v'), page: 150, href: o => `#/owner/${o.id}`, ascKeys: ['n', 'st', 'pr'] }); };
  const OCOLS = () => [
      { k: 'n', l: 'Owner', h: o => `<a href="#/owner/${o.id}">${esc(nc(o.name))}</a> ${o.inferred ? '<span class="conf c-inf">Inferred</span>' : ''}${(o.entities || []).length > 1 ? `<div class="xs muted">${o.entities.length} entities</div>` : ''}`, v: o => o.name },
      { k: 'p', l: 'Parcels', cls: 'num', h: o => ownerProps(o.id).length, v: o => ownerProps(o.id).length },
      { k: 'sf', l: 'Total SF', cls: 'num', h: o => fmt(ownerDeal(o.id).sf), v: o => ownerDeal(o.id).sf },
      { k: 'v', l: 'Est. value', cls: 'num', h: o => kmoney(ownerDeal(o.id).value), v: o => ownerDeal(o.id).value },
      { k: 'c', l: 'Est. comm.', cls: 'num', h: o => `<span class="pos">${kmoney(ownerDeal(o.id).commission)}</span>`, v: o => ownerDeal(o.id).commission },
      { k: 'ms', l: 'Score', h: o => scorePill(maxScore(o)), v: maxScore },
      { k: 'cf', l: 'Contact', h: o => contactBadge(o), v: o => contactFound(o) ? 2 : (o.phone || o.email) ? 1 : 0 },
      { k: 'b', l: 'Buyer?', h: o => { const b = buyerSignal(o); return b ? `<span class="tag ${b.active ? 'match' : ''}" title="${esc(b.text)}">${b.active ? 'Active buyer?' : 'Multi-parcel'}</span>` : ''; } },
      { k: 'st', l: 'Stage', h: o => stageTag(o.stage), v: o => o.stage || 'New' }, { k: 'pr', l: 'Pri', h: o => esc(o.priority || ''), v: o => o.priority || 'Z' },
      { k: 'lc', l: 'Last contact', h: o => esc(o.lastContact || ''), v: o => o.lastContact || '' },
      { k: 'ph', l: 'Phone', h: o => o.phone ? `<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : '' },
    ];
  const oShown = () => setting('ownerCols5', null) || ['p', 'v', 'ms', 'st'];
  $('#ocols').onclick = () => modal(`<h2>Columns</h2><div class="checklist">${OCOLS().filter(c => c.k !== 'n').map(c => `<label><input type="checkbox" data-col="${c.k}" ${oShown().includes(c.k) ? 'checked' : ''}> ${c.l}</label>`).join('')}</div><div class="mfoot"><button class="btn ghost" id="cdef">Default</button><button class="btn primary" id="capp">Apply</button></div>`, (m, close) => {
    $('#capp', m).onclick = async () => { await setSetting('ownerCols5', $$('[data-col]:checked', m).map(c => c.dataset.col)); close(); draw(); };
    $('#cdef', m).onclick = async () => { await setSetting('ownerCols5', null); close(); draw(); }; });
  let t; $$('.filters input, .filters select', el).forEach(i => i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { OF.q = $('#oq').value; OF.stage = $('#ost').value; OF.minParcels = $('#omp').value; OF.buyers = $('#obu').checked; draw(); }, 250); }));
  $('#exp').onclick = () => download(`owners-${today()}.csv`, toCSV(rows().map(ownerRow)));
  $('#addo').onclick = async () => { const o = { id: uid('o'), name: 'New owner', inferred: false, entities: [], mail: {}, stage: 'New' }; await save('owners', o); location.hash = `#/owner/${o.id}`; };
  draw();
}
export const ownerRow = o => { const d = ownerDeal(o.id); return { id: o.id, name: o.name, inferred_group: o.inferred ? 'yes' : 'no', entities: (o.entities || []).join(' | '), parcels: ownerProps(o.id).length, total_sf: Math.round(d.sf), est_value: Math.round(d.value), est_commission: Math.round(d.commission), stage: o.stage || 'New', priority: o.priority || '', contact: o.contactName || '', phone: o.phone || '', email: o.email || '', linkedin: o.linkedin || '', ...Object.fromEntries(['contactName', 'phone', 'email', 'linkedin'].flatMap(k => { const c = cstat(o, k) || {}; return [[k + '_status', c.st || ''], [k + '_source', c.src || ''], [k + '_checked', c.dt || '']]; })), contact_found: contactFound(o) ? 'yes' : 'no', names_found: o.foundNames || '', motivations: (o.motivations || []).join('|'), mailing: [o.mail?.addr, o.mail?.city, o.mail?.st, o.mail?.zip].filter(Boolean).join(', '), last_contact: o.lastContact || '', notes: o.notes || '' }; };

export async function owner(el, id) {
  const o = S.owners.get(id); if (!o) { el.innerHTML = '<div class="page">Owner not found.</div>'; return; }
  const props = ownerProps(id), od = ownerDeal(id), bsig = buyerSignal(o), fus = ownerFollowups(id);
  el.innerHTML = `<div class="page"><div class="ph"><div><div class="crumb"><a href="#/owners">Owners</a></div><h1>${esc(nc(o.name))}</h1><div>${o.inferred ? '<span class="conf c-inf" title="Grouped by matching taxpayer name and mailing address. Confirm or edit.">Inferred owner group</span>' : '<span class="conf c-ok">Owner record</span>'} ${bsig ? `<span class="tag ${bsig.active ? 'match' : ''}">Possible buyer (inferred): ${esc(bsig.text)}</span>` : ''}</div></div>
    <div class="ph-act"><a class="btn primary" href="#/prospect/${id}">Prospect this owner ▸</a></div></div>
    <div class="kpis"><div class="kpi"><b>${props.length}</b><span>Parcels</span></div><div class="kpi"><b>${fmt(od.sf) || '–'}</b><span>Total bldg SF</span></div><div class="kpi"><b>${kmoney(od.value) || '–'}</b><span>Est. portfolio value</span></div><div class="kpi"><b class="pos">${kmoney(od.commission) || '–'}</b><span>Est. commission</span></div></div>
    <div class="cols">
      <section class="card"><div class="ch"><h2>Relationship</h2></div>
        <form id="of" class="fgrid2">
          <label>Owner name<input name="name" value="${esc(o.name)}"></label>
          <label>Stage${stageSelect(o.stage, 'name="stage"')}</label><label>Broker priority${prioSelect(o.priority, 'name="priority"')}</label>
          <div class="full"><h3>Contact ${contactBadge(o)}</h3>${contactFormHTML(o)}</div>
          <label class="full">Notes<textarea name="notes" rows="3">${esc(o.notes || '')}</textarea></label>
          <label class="full">Owner group confirmed? <select name="inferred"><option value="1" ${o.inferred ? 'selected' : ''}>Inferred (not yet confirmed)</option><option value="0" ${!o.inferred ? 'selected' : ''}>Confirmed by broker</option></select></label>
        </form>
        <h3>Motivations <span class="muted xs">(broker intelligence, adds to score)</span></h3><div class="checklist">${MOTIVATIONS.map(([k, l]) => `<label><input type="checkbox" data-mot="${k}" ${(o.motivations || []).includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <div class="mfoot"><label class="toggle"><input type="checkbox" id="needr" ${o.needsResearch ? 'checked' : ''}> In research queue</label><button class="btn primary" id="svo">Save owner</button></div></section>
      <section class="card"><div class="ch"><h2>Log a call / note</h2></div>${quickLogHTML('oql')}
        <h3>Follow-ups</h3>${fus.map(f => `<div class="lrow">${d8(f.due)} · ${esc(f.note || '')} <button class="btn sm ghost" data-done="${f.id}">Done</button></div>`).join('') || '<div class="muted">None scheduled.</div>'}
        <div class="ql-row"><input type="date" id="nfd"><input id="nfn" placeholder="Follow-up note"><button class="btn sm" id="nfa">Add</button></div>
        <h3>Research</h3>${linksHTML([['Google owner', `https://www.google.com/search?q=${encodeURIComponent('"' + o.name + '"')}`], ['Owner + Illinois', `https://www.google.com/search?q=${encodeURIComponent('"' + o.name + '" Illinois')}`], ['News', `https://news.google.com/search?q=${encodeURIComponent('"' + o.name + '"')}`], [MARKET.sos.name, MARKET.sos.url()]])}</section>
    </div>
    ${(() => { const tp = props[0]; return trueOwnerHTML({ names: ownerEntities(o), st: String(o.mail?.st || (tp && val(tp, 'mailState')) || '').toUpperCase(), p: tp, o }); })()}
    <section class="card" id="findowner"><div class="ch"><h2>Find the real owner <span class="muted xs">${froDone(o)}/${FRO_STEPS.length} steps</span></h2><span class="muted xs">One-click public sources. Nothing is looked up automatically and no contact is guessed.</span></div>${findOwnerHTML(o)}</section>
    <section class="card"><div class="ch"><h2>Entities / LLCs (${(o.entities || []).length})</h2><span class="muted xs">Tax-bill names grouped to this owner</span></div>
      <div class="chips">${(o.entities || []).map((e, i) => `<span class="chip">${esc(e)} <button data-rme="${i}" title="Remove">✕</button></span>`).join('')}</div>
      <div class="ql-row"><input id="ne" placeholder="Add entity / LLC name"><button class="btn sm" id="nea">Add entity</button><input id="mq" placeholder="Merge another owner into this one (type name)"><div id="mres" class="mres"></div></div>
      <div class="xs muted">Tax-bill mailing address: ${esc([o.mail?.addr, o.mail?.city, o.mail?.st, o.mail?.zip].filter(Boolean).join(', ') || '–')} ${badge('public')} <i>${TAXNOTE}</i></div></section>
    <details class="sect" ${props.length > 1 ? 'open' : ''}><summary><span class="st-t"><h2>Ownership network</h2><span class="cnt">${props.length}</span></span><span class="st-d">Owner group → tax-bill entities → parcels</span></summary><div class="sect-b">${networkHTML(o)}${(() => { const lk = linkedOwners(o); if (!lk.length) return ''; const n = lk.reduce((a, g) => a + g.n, 0), v = lk.reduce((a, g) => a + g.v, 0); return `<div class="tor-link"><b>Linked through Secretary of State records:</b> ${lk.length} other owner group${lk.length > 1 ? 's' : ''} · ${n} parcels · ${kmoney(v)}. Combined portfolio ≈ ${kmoney(v + ownerDeal(o.id).value)} <span class="xs muted">(inferred from shared agent / office / managers you saved)</span><ul class="why">${lk.slice(0, 8).map(g => `<li><a href="#/owner/${g.o.id}">${esc(nc(g.o.name))}</a> <span class="xs muted">${[...g.why].join(' · ')}</span></li>`).join('')}</ul></div>`; })()}</div></details>
    <section class="card"><div class="ch"><h2>Properties (${props.length})</h2></div><div id="opt"></div></section>
    <section class="card"><div class="ch"><h2>Activity</h2></div>${activityHTML(activitiesFor('ownerId', id))}</section></div>`;
  table($('#opt'), props, [
    { k: 'om', l: 'Score', h: p => scorePill(scoreOf(p).score), v: p => scoreOf(p).score },
    { k: 'a', l: 'Address', h: p => `<a href="#/property/${p.id}">${esc(nc(val(p, 'address') || p.pin))}</a> ${bigTag(deal(p))}`, v: p => val(p, 'address') || '' },
    { k: 'c', l: 'City', h: p => esc(val(p, 'city') || '') }, { k: 'sf', l: 'Size', h: p => sfAc(deal(p)), v: p => deal(p).sf },
    { k: 'v', l: 'Est. value', h: p => kmoney(deal(p).value), v: p => deal(p).value }, { k: 'tp', l: 'Taxpayer name', h: p => esc(val(p, 'taxpayer') || '') },
  ], { sort: 'v', href: p => `#/property/${p.id}` });
  bindQuickLog(el, { ownerId: id, propertyId: props[0] && props[0].id }, () => owner(el, id));
  bindFindOwner($('#findowner'), o, () => owner(el, id));
  bindTrueOwner(el, () => owner(el, id));
  $('#svo').onclick = async () => { const fd = new FormData($('#of')); ['name', 'stage', 'priority', 'notes'].forEach(k => o[k] = (fd.get(k) || '').trim()); readContactForm(o, fd); o.inferred = fd.get('inferred') === '1'; o.motivations = $$('[data-mot]:checked', el).map(c => c.dataset.mot); o.needsResearch = $('#needr').checked; await save('owners', o); toast('Owner saved'); owner(el, id); };
  $$('[data-done]', el).forEach(b => b.onclick = async () => { const f = S.followups.get(b.dataset.done); f.done = true; f.doneTs = Date.now(); await save('followups', f); owner(el, id); });
  $('#nfa').onclick = async () => { const d = $('#nfd').value || addDays(today(), 7); await addFollowup({ ownerId: id, due: d, note: $('#nfn').value }); owner(el, id); };
  $('#nea').onclick = async () => { const v = $('#ne').value.trim(); if (!v) return; o.entities = [...(o.entities || []), v]; await save('owners', o); owner(el, id); };
  $$('[data-rme]', el).forEach(b => b.onclick = async () => { o.entities.splice(+b.dataset.rme, 1); await save('owners', o); owner(el, id); });
  let mt; $('#mq').oninput = e => { clearTimeout(mt); mt = setTimeout(() => { const q = e.target.value.trim().toLowerCase(); if (q.length < 3) { $('#mres').innerHTML = ''; return; } const r = [...S.owners.values()].filter(x => x.id !== id && x.name.toLowerCase().includes(q)).slice(0, 8); $('#mres').innerHTML = r.map(x => `<button class="btn sm ghost" data-merge="${x.id}">Merge: ${esc(x.name)} (${ownerProps(x.id).length})</button>`).join(''); $$('[data-merge]', el).forEach(b => b.onclick = async () => { const x = S.owners.get(b.dataset.merge); if (!confirm(`Merge "${x.name}" into "${o.name}"? Its parcels, entities, notes and follow-ups move here.`)) return; for (const p of ownerProps(x.id)) { p.ownerId = id; p.ownerLocked = true; await save('properties', p); } o.entities = [...new Set([...(o.entities || []), ...(x.entities || [x.name])])]; for (const a of S.activities.values()) if (a.ownerId === x.id) { a.ownerId = id; await save('activities', a); } for (const f of S.followups.values()) if (f.ownerId === x.id) { f.ownerId = id; await save('followups', f); } await save('owners', o); const { remove } = await import('./store.js'); await remove('owners', x.id); toast('Merged'); owner(el, id); }); }, 250); };
}
