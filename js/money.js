// Money engine (master spec section 1) + territory (7.3). Settings live in the 'money' / 'territory' settings keys (included in backup).
import { $, $$, esc, fmt, kmoney, today, addDays, daysBetween, toast, uid } from './util.js';
import { S, val, setting, setSetting, addFollowup, ownerProps } from './store.js';
import { deal, sfOf, scoreOf, activeMatchMap } from './scoring.js';
import { x1031Buyers, nc } from './extras.js';
import { ownerOccupied } from './adv.js';
import { estateOn } from './edge.js';

export const STAGES5 = ['Lead', 'Pitched', 'Touring / Listed', 'Under contract', 'Closed'];
export const PROB = { Lead: .1, Pitched: .25, 'Touring / Listed': .5, 'Under contract': .85, Closed: 1 };
const DEF = { sale: 3, lease: 4, resi: 2.5, split: 85, cap: 12000, goal: 100000, goalDate: '', typical: 3000000, big: 100000, lag: 10, rent: 8 };
export const cfg = () => ({ ...DEF, ...(setting('money', {}) || {}) });
const yr = () => today().slice(0, 4);
export const deals = () => setting('deals', []) || [];
export const saveDeals = D => setSetting('deals', D);
// gross fee for a deal
export function gross(d) { const c = cfg(), v = +d.value || 0, pct = d.comm !== undefined && d.comm !== '' ? +d.comm : d.kind === 'lease' ? c.lease : d.kind === 'resi' ? c.resi : c.sale; return v * pct / 100; }
// company dollar already paid toward the Real cap this year (closed deals)
export function capPaid(excludeId) { const c = cfg(); let paid = 0; for (const d of deals()) if (d.stage === 'Closed' && String(d.close || d.created || '').slice(0, 4) === yr() && d.id !== excludeId) paid += gross(d) * (1 - c.split / 100); return Math.min(c.cap, paid); }
// take-home after split, honoring the annual cap (then 100%)
export function takeHome(g, paid = capPaid()) { const c = cfg(), co = Math.min(g * (1 - c.split / 100), Math.max(0, c.cap - paid)); return g - co; }
export const takeHomeValue = (value, kind = 'sale') => takeHome(value * (kind === 'lease' ? cfg().lease : kind === 'resi' ? cfg().resi : cfg().sale) / 100);
export const expected = (value, prob) => takeHomeValue(value) * prob;
export const VCHK = 30000000;
export const chip = (value, kind) => value > VCHK ? `<span class="tag" style="background:#fef3c7;color:#92400e" title="Estimate over $30M: likely a size or multi-parcel data issue, or a co-brokered institutional deal">Large: check size</span>` : value ? `<span class="tag" style="background:#dcfce7;color:#166534">≈ ${kmoney(takeHomeValue(value, kind))} to you (est.)</span>` : '';
export const dnc = o => !!(o && (o.dnc || o.stage === 'Do not contact'));
// ---------- territory (7.3) ----------
export const terr = () => setting('territory', { types: [], towns: '', zips: '' }) || {};
export function inTerritory(p) { const t = terr(), towns = String(t.towns || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean), zips = String(t.zips || '').split(',').map(s => s.trim()).filter(Boolean);
  if (towns.length || zips.length) { const c = String(val(p, 'city') || '').toLowerCase(), z = String(val(p, 'zip') || '').slice(0, 5); if (!(towns.includes(c) || zips.includes(z))) return false; }
  if (t.types && t.types.length) { const land = !!p.vac; if (!t.types.some(k => k === 'land' ? land : k === 'industrial' ? !land : false)) return false; }
  return true; }
