// Listing status: set MANUALLY by the user only (never inferred). Saved on this device in settings (rides along in backup / export),
// keyed by normalized site address + city, so marking one parcel marks every parcel at the same address.
import { $$, esc, toast, today } from './util.js';
import { S, val, setting, setSetting } from './store.js';
export const LSTAT = ['For sale', 'For lease', 'Both', 'Off-market'];
const norm = s => String(s || '').toUpperCase().replace(/[.,#'"]/g, ' ').replace(/\b(STREET)\b/g, 'ST').replace(/\b(AVENUE)\b/g, 'AVE').replace(/\b(ROAD)\b/g, 'RD').replace(/\b(DRIVE)\b/g, 'DR').replace(/\b(BOULEVARD)\b/g, 'BLVD').replace(/\s+/g, ' ').trim();
export const lsKey = p => { const a = norm(val(p, 'address')); return a ? a + '|' + norm(val(p, 'city') || val(p, 'municipality')) : 'id:' + p.id; };
const all = () => setting('lstat', {});
export const lstatOf = p => all()[lsKey(p)] || null;           // { s: 'For sale', d: 'YYYY-MM-DD' } or null (= Not checked)
export function setLstat(p, s) {
  const m = { ...all() }, k = lsKey(p);
  if (!s) delete m[k]; else m[k] = { s, d: today() };
  setSetting('lstat', m);
  return S.props.filter(x => lsKey(x) === k).length || 1;
}
const CLS = { 'For sale': 'ls-sale', 'For lease': 'ls-lease', Both: 'ls-both', 'Off-market': 'ls-off' };
export const lstatBadge = p => { const x = lstatOf(p); return x ? ` <span class="lsb ${CLS[x.s] || ''}" data-lsb="${esc(lsKey(p))}" title="Listing status set by you on ${esc(x.d)}">${esc(x.s)}</span>` : ''; };
// filter value: '' any · 'For sale' (incl. Both) · 'For lease' (incl. Both) · 'Both' · 'Off-market' · 'none' (not checked)
export function lstatMatch(p, f) {
  if (!f) return true; const x = lstatOf(p), s = x && x.s;
  if (f === 'none') return !s; if (f === 'For sale') return s === 'For sale' || s === 'Both'; if (f === 'For lease') return s === 'For lease' || s === 'Both'; return s === f;
}
export const LSF = [['', 'Any'], ['For sale', 'For sale'], ['For lease', 'For lease'], ['Both', 'Both'], ['Off-market', 'Off-market'], ['none', 'Not checked']];
export function lstatControl(p) {
  const x = lstatOf(p);
  return `<div class="lsctl"><label for="lsel"><b>Listing status</b> <span class="xs muted">(set by you)</span></label> <select id="lsel" data-lstat="${esc(p.id)}">${['', ...LSTAT].map(s => `<option value="${s}" ${(x ? x.s : '') === s ? 'selected' : ''}>${s || 'Not checked'}</option>`).join('')}</select> <span class="xs muted" id="lsd">${x ? 'marked ' + esc(x.d) : ''}</span></div>`;
}
let bound = false;
export function bindLstat() {
  if (bound) return; bound = true;
  document.addEventListener('change', e => {
    const sel = e.target.closest && e.target.closest('[data-lstat]'); if (!sel) return;
    const id = sel.dataset.lstat, p = S.prop.get(id) || S.props.find(x => x.id === id); if (!p) return;
    const n = setLstat(p, sel.value), x = lstatOf(p);
    const d = document.getElementById('lsd'); if (d) d.textContent = x ? 'marked ' + x.d : '';
    toast(sel.value ? `Listing status: ${sel.value}${n > 1 ? ` (applied to ${n} parcels at this address)` : ''}` : 'Listing status cleared');
  });
}
