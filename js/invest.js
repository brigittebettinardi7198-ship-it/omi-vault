// "Investment" panel: editable on-device calculator. Pre-fills only real figures (last recorded sale price or the labeled estimated value,
// official building SF else the roof-footprint estimate, median $/SF of nearby recorded sales). Rent has no default. Everything is an estimate.
import { $, esc, fmt, kmoney } from './util.js';
import { val, setting, setSetting } from './store.js';
import { deal, sfOf } from './scoring.js';
import { nearbySales } from './comps.js';
const DEF = { vac: 5, exp: 0.5, cap: 7, ltv: 65, rate: 6.5, amort: 25 };   // editable assumption defaults (not data)
const saved = id => (setting('inv', {}) || {})[id] || {};
function prefill(p) {
  const sp = +val(p, 'lastSalePrice') || 0, d = deal(p), so = sfOf(p);
  const price = sp ? { v: sp, src: `last recorded sale ${val(p, 'lastSaleDate') || ''}` } : d.value ? { v: Math.round(d.value), src: `estimated value (${d.kind || 'estimate'})` } : { v: 0, src: 'no price on record' };
  const cs = nearbySales(p, 8).filter(c => c.psf > 0).map(c => c.psf).sort((a, b) => a - b);
  const med = cs.length ? cs[Math.floor((cs.length - 1) / 2)] / 2 + cs[Math.ceil((cs.length - 1) / 2)] / 2 : 0;
  return { price, sf: so.sf, sfEst: so.est, med, nComps: cs.length };
}
export function investHTML(p) {
  const f = prefill(p), s = saved(p.id), v = k => s[k] ?? (k === 'price' ? (f.price.v || '') : k === 'sf' ? (f.sf || '') : k === 'rent' ? '' : DEF[k]);
  const inp = (k, l, step = 'any', suf = '') => `<label><span>${l}</span><input data-inv="${k}" type="number" step="${step}" inputmode="decimal" value="${esc(v(k))}">${suf ? `<small>${suf}</small>` : ''}</label>`;
  return `<section class="card inv" data-pid="${esc(p.id)}"><div class="ch"><h2>Investment <span class="tag est">estimate</span></h2><button class="btn sm ghost" data-invreset>Reset</button></div>
    <div class="xs muted">Price pre-filled from ${esc(f.price.src)}. Building SF: ${f.sf ? fmt(f.sf) + (f.sfEst ? ' (est. from roof footprint)' : ' (official)') : 'not on record'}. Nearby recorded sales median: <b>${f.med ? '$' + Math.round(f.med) + '/SF' : '–'}</b>${f.nComps ? ` (${f.nComps} sale${f.nComps > 1 ? 's' : ''})` : ''}. Rent has no default: enter what you know. Inputs save on this device.</div>
    <div class="invg">${inp('price', 'Price $', '1000')}${inp('sf', 'Building SF', '100')}${inp('rent', 'Rent $/SF/yr (NNN)', '0.05')}${inp('vac', 'Vacancy %', '0.5')}${inp('exp', 'Unrecovered expenses $/SF/yr', '0.05')}${inp('cap', 'Market cap rate %', '0.1')}${inp('ltv', 'Loan-to-value %', '1')}${inp('rate', 'Interest rate %', '0.05')}${inp('amort', 'Amortization yrs', '1')}</div>
    <div class="invo" id="invo"></div><div class="xs muted">Vacancy, expenses, cap rate and loan terms start at editable assumptions, not market data. Not an appraisal.</div></section>`;
}
function calc(box) {
  const g = k => { const x = $(`[data-inv="${k}"]`, box).value; return x === '' ? null : +x; };
  const price = g('price'), sf = g('sf'), rent = g('rent'), vac = g('vac') || 0, exp = g('exp') || 0, cap = g('cap'), ltv = (g('ltv') || 0) / 100, r = (g('rate') || 0) / 100 / 12, n = (g('amort') || 25) * 12;
  const row = (l, x) => `<div><span>${l}</span><b>${x}</b></div>`;
  const out = [row('Price / SF', price && sf ? '$' + (price / sf).toFixed(0) : '–')];
  if (rent && sf) {
    const egi = rent * sf * (1 - vac / 100), noi = egi - exp * sf;
    const loan = price ? price * ltv : 0, pm = loan ? (r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n) : 0, ds = pm * 12, eq = price ? price - loan : 0;
    out.push(row('NOI / yr', kmoney(noi)), row('Implied value at cap', cap ? kmoney(noi / (cap / 100)) + (sf ? ` <small>$${Math.round(noi / (cap / 100) / sf)}/SF</small>` : '') : '–'), row('Cap rate on price', price ? (noi / price * 100).toFixed(2) + '%' : '–'),
      row('Debt service / yr', loan ? kmoney(ds) : '–'), row('Cash flow / yr', price ? kmoney(noi - ds) : '–'), row('Cash-on-cash', eq > 0 ? ((noi - ds) / eq * 100).toFixed(1) + '%' : '–'));
  } else out.push(row('NOI, value, cap, cash-on-cash', '<span class="muted">enter rent $/SF</span>'));
  $('#invo', box).innerHTML = out.join('');
}
export function bindInvest(root) {
  const box = $('.inv', root); if (!box) return; const id = box.dataset.pid;
  box.addEventListener('input', e => { const k = e.target.dataset.inv; if (!k) return; const all = { ...(setting('inv', {}) || {}) }; all[id] = { ...(all[id] || {}), [k]: e.target.value === '' ? '' : +e.target.value }; setSetting('inv', all); calc(box); });
  const rs = $('[data-invreset]', box); if (rs) rs.onclick = () => { const all = { ...(setting('inv', {}) || {}) }; delete all[id]; setSetting('inv', all); box.outerHTML; location.reload(); };
  calc(box);
}
