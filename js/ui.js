import { phoneFromResult } from './contacts.js';
import { $, $$, esc, toast, addDays, today, uid, CONF, CONF_OPTS, badge, SCORE_BANDS } from './util.js';
import { S, save, addActivity, addFollowup, ownerFollowups, STAGES } from './store.js';

// ---------- Generic sortable, paged table ----------
// cols: [{k, l, v:(row)=>value for sort, h:(row)=>html, cls}]
export function table(el, rows, cols, opt = {}) {
  const st = { key: opt.sort || null, dir: opt.dir || -1, shown: opt.page || 100 };
  const draw = () => {
    let r = rows;
    if (st.key) { const c = cols.find(c => c.k === st.key) || (opt.sortCol && opt.sortCol.k === st.key ? opt.sortCol : null) || cols[0]; const g = c.v || (x => x[c.k]); r = [...rows].sort((a, b) => { const x = g(a), y = g(b); if (x == null || x === '') return 1; if (y == null || y === '') return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.dir; }); }
    el.innerHTML = `<div class="tbl-wrap"><table class="grid"><thead><tr>${cols.map(c => `<th data-k="${c.k}" class="${c.cls || ''} ${st.key === c.k ? (st.dir > 0 ? 'asc' : 'desc') : ''}">${c.l}</th>`).join('')}</tr></thead><tbody>${r.slice(0, st.shown).map((x, i) => `<tr data-i="${rows.indexOf(x)}" ${opt.href ? `data-href="${esc(opt.href(x))}"` : ''}>${cols.map((c, ci) => `<td class="${c.cls || ''}${ci === 0 ? ' c0' : ''}" data-l="${esc(c.l)}">${c.h ? c.h(x) : esc(x[c.k] ?? '')}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="empty">${opt.empty || 'Nothing here yet.'}</td></tr>`}</tbody></table></div>${r.length > st.shown ? `<button class="btn ghost more">Show more (${(r.length - st.shown).toLocaleString()} more)</button>` : ''}`;
    $$('th', el).forEach(th => th.onclick = () => { st.dir = st.key === th.dataset.k ? -st.dir : (opt.ascKeys || []).includes(th.dataset.k) ? 1 : -1; st.key = th.dataset.k; draw(); });
    const m = $('.more', el); if (m) m.onclick = () => { st.shown += 300; draw(); };
    $$('tbody tr[data-href]', el).forEach(tr => tr.onclick = e => { if (e.target.closest('a,button,input,select')) return; location.hash = tr.dataset.href; });
  };
  draw();
}
// ---------- Modal ----------
export function modal(html, onMount) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="modal-card">${html}</div>`;
  document.body.appendChild(m); const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  if (onMount) onMount(m.querySelector('.modal-card'), close); return close;
}
// ---------- Score color legend (always visible where scores appear) ----------
export const scoreLegend = (cls = '') => `<div class="slegend ${cls}" role="note" aria-label="Score colors"><span class="sl-t">Score colors</span>${SCORE_BANDS.map(b => `<span class="sl-i"><span class="sl-dot" style="background:${b.color}"></span><b>${b.name} ${b.range}</b> <span class="sl-l">${b.label}</span></span>`).join('')}<button type="button" class="sl-q" data-sclegend aria-label="What do the scores mean?" title="What do the scores mean?">?</button></div>`;
export const scoreHelpBtn = () => `<button type="button" class="sl-q sm" data-sclegend aria-label="What does the score mean?" title="What does the score mean?">?</button>`;
export function scoreHelp() {
  modal(`<div class="ch"><h2>What the score means</h2><button class="x" data-close>✕</button></div>
    <div class="slhelp">
      <p>The <b>off-market score (0–100)</b> estimates how likely an owner <b>may be open to a deal</b> before the property is listed. It is a guide for who to call first, <b>not a promise</b> that anyone will sell.</p>
      <ul class="sl-list">${SCORE_BANDS.map(b => `<li><span class="sl-dot" style="background:${b.color}"></span><span><b>${b.name} ${b.range}</b>: ${b.label}</span></li>`).join('')}</ul>
      <p><b>Where it comes from:</b> public records such as how long the owner has held the property, an out-of-state or different tax-bill address, the type of owner (person, trust, estate, company), building age, low building value compared to land, and how many parcels the owner holds. Extra points come from events like a plant-closing notice, a tax-delinquency listing, a loan coming due, a fresh ownership or mailing-address change, and anything you enter (lease expiring, motivation, vacancy).</p>
      <p><b>Tap any property</b> to see the exact signals behind its score, each labeled as a fact, an inference, an estimate, or your own note, with the points it adds.</p>
      <p><b>Missing data is neutral.</b> Some counties publish fewer data fields (for example no sale history, building age, or owner mailing address). A missing field counts as average, not as a bad sign, but with fewer facts the score is less certain. Compare properties within the same county when you can.</p><p><b>Guard rails.</b> No single factor can add more than about a quarter of the public-record score. Public-record bonus flags (tax jumps, permits, notices) are capped at +20 in total. Big companies and utilities count as unlikely sellers. The color is the likelihood of a sale; the call list also weighs deal size, so big deals rank above tiny parcels.</p>
      <p class="muted xs">Map dots and score badges use these colors. "Deal priority" in the call list uses the same colors but also weighs deal size, follow-ups due and buyer matches. You can change the weights in Tools → Settings.</p>
    </div><div class="mfoot"><button class="btn primary" data-close>Got it</button></div>`);
}
export const confSelect = (name, cur) => `<select name="${name}" class="conf-sel">${CONF_OPTS.map(c => `<option value="${c}" ${c === cur ? 'selected' : ''}>${CONF[c].label}</option>`).join('')}</select>`;
export const stageSelect = (cur, attr = '') => `<select ${attr}>${STAGES.map(s => `<option ${s === (cur || 'New') ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
export const prioSelect = (cur, attr = '') => `<select ${attr}>${['', 'A', 'B', 'C'].map(s => `<option value="${s}" ${s === (cur || '') ? 'selected' : ''}>${s ? 'Priority ' + s : 'No priority'}</option>`).join('')}</select>`;
export const kindTag = k => ({ fact: '<span class="kt k-fact">fact</span>', inferred: '<span class="kt k-inf">inferred</span>', broker: '<span class="kt k-broker">broker</span>', estimated: '<span class="kt k-est">estimated</span>', crm: '<span class="kt k-crm">CRM</span>', score: '<span class="kt k-fact">score</span>', match: '<span class="kt k-match">match</span>', fresh: '<span class="kt k-fresh">fresh</span>' }[k] || (CONF[k] ? badge(k) : ''));

// ---------- Fast call logging + follow-up engine ----------
export const RESULTS = [
  ['No answer', 'Attempted', 2], ['Left voicemail', 'Attempted', 3], ['Wrong number', null, null], ['Call back later', 'Connected', 14],
  ['Send info', 'Nurturing', 3], ['Interested', 'Interested', 2], ['Meeting set', 'Meeting set', 7], ['Not interested', 'Not interested', 180], ['Do not contact', 'Do not contact', null],
];
const ORDER = s => STAGES.indexOf(s || 'New');
export async function logResult({ ownerId, propertyId, companyId, result, note, fuDate, type = 'Call' }) {
  const rr = RESULTS.find(r => r[0] === result);
  await addActivity({ type, result, ownerId, propertyId, companyId, note });
  const o = ownerId && S.owners.get(ownerId);
  if (o) {
    o.lastContact = today();
    if (rr && rr[1]) { const keepHigher = ['Attempted', 'Connected', 'Nurturing'].includes(rr[1]) && ORDER(o.stage) > ORDER(rr[1]) && ORDER(o.stage) < ORDER('Not interested'); if (!keepHigher) o.stage = rr[1]; }
    if (result === 'Wrong number') o.needsResearch = true;
    phoneFromResult(o, result);
    await save('owners', o);
    for (const f of ownerFollowups(ownerId)) { f.done = true; f.doneTs = Date.now(); await save('followups', f); }
  }
  const days = rr ? rr[2] : null;
  if ((fuDate || days != null) && result !== 'Do not contact') {
    await addFollowup({ ownerId, propertyId, companyId, due: fuDate || addDays(today(), days), note: result === 'Send info' ? 'Send info / follow up' : result === 'Meeting set' ? 'Meeting' : `After: ${result}`, auto: !fuDate });
  }
  toast(`Logged: ${result}${fuDate || days != null ? ' · follow-up ' + (fuDate || addDays(today(), days)) : ''}`);
}
export function quickLogHTML(id = 'ql') {
  return `<div class="quicklog" id="${id}"><textarea class="ql-note" rows="2" placeholder="Call note (optional), then tap a result"></textarea>
  <div class="ql-btns">${RESULTS.map(r => `<button class="btn res res-${r[0].replace(/\W+/g, '').toLowerCase()}" data-res="${esc(r[0])}">${r[0]}</button>`).join('')}</div>
  <div class="ql-row"><label>Custom follow-up <input type="date" class="ql-date"></label><button class="btn ghost ql-noteonly">Save note only</button></div></div>`;
}
export function bindQuickLog(root, ctx, after) {
  const q = $('.quicklog', root); if (!q) return;
  $$('[data-res]', q).forEach(b => b.onclick = async () => { await logResult({ ...ctx, result: b.dataset.res, note: $('.ql-note', q).value.trim(), fuDate: $('.ql-date', q).value || null }); after && after(b.dataset.res); });
  $('.ql-noteonly', q).onclick = async () => { const n = $('.ql-note', q).value.trim(); if (!n) return; await addActivity({ type: 'Note', ...ctx, note: n }); if ($('.ql-date', q).value) await addFollowup({ ...ctx, due: $('.ql-date', q).value, note: n.slice(0, 80) }); toast('Note saved'); after && after('note'); };
}
export function activityHTML(list) {
  if (!list.length) return '<div class="muted">No activity yet.</div>';
  return `<ul class="acts">${list.slice(0, 50).map(a => `<li><span class="when">${new Date(a.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span> <b>${esc(a.type)}${a.result ? ' · ' + esc(a.result) : ''}</b>${a.note ? `<div class="note">${esc(a.note)}</div>` : ''}</li>`).join('')}</ul>`;
}
export function linksHTML(L) { return `<div class="links">${L.map(([l, u]) => `<a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(u)}">${esc(l)} ↗</a>`).join('')}</div>`; }
