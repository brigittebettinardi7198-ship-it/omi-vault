// Buyer-rep deals: buyers who must act (1031 exchangers, active private buyers, his own buyer clients) matched to properties
// ALREADY FOR SALE in his CoStar / LoopNet / Crexi exports. No owner has to be talked into selling, so these close in 60 to 90 days.
// Fee assumption: buyer's side of a co-brokered sale commission (half of the sale rate), then his split and cap.
import { $, $$, esc, fmt, kmoney, today, daysBetween, toast, normName } from './util.js';
import { S, val, setting, setSetting } from './store.js';
import { allSnaps } from './costar.js';
import { x1031Buyers, nc } from './extras.js';
import { buyerProfiles, qualify, isInstitutional } from './buyers.js';
import { takeHome, cfg } from './money.js';

const isSale = r => !(/lease|rent/i.test(r.status || '') || (!r.ask && r.rent)) && +r.ask > 0;
export async function listingsForSale() {
  const S2 = await allSnaps().catch(() => []), L = S2.filter(s => s.kind === 'listing'); if (!L.length) return { rows: [], asOf: '' };
  const cur = L[L.length - 1], seen = new Set(), rows = [];
  for (const r of cur.rows) { if (!isSale(r) || !r.address || +r.ask > 30e6 || +r.ask < 300000) continue; /* his range: $300K to $30M */ const k = normName(r.address) + '|' + String(r.city || '').toUpperCase(); if (seen.has(k)) continue; seen.add(k); rows.push({ ...r, k }); }
  return { rows, asOf: cur.date };
}
const sideFee = ask => takeHome(ask * (cfg().sale / 100) / 2);   // his side of a co-broke (estimate)
const cityOk = (b, city) => !city || !b.cities.length || b.cities.map(c => c.toLowerCase()).includes(String(city).toLowerCase()) || (b.areas.length && true);
const fitPrice = (ask, lo, hi) => !lo ? 1 : ask >= lo * .6 && ask <= hi * 1.6;
const fitSf = (sf, lo, hi) => !sf || !lo ? true : sf >= lo * .6 && sf <= hi * 1.5;