// ---------- 1.3 90-Day Big Deal list ----------
let BIG = null;
export function bigDealLeads() {
  if (BIG && BIG.v === S.version) return BIG.list;
  const c = cfg(), minV = c.big / (c.sale / 100) / (c.split / 100) * .9, now = today(), out = [], mm = activeMatchMap(), lease = new Map();
  for (const l of S.leases.values()) if (l.propertyId && l.expiration && +l.sf >= 50000) { const d = daysBetween(now, l.expiration); if (d >= 0 && d <= 365) lease.set(l.propertyId, Math.min(d, lease.get(l.propertyId) ?? 999)); }
  const x = x1031Buyers().filter(e => e.d180 > 0 && e.total >= 1e6);
  for (const p of S.props) {
    const o = S.owners.get(p.ownerId); if (dnc(o) || (o && o.inst) || p.ot === 'institutional' || !inTerritory(p)) continue; const dq = deal(p), v = dq.value || 0; if (v < minV || dq.check) continue;   // implausible size: not a 90-day lead
    const th = takeHomeValue(v); if (th < c.big) continue;
    const T = [];
    if (lease.has(p.id)) T.push({ t: `Lease ends in ${lease.get(p.id)} days`, d: lease.get(p.id) });
    if (!p.vac && ['individual', 'trust', 'estate', 'company'].includes(p.ot) && ownerOccupied(p)) T.push({ t: 'Owner-user: sale-leaseback candidate', d: null });
    const xe = x.find(e => v >= e.total * .6 && v <= e.total * 1.6 && e.props.some(z => z.p.co === p.co)); if (xe) T.push({ t: xe.d45 > 0 ? `1031 window: ${xe.d45} days left (${nc(xe.seller)})` : `1031 window: ${xe.d180} days left (${nc(xe.seller)})`, d: xe.d45 > 0 ? xe.d45 : xe.d180 });
    const m = mm.get(p.id); if (m && m.length) T.push({ t: `Your buyer fits: ${m[0].req.name}`, d: null });
    if (p.tdel) T.push({ t: `Tax delinquent (Cook file ${p.tdel})`, d: null });
    if (p.ot === 'estate' || estateOn(p.id)) T.push({ t: 'Estate / heirs owner', d: null });
    if (+p.avchg >= 25) T.push({ t: `Assessment jumped ${Math.round(+p.avchg)}%`, d: null });
    if (!T.length) continue;
    const dd = T.filter(t => t.d != null).map(t => t.d), days = dd.length ? Math.min(...dd) : null, urg = days == null ? 1 : Math.max(1, 1 + (90 - days) / 90), odds = Math.min(.9, .15 + scoreOf(p).score / 200 + T.length * .05);
    out.push({ p, o, v, th, T, days, rank: th * odds * urg, odds });
  }
  out.sort((a, b) => b.rank - a.rank); BIG = { v: S.version, list: out.slice(0, 200) }; return BIG.list;
}
// ---------- 1.2 Path to $100K ----------
const NEXT = { Lead: 'Book a meeting', Pitched: 'Send the proposal', 'Touring / Listed': 'Get an LOI or tour', 'Under contract': 'Clear the next deadline' };
export function pathHTML() {
  const c = cfg(), D = deals(), paid0 = capPaid(); let paid = 0, closed = 0;
  for (const d of D.filter(d => d.stage === 'Closed' && String(d.close || d.created || '').slice(0, 4) === yr())) { const g = gross(d); closed += takeHome(g, paid); paid += Math.min(g * (1 - c.split / 100), Math.max(0, c.cap - paid)); }
  const open = D.filter(d => d.stage !== 'Closed'), signed = open.filter(d => d.stage === 'Under contract').reduce((a, d) => a + takeHome(gross(d), paid0), 0), weighted = open.reduce((a, d) => a + takeHome(gross(d), paid0) * (PROB[d.stage] || 0), 0);
  const top3 = [...open].sort((a, b) => gross(b) - gross(a)).slice(0, 3), avg = top3.length ? top3.reduce((a, d) => a + takeHome(gross(d), paid0), 0) / top3.length : takeHomeValue(c.typical);
  const left = Math.max(0, c.goal - closed - signed), need = avg ? Math.ceil(left / avg) : 0;
  const likely = [...open].sort((a, b) => takeHome(gross(b)) * (PROB[b.stage] || 0) - takeHome(gross(a)) * (PROB[a.stage] || 0)).slice(0, 3);
  const nextOf = d => { const k = ['dd', 'fin', 'appr', 'close'].map(x => d[x]).filter(x => x && x >= today()).sort()[0]; const f = [...S.followups.values()].filter(f => !f.done && f.ownerId && f.ownerId === d.oid).sort((a, b) => a.due.localeCompare(b.due))[0]; return [NEXT[d.stage] || 'Next step', k || (f && f.due) || addDays(today(), 2)]; };
  const pc = Math.min(100, closed / c.goal * 100), ps = Math.min(100 - pc, signed / c.goal * 100), pw = Math.min(100 - pc - ps, weighted / c.goal * 100);
  return `<section class="card pathcard" style="padding:14px;margin:8px 0"><div class="ch"><h2 style="margin:0">Path to ${kmoney(c.goal)}</h2><a class="sm" href="#/deals">Deals ›</a></div>
   <div class="earn"><div><span>Closed</span><b>${kmoney(closed) || '$0'}</b></div><div><span>Signed, not closed</span><b>${kmoney(signed) || '$0'}</b></div><div><span>Weighted pipeline</span><b>${kmoney(weighted) || '$0'}</b></div></div>
   <div class="gbar"><i style="width:${pc}%"></i><i class="ex" style="width:${ps}%;opacity:.7"></i><i class="ex" style="width:${pw}%;opacity:.35"></i></div>
   <div style="margin-top:6px">${left ? `You need <b>${need}</b> more deal${need === 1 ? '' : 's'} like ${top3.length ? 'your top 3' : 'a typical ' + kmoney(c.typical) + ' sale'}${c.goalDate ? ` by ${esc(c.goalDate)}` : ''}.` : '<b>Goal covered by closed + signed deals.</b>'}</div>
   ${likely.length ? `<ol class="xs" style="padding-left:18px;margin:6px 0 0">${likely.map(d => { const [s, due] = nextOf(d); return `<li><b>${esc(d.name)}</b> · ${esc(d.stage)} · ≈ ${kmoney(takeHome(gross(d), paid0))} to you: ${esc(s)} by ${esc(due)}</li>`; }).join('')}</ol>` : '<div class="xs muted">No deals yet. Tap "Interested" on a call or add one in Deals.</div>'}
   <div class="xs muted">Take-home uses your split ${c.split}% until the Real cap (${kmoney(c.cap)} company dollar), then 100%. Estimates.</div></section>`;
}
// ---------- 1.9 My 10 target deals ----------
export const targets = () => setting('targets', []) || [];
export async function togglePin(pid) { let T = targets(); T = T.includes(pid) ? T.filter(x => x !== pid) : [...T, pid].slice(-10); await setSetting('targets', T); toast(T.includes(pid) ? 'Pinned to My 10 target deals' : 'Unpinned'); }
export const pinBtn = pid => `<button class="btn sm" data-pin="${esc(pid)}">${targets().includes(pid) ? '★ Pinned target' : '☆ Pin as target'}</button>`;
export function targetsHTML() { const T = targets().filter(id => S.prop.has(id)); if (!T.length) return ''; return `<section class="card" style="padding:12px;margin:8px 0"><h2 style="margin:0 0 4px">My 10 target deals <span class="cnt">${T.length}</span></h2>${T.map(id => { const p = S.prop.get(id), o = S.owners.get(p.ownerId); return `<div class="nbr"><div><a href="#/property/${esc(id)}"><b>${esc(nc(val(p, 'address') || p.pin))}</b></a><div class="xs muted">${esc(nc(o ? o.name : val(p, 'taxpayer') || ''))} ${chip(deal(p).value)}</div></div>${dnc(o) ? '<span class="tag">DNC</span>' : `<button class="btn sm" data-call="${esc(id)}">Call</button>`}</div>`; }).join('')}</section>`; }
// ---------- 1.4 live-deal guard ----------
export function guardHTML() {
  const live = deals().filter(d => d.stage !== 'Closed' && d.stage !== 'Lead' && takeHome(gross(d)) >= 50000).length; if (live >= 5) return '';
  const best = bigDealLeads().filter(x => !deals().some(d => d.pid === x.p.id)).slice(0, 3);
  return `<div class="card" style="background:#fef9c3;border-color:#facc15;padding:12px;margin:8px 0"><b>Keep 5 big deals alive to close 1.</b> <span class="xs">You have ${live} worth $50K+ to you at Pitched or later.</span>${best.map(x => `<div class="nbr"><div><a href="#/property/${esc(x.p.id)}">${esc(nc(val(x.p, 'address') || x.p.pin))}</a><div class="xs muted">${esc(x.T[0].t)} · ≈ ${kmoney(x.th)} to you (est.)</div></div><button class="btn sm primary" data-adddeal="${esc(x.p.id)}">Add</button></div>`).join('')}</div>`;
}
export async function addDealFor(pid, stage = 'Lead') { const p = S.prop.get(pid); if (!p) return; const D = deals(); if (D.some(d => d.pid === pid && d.stage !== 'Closed')) return toast('Already in your deals'); D.unshift({ id: uid('d'), oid: p.ownerId || '', pid, name: nc(val(p, 'address') || 'Deal'), stage, value: Math.round(deal(p).value || 0) || '', kind: 'sale', created: today() }); await saveDeals(D); toast('Added to Deals'); }
// ---------- 1.6 deal-killer dates ----------
const KD = [['dd', 'Due diligence ends'], ['fin', 'Financing deadline'], ['appr', 'Appraisal'], ['close', 'Closing']];
export function overdueHTML() { const t = today(), L = []; for (const d of deals()) if (d.stage === 'Under contract') for (const [k, l] of KD) if (d[k] && d[k] < t && !(d.done || {})[k]) L.push([d, l, d[k]]);
  return L.length ? `<div class="card" style="background:#fee2e2;border-color:#dc2626;padding:12px;margin:8px 0"><b style="color:#b91c1c">Overdue deal deadlines</b>${L.map(([d, l, x]) => `<div class="xs"><a href="#/deals">${esc(d.name)}</a>: ${esc(l)} was ${esc(x)}</div>`).join('')}</div>` : ''; }
