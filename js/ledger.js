// One touch ledger for every list. Outcomes are keyed by owner id ('outc'), but the same owner shows up in Today, Big Deals,
// Off-Market, Stacked, Sale-leasebacks and the apartment/residential lists under different ids. This index lets any card ask
// "has he already talked to this owner / this address?" by name or street address, and shows where the touch came from.
import { setting, setSetting, S, val, save } from './store.js';
import { normName, normAddr, today, daysBetween, esc, toast } from './util.js';

const LAB = { na: 'No answer', vm: 'Left VM', talked: 'Talked', int: 'Interested', no: 'Pass', mtg: 'Meeting set', prop: 'Proposal sent' };
const akey = (addr, city) => normAddr(addr).replace(/\s+/g, ' ') + '|' + String(city || '').toUpperCase().trim();
export async function logTouch({ oid, pid, name, addr, city, o, src = 'Today', note = '' }) {
  const t = today(), L = { ...(setting('ledger', { n: {}, a: {} }) || { n: {}, a: {} }) }, rec = { d: t, o, src, oid: oid || '', pid: pid || '', note };
  const push = (m, k) => { if (!k || k.length < 4) return; m[k] = [rec, ...(m[k] || [])].slice(0, 12); };
  const nm = normName(name || (oid && S.owners.get(oid)?.name) || (pid && val(S.prop.get(pid), 'taxpayer')) || '');
  push(L.n, nm);
  const p = pid && S.prop.get(pid); push(L.a, akey(addr || (p && val(p, 'address')) || '', city || (p && val(p, 'city')) || ''));
  await setSetting('ledger', L);
}
// most recent touch for an owner name and/or address, from any list
export function lastTouch({ oid, name, addr, city }) {
  const L = setting('ledger', null); let best = null;
  const take = r => { if (r && (!best || r.d > best.d)) best = r; };
  if (oid) { const x = ((setting('outc', {}) || {})[oid] || [])[0]; if (x) take({ d: x.d, o: x.o, src: 'Today' }); }
  if (L) { const nm = normName(name || (oid && S.owners.get(oid)?.name) || ''); if (nm.length >= 4) take((L.n[nm] || [])[0]); const ak = akey(addr, city); if (addr) take((L.a[ak] || [])[0]); }
  return best;
}
export const touchLabel = r => r ? `${LAB[r.o] || r.o} ${r.d}${r.src && r.src !== 'Today' ? ' · ' + r.src : ''}` : '';
export const touchHTML = q => { const r = lastTouch(q); if (!r) return ''; const fresh = daysBetween(r.d, today()) <= 14; return `<span class="lastout${fresh ? ' fresh' : ''}" title="Last contact, from any screen">${fresh ? '⚠ ' : ''}Last: ${esc(touchLabel(r))}</span>`; };
export const touchedRecently = (q, days = 14) => { const r = lastTouch(q); return !!(r && daysBetween(r.d, today()) <= days); };

// ---------- save a found phone number / LLC manager straight onto the owner, so it's never looked up twice ----------
export const contactBox = oid => { const o = S.owners.get(oid); if (!o) return '';
  return `<div class="cbox" style="margin:8px 0"><div class="xs muted" style="margin-bottom:4px">Found the number? Save it here once and the Call button uses it from now on.</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><input data-cphone="${esc(oid)}" type="tel" placeholder="Phone" value="${esc(o.phone || '')}" style="flex:1 1 130px;min-height:40px;font-size:16px"><input data-cname="${esc(oid)}" placeholder="Person / LLC manager" value="${esc(o.contactName || '')}" style="flex:1 1 150px;min-height:40px;font-size:16px"><button class="btn sm primary" data-csave="${esc(oid)}" style="min-height:40px">Save</button></div>
    <div class="xs muted" style="margin-top:4px">LLC or trust? <a target="_blank" rel="noopener" href="https://apps.ilsos.gov/businessentitysearch/">Look up the manager (IL Secretary of State)</a>, then paste the name above.</div></div>`; };
export function bindContactBox(root, after) {
  root.querySelectorAll('[data-csave]').forEach(b => b.onclick = async () => { const oid = b.dataset.csave, o = S.owners.get(oid); if (!o) return;
    const ph = root.querySelector(`[data-cphone="${CSS.escape(oid)}"]`), nm = root.querySelector(`[data-cname="${CSS.escape(oid)}"]`);
    o.phone = (ph && ph.value.trim()) || o.phone || ''; o.contactName = (nm && nm.value.trim()) || o.contactName || ''; o.cv = o.cv || {}; if (o.phone) o.cv.phone = { st: 'Unverified', src: 'Entered by me', d: today() };
    await save('owners', o); toast('Saved to the owner'); after && after(); });
}
