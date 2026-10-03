// v8: listing one-pager (print / PDF), weekly brief share (copy + "Email to me" mailto, on-device),
// SBA 504 loan maturity calendar (ESTIMATED), vacancy hunter (LIKELY vacant from free public signals).
import { $, esc, fmt, money, kmoney, today, toast } from './util.js';
import { S, val, setting, setSetting } from './store.js';
import { scoreOf, deal } from './scoring.js';
import { nc, dcOf, powerTxt, iosOf } from './extras.js';
import { likelyBuyers } from './buyers.js';

// ---------- one-pager ----------
export function onePagerHTML(p) {
  const d = deal(p), sc = scoreOf(p), o = p.ownerId && S.owners.get(p.ownerId), lb = p.office ? [] : likelyBuyers(p, 3);
  const row = (l, v, src = '') => v ? `<tr><th>${l}</th><td>${v}${src ? ` <span class="ops">${src}</span>` : ''}</td></tr>` : '';
  const ac = (+p.lsf || 0) / 43560;
  return `<div class="op"><div class="op-h"><div><h1>${esc(nc(val(p, 'address') || p.pin))}</h1><div>${esc(nc(val(p, 'city') || ''))}, IL ${esc(val(p, 'zip') || '')} · ${esc(val(p, 'county') || p.co || '')} County · PIN ${esc(p.pin || '')}</div></div><div class="op-sc">Score<br><b>${sc.score}</b></div></div>
  <table class="op-t">${row('Property type', esc(p.office ? 'Office' : p.vac ? 'Land' : 'Industrial') + (dcOf(p) ? ' · Data center candidate' : '') + (iosOf(p) ? ' · Outdoor storage candidate' : ''))}
  ${row('Assessor class', esc(val(p, 'propClass') || ''), 'county assessor')}
  ${row('Building', d.sf ? fmt(d.sf) + ' SF' : '', 'assessor')}${row('Land', ac ? ac.toFixed(2) + ' acres (' + fmt(p.lsf) + ' SF)' : '', 'assessor')}${row('Year built', val(p, 'yearBuilt') || '')}
  ${row('Estimated value', d.value ? money(d.value) : '', p.mvest ? 'ESTIMATE from assessed value' : 'assessor market value')}
  ${row('Last sale', val(p, 'lastSaleDate') ? esc(val(p, 'lastSaleDate')) + (+val(p, 'lastSalePrice') ? ' · ' + money(val(p, 'lastSalePrice')) : '') + (val(p, 'lastBuyer') ? ' · to ' + esc(nc(val(p, 'lastBuyer'))) : '') : '', 'PTAX-203 / county sales')}
  ${row('Tax-bill name', esc(nc(o ? o.name : val(p, 'taxpayer') || '')), 'may be a trust or manager')}${row('Annual tax', +val(p, 'annualTax') ? money(val(p, 'annualTax')) : '', 'county treasurer')}
  ${row('Power', p.subd != null ? powerTxt(p) : '', 'OpenStreetMap')}${row('Flood', p.flood ? 'In a FEMA flood hazard area' : '', 'FEMA NFHL')}
  ${row('Location', p.lat ? `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : '')}</table>
  ${sc.reasons && sc.reasons.length ? `<h2>Why it scores</h2><ul>${sc.reasons.filter(r => (r.pts || 0) > 0).slice(0, 5).map(r => `<li>${esc(r.text || r)}</li>`).join('')}</ul>` : ''}
  ${lb.length ? `<h2>Active buyers that fit</h2><ul>${lb.map(x => `<li><b>${esc(x.b.name)}</b>: ${esc(x.why)}</li>`).join('')}</ul>` : ''}
  <div class="op-f">Prepared ${today()} from public records (county assessor, IL PTAX-203, FEMA, OpenStreetMap). Values marked ESTIMATE are not appraisals. Verify before use. Not a listing.</div></div>`;
}
export function printOnePager(p) {
  let host = $('#printsheet'); if (!host) { host = document.createElement('div'); host.id = 'printsheet'; document.body.appendChild(host); }
  host.innerHTML = onePagerHTML(p); document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => { window.print(); setTimeout(done, 1500); }, 50);
}

// ---------- weekly brief share (stays on device: clipboard or your own mail app) ----------
export function bindBriefShare(el) {
  const text = () => (el.querySelector('.page') || el).innerText.replace(/Print \/ save PDF|Copy text|Email to me/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const c = $('#bcopy', el), m = $('#bmail', el);
  if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(text()); toast('Brief copied'); } catch { toast('Copy blocked by the browser'); } };
  if (m) m.onclick = async () => {
    let to = setting('myEmail', '');
    if (!to) { to = (prompt('Your email (saved on this device only):') || '').trim(); if (to) await setSetting('myEmail', to); }
    let body = text(); if (body.length > 1800) body = body.slice(0, 1800) + '\n… (full brief: open the app > More > Market brief)';
    const a = document.createElement('a'); a.href = `mailto:${encodeURIComponent(to).replace('%40', '@')}?subject=${encodeURIComponent('Weekly industrial brief ' + today())}&body=${encodeURIComponent(body)}`; a.className = 'mailgo'; document.body.appendChild(a); a.click(); a.remove();
  };
}

// ---------- SBA 504 loan maturity calendar (ESTIMATED: approval date + term; refinancing / prepayment unknown) ----------
export function loanCalendar(years = 10) {
  const y0 = +today().slice(0, 4), out = [];
  for (const p of S.props) { const m = val(p, 'sbaMaturity'); if (m && +m.slice(0, 4) >= y0 && +m.slice(0, 4) < y0 + years) out.push({ p, m }); }
  return out.sort((a, b) => a.m.localeCompare(b.m));
}
export const loanCalHTML = L => { const by = {}; L.forEach(x => (by[x.m.slice(0, 4)] = by[x.m.slice(0, 4)] || []).push(x));
  return Object.keys(by).length ? Object.entries(by).map(([y, xs]) => `<div class="lc-y"><b>${y}</b> <span class="xs muted">${xs.length} loan${xs.length > 1 ? 's' : ''} (est.)</span><ul class="why">${xs.slice(0, 12).map(x => `<li><a href="#/property/${x.p.id}">${esc(nc(val(x.p, 'address') || x.p.pin))}</a> <span class="xs muted">· est. maturity ${esc(x.m)} · ${esc(String(val(x.p, 'sbaLoan') || '').replace(/^SBA 504 loan approved /, 'approved ').split(';')[0].slice(0, 90))}</span></li>`).join('')}${xs.length > 12 ? `<li class="xs muted">+${xs.length - 12} more</li>` : ''}</ul></div>`).join('') : '<div class="muted xs">No SBA 504 maturities in range.</div>'; };

// ---------- vacancy hunter (LIKELY vacant; each reason is a public record) ----------
export function vacancyOf(p) {
  const R = [], w = String(val(p, 'warnNotice') || ''), absentee = p.abs === 'abs' || String(val(p, 'mailState') || 'IL').toUpperCase() !== 'IL';
  if (/clos/i.test(w)) R.push({ s: 2, t: 'WARN closing notice: ' + w });
  if (p.vacv) R.push({ s: 2, t: `City vacant-building violation (${p.vacv.d})` });
  const noBiz = !p.fm && !(p.bph && p.bph.length) && !val(p, 'carriers');
  if (p.tdel && absentee && noBiz && !p.vac) R.push({ s: 1, t: `Tax delinquent (${p.tdel}), absentee owner, no active business found at the address (FMCSA / OpenStreetMap)` });
  return R.length ? { score: R.reduce((a, r) => a + r.s, 0), R, likely: R.some(r => r.s >= 2) } : null;
}
export const vacancyList = () => S.props.map(p => ({ p, v: vacancyOf(p) })).filter(x => x.v).sort((a, b) => b.v.score - a.v.score || deal(b.p).value - deal(a.p).value);
export const vacancyHTML = L => `<ul class="why">${L.slice(0, 30).map(x => `<li><a href="#/property/${x.p.id}">${esc(nc(val(x.p, 'address') || x.p.pin))}</a> <span class="tag">${x.v.likely ? 'Likely vacant' : 'Possibly vacant'}</span> <span class="xs muted">· ${x.v.R.map(r => esc(r.t)).join(' · ')}</span></li>`).join('')}</ul><div class="xs muted">LIKELY, not confirmed. "Likely" = a WARN closing notice or a city vacant-building violation at the address; "Possibly" = tax delinquent + absentee owner + no active business found. Built from free public signals only (IL WARN closing notices, county tax delinquency, absentee tax-bill address, no FMCSA carrier or mapped business at the address, City of Chicago vacant-building violations). Drive by or call before relying on it.</div>`;

// ---------- business-name search index (names of businesses at a property, from public records + your tenants) ----------
let BIX = null;
export function businessIndex() {
  if (BIX && BIX.v === S.version && BIX.n === S.props.length) return BIX.L;
  const L = [], add = (p, n, src) => { n = String(n || '').trim(); if (n.length >= 3) L.push({ p, n, k: n.toLowerCase(), src }); };
  for (const p of S.props) {
    for (const x of p.bph || []) add(p, x.n, x.s === 'OSM' ? 'OpenStreetMap business' : 'FMCSA carrier');
    String(val(p, 'carriers') || '').split(';').forEach(s => add(p, s.replace(/\s*\(USDOT.*$/, ''), 'FMCSA carrier'));
    if (p.fed) add(p, p.fed.n, 'Federal contract recipient');
    if (val(p, 'lastBuyer')) add(p, val(p, 'lastBuyer'), 'Buyer on last deed');
    const w = String(val(p, 'warnNotice') || ''); if (w) add(p, w.split(':')[0], 'WARN notice employer');
  }
  for (const l of S.leases.values()) { const p = S.prop.get(l.propertyId), c = S.companies.get(l.companyId); if (p && c) add(p, c.name, 'Your tenant'); }
  BIX = { v: S.version, n: S.props.length, L }; return L;
}
export function businessSearch(q, k = 10) {
  const out = [], seen = new Set();
  for (const x of businessIndex()) { if (out.length >= k) break; const key = x.p.id + '|' + x.k; if (!x.k.includes(q) || seen.has(key)) continue; seen.add(key); out.push(x); }
  return out;
}