// ---------- 1.5 commission protection ----------
const CHK = [['agr', 'Signed listing or tenant/buyer rep agreement'], ['terms', 'Commission terms in writing'], ['cobk', 'Co-broker split agreed'], ['reg', 'Registration letter sent'], ['real', 'Transaction submitted to Real']];
// ---------- 1.8 weekly scorecard ----------
export function scorecardHTML() {
  const t = today(), dow = (new Date().getDay() + 6) % 7, mon = addDays(t, -dow), two = addDays(t, -13), O = setting('outc', {}) || {}, man = setting('manualCounts', {}) || {}; let dials = 0, conv = 0, mtg = 0, prop = 0; const perDay = {};
  for (const k in O) for (const e of O[k]) { perDay[e.d] = (perDay[e.d] || 0) + 1; if (e.d >= mon) { dials++; if (['talked', 'int', 'no', 'mtg', 'prop'].includes(e.o)) conv++; if (e.o === 'mtg') mtg++; } if (e.d >= two && e.o === 'prop') prop++; }
  for (const d in man) { if (d >= mon) mtg += man[d].mtg || 0; if (d >= two) prop += man[d].prop || 0; }
  let streak = 0; for (let i = 0; i < 60; i++) { const d = addDays(t, -i); if ((perDay[d] || 0) >= 60) streak++; else if (i > 0) break; }
  const cell = (l, n, goal, extra = '') => `<div style="flex:1;min-width:72px;text-align:center"><div class="xs muted">${l}</div><b style="font-size:20px">${n}</b><span class="xs muted">/${goal}</span><div class="gbar"><i style="width:${Math.min(100, n / goal * 100)}%"></i></div>${extra}</div>`;
  return `<section class="card" style="padding:12px;margin:8px 0"><div class="ch"><h2 style="margin:0">This week</h2><span class="xs muted">since Mon ${esc(mon)}${streak ? ` · ${streak}-day streak of 60+ dials` : ''}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${cell('Dials', dials, 300)}${cell('Conversations', conv, 25)}${cell('Meetings / tours', mtg, 3, '<button class="btn sm ghost" data-man="mtg">+1</button>')}${cell('Proposals (2 wks)', prop, 1, '<button class="btn sm ghost" data-man="prop">+1</button>')}</div></section>`;
}
export function bindMoney(root, re) {
  $$('[data-pin]', root).forEach(b => b.onclick = async () => { await togglePin(b.dataset.pin); re(); });
  $$('[data-adddeal]', root).forEach(b => b.onclick = async () => { await addDealFor(b.dataset.adddeal); re(); });
  $$('[data-man]', root).forEach(b => b.onclick = async () => { const M = { ...(setting('manualCounts', {}) || {}) }, t = today(); M[t] = { ...(M[t] || {}) }; M[t][b.dataset.man] = (M[t][b.dataset.man] || 0) + 1; await setSetting('manualCounts', M); re(); });
}
// ---------- 1.3 card for the 90-day list ----------
export function bigCardHTML(x, i) { const ph = x.o && x.o.phone; return `<div class="pcall"><div class="pc-top"><span class="pc-n">${i + 1}</span><div class="pc-who"><a href="#/property/${esc(x.p.id)}"><b>${esc(nc(val(x.p, 'address') || x.p.pin))}</b></a><span class="xs muted">${esc(nc(x.o ? x.o.name : val(x.p, 'taxpayer') || ''))} · ${esc(nc(val(x.p, 'city') || ''))}${sfOf(x.p).sf ? ' · ' + fmt(sfOf(x.p).sf) + ' SF' : ''}</span></div><button class="bact primary pc-call" data-call="${esc(x.p.id)}">Call</button></div>
  <div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">${x.days != null ? `<span class="tag" style="background:#fde68a">${esc(x.T.find(t => t.d === x.days).t)}</span>` : ''}${chip(x.v)}</div><div class="pc-why">${esc(x.T.filter(t => t.d !== x.days).map(t => t.t).join(' · '))}</div></div>`; }
