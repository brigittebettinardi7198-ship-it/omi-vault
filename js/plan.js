// Today = daily call plan (first screen). Ranked for QUICK closes from real public signals only; outcomes, follow-ups, pipeline
// and the script are saved on this device (settings + followups store, so they ride along in backup).
import { $, $$, esc, fmt, kmoney, today, addDays, daysBetween, toast, uid } from './util.js';
import { S, val, setting, setSetting, ownerProps, addFollowup, addActivity, save } from './store.js';
import { deal, activeMatchMap, ownerDeal, sfOf } from './scoring.js';
import { favBtn } from './favs.js';
import { vacancyOf } from './sheets.js';
import { likelyBuyers, qualify } from './buyers.js';
import { x1031Buyers, nc } from './extras.js';
import { pathHTML, targetsHTML, guardHTML, overdueHTML, scorecardHTML, bigDealLeads, bigCardHTML, bindMoney, dnc, inTerritory, chip, takeHomeValue } from './money.js';
import * as RC from './reach.js';
import { pitchLine, autopilot, draftBtns, buyerAlertsHTML, estateListHTML, driveRoute, driveHTML } from './edge.js';

const GOV = /\b(CITY OF|VILLAGE OF|TOWN OF|COUNTY|STATE OF|UNITED STATES|USA|DISTRICT|AUTHORITY|SCHOOL|UNIVERSITY|COLLEGE|PARK DIST|FOREST PRESERVE|RAILROAD|RAILWAY|METRA|CTA|COMMONWEALTH EDISON|COMED|NICOR|HOUSING|CHURCH|DIOCESE|ARCHDIOCESE)\b/;
export const OUTCOMES = [['na', 'No answer'], ['vm', 'Left VM'], ['talked', 'Talked'], ['int', 'Interested'], ['no', 'Pass / not interested'], ['mtg', 'Meeting set'], ['prop', 'Proposal sent']];
const FU_DEF = { na: 2, vm: 3, talked: 30, int: 7 };
export const fuDays = () => ({ ...FU_DEF, ...(setting('fuDays', {}) || {}) });
const SCRIPT_DEF = 'Hi, this is [your name], an industrial broker. I\'m calling about {address} in {city}. {hook} Would you consider selling if the price and timing were right?';
export const STAGES5 = ['Lead', 'Pitched', 'Touring / Listed', 'Under contract', 'Closed'];
const PROB = { Lead: .1, Pitched: .25, 'Touring / Listed': .5, 'Under contract': .85, Closed: 1 };

