// Pro layer: deal intelligence on every property, a command-center header on Today,
// the Stacked Opportunities view and a Cmd/Ctrl+K command palette.
// Runs entirely on this device from data already loaded. No API, no network calls.
import { S, val } from './store.js';
import { scoreOf, deal, sfOf, freshFor, freshText } from './scoring.js';
import { esc, fmt, kmoney, today, daysBetween, scorePill, d8 } from './util.js';
import { leaseFlag, leaseList, slbTargets, occupants, ownerOccupied } from './adv.js';
import { nearbySales } from './comps.js';

const YR = new Date().getFullYear();
const nc = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const med = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const yrsAgo = d => d ? (Date.now() - new Date(d + 'T12:00:00')) / (365.25 * 864e5) : 99;
const ownerOf = p => (p.ownerId && S.owners.get(p.ownerId)) || null;
const ownerName = p => ownerOf(p)?.name || val(p, 'taxpayer') || p.own || 'Unknown owner';
const addrOf = p => nc(val(p, 'address') || p.addr || p.pin);
const cityOf = p => val(p, 'city') || p.city || '';
const warnDate = p => (String(p.warn || '').match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';

// ---------- signals: every reason this property could transact ----------
// kind: 'opp' counts toward the stack, 'risk' is a leverage / caution flag, 'inc' is an incentive
export function signals(p) {
  const L = [], add = (k, kind, label, talk, d) => L.push({ k, kind, label, talk, d: d || '' });
  const sc = scoreOf(p), bsf = sfOf(p).sf;
  if (+p.hold >= 15) add('hold', 'opp', `Held ${Math.floor(+p.hold)}+ yrs`, `They've owned it ${Math.floor(+p.hold)}+ years, likely a low basis and a lot of equity.`);
  if (p.abs === 'oos' || (p.mst && String(p.mst).toUpperCase() !== 'IL')) add('oos', 'opp', `Owner out of state (${esc(p.mst || '')})`, `Owner gets the tax bill in ${esc(p.mcity ? nc(p.mcity) + ', ' : '')}${esc(p.mst || 'another state')}, managing from a distance.`);
  else if (p.abs === 'abs' || p.abs === true) add('abs', 'weak', 'Absentee owner', 'Tax bill goes to a different address, so the owner likely is not on site.');
  if (p.ot === 'trust') add('trust', 'opp', 'Trust owned', 'Held in a trust: often estate or succession planning, ask who makes decisions.');
  if (p.ot === 'estate') add('estate', 'opp', 'Estate owned', 'Owned by an estate: heirs often prefer cash to a building.');
  if (p.ot === 'individual') add('indiv', 'weak', 'Individual owner', 'Owned by an individual, not a fund. One decision maker.');
  if (p.tdel) add('tdel', 'opp', 'Tax delinquent', 'On the county delinquent-tax list: possible cash-flow pressure (verify current status first).', p.tdel);
  if (p.appeal && +p.appeal.y >= YR - 1) add('appeal', 'opp', `Appealed taxes ${p.appeal.y}`, `Appealed their assessment in ${p.appeal.y}${p.appeal.pct ? ` (${p.appeal.pct}%)` : ''}: cost-sensitive owner.`, `${p.appeal.y}-06-30`);
  if (p.warn) add('warn', 'opp', 'WARN notice', `${esc(p.warn)}: space may come back as a sublease or sale.`, warnDate(p));
  const lf = leaseFlag(p); if (lf) add('lease', 'opp', `Lease event ~${lf.due.slice(0, 7)}`, `Estimated ${lf.yrs}-year lease anniversary around ${d8(lf.due)}, a natural renewal or move decision.`, lf.due);
  const oo = ownerOccupied(p); if (oo && +p.hold >= 10) add('slb', 'opp', 'Sale-leaseback fit', `Owner appears to occupy the building (${esc(nc(oo.n || ''))}): pitch selling and staying as tenant to unlock equity.`);
  if (p.sba) add('sba', 'opp', 'SBA 504 loan', 'Owner-user with an SBA 504 loan: knows its occupancy costs well, a refinance or sale-leaseback angle.', (String(p.sba).match(/(\d{4}-\d{2}-\d{2})/) || [])[1]);
  if (p.vac) add('vac', 'opp', 'Vacant / partly vacant', 'Flagged vacant: carrying costs with no income, motivated to lease or sell.');
  if (+p.bv > 0) add('bv', 'opp', `${p.bv} building violation${+p.bv > 1 ? 's' : ''}`, 'Open city building violations: deferred maintenance the owner may not want to fix.', p.bvl);
  if (p.dsale) add('dsale', 'opp', 'Distressed sale history', `Prior ${esc(p.dsale)}.`);
  const avb = +p.avb, avt = +p.avt; if (avt > 0 && avb / avt < 0.2 && (bsf || +p.lsf > 43560)) add('under', 'opp', 'Underused site', `Building is only ${Math.round(avb / avt * 100)}% of assessed value: land play or redevelopment.`);
  if (p.fed) add('fed', 'opp', 'Federal contract win', `${esc(nc(p.fed.n))} won a ${kmoney(p.fed.amt)} federal award (${p.fed.d}): may need more space.`, p.fed.d);
  const recent = [...(p.cperm || []), ...(p.perm || [])].filter(x => x.d && yrsAgo(x.d) < 1.5 && +x.amt >= 250000);
  if (recent.length) { const x = recent.sort((a, b) => b.amt - a.amt)[0]; add('invest', 'opp', 'Major recent permit', `${kmoney(x.amt)} permit ${x.d} (${esc(String(x.desc || x.type || '').slice(0, 60).toLowerCase())}): active investment or a new occupant.`, x.d); }
  const fr = freshFor(p, 120); if (fr.length) add('fresh', 'opp', 'Recent record change', esc(freshText(fr[0])), fr[0].d);
  if (p.sd && yrsAgo(p.sd) < 1.5) add('newown', 'opp', 'New owner', `Bought ${d8(p.sd)}${+p.sp ? ` for ${kmoney(+p.sp)}` : ''}: new owners re-tenant, reposition or flip.`, p.sd);
  // risk / leverage
  if (p.flood && p.flood.z) add('flood', 'risk', `Flood zone ${esc(p.flood.z)}`, `FEMA flood zone ${esc(p.flood.z)}: insurance cost, a buyer will discount for it.`);
  if (bsf && +p.yb && +p.yb < 1975) add('old', 'risk', `Built ${p.yb}`, `Built ${p.yb}: likely low clear height, functionally dated for modern users.`);
  if (+p.v311 > 0) add('311', 'risk', '311 complaints', 'Recent 311 complaints on file.', p.v311l);
  // incentives
  if (p.tif) add('tif', 'inc', `TIF: ${esc(p.tif)}`, `In the ${esc(p.tif)} TIF${p.tifx ? ` (expires ${p.tifx.slice(0, 4)})` : ''}: incentive money for a buyer or user.`);
  if (p.ez) add('ez', 'inc', 'Enterprise zone', `${esc(p.ez)}: sales tax and incentive benefits for a user.`);
  if (p.oz === 'Yes') add('oz', 'inc', 'Opportunity zone', 'Federal Opportunity Zone: capital-gains benefits for an investor buyer.');
  if (p.prox && +p.prox.railft && +p.prox.railft < 500) add('rail', 'inc', 'Rail adjacent', `Next to ${esc(p.prox.rail)}: rare for rail-served users.`);
  L.score = sc.score; return L;
}
export const stackOf = p => signals(p).filter(s => s.kind === 'opp');
// weak signals (very common) show as chips but never count toward the stack

// ---------- value: three independent estimates, shown as a range ----------
let psfIdx = { v: -1 };
function psfIndex() {
  if (psfIdx.v === S.version) return psfIdx;
  const city = new Map(), county = new Map(), put = (m, k, x) => { if (!m.has(k)) m.set(k, []); m.get(k).push(x); };
  for (const p of S.props) { const sf = +p.bsf; if (!sf || sf < 2000 || !+p.mv || p.mvest) continue; const x = +p.mv / sf; if (x < 5 || x > 600) continue; put(city, cityOf(p), x); put(county, p.co, x); }
  for (const m of [city, county]) for (const a of m.values()) a.sort((a, b) => a - b);
  psfIdx = { v: S.version, city, county }; return psfIdx;
}
const pctile = (arr, x) => { if (!arr || arr.length < 8) return null; let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return Math.round(lo / arr.length * 100); };
export function valuation(p) {
  const sf = sfOf(p).sf, est = [];
  if (sf && p.cval && +p.cval.mvsf) est.push({ src: `Assessor income approach (${p.cval.y}: rent $${p.cval.rent}/SF, ${Math.round(p.cval.cap * 1000) / 10}% cap)`, v: +p.cval.mvsf * sf });
  if (+p.mv && !p.mvest) est.push({ src: 'Assessor market value', v: +p.mv });
  const comps = sf ? nearbySales(p, 8).filter(c => c.psf > 10 && c.psf < 600) : [];
  if (comps.length >= 3) { const m = med(comps.map(c => c.psf)); if (m > 10) est.push({ src: `${comps.length} nearby sales, median $${Math.round(m)}/SF`, v: m * sf }); }
  if (+p.sp && p.sd && yrsAgo(p.sd) < 6) est.push({ src: `Last sale ${p.sd.slice(0, 4)}`, v: +p.sp * Math.pow(1.04, yrsAgo(p.sd)) });
  if (!est.length) { const d = deal(p); if (d.value) est.push({ src: d.kind, v: d.value }); }
  const vs = est.map(e => e.v).filter(v => v > 0);
  const out = { est, sf, lo: vs.length ? Math.min(...vs) : 0, hi: vs.length ? Math.max(...vs) : 0, mid: med(vs) };
  if (sf && p.cval && +p.cval.rent) out.rent = +p.cval.rent * sf;
  if (sf && +p.mv && !p.mvest) { const I = psfIndex(), x = +p.mv / sf; out.psf = x; out.pCity = pctile(I.city.get(cityOf(p)), x); out.pCounty = pctile(I.county.get(p.co), x); }
  return out;
}

// ---------- deal thesis ----------
export function thesis(p, sig = signals(p)) {
  const has = k => sig.some(s => s.k === k), opp = sig.filter(s => s.kind === 'opp').length, T = [];
  if (has('warn')) T.push(['Sublease or disposition', 'A WARN notice means the occupant is closing or cutting staff. Call the landlord about backfilling and the tenant about subleasing.']);
  if (has('lease')) T.push(['Lease renewal or relocation', 'An estimated lease anniversary is coming. Reach the tenant 12 to 18 months ahead, before the landlord\'s broker does.']);
  if (has('slb')) T.push(['Sale-leaseback', 'The owner seems to run its business here. Pitch selling the building and leasing it back to free up cash.']);
  if (has('tdel') || has('dsale') || has('bv')) T.push(['Motivated or distressed sale', 'Financial or physical distress signals. Lead with speed and certainty of close.']);
  if (has('under')) T.push(['Land or redevelopment sale', 'The land is worth far more than the building. Position it to developers and outdoor-storage users.']);
  if (has('newown')) T.push(['New owner: leasing assignment', 'Recent buyers need tenants or a repositioning plan. Offer to lease it up.']);
  if ((has('hold') || has('oos') || has('trust') || has('estate')) && scoreOf(p).score >= 60) T.push(['Off-market sale', 'Long-term, distant or estate-style ownership. Open with a free value estimate.']);
  if (has('fed') || has('invest')) T.push(['Tenant expansion', 'Growth signals at this address. The occupant may need more space soon.']);
  if (!T.length) T.push(['Relationship / nurture', 'Few public signals. Introduce yourself, offer market updates, and follow up quarterly.']);
  const conf = opp >= 5 ? 'High' : opp >= 3 ? 'Medium' : 'Low';
  return { primary: T[0], alt: T.slice(1, 3), conf, opp };
}

// ---------- timeline of every dated public record ----------
function timeline(p) {
  const E = [], t = today(), add = (d, label, cls = '') => { if (d && /^\d{4}/.test(d)) E.push({ d: String(d).slice(0, 10), label, cls, future: String(d) > t }); };
  if (p.sd) add(p.sd, `Sold${+p.sp ? ' for ' + kmoney(+p.sp) : ''}${p.buyer ? ' to ' + esc(nc(p.buyer)) : ''}`, 'ev-sale');
  for (const x of [...(p.perm || []), ...(p.cperm || [])]) add(x.d, `Permit ${+x.amt ? kmoney(+x.amt) : ''}: ${esc(String(x.desc || x.type || '').slice(0, 70).toLowerCase())}`, 'ev-perm');
  if (p.appeal && p.appeal.y) add(`${p.appeal.y}-06-30`, `Tax appeal filed${p.appeal.pct ? ` (${p.appeal.pct}%)` : ''}`, 'ev-tax');
  if (p.tdel) add(p.tdel, 'On county delinquent-tax list', 'ev-risk');
  if (p.warn) add(warnDate(p), esc(p.warn), 'ev-risk');
  if (p.bvl) add(p.bvl, `${p.bv} building violation(s), latest`, 'ev-risk');
  if (p.fed) add(p.fed.d, `Federal award ${kmoney(p.fed.amt)} to ${esc(nc(p.fed.n))}`, 'ev-good');
  const sbaD = (String(p.sba || '').match(/(\d{4}-\d{2}-\d{2})/) || [])[1]; if (sbaD) add(sbaD, 'SBA 504 loan approved', 'ev-good');
  for (const e of freshFor(p, 400)) add(e.d, esc(freshText(e)), 'ev-sale');
  const lf = leaseFlag(p); if (lf) add(lf.due, `Estimated lease event (${lf.yrs}-yr anniversary)`, 'ev-lease');
  if (p.tifx) add(p.tifx, `TIF ${esc(p.tif || '')} expires`, 'ev-inc');
  const seen = new Set(); return E.filter(e => { const k = e.d + e.label; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 12);
}

// ---------- owner portfolio ----------
function portfolio(p) {
  if (!p.ownerId) return null;
  const L = S.props.filter(q => q.ownerId === p.ownerId); if (L.length < 2) return null;
  const sf = L.reduce((a, q) => a + (sfOf(q).sf || 0), 0), mv = L.reduce((a, q) => a + (+q.mv || 0), 0);
  const ranked = L.map(q => ({ q, s: scoreOf(q).score })).sort((a, b) => b.s - a.s);
  return { n: L.length, sf, mv, ranked, counties: [...new Set(L.map(q => q.co))] };
}

// ---------- property page: Deal Intelligence ----------
function callBrief(p, sig, th, v) {
  const o = ownerOf(p), lines = [];
  const where = p.mcity ? ` (tax bill: ${nc(p.mcity)}, ${p.mst || ''})` : '';
  lines.push(['Who', `${esc(nc(ownerName(p)))}${esc(where)}${p.ot && p.ot !== 'other' ? ` · ${p.ot}` : ''}`]);
  lines.push(['History', +p.hold ? `Owned ${Math.floor(+p.hold)}${p.holdplus ? '+' : ''} yrs${p.sd && +p.sp ? `, bought ${p.sd.slice(0, 4)} for ${kmoney(+p.sp)}` : ''}` : (p.sd ? `Last sale ${p.sd}` : 'No recorded sale on file')]);
  const ev = sig.filter(s => s.d && s.kind === 'opp').sort((a, b) => b.d.localeCompare(a.d))[0];
  lines.push(['What changed', ev ? `${ev.label} (${ev.d.slice(0, 10)})` : 'Nothing new on record: lead with market info']);
  lines.push(['Angle', `${th.primary[0]}${v.mid ? `. Est. value ${v.hi - v.lo < v.mid * 0.08 ? 'about ' + kmoney(v.mid) : kmoney(v.lo) + ' to ' + kmoney(v.hi)}` : ''}`]);
  const ask = th.primary[0].startsWith('Sublease') ? 'Ask: "Are you planning to keep the space or put it on the market?"'
    : th.primary[0].startsWith('Lease') ? 'Ask: "When is your lease up, and have you started thinking about renew vs. move?"'
    : th.primary[0].startsWith('Sale-leaseback') ? 'Ask: "Have you ever considered selling the building and staying as the tenant?"'
    : th.primary[0].startsWith('Tenant expansion') ? 'Ask: "Are you running out of room here?"'
    : th.primary[0].startsWith('New owner') ? 'Ask: "What\'s your plan for the building, and do you need help leasing it?"'
    : 'Ask: "Can I put together a free value estimate on your building?"';
  lines.push(['The ask', ask]);
  const occ = occupants(p).find(x => x.tel); if (occ) lines.push(['Occupant phone', `${esc(nc(occ.n))}: <a href="tel:${esc(occ.tel)}">${esc(occ.tel)}</a>`]);
  if (o && o.phone) lines.push(['Owner phone', `<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>`]);
  return lines;
}
function pctBar(label, p) { if (p == null) return ''; return `<div class="pr-pct"><span>${label}</span><div class="pr-bar"><i style="width:${p}%"></i><b style="left:${p}%"></b></div><em>${p}th pct</em></div>`; }
export function intelHTML(p) {
  const sig = signals(p), th = thesis(p, sig), v = valuation(p), tl = timeline(p), pf = portfolio(p), cb = callBrief(p, sig, th, v);
  const opp = sig.filter(s => s.kind === 'opp'), risk = sig.filter(s => s.kind === 'risk'), inc = sig.filter(s => s.kind === 'inc');
  const chip = s => `<span class="pr-chip k-${s.kind === 'weak' ? 'opp' : s.kind}">${s.label}</span>`;
  return `<section class="pr-intel" aria-label="Deal intelligence">
  <div class="pr-head"><div><div class="pr-eyebrow">Deal intelligence</div><div class="pr-thesis">${esc(th.primary[0])}</div><p>${esc(th.primary[1])}</p>${th.alt.length ? `<div class="pr-alt">Also: ${th.alt.map(a => esc(a[0])).join(' · ')}</div>` : ''}</div>
    <div class="pr-stackbox"><div class="pr-stacknum">${opp.length}</div><div class="pr-stacklbl">signals stacked</div><div class="pr-conf c-${th.conf.toLowerCase()}">${th.conf} confidence</div></div></div>
  <div class="pr-chips">${opp.map(chip).join('')}${sig.filter(s => s.kind === 'weak').map(chip).join('')}${risk.map(chip).join('')}${inc.map(chip).join('')}</div>
  <div class="pr-grid">
    <div class="pr-card pr-brief"><h4>Call brief <span>read before dialing</span></h4><dl>${cb.map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join('')}</dl></div>
    <div class="pr-card"><h4>Estimated value <span class="conf c-inf">Estimated</span></h4>
      ${v.mid ? `<div class="pr-big">${v.hi - v.lo < v.mid * 0.08 ? kmoney(v.mid) : `${kmoney(v.lo)}<small> to </small>${kmoney(v.hi)}`}</div><div class="pr-sub">midpoint ${kmoney(v.mid)}${v.sf ? ` · about $${Math.round(v.mid / v.sf)}/SF` : ''}</div>` : '<div class="muted">Not enough data for a value range.</div>'}
      ${v.rent ? `<div class="pr-kv"><span>Est. annual rent</span><b>${kmoney(v.rent)}</b></div>` : ''}
      ${v.psf ? `<div class="pr-kv"><span>Assessor value / SF</span><b>$${Math.round(v.psf)}</b></div>` : ''}
      ${pctBar(esc(cityOf(p) || 'Town'), v.pCity)}${pctBar(esc(p.co) + ' County', v.pCounty)}
      <ul class="pr-src">${v.est.map(e => `<li>${esc(e.src)}: <b>${kmoney(e.v)}</b></li>`).join('')}</ul></div>
    <div class="pr-card"><h4>Talking points</h4><ul class="pr-talk">${[...opp, ...sig.filter(s => s.kind === 'weak'), ...risk, ...inc].slice(0, 8).map(s => `<li class="k-${s.kind}">${s.talk}</li>`).join('') || '<li class="muted">No public signals yet.</li>'}</ul></div>
    <div class="pr-card"><h4>Record timeline</h4>${tl.length ? `<ol class="pr-tl">${tl.map(e => `<li class="${e.cls}${e.future ? ' fut' : ''}"><time>${e.future ? 'Upcoming · ' : ''}${d8(e.d)}</time><span>${e.label}</span></li>`).join('')}</ol>` : '<div class="muted">No dated records.</div>'}</div>
    ${pf ? `<div class="pr-card pr-port"><h4>Owner portfolio <span>${pf.n} properties</span></h4><div class="pr-kv"><span>Total building SF</span><b>${fmt(pf.sf)}</b></div><div class="pr-kv"><span>Total assessor value</span><b>${kmoney(pf.mv)}</b></div><div class="pr-kv"><span>Counties</span><b>${pf.counties.map(esc).join(', ')}</b></div>
      <div class="pr-entry">Best entry point: <a href="#/property/${pf.ranked[0].q.id}">${esc(addrOf(pf.ranked[0].q))}</a></div>
      <ul class="pr-plist">${pf.ranked.slice(0, 6).map(({ q, s }) => `<li${q.id === p.id ? ' class="cur"' : ''}><a href="#/property/${q.id}">${esc(addrOf(q))}</a><small>${esc(cityOf(q))}</small>${scorePill(s)}</li>`).join('')}</ul></div>` : ''}
  </div></section>`;
}

// ---------- Today: command-center KPI band ----------
let kpiCache = { v: -1 };
function kpis() {
  if (kpiCache.v === S.version) return kpiCache;
  let hot = 0, tdel = 0; const stk = new Set(); for (const p of S.props) { const s = scoreOf(p).score; if (s >= 85) hot++; if (s >= 60 && stackOf(p).length >= 3) stk.add((addrOf(p) + '|' + cityOf(p)).toLowerCase()); if (p.tdel) tdel++; } const stacked = stk.size;
  const t = today(), lease12 = leaseList().filter(x => daysBetween(t, x.f.due) <= 365).length, slb = slbTargets().length;
  const warn = (S.warn?.ev || []).filter(e => e.d && daysBetween(e.d, t) <= 90).length;
  const wk = (S.changes?.ev || []).filter(e => e.d && daysBetween(e.d, t) <= 7).length;
  kpiCache = { v: S.version, hot, stacked, tdel, lease12, slb, warn, wk }; return kpiCache;
}
function kpiHTML() {
  const k = kpis(), T = [
    ['Stacked opportunities', k.stacked, '3+ signals overlap', '#/stack', 'hot'],
    ['Hot owners', k.hot, 'Score 85+', '#/offmarket', ''],
    ['Lease events · 12 mo', k.lease12, 'Estimated', '#/leases', ''],
    ['Sale-leaseback', k.slb, 'Owner-occupied targets', '#/slb', ''],
    ['WARN notices · 90 days', k.warn, 'Closings and layoffs', '#/brief', ''],
    ['Changes this week', k.wk, 'Sales, owners, mail', '#/today', ''],
  ];
  return `<div class="pr-kpis">${T.map(([l, n, s, h, c]) => `<a class="pr-kpi ${c}" href="${h}"><span class="pr-kl">${l}</span><span class="pr-kn">${fmt(n)}</span><span class="pr-ks">${s}</span></a>`).join('')}</div>`;
}

// ---------- Stacked Opportunities view ----------
export async function stackView(el) {
  el.innerHTML = '<div class="page wide"><div class="boot"><div class="spinner"></div>Ranking every property…</div></div>';
  await new Promise(r => setTimeout(r, 30));
  const rows = [];
  for (const p of S.props) { const sc = scoreOf(p).score; if (sc < 60) continue; const st = stackOf(p); if (st.length >= 3) rows.push({ p, sc, st }); }
  rows.sort((a, b) => b.st.length - a.st.length || b.sc - a.sc);
  { const seen = new Map(), keep = []; for (const r of rows) { const k = (addrOf(r.p) + '|' + cityOf(r.p)).toLowerCase(); if (seen.has(k)) { seen.get(k).more++; continue; } r.more = 0; seen.set(k, r); keep.push(r); } rows.length = 0; rows.push(...keep); }
  const counties = [...new Set(rows.map(r => r.p.co))].sort();
  const draw = (co = '', min = 3) => {
    const R = rows.filter(r => (!co || r.p.co === co) && r.st.length >= min).slice(0, 300);
    $tbl.innerHTML = `<table class="pr-table"><thead><tr><th>#</th><th>Property</th><th class="num">Score</th><th class="num">Signals</th><th>Deal thesis</th><th>Why</th><th class="num">Est. value</th></tr></thead><tbody>${R.map((r, i) => { const th = thesis(r.p), v = valuation(r.p); return `<tr onclick="location.hash='#/property/${r.p.id}'"><td class="muted">${i + 1}</td><td><a href="#/property/${r.p.id}"><b>${esc(addrOf(r.p))}</b></a>${r.more ? ` <span class="muted xs">+${r.more} parcel${r.more > 1 ? 's' : ''}</span>` : ''}<small>${esc(cityOf(r.p))} · ${esc(nc(ownerName(r.p)))}</small></td><td class="num">${scorePill(r.sc)}</td><td class="num"><span class="pr-n">${r.st.length}</span></td><td><span class="pr-tag">${esc(th.primary[0])}</span></td><td><div class="pr-why">${r.st.slice(0, 4).map(s => `<span class="pr-chip k-opp">${s.label}</span>`).join('')}</div></td><td class="num">${v.mid ? kmoney(v.mid) : '–'}</td></tr>`; }).join('')}</tbody></table>`;
    $cnt.textContent = `${fmt(R.length)} shown of ${fmt(rows.filter(r => (!co || r.p.co === co) && r.st.length >= min).length)}`;
  };
  el.innerHTML = `<div class="page wide"><div class="ph"><div><h1>Stacked opportunities</h1><p class="explain">Properties where three or more independent reasons to transact overlap. These are the highest-odds calls in the market.</p></div>
    <div class="ph-act"><select id="pr-co"><option value="">All counties</option>${counties.map(c => `<option>${esc(c)}</option>`).join('')}</select><select id="pr-min"><option value="3">3+ signals</option><option value="4">4+ signals</option><option value="5">5+ signals</option></select><span class="muted xs" id="pr-cnt"></span></div></div><div class="tbl-wrap" id="pr-tbl"></div></div>`;
  const $tbl = el.querySelector('#pr-tbl'), $cnt = el.querySelector('#pr-cnt'), co = el.querySelector('#pr-co'), mn = el.querySelector('#pr-min');
  co.onchange = mn.onchange = () => draw(co.value, +mn.value); draw();
}

// ---------- Command palette (Cmd/Ctrl + K) ----------
const CMDS = [['Today', '#/today'], ['Stacked opportunities', '#/stack'], ['Off-Market', '#/offmarket'], ['Prospecting call list', '#/prospect'], ['Search properties', '#/properties'], ['Ask (smart search)', '#/ask'], ['Buyers & requirements', '#/requirements'], ['Owners', '#/owners'], ["Who's inside (tenants)", '#/occupants'], ['Sale-leaseback targets', '#/slb'], ['Leases', '#/leases'], ['Follow-ups', '#/crm'], ['Comps & listings', '#/comps'], ['Market brief', '#/brief'], ['Saved properties', '#/favs'], ['Saved lists', '#/lists'], ['Templates', '#/templates'], ['Tools & data', '#/tools']];
function palette() {
  if (document.querySelector('.pr-pal')) return;
  const ov = document.createElement('div'); ov.className = 'pr-pal'; ov.innerHTML = `<div class="pr-pal-box" role="dialog" aria-label="Command palette"><input placeholder="Jump to an address, owner, town or screen…" autocomplete="off"><div class="pr-pal-res"></div><div class="pr-pal-ft"><span>↑↓ move</span><span>↵ open</span><span>esc close</span></div></div>`;
  document.body.appendChild(ov);
  const inp = ov.querySelector('input'), res = ov.querySelector('.pr-pal-res'); let items = [], i = 0;
  const close = () => ov.remove(), go = h => { close(); location.hash = h; };
  const draw = () => { res.innerHTML = items.map((x, k) => `<a class="${k === i ? 'on' : ''}" href="${x[1]}"><span class="pr-pal-t">${x[2]}</span><b>${esc(x[0])}</b><small>${esc(x[3] || '')}</small></a>`).join('') || '<div class="muted pad">No matches</div>'; res.querySelectorAll('a').forEach(a => a.onclick = e => { e.preventDefault(); go(a.getAttribute('href')); }); };
  const run = () => {
    const q = inp.value.trim().toLowerCase(); items = []; i = 0;
    for (const c of CMDS) if (!q || c[0].toLowerCase().includes(q)) items.push([c[0], c[1], 'Go', '']);
    if (q.length >= 2) {
      let n = 0; for (const p of S.props) { if (n >= 12) break; const h = `${val(p, 'address') || ''} ${cityOf(p)} ${ownerName(p)} ${p.pin}`.toLowerCase(); if (h.includes(q)) { n++; items.push([addrOf(p), `#/property/${p.id}`, 'Property', `${cityOf(p)} · ${nc(ownerName(p))} · score ${scoreOf(p).score}`]); } }
      let m = 0; for (const o of S.owners.values()) { if (m >= 6) break; if (String(o.name || '').toLowerCase().includes(q)) { m++; items.push([nc(o.name), `#/owner/${o.id}`, 'Owner', o.stage || '']); } }
    }
    items = items.slice(0, 24); draw();
  };
  inp.oninput = run; inp.onkeydown = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowDown') { i = Math.min(items.length - 1, i + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { i = Math.max(0, i - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter' && items[i]) go(items[i][1]); };
  ov.onclick = e => { if (e.target === ov) close(); }; run(); inp.focus();
}
let bound = false;
export function bindPro() {
  if (bound) return; bound = true; bindSmartSearch(); bindNav();
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); } });
  const host = document.querySelector('.topnav .search');
  if (host && !document.querySelector('.pr-kbtn')) { const b = document.createElement('button'); b.className = 'pr-kbtn'; b.type = 'button'; b.title = 'Command palette'; b.innerHTML = '<kbd>⌘K</kbd>'; b.onclick = palette; host.after(b); }
}