// ---------- Deals screen (Deals tab) ----------
export function dealsView(el) {
  const c = cfg(), D = deals(), paid0 = capPaid(), t = today();
  const months = {}; for (const d of D) if (d.stage !== 'Closed' && d.close) { const m = addDays(d.close, +c.lag || 10).slice(0, 7); months[m] = (months[m] || 0) + takeHome(gross(d), paid0) * (PROB[d.stage] || 0); }
  const mk = Object.keys(months).sort().slice(0, 12), mx = Math.max(1, ...Object.values(months));
  const T = terr(), num = (k, l, step = 1) => `<label>${l}<input data-cfg="${k}" type="number" inputmode="decimal" step="${step}" value="${esc(c[k])}"></label>`;
  el.innerHTML = `<div class="page narrow"><h1>Deals</h1><p class="explain">Your pipeline, take-home after split and cap, deadlines and commission protection. Big leads live here too.</p>
   ${pathHTML()}
   <div class="btnrow" style="flex-wrap:wrap;margin:8px 0"><a class="btn" href="#/offmarket">Off-Market</a><a class="btn" href="#/big">Big Deals</a><a class="btn" href="#/stack">Stacked</a><a class="btn" href="#/requirements">Buyers</a><a class="btn" href="#/leases">Leases</a><a class="btn" href="#/prospect">Prospecting</a></div>
   <section class="card" style="padding:12px"><div class="ch"><h2 style="margin:0">Your deals <span class="cnt">${D.length}</span></h2><button class="btn sm primary" id="nd">+ Deal</button></div>
   ${D.map(d => { const g = gross(d), th = takeHome(g, paid0), miss = CHK.filter(([k]) => !(d.chk || {})[k]).length, uc = d.stage === 'Under contract';
     return `<div class="deal" data-did="${esc(d.id)}" style="border-top:1px solid var(--line2);padding:10px 0"><div class="dl-h">${d.pid ? `<a href="#/property/${esc(d.pid)}"><b>${esc(d.name)}</b></a>` : `<input data-df="name" value="${esc(d.name)}">`} ${miss && d.stage !== 'Lead' ? `<span class="tag" style="background:#dc2626;color:#fff">Fee at risk: ${miss} open</span>` : ''}</div>
     <div class="dl-f"><select data-df="stage">${STAGES5.map(s => `<option ${s === d.stage ? 'selected' : ''}>${s}</option>`).join('')}</select><select data-df="kind">${[['sale', 'Sale'], ['lease', 'Lease (total value)'], ['resi', 'Residential']].map(([k, l]) => `<option value="${k}" ${k === (d.kind || 'sale') ? 'selected' : ''}>${l}</option>`).join('')}</select><label>Value $<input data-df="value" type="number" inputmode="numeric" value="${esc(d.value)}"></label><label>Comm % (blank = default)<input data-df="comm" type="number" step="0.25" inputmode="decimal" value="${esc(d.comm ?? '')}"></label><span class="dl-c">≈ ${kmoney(th) || '$0'} to you</span></div>
     <details><summary class="xs">Commission protection (${5 - miss}/5)</summary>${CHK.map(([k, l]) => `<label class="xs" style="display:flex;gap:8px;min-height:44px;align-items:center"><input type="checkbox" data-chk="${k}" ${(d.chk || {})[k] ? 'checked' : ''}> ${l}</label>`).join('')}</details>
     ${uc ? `<div class="dl-f">${KD.map(([k, l]) => `<label>${l}<input type="date" data-kd="${k}" value="${esc(d[k] || '')}"></label>`).join('')}</div><div class="xs muted">Follow-ups are set 7 and 2 days before each date.</div>` : `<div class="dl-f"><label>Expected close<input type="date" data-df="close" value="${esc(d.close || '')}"></label></div>`}
     <button class="btn sm ghost" data-ddel>Remove</button></div>`; }).join('') || '<div class="muted">No deals yet.</div>'}</section>
   <section class="card" style="padding:12px;margin-top:10px"><h2 style="margin:0">Cash timeline <span class="xs muted">(expected, weighted by stage, paid ${c.lag} days after close)</span></h2>${mk.length ? mk.map(m => `<div style="display:flex;align-items:center;gap:8px;min-height:28px"><span class="xs" style="width:60px">${m}</span><div style="flex:1;background:var(--line2);border-radius:6px;height:14px"><div style="width:${months[m] / mx * 100}%;background:#16a34a;height:14px;border-radius:6px"></div></div><b class="xs">${kmoney(months[m])}</b></div>`).join('') : '<div class="xs muted">Add expected close dates to see cash by month.</div>'}</section>
   <details class="card" style="padding:12px;margin-top:10px" ${setting('money', null) ? '' : 'open'}><summary><b>Money settings</b></summary><div class="dl-f">${num('sale', 'Sale commission %', .25)}${num('lease', 'Lease commission % (of total lease value)', .25)}${num('resi', 'Residential %', .25)}${num('split', 'Your split %')}${num('cap', 'Real annual cap $')}${num('goal', 'Goal $')}<label>Goal date<input data-cfg="goalDate" type="date" value="${esc(c.goalDate)}"></label>${num('typical', 'Typical deal size $')}${num('big', '90-Day Big Deal: min take-home $')}${num('lag', 'Payout lag (days)')}${num('rent', 'Typical industrial rent $/SF/yr (lease radar estimate)', .25)}</div><div class="xs muted">Real Brokerage: split until the ${kmoney(c.cap)} cap is paid, then 100%. Team: John Boska.</div></details>
   <details class="card" style="padding:12px;margin-top:10px"><summary><b>Territory</b> <span class="xs muted">filters Today</span></summary><div class="xs">Property types</div><div class="chips">${[['industrial', 'Industrial buildings'], ['land', 'Land']].map(([k, l]) => `<label class="fchip" style="min-height:44px"><input type="checkbox" data-tt="${k}" ${(T.types || []).includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div><label class="full">Towns (comma separated)<input id="ttowns" value="${esc(T.towns || '')}" placeholder="Elk Grove Village, Bensenville"></label><label class="full">ZIPs<input id="tzips" value="${esc(T.zips || '')}" placeholder="60007, 60106"></label><div class="xs muted">Empty = all of Chicagoland.</div>
     <div style="margin-top:10px"><b>Residential + apartments/retail (Cook)</b><div class="xs muted">Loads Cook County parcels, owners and sales for your territory ZIPs (1 to 6) from free Cook open data. Stored on this device. Property and ownership facts only; no demographic data.</div>
     <div class="xs">${(() => { const L = setting('creLoaded', null); return L ? `Loaded ${fmt(L.n)} parcels for ${esc(L.zips)} on ${esc(L.d)}.` : 'Not loaded yet.'; })()}</div><button class="btn" id="creload" style="width:100%;margin-top:6px">Load / refresh territory data</button><div id="crest" class="xs"></div>
     <label>Residential calls per day (of 10)<input id="rcap" type="number" inputmode="numeric" value="${esc(setting('resiCap', 3))}"></label></div></details>
   <details class="card" style="padding:12px;margin-top:10px" id="bridge"><summary><b>Commercial opportunities from residential</b> <span class="xs muted">3+ properties, 2-6 units or a business</span></summary><div id="bridgeb" class="xs">Loading…</div></details></div>`;
  const re = () => dealsView(el), upd = async (id, f) => { await saveDeals(deals().map(d => d.id === id ? f({ ...d }) : d)); };
  $$('[data-cfg]', el).forEach(i => i.onchange = async () => { const m = { ...cfg() }; m[i.dataset.cfg] = i.type === 'number' ? +i.value : i.value; await setSetting('money', m); BIG = null; re(); });
  $('#nd', el).onclick = async () => { const D2 = deals(); D2.unshift({ id: uid('d'), name: 'New deal', stage: 'Lead', kind: 'sale', value: '', created: t }); await saveDeals(D2); re(); };
  $$('.deal', el).forEach(row => { const id = row.dataset.did;
    $$('[data-df]', row).forEach(i => i.onchange = async () => { await upd(id, d => { d[i.dataset.df] = i.type === 'number' ? (i.value === '' ? '' : +i.value) : i.value; if (i.dataset.df === 'stage') d.moved = today(); if (i.dataset.df === 'stage' && i.value === 'Closed' && !d.close) d.close = today(); return d; }); re(); });
    $$('[data-chk]', row).forEach(i => i.onchange = async () => { await upd(id, d => { d.chk = { ...(d.chk || {}), [i.dataset.chk]: i.checked }; return d; }); re(); });
    $$('[data-kd]', row).forEach(i => i.onchange = async () => { const d0 = deals().find(d => d.id === id); await upd(id, d => { d[i.dataset.kd] = i.value; return d; }); const l = KD.find(x => x[0] === i.dataset.kd)[1];
      if (i.value) for (const n of [7, 2]) { const due = addDays(i.value, -n); if (due >= today()) await addFollowup({ ownerId: d0.oid || '', propertyId: d0.pid || '', due, note: `${d0.name}: ${l} in ${n} days (${i.value})` }); } toast('Saved · reminders set'); re(); });
    $('[data-ddel]', row).onclick = async () => { await saveDeals(deals().filter(d => d.id !== id)); re(); }; });
  $$('[data-tt]', el).forEach(i => i.onchange = async () => { const T2 = { ...terr() }; T2.types = $$('[data-tt]:checked', el).map(x => x.dataset.tt); await setSetting('territory', T2); await setSetting('plan', null); BIG = null; });
  $('#ttowns', el).onchange = async e => { await setSetting('territory', { ...terr(), towns: e.target.value }); await setSetting('plan', null); BIG = null; };
  $('#creload', el).onclick = async () => { const st = $('#crest', el); try { const n = await (await import('./cre.js')).loadTerritory(m => st.textContent = m); toast(`Loaded ${fmt(n)} parcels`); re(); } catch (e) { st.textContent = e.message; } };
  $('#rcap', el).onchange = async e => { await setSetting('resiCap', Math.max(0, Math.min(10, +e.target.value || 0))); await setSetting('plan', null); };
  $('#bridge', el).addEventListener('toggle', async () => { const b = $('#bridgeb', el); if (b.dataset.done) return; b.dataset.done = 1; b.innerHTML = await (await import('./resi.js')).bridgeHTML(); });
  $('#tzips', el).onchange = async e => { await setSetting('territory', { ...terr(), zips: e.target.value }); await setSetting('plan', null); BIG = null; };
}
