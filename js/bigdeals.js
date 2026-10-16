// Big Deals: ranks 100k+ SF / $10M+ properties by estimated fee x rule-based likelihood. Public data only; every number marked as an estimate.
import { S, val, setting, firm } from './store.js';
import { $, $$, esc, kmoney, fmt, toast } from './util.js';
import { deal, sfOf, scoreOf } from './scoring.js';
import { propertyLinks } from './markets.js';
import { callablePhone } from './contacts.js';
import { nc } from './extras.js';
import { tdelAge, tdelMonth } from './util.js';
import { takeHome as th0 } from './money.js';

const YR = new Date().getFullYear();
const SRC = { warn: 'https://ides.illinois.gov/employment-training/workforce-development/warn-notices.html', sba: 'https://data.sba.gov/dataset/7-a-504-foia', tdel: 'https://www.cookcountyclerkil.gov/property-taxes/delinquent-taxes', ptax: 'https://tax.illinois.gov/localgovernments/property/ptax203.html' };
// signal: [key, label, likelihood weight, test(p)->text|null, call script]
const SIG = [
  ['dist', 'Distress / loan', .45, p => {
    const o = [];
    if (p.warn) o.push(['IL WARN layoff/closing notice at this address: ' + p.warn, SRC.warn]);
    if (p.tdel) o.push([`On the Cook County delinquent-tax list as of ${tdelMonth(p.tdel)}${tdelAge(p.tdel) >= 6 ? ' (may be paid since, check first)' : ''}`, SRC.tdel]);
    if (p.dsale) o.push(['Distressed sale on record (PTAX-203): ' + p.dsale, SRC.ptax]);
    if (p.sbamat) { const m = Math.round((new Date(p.sbamat + '-01') - Date.now()) / 2.63e9); if (m >= -6 && m <= 24) o.push([`SBA 504 loan matures ~${p.sbamat} (ESTIMATE: approval + term)`, SRC.sba]); }
    return o.length ? o : null; },
    (n, a) => `Hi ${n}, This is [your name] with ${firm()}. I cover industrial around ${a}. Public records show some changes at your building, and owners in that spot often want options: a sale, a sale-leaseback or bringing in a tenant. Would a quick, confidential value range be useful?`],
  ['hold', 'Long-hold owners', .22, p => { const y = +String(val(p, 'lastSaleDate') || '').slice(0, 4); return y && YR - y >= 15 && p.ot !== 'institutional' ? [[`Owned ${YR - y}+ years (last recorded sale ${y}); large equity, possible retirement/estate planning`, null]] : null; },
    (n, a) => `Hi ${n}, this is [your name] with ${firm()}. You've owned ${a} a long time, and big industrial buildings have re-priced a lot since you bought. I'm not asking you to sell; I can send you a one-page value range so you know what it's worth today. Okay to email it?`],
  ['inv', 'Recent investor buys', .3, p => { const d = String(val(p, 'lastSaleDate') || ''), y = +d.slice(0, 4); return y >= YR - 2 && /institutional|company/.test(p.ot || '') ? [[`Bought ${d} by ${p.ot === 'institutional' ? 'an institutional' : 'a company/LLC'} owner; new owners often need leasing or a value-add plan`, null]] : null; },
    (n, a) => `Hi ${n}, [your name] with ${firm()}. Congrats on picking up ${a}. I'm tracking tenants in the market looking for that size right now. Do you have a leasing plan in place, or would it help to see who's active?`],
  ['slb', 'Sale-leasebacks', .3, p => p.slb ? [[`Sale-leaseback recorded on PTAX-203 (${p.slb}); the lease term clock is running`, SRC.ptax]] : null,
    (n, a) => `Hi ${n}, [your name] with ${firm()}. Records show a sale-leaseback at ${a}. I'd like to check where the lease stands; owners and tenants usually plan 18 to 24 months ahead. Is there a good time this week?`],
];
const MIN_SF = 100000, MIN_V = 10e6;
let CACHE = { v: -1, rows: [] };
function build() {
  if (CACHE.v === S.version) return CACHE.rows;
  const rows = [];
  for (const p of S.props) {
    const sf = sfOf(p), d = deal(p);
    if (sf.sf < MIN_SF && (d.value || 0) < MIN_V) continue; const ow = S.owners.get(p.ownerId); if (ow && (ow.dnc || ow.stage === 'Do not contact' || ow.inst)) continue; if (p.ot === 'institutional' || (d.value || 0) > 30e6) continue;   // REITs and $30M+ trophies: not a 90-day win for a newer broker
    const hits = []; let L = 0;
    for (const s of SIG) { const r = s[3](p); if (r) { hits.push([s, r]); L += s[2]; } }
    if (!hits.length) continue;
    if (p.tdel && tdelAge(p.tdel) >= 12 && hits.length === 1 && hits[0][1].length === 1) L *= .5;   // only an old tax file: weak
    L = Math.min(.9, L + scoreOf(p).score / 400);
    // fee estimate: sale commission on estimated value (Tools > settings), or 5-yr lease fee at est. rent if larger
    const leaseFee = (d.sfOut ? d.sf : sf.sf) * setting('rentPsf', 8) * 5 * setting('leaseComm', 4) / 100;
    const fee = Math.max(d.commission || 0, leaseFee);
    rows.push({ p, sf, d, hits, L, fee, ev: fee * L * Math.min(1, Math.sqrt(15e6 / Math.max(1, d.value || fee / .03))), kind: fee === leaseFee ? `5-yr lease at $${setting('rentPsf', 8)}/SF, ${setting('leaseComm', 4)}%` : `sale, ${d.kind}, ${setting('commRate', 3)}%` });
  }
  rows.sort((a, b) => (a.d.check - b.d.check) || b.ev - a.ev);   // implausible sizes sink to the bottom
  CACHE = { v: S.version, rows }; return rows;
}
let TAB = 'all', SHOWN = 25;
export function bigView(el) {
  const all = build(), cnt = k => all.filter(r => r.hits.some(h => h[0][0] === k)).length;
  const rows = TAB === 'all' ? all : all.filter(r => r.hits.some(h => h[0][0] === TAB));
  const tabs = [['all', 'All', all.length], ...SIG.map(s => [s[0], s[1], cnt(s[0])])];
  el.innerHTML = `<div class="page narrow"><div class="ph"><div><h1>Big Deals</h1><div class="muted">${fmt(all.length)} large properties (100k+ SF or $10M+) with a public reason to transact, biggest likely fee first.</div></div></div>
    <div class="chips fchips">${tabs.map(([k, l, n]) => `<button class="fchip ${TAB === k ? 'on' : ''}" data-bt="${k}">${l} <span class="xs muted">${fmt(n)}</span></button>`).join('')}</div>
    <div class="xs muted" style="margin:6px 0 12px">Fee and likelihood are <b>estimates</b> (rules on public records, not a prediction). Change rates in Tools. Verify before you call.</div>
    <div id="bdl">${rows.slice(0, SHOWN).map(card).join('') || '<div class="muted pad">Nothing here yet.</div>'}</div>
    ${rows.length > SHOWN ? `<button class="btn" id="bdm" style="width:100%">Show more (${fmt(rows.length - SHOWN)} left)</button>` : ''}</div>`;
  $$('[data-bt]', el).forEach(b => b.onclick = () => { TAB = b.dataset.bt; SHOWN = 25; bigView(el); });
  const m = $('#bdm', el); if (m) m.onclick = () => { SHOWN += 25; bigView(el); };
  $$('[data-scr]', el).forEach(b => b.onclick = () => { const box = b.nextElementSibling; box.hidden = !box.hidden; });
  $$('[data-copy]', el).forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.closest('.bdscr').querySelector('p').textContent).then(() => toast('Script copied')); });
}
function card(r) {
  const p = r.p, o = S.owners.get(p.ownerId), name = (o && o.name) || val(p, 'taxpayer') || 'the owner', addr = nc(val(p, 'address') || p.pin), city = nc(val(p, 'city') || '');
  const ph = callablePhone(o), A = Object.fromEntries(propertyLinks({ address: val(p, 'address'), city: val(p, 'city'), zip: val(p, 'zip'), county: val(p, 'county'), pin: p.pin, lat: p.lat, lon: p.lon, taxpayer: val(p, 'taxpayer') }, o).filter(x => x[1]));
  const s0 = r.hits[0][0], first = /\b(LLC|L\.L\.C|INC|CO|CORP|CORPORATION|TRUST|LP|LTD|BANK|PARTNERS|COMPANY|HOLDINGS|PROPERTIES|ACCTG|TR|FUND|REIT)\b/i.test(name) ? 'there' : String(name).split(/[ ,]/)[0];
  return `<div class="card bdcard" style="padding:14px;margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;gap:8px"><a href="#/property/${p.id}"><b>${esc(addr)}</b></a><b class="pos">${r.d.check ? '<span class="tag" style="background:#fef3c7;color:#92400e">check size</span> ' : ''}${'≈ ' + kmoney(th0(r.fee)) + ' to you'}</b></div>
    <div class="xs muted">${esc(city)} · ${fmt(r.sf.sf)} SF${r.sf.est ? ' (est.)' : ''} · est. fee (${esc(r.kind)}) · likelihood ${Math.round(r.L * 100)}% (est.)</div>
    <div class="xs" style="margin-top:4px">Owner: ${p.ownerId ? `<a href="#/owner/${p.ownerId}">${esc(nc(name))}</a>` : esc(nc(name))}</div>
    <ul class="xs" style="margin:6px 0 6px 18px;padding:0">${r.hits.flatMap(([s, list]) => list.map(([t, u]) => `<li>${esc(t)}${u ? ` · <a href="${u}" target="_blank" rel="noopener">source</a>` : ''}</li>`)).join('')}
      ${A['County assessor'] ? `<li>Property record: <a href="${A['County assessor']}" target="_blank" rel="noopener">county assessor</a>${A['Recorder of deeds'] ? ` · <a href="${A['Recorder of deeds']}" target="_blank" rel="noopener">deeds</a>` : ''}</li>` : ''}</ul>
    <div class="btnrow">${ph ? `<a class="btn primary" href="tel:${esc(ph.replace(/[^\d+]/g, ''))}">Call</a>` : `<a class="btn primary" href="#/owner/${p.ownerId || ''}">Find phone</a>`}<button class="btn" data-scr>Call script</button>
    <div class="bdscr" hidden style="flex-basis:100%"><p class="sm" style="background:var(--panel2,#f5f6f8);padding:10px;border-radius:10px">${esc(s0[4](nc(first), addr))}</p><button class="btn sm ghost" data-copy>Copy</button></div></div></div>`;
}
