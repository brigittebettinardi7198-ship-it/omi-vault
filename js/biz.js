// 5.3 Business brokerage fee: 10% of the business price under $1M; Double Lehman above (10/8/6/4/2% on each $1M tier).
// Shown beside the building commission so one owner conversation can cover both. Estimates only.
import { $, esc, kmoney } from './util.js';
import { cfg, takeHome } from './money.js';
export function bizFee(price) { price = +price || 0; if (price <= 0) return 0; if (price < 1e6) return price * .10;
  const R = [.10, .08, .06, .04]; let f = 0, left = price; for (const r of R) { const t = Math.min(left, 1e6); f += t * r; left -= t; if (left <= 0) return f; } return f + left * .02; }
export function bizCalcHTML(bldg = '', biz = '') { return `<section class="card" id="bizcalc" style="margin:12px 0;padding:14px"><h2 style="margin-top:0">Building + business fee</h2>
  <div class="xs muted">Owner-users often sell the business too. Business fee (estimate): 10% under $1M; above that Double Lehman: 10% of the first $1M, 8% of the 2nd, 6% of the 3rd, 4% of the 4th, 2% above.</div>
  <div class="dl-f"><label>Building price $<input id="bzb" type="number" inputmode="numeric" value="${esc(bldg)}"></label><label>Business price $<input id="bzp" type="number" inputmode="numeric" value="${esc(biz)}"></label></div><div id="bzout" class="earn"></div></section>`; }
export function bindBizCalc(root) { const b = $('#bzb', root), p = $('#bzp', root), o = $('#bzout', root); if (!b) return;
  const go = () => { const c = cfg(), bf = (+b.value || 0) * (+c.sale || 3) / 100, pf = bizFee(p.value), th = x => { try { return takeHome(x); } catch (e) { return x * (+c.split || 85) / 100; } };
    o.innerHTML = `<div><span>Building commission (${+c.sale || 3}%)</span><b>${kmoney(bf) || '$0'}</b></div><div><span>Business fee (est.)</span><b>${kmoney(pf) || '$0'}</b></div><div><span>Gross together</span><b>${kmoney(bf + pf) || '$0'}</b></div><div><span>Your take-home (est.)</span><b>${kmoney(th(bf + pf)) || '$0'}</b></div>`; };
  b.oninput = p.oninput = go; go(); }