// ---------- hook called after every screen renders ----------
export function enhance(el, r, id) {
  bindPro(); markActive(); if (r === 'today' || r === 'crm') paintNav();
  const pg = el.querySelector('.page'); if (!pg) return;
  if (r === 'property' && id) {
    const p = S.prop.get(id); if (!p || pg.querySelector('.pr-intel')) return;
    const anchor = pg.querySelector('.tiles4') || pg.querySelector('.phead5');
    if (anchor) anchor.insertAdjacentHTML('afterend', intelHTML(p));
  }
  if ((r === 'today' || !r) && !pg.querySelector('.pr-kpis')) {
    const h = pg.querySelector('.explain') || pg.querySelector('h1');
    if (h) h.insertAdjacentHTML('afterend', kpiHTML());
  }
}

// ---------- Smart search (top bar). On-device only: no API, nothing typed leaves the browser. ----------
// Word-order-free, partial-word matching ("118th accardi", "ridg skokie"), street abbreviations
// (avenue = ave, north = n), PIN digits, towns, owners, businesses and screens, ranked by relevance
// and deal score, with keyboard navigation and recently opened items.
const ABBR = { street: 'st', avenue: 'ave', av: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd', north: 'n', south: 's', east: 'e', west: 'w', parkway: 'pkwy', lane: 'ln', court: 'ct', place: 'pl', highway: 'hwy', terrace: 'ter', circle: 'cir', trail: 'trl', mount: 'mt', saint: 'st', first: '1st', second: '2nd', third: '3rd' };
const tok = s => String(s || '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map(w => ABBR[w] || w);
let SIX = { v: -1 };
function searchIndex() {
  if (SIX.v === S.version && SIX.n === S.props.length) return SIX;
  const props = S.props.map(p => { const a = tok(val(p, 'address') || p.addr), c = tok(cityOf(p)), o = tok(ownerName(p)); return { p, a, c, o, all: [...a, ...c, ...o, ...tok(p.zip)], pin: String(p.pin || '').replace(/\D/g, '') }; });
  const owners = [...S.owners.values()].map(o => ({ o, t: tok([o.name, ...(o.entities || []), o.contactName].join(' ')) }));
  const tc = new Map(); for (const p of S.props) { const c = String(cityOf(p) || '').replace(/\b(Vlg|Vil|Vl)\.?$/i, 'Village').replace(/\bHts\b/i, 'Heights').replace(/\bPk\b/i, 'Park'); if (c && !/unincorporated/i.test(c)) tc.set(c, (tc.get(c) || 0) + 1); }
  const towns = [...tc.entries()].filter(([, k]) => k >= 5).map(([n, k]) => ({ n, k, t: tok(n) }));
  SIX = { v: S.version, n: S.props.length, props, owners, towns }; return SIX;
}
const hit = (q, toks) => q.every(w => toks.some(t => t.startsWith(w)));
const RKEY = 'omi_recent_search';
const recentGet = () => { try { return JSON.parse(localStorage.getItem(RKEY) || '[]'); } catch { return []; } };
const recentAdd = it => { try { const L = recentGet().filter(x => x[1] !== it[1]); L.unshift(it); localStorage.setItem(RKEY, JSON.stringify(L.slice(0, 8))); } catch { } };
const INTENT = [[/^(stack|stacked|best|top|hottest)/, 'Stacked opportunities', '#/stack'], [/^(lease|expir)/, 'Leases & likely lease expirations', '#/leases'], [/^(sale.?lease|slb|leaseback)/, 'Sale-leaseback targets', '#/slb'], [/^(warn|layoff|closing)/, 'Market brief (WARN notices)', '#/brief'], [/^(call|today|follow)/, 'Today: call plan & follow-ups', '#/today'], [/^(buyer|req)/, 'Buyers & requirements', '#/requirements'], [/^(tenant|occup|who.?s inside)/, "Who's inside (tenants)", '#/occupants'], [/^(comp|sold|sales)/, 'Comps & listings', '#/comps'], [/^(off.?market|seller|owner.*sell)/, 'Off-Market sellers', '#/offmarket'], [/^(saved|star|fav)/, 'Saved properties', '#/favs']];
function smartResults(raw) {
  const q0 = raw.trim(), q = tok(q0), digits = q0.replace(/\D/g, ''), I = searchIndex(), out = [];
  if (!q.length) return recentGet().map(x => ({ g: 'Recent', label: x[0], href: x[1], sub: x[2] || '', tag: x[3] || '' }));
  // screens and intents
  for (const [re, l, h] of INTENT) if (re.test(q0.toLowerCase())) out.push({ g: 'Go to', label: l, href: h, sub: 'Screen', tag: 'Go' });
  // towns
  const T = I.towns.filter(t => hit(q, t.t)).sort((a, b) => b.k - a.k).slice(0, 2);
  for (const t of T) out.push({ g: 'Go to', label: `Sellers in ${t.n}`, href: `#/ask/${encodeURIComponent('sellers in ' + t.n)}`, sub: `${fmt(t.k)} industrial properties, ranked by chance to sell`, tag: 'Town' });
  // properties: all words must match (any order, partial words OK)
  const P = [];
  for (const x of I.props) {
    let m = false, r = 0;
    if (digits.length >= 6 && x.pin.includes(digits)) { m = true; r = 300; }
    else if (hit(q, x.all)) { m = true; const inAddr = hit(q, x.a); r = (inAddr ? 120 : 0) + (x.a.join(' ').startsWith(q.join(' ')) ? 80 : 0) + (hit(q, x.o) ? 40 : 0); }
    if (m) P.push({ x, r: r + scoreOf(x.p).score / 2 });
  }
  P.sort((a, b) => b.r - a.r);
  const seenAddr = new Set();
  for (const { x } of P) { if (out.filter(o => o.g === 'Properties').length >= 10) break; const p = x.p, k = (addrOf(p) + cityOf(p)).toLowerCase(); if (seenAddr.has(k)) continue; seenAddr.add(k); const s = scoreOf(p).score, sf = sfOf(p).sf, st = stackOf(p).length; out.push({ g: 'Properties', label: addrOf(p), href: `#/property/${p.id}`, sub: `${cityOf(p)} · ${nc(ownerName(p))}${sf ? ' · ' + fmt(sf) + ' SF' : ''}`, score: s, stack: st, tag: 'Property' }); }
  // owners
  const O = I.owners.filter(o => hit(q, o.t)).map(o => ({ o: o.o, n: S.props.filter(p => p.ownerId === o.o.id).length })).sort((a, b) => b.n - a.n).slice(0, 5);
  for (const { o, n } of O) out.push({ g: 'Owners', label: nc(o.name), href: `#/owner/${o.id}`, sub: `${n} propert${n === 1 ? 'y' : 'ies'}${o.stage ? ' · ' + o.stage : ''}${o.mail?.city ? ' · mail: ' + nc(o.mail.city) + ', ' + o.mail.st : ''}`, tag: 'Owner' });
  // tenants / buyers from the broker's own records
  for (const c of S.companies.values()) if (hit(q, tok(c.name))) out.push({ g: 'Tenants & buyers', label: c.name, href: `#/company/${c.id}`, sub: c.industry || 'Tenant', tag: 'Tenant' });
  for (const r of S.requirements.values()) if (hit(q, tok((r.name || '') + ' ' + (r.clientName || '')))) out.push({ g: 'Tenants & buyers', label: r.name, href: `#/requirement/${r.id}`, sub: r.dealType || 'Requirement', tag: 'Buyer' });
  // always offer plain-English Ask
  out.push({ g: 'Ask', label: `Ask: "${q0}"`, href: `#/ask/${encodeURIComponent(q0)}`, sub: 'Smart search in plain English: size, area, owner type, signals', tag: 'Ask' });
  return out.slice(0, 40);
}
let busPromise = null;
async function withBusinesses(raw, out) {
  if (raw.trim().length < 3) return out;
  try { busPromise = busPromise || import('./sheets.js'); const M = await busPromise; const q = raw.trim().toLowerCase(), seen = new Set(out.map(o => o.href)); const B = M.businessSearch(q, 6).filter(x => !seen.has(`#/property/${x.p.id}`)); const at = out.findIndex(o => o.g === 'Owners' || o.g === 'Tenants & buyers' || o.g === 'Ask'); out.splice(at < 0 ? out.length : at, 0, ...B.map(x => ({ g: 'Businesses at a property', label: nc(x.n), href: `#/property/${x.p.id}`, sub: `${x.src} · at ${addrOf(x.p)}, ${cityOf(x.p)}`, tag: 'Business' }))); } catch { }
  return out;
}
function bindSmartSearch() {
  const old = document.getElementById('gsearch'), box = document.getElementById('gresults'); if (!old || !box || old.dataset.smart) return;
  const inp = old.cloneNode(true); old.replaceWith(inp); inp.dataset.smart = '1';
  inp.placeholder = 'Search address, owner, town, business, PIN, or ask anything';
  let items = [], sel = 0, t, seq = 0;
  const open = it => { if (!it) return; if (it.g !== 'Ask' && it.g !== 'Recent') recentAdd([it.label, it.href, it.sub, it.tag]); box.classList.add('hidden'); inp.value = ''; inp.blur(); location.hash = it.href; };
  const draw = () => {
    if (!items.length) { box.innerHTML = '<div class="muted pad">Start typing an address, owner, town or business</div>'; box.classList.remove('hidden'); return; }
    let g = '', h = '';
    items.forEach((it, i) => { if (it.g !== g) { g = it.g; if (g !== 'Ask') h += `<div class="ss-g">${esc(g)}</div>`; } h += `<a href="${esc(it.href)}" class="ss-i${i === sel ? ' on' : ''}" data-i="${i}"><span class="ss-tag">${esc(it.tag || '')}</span><span class="ss-m"><b>${esc(it.label)}</b><small>${esc(it.sub || '')}</small></span>${it.score != null ? `<span class="ss-r">${it.stack >= 3 ? `<span class="ss-st" title="${it.stack} signals stacked">${it.stack}</span>` : ''}${scorePill(it.score)}</span>` : ''}</a>`; });
    box.innerHTML = h + '<div class="ss-ft"><span>↑↓ move</span><span>↵ open</span><span>esc close</span></div>'; box.classList.remove('hidden');
    box.querySelectorAll('.ss-i').forEach(a => { a.onclick = e => { e.preventDefault(); open(items[+a.dataset.i]); }; a.onmousemove = () => { if (sel !== +a.dataset.i) { sel = +a.dataset.i; box.querySelectorAll('.ss-i').forEach(x => x.classList.toggle('on', +x.dataset.i === sel)); } }; });
    const on = box.querySelector('.ss-i.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const run = async () => { const my = ++seq, v = inp.value; items = smartResults(v); sel = 0; draw(); const withB = await withBusinesses(v, items.slice()); if (my === seq) { items = withB; draw(); } };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 110); });
  inp.addEventListener('focus', () => run());
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); open(items[sel]); }
    else if (e.key === 'Escape') { box.classList.add('hidden'); inp.blur(); }
  });
  document.addEventListener('keydown', e => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) { e.preventDefault(); inp.focus(); } });
}