// ---------- the match ----------
export async function buyerRepDeals() {
  const { rows, asOf } = await listingsForSale(); if (!rows.length) return { deals: [], asOf, nListings: 0 };
  const t = today(), out = [];
  // 1. Owners who just sold (possible 1031): must identify in 45 days, close in 180
  for (const e of x1031Buyers()) {
    if (e.d180 <= 10 || e.total > 30e6 || e.props.length > 6 || isInstitutional(e.seller)) continue;   // portfolio / institutional sellers are not his 1031 client
    const fits = rows.filter(r => r.ask >= e.total * .6 && r.ask <= e.total * 1.8).map(r => ({ r, s: 100 - Math.abs(Math.log(r.ask / e.total)) * 60 })).sort((a, b) => b.s - a.s).slice(0, 3);
    if (!fits.length) continue;
    out.push({ kind: '1031', name: nc(e.seller), why: `Sold ${kmoney(e.total)} on ${e.sd}. ${e.d45 > 0 ? `${e.d45} days left to name replacements` : `Must close by ${e.c180} (${e.d180} days)`}.`, days: e.d45 > 0 ? e.d45 : e.d180, urgency: e.d45 > 0 ? 3 : 2, fits, fee: sideFee(fits[0].r.ask), sold: e.props.map(x => nc(val(x.p, 'address') || '')).slice(0, 2), key: 'x:' + normName(e.seller) });
  }
  // 2. Private repeat buyers (grade A/B, not institutions): buy what they already buy
  for (const b of buyerProfiles()) {
    const q = qualify(b); if (q.grade === 'C' || isInstitutional(b.name) || b.n >= 10) continue;
    if (!b.pMin && !b.sfMin) continue;   // nothing known about what they buy
    const fits = rows.filter(r => fitPrice(r.ask, b.pMin, b.pMax) && fitSf(+r.sf || 0, b.sfLo || b.sfMin, b.sfHi || b.sfMax) && (b.pMin || +r.sf)).map(r => ({ r, s: (b.cities.map(c => c.toLowerCase()).includes(String(r.city || '').toLowerCase()) ? 40 : 0) + 60 - Math.abs(Math.log(r.ask / Math.max(1, (b.pMin + b.pMax) / 2 || r.ask))) * 30 })).sort((a, b2) => b2.s - a.s).slice(0, 3);
    if (!fits.length) continue;
    out.push({ kind: 'buyer', name: b.name, why: `Grade ${q.grade} private buyer: ${b.n} purchases, ${b.pMin ? kmoney(b.pMin) + (b.pMax > b.pMin ? ' to ' + kmoney(b.pMax) : '') + ' each' : 'prices not recorded'}${b.sfMin ? ', ' + fmt(Math.round(b.sfMin / 1000)) + 'k' + (b.sfMax > b.sfMin ? ' to ' + fmt(Math.round(b.sfMax / 1000)) + 'k' : '') + ' SF' : ''}, latest ${b.latest.sd}.`, days: 999, urgency: q.days <= 365 ? 1.5 : 1, fits, fee: sideFee(fits[0].r.ask), key: 'b:' + b.key });
  }
  // 3. His own buyer clients (Buyers & requirements)
  for (const r0 of S.requirements.values()) {
    if (r0.status && r0.status !== 'Active') continue; if (r0.dealType === 'Lease') continue;
    const bmax = +r0.budgetMax || 0, smin = +r0.sfMin || 0, smax = +r0.sfMax || 0;
    const fits = rows.filter(r => (!bmax || r.ask <= bmax * 1.15) && (!smin || !+r.sf || +r.sf >= smin * .8) && (!smax || !+r.sf || +r.sf <= smax * 1.2)).map(r => ({ r, s: 50 + (bmax ? Math.min(40, 40 * r.ask / bmax) : 0) })).sort((a, b) => b.s - a.s).slice(0, 3);
    if (!fits.length) continue;
    out.push({ kind: 'client', name: r0.name || r0.clientName || 'Your buyer', why: `Your client${bmax ? ', budget ' + kmoney(bmax) : ''}${smin || smax ? `, ${fmt(smin)}${smax ? ' to ' + fmt(smax) : '+'} SF` : ''}.`, days: 999, urgency: 2.5, fits, fee: sideFee(fits[0].r.ask), key: 'r:' + r0.id });
  }
  const done = setting('brDone', {}) || {};
  out.forEach(d => { d.done = done[d.key]; d.rank = d.fee * d.urgency * (d.done ? .2 : 1); });
  return { deals: out.sort((a, b) => b.rank - a.rank), asOf, nListings: rows.length };
}
const optLine = f => `${nc(f.r.address)}${f.r.city ? ', ' + nc(f.r.city) : ''} (${kmoney(f.r.ask)}${+f.r.sf ? ', ' + fmt(f.r.sf) + ' SF' : ''})`;
export const brText = d => d.kind === '1031' ? `Hi, this is ${(setting('profile', {}) || {}).name || '[your name]'} with Real Brokerage. Saw you sold ${d.sold[0] || 'your property'} recently. If you're doing a 1031 exchange, I have ${d.fits.length} option${d.fits.length > 1 ? 's' : ''} that fit the price range: ${d.fits.map(optLine).join('; ')}. Want the details?`
  : `Hi, this is ${(setting('profile', {}) || {}).name || '[your name]'} with Real Brokerage. You've been buying buildings like these in the area. ${d.fits.length} just came up that fit: ${d.fits.map(optLine).join('; ')}. Want me to send details?`;
const smsHref = t => `sms:&body=${encodeURIComponent(t)}`;