// ---------- signals (real public data only) ----------
function propSignals(p) {
  const R = [], now = today();
  if (p.tdel) R.push([30, `behind on property taxes (Cook County delinquent list ${p.tdel})`]);
  if (p.sba && p.sbamat) { const m = daysBetween(now, p.sbamat) / 30.4; if (m >= -6 && m <= 24) R.push([25, `SBA loan likely comes due around ${p.sbamat} (estimate)`]); }
  const v = vacancyOf(p); if (v && v.length) { const t = v.sort((a, b) => b.s - a.s)[0]; R.push([t.s === 2 ? 25 : 12, 'may be empty: ' + t.t]); }
  if (p.warn) R.push([20, 'WARN layoff / closing notice: ' + p.warn]);
  const sd = val(p, 'lastSaleDate'), yrs = sd ? daysBetween(sd, now) / 365.25 : p.holdplus ? 27 : 0; if (yrs >= 15) R.push([15, `owned ${Math.floor(yrs)}+ years`]);
  const st = String(val(p, 'mailState') || '').toUpperCase(); if (st && st !== 'IL') R.push([10, `owner's tax bill goes out of state (${st})`]);
  return R;
}
let candCache = null;
function candidates() {
  if (candCache && candCache.v === S.version) return candCache.list;
  const list = [];
  for (const o of S.owners.values()) {
    if (o.inst || dnc(o) || GOV.test(String(o.name || '').toUpperCase())) continue;
    const props = ownerProps(o.id).filter(inTerritory); if (!props.length || props.length > 12) continue;   // 12+ parcels = large company portfolio
    let best = null;
    for (const p of props) { const sd = val(p, 'lastSaleDate'); if (sd && daysBetween(sd, today()) < 3 * 365) continue;   // just bought: not a seller
      const sig = propSignals(p); if (!sig.length) continue; const s = sig.reduce((a, x) => a + x[0], 0); if (!best || s > best.s) best = { p, sig, s }; }
    if (!best || best.s < 20) continue;
    const d = deal(best.p); list.push({ o, p: best.p, sig: best.sig.sort((a, b) => b[0] - a[0]), s: best.s + Math.min(15, (d.value || 0) / 1e6), value: d.value || 0 });
  }
  list.sort((a, b) => b.s - a.s); candCache = { v: S.version, list }; return list;
}
function buyerBonus(c) {
  const mm = activeMatchMap().get(c.p.id); if (mm && mm.length) return [20, `matches your buyer “${mm[0].req.name}”`];
  const lb = likelyBuyers(c.p, 3).map(x => ({ x, q: qualify(x.b) })).find(y => y.q.grade !== 'C' && !GOV.test(String(y.x.b.name).toUpperCase())); if (lb) return [15, `active buyer ${lb.x.b.name} (grade ${lb.q.grade}) buys this size here`];
  const v = c.value; const x = x1031Buyers().find(e => e.d180 > 0 && e.props.some(z => z.p.co === c.p.co) && v && v >= e.total * .4 && v <= e.total * 1.6); if (x) return [10, `1031 buyer ${nc(x.seller)} must buy by ${x.c180}`];
  return null;
}
// Money-first ranking: estimated take-home x odds, scaled down for mega properties a newer broker rarely wins off a cold call.
export const moneyRank = (value, r) => takeHomeValue(+value || 0) * Math.max(.03, Math.min(.5, (+r || 0) / 200)) * Math.min(1, Math.sqrt(15e6 / Math.max(1, +value || 1)));
// ---------- daily plan: 10 owners, no repeats within 14 days ----------
export function dailyPlan() {
  const t = today(), cur = setting('plan', null);
  const pick = cur && cur.d === t && cur.v === 3 ? cur.ids : null;
  const all = candidates(), byId = new Map(all.map(c => [c.o.id, c]));
  let rows;
  if (pick) rows = pick.map(id => byId.get(id)).filter(Boolean);
  else {
    const hist = setting('planHist', {}) || {}, outc = setting('outc', {}) || {};
    const ok = c => { const h = hist[c.o.id]; if (h && daysBetween(h, t) < 14) return false; const last = (outc[c.o.id] || [])[0]; return !(last && last.o === 'no' && daysBetween(last.d, t) < 180); };
    const pool = all.filter(c => ok(c) && !(c.value > 30e6)).slice(0, 150).map(c => { const b = buyerBonus(c), r = c.s + (b ? b[0] : 0); return { ...c, b, r, ex: moneyRank(c.value, r) }; }).sort((a, b) => b.ex - a.ex).slice(0, 10);
    rows = pool; const h2 = { ...hist }; pool.forEach(c => h2[c.o.id] = t);
    for (const k of Object.keys(h2)) if (daysBetween(h2[k], t) > 30) delete h2[k];
    setSetting('planHist', h2); setSetting('plan', { d: t, v: 3, ids: pool.map(c => c.o.id) });
  }
  return rows.map(c => c.b === undefined ? { ...c, b: buyerBonus(c) } : c);
}
const reason = c => { const parts = [c.sig[0][1]]; if (c.sig[1]) parts.push(c.sig[1][1]); if (c.b) parts.push(c.b[1]); const s = parts.join('; '); return s[0].toUpperCase() + s.slice(1) + '.'; };
const hookOf = c => c.b ? 'I work with buyers looking for buildings like yours in the area right now.' : c.sig.some(x => /tax/.test(x[1])) ? 'I help owners who want a quick, quiet sale.' : 'Buyers are actively looking for industrial property in your area.';
const script = c => (setting('script', SCRIPT_DEF) || SCRIPT_DEF).replace('{address}', nc(val(c.p, 'address') || 'your property')).replace('{city}', nc(val(c.p, 'city') || '')).replace('{hook}', hookOf(c)).replace('{owner}', nc(c.o.name)) + (pitchLine(c.p) ? ' ' + pitchLine(c.p) : '');
// ---------- follow-ups due ----------
export const dueList = () => { const t = today(); return [...S.followups.values()].filter(f => !f.done && f.due && f.due <= t).sort((a, b) => a.due.localeCompare(b.due)); };
export const dueCount = () => dueList().length;
async function record(oid, pid, code) {
  const t = today(), all = { ...(setting('outc', {}) || {}) }; all[oid] = [{ d: t, o: code, pid }, ...(all[oid] || [])].slice(0, 20); await setSetting('outc', all);
  const label = OUTCOMES.find(x => x[0] === code)[1];
  try { await addActivity({ ownerId: oid, propertyId: pid, type: 'Call', outcome: label, note: 'Call plan: ' + label, date: t }); } catch (e) { /* activity log optional */ }
  for (const f of [...S.followups.values()].filter(f => !f.done && f.ownerId === oid && f.due <= t)) { f.done = true; f.doneTs = Date.now(); await save('followups', f); }
  const days = ['talked', 'no'].includes(code) ? 0 : fuDays()[code]; let msg = label;
  if (['talked', 'no'].includes(code) && pid) { await autopilot(oid, pid); msg += ' · 30/60/90-day touches scheduled'; }
  if (days) { const due = addDays(t, +days); await addFollowup({ ownerId: oid, propertyId: pid, due, note: `Call back (${label})` }); msg += ` · follow-up ${due}`; }
  if (['int', 'mtg', 'prop'].includes(code)) { const D = setting('deals', []) || []; if (!D.some(d => d.oid === oid && d.stage !== 'Closed')) { const p = S.prop.get(pid); D.unshift({ id: uid('d'), oid, pid, name: nc(val(p, 'address') || S.owners.get(oid)?.name || 'Deal'), stage: 'Lead', value: Math.round(deal(p).value || 0) || '', comm: 3, split: 50, created: t }); await setSetting('deals', D); msg += ' · added to pipeline'; } }
  toast(msg);
}
const OB = (oid, pid, keys, cls = 'outs') => `<div class="${cls}">${keys.map(k => [k, ({ na: 'No answer', no: 'Pass' })[k] || OUTCOMES.find(x => x[0] === k)[1]]).map(([k, l]) => `<button class="outb o-${k}" data-out="${k}" data-oid="${esc(oid)}" data-pid="${esc(pid || '')}">${l}</button>`).join('')}</div>`;
const outBtns = (oid, pid) => OB(oid, pid, ['na', 'talked', 'int', 'no']);
const outMore = (oid, pid) => OB(oid, pid, ['vm', 'mtg', 'prop'], 'outs outs2');
const NY = new Date().getFullYear() + 1, TAGS = [`maybe ${NY}`, 'wants $…', 'partner decides', 'hates brokers', 'has another building', 'owns a business', '+ custom'];
const rtags = oid => ((setting('rtags', {}) || {})[oid] || []);
const tagRow = (oid, pid) => `<div class="rtags xs" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${rtags(oid).map(t => `<span class="tag" style="background:#e0e7ff">${esc(t.t)}</span>`).join('')}${TAGS.map(t => `<button class="fchip" style="min-height:30px" data-rtag="${esc(t)}" data-oid="${esc(oid)}" data-pid="${esc(pid || '')}">${esc(t)}</button>`).join('')}</div>`;
async function addTag(oid, pid, t) {
  if (t === 'wants $…') { const v = prompt('What price do they want? (e.g. 4.5M)'); if (!v) return; t = 'wants $' + v.replace(/^\$/, ''); }
  if (t === '+ custom') { t = prompt('Tag (e.g. "maybe spring 2028", "son runs it")') || ''; if (!t) return; }
  const A = { ...(setting('rtags', {}) || {}) }; A[oid] = [...(A[oid] || []), { t, d: today() }]; await setSetting('rtags', A);
  const y = (t.match(/\b(20\d\d)\b/) || [])[1]; if (y) { const due = addDays(`${y}-01-01`, -60); if (due > today()) { await addFollowup({ ownerId: oid, propertyId: pid, due, note: `Timeframe tag "${t}": call 60 days before` }); toast(`Tagged · call scheduled ${due}`); return; } }
  toast('Tagged');
}
const lastOut = oid => { const x = ((setting('outc', {}) || {})[oid] || [])[0]; return x ? `<span class="lastout">Last: ${esc(OUTCOMES.find(o => o[0] === x.o)?.[1] || x.o)} ${esc(x.d)}</span>` : ''; };
// ---------- pipeline & earnings ----------
export function earnings() {
  const D = setting('deals', []) || [], y = today().slice(0, 4), c = d => (+d.value || 0) * (+d.comm || 0) / 100 * (+d.split || 100) / 100;
  const closed = D.filter(d => d.stage === 'Closed' && String(d.close || d.created || '').slice(0, 4) === y).reduce((a, d) => a + c(d), 0);
  const expected = D.filter(d => d.stage !== 'Closed').reduce((a, d) => a + c(d) * (PROB[d.stage] || 0), 0);
  return { D, closed, expected, goal: +setting('goal', 100000) || 100000, c };
}
function pipelineHTML() {
  const { D, closed, expected, goal, c } = earnings(), pc = Math.min(100, closed / goal * 100), pe = Math.min(100 - pc, expected / goal * 100);
  return `<section class="card pipe"><div class="ch"><h2>Pipeline & earnings</h2><button class="btn sm" id="adddeal">+ Deal</button></div>
    <div class="earn"><div><span>Closed this year</span><b>${kmoney(closed) || '$0'}</b></div><div><span>Expected (weighted by stage)</span><b>${kmoney(expected) || '$0'}</b></div><div><span>Goal</span><b><input id="goal" type="number" inputmode="numeric" value="${goal}" aria-label="Yearly commission goal"></b></div></div>
    <div class="gbar" title="Closed ${Math.round(pc)}% · expected ${Math.round(pe)}%"><i style="width:${pc}%"></i><i class="ex" style="width:${pe}%"></i></div>
    <div class="xs muted">Your commission = deal value × commission % × your split %. Expected uses stage odds: Lead 10%, Pitched 25%, Touring / Listed 50%, Under contract 85%.</div>
    ${D.length ? `<div class="deals">${D.map(d => `<div class="deal" data-did="${esc(d.id)}"><div class="dl-h">${d.pid ? `<a href="#/property/${esc(d.pid)}">${esc(d.name)}</a>` : `<input data-df="name" value="${esc(d.name)}" aria-label="Deal name">`}<select data-df="stage">${STAGES5.map(s => `<option ${s === d.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="dl-f"><label>Value $<input data-df="value" type="number" inputmode="numeric" value="${esc(d.value)}"></label><label>Comm %<input data-df="comm" type="number" step="0.25" inputmode="decimal" value="${esc(d.comm)}"></label><label>Your split %<input data-df="split" type="number" inputmode="numeric" value="${esc(d.split)}"></label><label>Close date<input data-df="close" type="date" value="${esc(d.close || '')}"></label><span class="dl-c">${kmoney(c(d)) || '–'}</span><button class="btn sm ghost" data-ddel>Remove</button></div></div>`).join('')}</div>` : '<div class="muted">No deals yet. Tap “Interested” on a call or “+ Deal”.</div>'}</section>`;
}
const rollup = oid => { const n = ownerProps(oid).length; if (n < 2) return ''; const od = ownerDeal(oid); return `<div class="rollup">One call covers ${n} properties${od.sf ? ' · ' + fmt(Math.round(od.sf)) + ' SF' : ''}${od.value ? ' · ' + kmoney(od.value) + ' est. total' : ''}</div>`; };
// ---------- "First to know": public-record changes since your last visit (data/changes.json) ----------
const TLAB = { sale: 'Sold', owner: 'New owner', mail: 'Mailing address changed' };
function seenSince() { const t = today(), x = setting('seen', null); if (!x) { const v = { prev: addDays(t, -14), cur: t }; setSetting('seen', v); return v.prev; } if (x.cur !== t) { setSetting('seen', { prev: x.cur, cur: t }); return x.cur; } return x.prev; }
const miles = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * 3959; };
function neighbors(p, n = 10) {
  if (!p || !p.lat) return []; const so = sfOf(p).sf, land = !!p.vac;
  return S.props.filter(q => q.id !== p.id && q.lat && q.ownerId && q.ownerId !== p.ownerId && !!q.vac === land && (!so || !sfOf(q).sf || (sfOf(q).sf >= so / 3 && sfOf(q).sf <= so * 3)))
    .map(q => ({ q, mi: miles(p.lat, p.lon, q.lat, q.lon) })).filter(x => x.mi <= 3).sort((a, b) => a.mi - b.mi)
    .filter((x, i, a) => a.findIndex(y => y.q.ownerId === x.q.ownerId) === i).slice(0, n);
}
function feedHTML() {
  const since = seenSince(), ev = (S.changes.ev || []).filter(e => TLAB[e.t] && e.d >= since && S.prop.has(e.id)).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 15);
  if (!ev.length) return `<h2 class="plan-h">First to know</h2><div class="muted xs">No new public-record changes since ${esc(since)}. Sales, owner and mailing-address changes appear here after each data refresh (Mon / Thu).</div>`;
  const price = e => { const m = String(e.b || '').match(/\$[\d,]+/); return m ? m[0] : ''; };
  return `<h2 class="plan-h">First to know <span class="cnt">${ev.length}</span></h2><div class="xs muted" style="margin:-4px 0 8px">Public-record changes since ${esc(since)}: sales, new owners and mailing-address changes.</div>${ev.map((e, i) => { const p = S.prop.get(e.id), nb = e.t === 'sale' ? neighbors(p) : [], pr = price(e);
    return `<div class="pcall feed"><div class="pc-top"><span class="fk fk-${e.t}">${TLAB[e.t]}</span><div class="pc-who"><a href="#/property/${esc(e.id)}"><b>${esc(nc(e.addr || val(p, 'address') || ''))}</b></a><span class="xs muted">${esc(nc(e.city || ''))} · ${esc(e.d)}</span></div>${favBtn(e.id)}<button class="bact primary pc-call" data-call="${esc(e.id)}">Call</button></div>
      <div class="pc-why">${esc(e.t === 'sale' ? 'Sold ' + (e.b || '') : e.t === 'owner' ? 'Owner now: ' + (e.b || '') : 'Tax bill now mails to: ' + (e.b || ''))}</div>
      ${nb.length ? `<details class="pc-sc"><summary>Just sold: call the ${nb.length} nearest similar owners</summary><p>“A building near yours at ${esc(nc(e.addr || ''))} just sold${pr ? ' for ' + esc(pr) : ''}. Buyers are active around you. Would you consider an offer on yours?”</p>
        ${nb.map(x => `<div class="nbr"><div><a href="#/property/${esc(x.q.id)}">${esc(nc(val(x.q, 'address') || x.q.pin))}</a><div class="xs muted">${esc(nc(S.owners.get(x.q.ownerId)?.name || val(x.q, 'taxpayer') || ''))} · ${x.mi.toFixed(1)} mi${sfOf(x.q).sf ? ' · ' + fmt(sfOf(x.q).sf) + ' SF' : ''}</div></div><button class="btn sm" data-call="o:${esc(x.q.ownerId)}">Call</button></div>`).join('')}</details>` : ''}</div>`; }).map((h, i, a) => i === 3 && a.length > 3 ? `<details class="feedmore"><summary>Show ${a.length - 3} more changes</summary>` + h : h).join('') + (ev.length > 3 ? '</details>' : '')}`;
}
// ---------- view ----------
export async function planView(el, sub) {
  await RC.loadPhones(); const RH = await import('./rhythm.js'); const RS = await import('./resi.js'), rba = await RC.resiBuyerAlertsHTML().catch(() => ''), resi = await RS.resiCalls().catch(() => []);
  const rows = dailyPlan().slice(0, 10 - resi.length), due = dueList(), t = today();
  const more = (oid, pid, extra = '') => `<details class="pc-sc pc-more"><summary>More</summary>${extra}${outMore(oid, pid)}${tagRow(oid, pid)}${RC.notesBox(oid, pid)}${RC.portfolioBtn(oid)}<a class="xs" target="_blank" rel="noopener" href="${esc(RC.SOS)}">Who runs the LLC (IL Secretary of State)</a></details>`;
  const card = (c, i) => `<div class="pcall"><div class="pc-top"><span class="pc-n">${i + 1}</span><div class="pc-who"><a href="#/owner/${esc(c.o.id)}"><b>${esc(nc(c.o.name))}</b></a><a class="xs" href="#/property/${esc(c.p.id)}">${esc(nc(val(c.p, 'address') || ''))}, ${esc(nc(val(c.p, 'city') || ''))}</a></div>${RC.callBtn(c.o, c.p)}</div>${RC.memTop(c.o.id)}
    <div class="pc-chip">${chip(c.value)}</div><div class="pc-why">${esc(reason(c))}</div>${rollup(c.o.id)}${lastOut(c.o.id)}
    ${outBtns(c.o.id, c.p.id)}${more(c.o.id, c.p.id, `<p class="pc-script"><b>What to say:</b> ${esc(script(c))}</p>`)}</div>`;
  const dueCard = f => { const o = S.owners.get(f.ownerId), p = f.propertyId && S.prop.get(f.propertyId); return `<div class="pcall due"><div class="pc-top"><span class="pc-n">!</span><div class="pc-who">${o ? `<a href="#/owner/${esc(o.id)}"><b>${esc(nc(o.name))}</b></a>` : '<b>Follow-up</b>'}${p ? `<a class="xs" href="#/property/${esc(p.id)}">${esc(nc(val(p, 'address') || ''))}</a>` : ''}</div>${o ? `<button class="bact primary pc-call" data-call="o:${esc(o.id)}">Call</button>` : ''}</div><div class="pc-why">${esc(f.note || 'Follow-up')} · due ${esc(f.due)}${f.due < t ? ' (overdue)' : ''}</div>${draftBtns(f)}${o ? outBtns(o.id, f.propertyId) + more(o.id, f.propertyId) : ''}</div>`; };
  const fd = fuDays();
  const big90 = !!setting('big90', false), bigL = big90 ? bigDealLeads().slice(0, 10) : [];
  el.innerHTML = `<div class="page plan"><div class="hello"><h1>Today</h1></div>
    ${overdueHTML()}${pathHTML(true)}${due.length ? `<h2 class="plan-h">Call back today <span class="cnt">${due.length}</span></h2>${due.slice(0, 15).map(dueCard).join('')}` : ''}
    <div class="ch" style="margin-top:14px"><h2 class="plan-h" style="margin:0">${big90 ? '90-Day Big Deal calls' : 'Your 10 calls'} · ${new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</h2><label class="fchip" style="min-height:44px"><input type="checkbox" id="big90" ${big90 ? 'checked' : ''}> 90-Day Big Deal</label></div>
    ${big90 ? (bigL.length ? bigL.map(bigCardHTML).join('') : '<div class="muted">No leads meet the 90-Day rules (take-home and a deadline trigger). Lower the minimum in Deals settings or widen your territory.</div>') : (rows.length || resi.length) ? rows.map(card).join('') + resi.map((x, i) => RS.resiCardHTML(x, rows.length + i + 1, outBtns)).join('') : '<div class="muted">No owners with strong sell signals in your territory right now.</div>'}
    <details class="card fold" style="padding:10px;margin-top:14px"><summary><b>Fastest money</b> <span class="xs muted">buyers waiting, estates, keep 5 deals alive</span></summary>${guardHTML()}${buyerAlertsHTML()}${rba}${estateListHTML()}<a class="btn" href="#/big" style="display:block;text-align:center;margin-top:8px">Big Deals ›</a></details>
    <details class="card fold" style="padding:10px;margin-top:10px"><summary><b>This week</b> <span class="xs muted">scorecard, target deals, inbound${new Date().getDay() === 5 ? ', Friday summary' : ''}</span></summary>${scorecardHTML()}${targetsHTML()}${RS.speedHTML()}${new Date().getDay() === 5 ? RH.winHTML() : ''}<div id="prosx"></div></details>
    <details class="card fold" style="padding:10px;margin-top:10px"><summary><b>More for today</b> <span class="xs muted">drive day, record changes, your files, more lead types</span></summary>
    <button class="btn primary" id="drive" style="width:100%;padding:14px;font-size:16px;margin:6px 0 10px">Plan a drive day</button><div id="driveout"></div>
    ${feedHTML()}
    <h2 class="plan-h">Your CoStar / LoopNet / Crexi files <span class="xs muted">(private, this device only)</span></h2><button class="btn" id="impbtn" style="width:100%;margin-bottom:8px">Import CoStar / LoopNet / Crexi file</button><div id="impx"><div class="xs muted">Loading…</div></div>
    <div id="b3x"></div>
    ${[['jsold', 'Just sold near your owners (residential)'], ['rbuy', 'Residential buyer leads'], ['inv', 'Investor buyers (2-6 units)']].map(([k, l]) => `<details class="feedmore" data-rs="${k}"><summary><b>${l}</b></summary><div class="rsbody xs">Loading…</div></details>`).join('')}
    <details class="card advset"><summary>Advanced: call script and follow-up timing</summary>
      <label class="full">Script (use {address}, {city}, {hook}, {owner})<textarea id="scr" rows="3">${esc(setting('script', SCRIPT_DEF) || SCRIPT_DEF)}</textarea></label>
      <div class="dl-f">${[['na', 'No answer'], ['vm', 'Left VM'], ['talked', 'Talked'], ['int', 'Interested']].map(([k, l]) => `<label>${l}: days<input data-fud="${k}" type="number" inputmode="numeric" value="${fd[k]}"></label>`).join('')}</div>
      <div class="xs muted">Ranking: tax delinquency, SBA loan coming due (estimate), possible vacancy, WARN notices, 15+ year ownership and out-of-state owners, plus a bonus when your buyer, a grade A/B public buyer or a 1031 buyer fits. Large companies (12+ parcels or institutional) and government owners are left out. Nobody repeats within 14 days.</div></details>
    </details></div>`;
  const re = () => planView(el);
  $$('[data-out]', el).forEach(b => b.onclick = async () => { b.closest('.outs').querySelectorAll('button').forEach(x => x.disabled = true); await record(b.dataset.oid, b.dataset.pid, b.dataset.out); re(); });
  import('./costar.js').then(async M => { const x = $('#impx', el); if (!x) return; x.innerHTML = await M.todayHTML(); M.bindToday(x, re); $('#impbtn', el).onclick = () => M.importModal(re); if (sub === 'import') M.importModal(re); });
  $$('[data-rtag]', el).forEach(b => b.onclick = async () => { await addTag(b.dataset.oid, b.dataset.pid, b.dataset.rtag); re(); });
  import('./batch3.js').then(M => { const x = $('#b3x', el); if (x) { x.innerHTML = M.todayGroupHTML(); M.bindTodayGroup(x); } });
  $('#drive').onclick = () => { const r = driveRoute(candidates().slice(0, 80)); $('#driveout').innerHTML = `<section class="card" style="padding:12px;margin-bottom:10px"><h2 style="margin:0">Drive day</h2>${driveHTML(r)}</section>`; };
  $('#scr').onchange = e => setSetting('script', e.target.value || SCRIPT_DEF);
  $$('[data-fud]', el).forEach(i => i.onchange = () => { const v = { ...(setting('fuDays', {}) || {}) }; v[i.dataset.fud] = +i.value || FU_DEF[i.dataset.fud]; setSetting('fuDays', v); });
  import('./batch3.js').then(M => { const x = $('#prosx', el); if (x) { x.innerHTML = M.prosDueHTML(); M.bindPros(x, re); } }); RH.bindWin(el); RS.bindResi(el, re); RC.bindNotes(el, re); RC.bindPortfolio(el); RS.bindBuyers(el, re);
  $$('[data-rs]', el).forEach(d => d.addEventListener('toggle', async () => { if (!d.open || d.dataset.done) return; d.dataset.done = 1; const b = d.querySelector('.rsbody'); b.innerHTML = await ({ jsold: RS.justSoldHTML, rbuy: RS.buyersHTML, inv: RS.investorsHTML })[d.dataset.rs](); RS.bindBuyers(b, re); }));
  bindMoney(el, re); $('#big90', el).onchange = async e => { await setSetting('big90', e.target.checked); re(); };
}