// ---------- Navigation: every section gets its own place (no "More" catch-all) ----------
// Laptop: a permanent left sidebar with every screen, grouped, with live counts.
// iPhone: bottom tabs stay; the last tab opens a slide-up menu with every screen, one tap away.
const I_ = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const IC = {
  today: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14c0 1.1.9 2 2 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V9h14zM7 11h5v5H7z',
  stack: 'M12 2l10 5-10 5L2 7zm0 13l-8-4-2 1 10 5 10-5-2-1zm0-4l-8-4-2 1 10 5 10-5-2-1z',
  off: 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z',
  phone: 'M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 013 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z',
  search: 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1016 9.5a6.5 6.5 0 01-1.6 4.2l.3.3v.8l5 5 1.5-1.5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z',
  ask: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 17h-2v-2h2zm2.1-7.8l-.9.9A3.4 3.4 0 0013 15h-2v-.5a4 4 0 011.2-2.8l1.2-1.3A2 2 0 0014 9a2 2 0 00-4 0H8a4 4 0 018 0 3.2 3.2 0 01-.9 2.2z',
  fu: 'M13 3a9 9 0 00-9 9H1l4 4 4-4H6a7 7 0 117 7 7 7 0 01-4.9-2l-1.4 1.4A9 9 0 1013 3zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8z',
  lease: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14c0 1.1.9 2 2 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V9h14z',
  tpl: 'M14 2H6a2 2 0 00-2 2v16c0 1.1.9 2 2 2h12a2 2 0 002-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z',
  owner: 'M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-3 0-8 1.5-8 4.5V21h16v-2.5c0-3-5-4.5-8-4.5z',
  buyer: 'M10 18h4v-2h-4zM3 6v2h18V6zm3 7h12v-2H6z',
  tenant: 'M12 7V3H2v18h20V7zM6 19H4v-2h2zm0-4H4v-2h2zm0-4H4V9h2zm0-4H4V5h2zm4 12H8v-2h2zm0-4H8v-2h2zm0-4H8V9h2zm0-4H8V5h2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8z',
  occ: 'M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z',
  slb: 'M4 10h16v10H4zM12 3l9 6H3z',
  brief: 'M4 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z',
  comps: 'M3 17h4V9H3zm7 0h4V5h-4zm7 0h4v-6h-4zM3 21h18v-2H3z',
  near: 'M12 2a7 7 0 00-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z',
  star: 'M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z',
  list: 'M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z',
  cmp: 'M10 3H5a2 2 0 00-2 2v14c0 1.1.9 2 2 2h5zm2 0v18h7a2 2 0 002-2V5a2 2 0 00-2-2z',
  stats: 'M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z',
  tools: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
  moon: 'M12 3a9 9 0 109 9c0-.5 0-1-.1-1.4A5.5 5.5 0 0112.4 3.1 9 9 0 0012 3z',
};
const NAVG = [
  ['Work', [['today', 'Today', IC.today, 'due'], ['stack', 'Stacked deals', IC.stack, 'stacked'], ['offmarket', 'Off-Market sellers', IC.off], ['prospect', 'Call list', IC.phone], ['crm', 'Follow-ups & activity', IC.fu, 'due'], ['templates', 'Templates & letters', IC.tpl]]],
  ['Properties', [['properties', 'Search properties', IC.search], ['ask', 'Ask (smart search)', IC.ask], ['near', 'Near me', IC.near], ['favs', 'Saved properties', IC.star], ['lists', 'Saved lists', IC.list], ['compare', 'Compare', IC.cmp]]],
  ['People', [['owners', 'Owners', IC.owner], ['requirements', 'Buyers & requirements', IC.buyer], ['companies', 'Tenants', IC.tenant], ['occupants', "Who's inside", IC.occ], ['slb', 'Sale-leasebacks', IC.slb, 'slb']]],
  ['Market', [['leases', 'Lease tracker', IC.lease, 'lease12'], ['brief', 'Market brief', IC.brief], ['comps', 'Comps & listings', IC.comps]]],
  ['You', [['stats', 'Stats', IC.stats], ['tools', 'Settings & backup', IC.tools]]],
];
const ACTIVE = { property: 'properties', owner: 'owners', company: 'companies', requirement: 'requirements', command: 'offmarket' };
const routeKey = () => { const r = (location.hash.replace(/^#\/?/, '') || 'today').split('/')[0]; return ACTIVE[r] || r; };
async function navCounts() {
  const k = kpis(); let due = 0; try { due = (await import('./plan.js')).dueCount(); } catch { }
  return { due, stacked: k.stacked, slb: k.slb, lease12: k.lease12 };
}
const navLinks = (C = {}) => NAVG.map(([g, L]) => `<div class="pn-g">${g}</div>${L.map(([k, l, ic, c]) => `<a href="#/${k}" data-nk="${k}">${I_(ic)}<span>${l}</span>${c && C[c] ? `<em class="${c === 'due' ? 'due' : ''}">${C[c] > 999 ? (C[c] / 1000).toFixed(1) + 'k' : C[c]}</em>` : ''}</a>`).join('')}`).join('');
function markActive() { const k = routeKey(); document.querySelectorAll('[data-nk]').forEach(a => a.classList.toggle('on', a.dataset.nk === k)); }
async function paintNav() {
  const C = await navCounts().catch(() => ({}));
  const side = document.querySelector('.pr-side .pn-links'); if (side) side.innerHTML = navLinks(C);
  const sheet = document.querySelector('.pr-sheet .pn-links'); if (sheet) sheet.innerHTML = navLinks(C);
  markActive();
}
function bindNav() {
  if (document.querySelector('.pr-side')) return;
  const tn = document.querySelector('.topnav'); if (!tn) return;
  const side = document.createElement('aside'); side.className = 'pr-side'; side.setAttribute('aria-label', 'Main navigation');
  side.innerHTML = `<nav class="pn-links">${navLinks()}</nav><div class="pn-foot"><button type="button" class="pn-theme">${I_(IC.moon)}<span>Dark / light</span></button><div class="pn-data" id="pn-data"></div></div>`;
  document.body.appendChild(side); document.body.classList.add('pr-nav');
  const setH = () => document.documentElement.style.setProperty('--pr-tn', tn.getBoundingClientRect().height + 'px'); setH(); window.addEventListener('resize', setH);
  side.querySelector('.pn-theme').onclick = () => window.__omiTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  if (S.meta) side.querySelector('#pn-data').textContent = `Public data updated ${S.meta.generated} CT`;
  // phone: last bottom tab becomes "Menu" and opens a slide-up sheet instead of a separate page
  const sheet = document.createElement('div'); sheet.className = 'pr-sheet hidden'; sheet.innerHTML = `<div class="pr-sheet-bd"></div><div class="pr-sheet-p" role="dialog" aria-label="Menu"><div class="pr-grab"></div><nav class="pn-links">${navLinks()}</nav><button type="button" class="pn-theme">${I_(IC.moon)}<span>Dark / light</span></button></div>`;
  document.body.appendChild(sheet);
  const close = () => { sheet.classList.remove('open'); setTimeout(() => sheet.classList.add('hidden'), 220); };
  const openSheet = () => { sheet.classList.remove('hidden'); requestAnimationFrame(() => sheet.classList.add('open')); paintNav(); };
  sheet.querySelector('.pr-sheet-bd').onclick = close; sheet.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  sheet.querySelector('.pn-theme').onclick = () => { window.__omiTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); close(); };
  const more = document.querySelector('.mnav a[data-r="more"]');
  if (more) { const svg = more.querySelector('svg'); more.textContent = ''; if (svg) more.appendChild(svg); more.append('Menu'); more.addEventListener('click', e => { e.preventDefault(); openSheet(); }); }
  window.addEventListener('hashchange', () => { markActive(); });
  paintNav();
}