// ---------- screens ----------
export async function buyerRepHTML(limit = 20) {
  const { deals, asOf, nListings } = await buyerRepDeals();
  if (!nListings) return `<div class="muted xs">Import a CoStar, LoopNet or Crexi <b>for-sale</b> export (Menu › Import) and buyers on a deadline get matched to listings automatically. The buyer side of someone else's listing is the fastest commission there is.</div>`;
  if (!deals.length) return `<div class="muted xs">${fmt(nListings)} listings on file (${esc(asOf)}), no buyer fits yet. Add buyer clients in Buyers, or import a wider listing search.</div>`;
  return `<div class="xs muted" style="margin:0 0 8px">${fmt(nListings)} for-sale listing${nListings === 1 ? '' : 's'} as of ${esc(asOf)}. Fee = buyer's side of a co-broke (${(cfg().sale / 2).toFixed(2)}%) after your split. Register the buyer with the listing broker before you show anything.</div>` +
    deals.slice(0, limit).map(d => `<div class="pcall${d.done ? ' muted' : ''}"><div class="pc-top"><span class="tag ${d.kind === '1031' ? 'sig' : d.kind === 'client' ? 'ok' : ''}">${d.kind === '1031' ? '1031 clock' : d.kind === 'client' ? 'Your buyer' : 'Repeat buyer'}</span><div class="pc-who"><b>${esc(d.name)}</b><span class="xs muted">${esc(d.why)}</span></div><a class="bact primary pc-call" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent('"' + d.name + '" phone')}">Find #</a></div>
      <div class="pc-chip"><span class="tag" style="background:#dcfce7;color:#166534">≈ ${kmoney(d.fee)} to you (est.)</span></div>
      <ol class="xs" style="margin:6px 0 4px 18px;padding:0">${d.fits.map(f => `<li>${esc(optLine(f))}${f.r.agent ? ` <span class="muted">· listed by ${esc(nc(f.r.agent))}</span>` : ''}</li>`).join('')}</ol>
      <div class="btnrow" style="display:flex;gap:6px;flex-wrap:wrap"><a class="btn sm" href="${smsHref(brText(d))}">Text ${d.fits.length === 1 ? "this option" : "the " + d.fits.length + " options"}</a><button class="btn sm" data-brcopy="${esc(d.key)}">Copy</button><button class="btn sm ghost" data-brdone="${esc(d.key)}">${d.done ? 'Undo sent' : 'Mark sent'}</button></div><textarea hidden data-brtxt="${esc(d.key)}">${esc(brText(d))}</textarea></div>`).join('');
}
export function bindBuyerRep(root, after) {
  $$('[data-brcopy]', root).forEach(b => b.onclick = () => { const t = root.querySelector(`[data-brtxt="${CSS.escape(b.dataset.brcopy)}"]`); navigator.clipboard?.writeText(t ? t.value : '').then(() => toast('Copied')); });
  $$('[data-brdone]', root).forEach(b => b.onclick = async () => { const D = { ...(setting('brDone', {}) || {}) }; if (D[b.dataset.brdone]) delete D[b.dataset.brdone]; else D[b.dataset.brdone] = today(); await setSetting('brDone', D); after && after(); });
}
export async function buyerRepView(el) {
  el.innerHTML = `<div class="page narrow plan"><h1>Buyer-rep deals</h1><p class="explain">Buyers who have to act, matched to properties already for sale in your exports. No seller to convince: show it, write it up, close in 60 to 90 days.</p><div id="brx">Loading…</div></div>`;
  const x = $('#brx', el); x.innerHTML = await buyerRepHTML(40); bindBuyerRep(x, () => buyerRepView(el));
}
export async function buyerRepCount() { try { const { deals } = await buyerRepDeals(); return Math.min(99, deals.filter(d => !d.done && (d.kind !== 'buyer' || d.urgency > 1)).length); } catch (e) { return 0; } }
