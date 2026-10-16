// National Do Not Call Registry scrub for RESIDENTIAL cold calls. He registers at telemarketing.donotcall.gov (free for up to 5 area codes),
// downloads the list files, and imports them here. Numbers stay on this device (IndexedDB 'omi-dnc'). Business-to-business calls to
// commercial owners are not covered by the registry, so only residential cards are checked. Not legal advice.
import { $, esc, fmt, today, toast } from './util.js';
import { setting, setSetting } from './store.js';

let dbp; const idb = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('omi-dnc', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
const kv = (mode, fn) => idb().then(db => new Promise((res, rej) => { const t = db.transaction('kv', mode), q = fn(t.objectStore('kv')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
let SET = null;
export async function dncLoad() { if (SET) return SET; const a = await kv('readonly', s => s.get('nums')).catch(() => null); SET = new Set(a || []); return SET; }
export const dncReady = () => !!(SET && SET.size);
export const digits10 = v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; };
export const isDNC = phone => { const d = digits10(phone); return !!(d && SET && SET.has(d)); };
export async function dncImport(file) {
  const txt = await file.text(), out = new Set(await dncLoad());
  // registry files: one number per line as "312,5550100" or "3125550100"; CSV exports with other columns are read for 10-digit numbers
  for (const line of txt.split(/\r?\n/)) { const m = line.replace(/[^\d,]/g, '').match(/^(\d{3}),?(\d{7})(?:\D|$)/); if (m) out.add(m[1] + m[2]); else { const d = digits10(line.replace(/[^\d]/g, '')); if (d) out.add(d); } }
  await kv('readwrite', s => s.put([...out], 'nums')); SET = out;
  const meta = { ...(setting('dncMeta', {}) || {}), at: today(), n: out.size, files: [...new Set([...((setting('dncMeta', {}) || {}).files || []), file.name])].slice(-10) }; await setSetting('dncMeta', meta);
  return out.size;
}
export async function dncClear() { await kv('readwrite', s => s.delete('nums')); SET = new Set(); await setSetting('dncMeta', {}); }
export function dncCardHTML() { const m = setting('dncMeta', {}) || {};
  return `<section class="card"><div class="ch"><h2>Do Not Call list (residential)</h2>${m.n ? `<span class="xs muted">${fmt(m.n)} numbers · ${esc(m.at)}</span>` : ''}</div>
    <p class="xs">Cold-calling homeowners requires scrubbing against the National Do Not Call Registry. Register at <a target="_blank" rel="noopener" href="https://telemarketing.donotcall.gov/">telemarketing.donotcall.gov</a> (free for up to 5 area codes, for example 312, 773, 708, 847, 630), download the list, and import it here. Residential call buttons then show "On DNC list: mail instead" for those numbers. Re-download every 31 days. Calls to businesses about their commercial property are not covered by the registry.</p>
    <label class="btn">Import DNC file<input type="file" id="dncf" accept=".txt,.csv" hidden></label> ${m.n ? '<button class="btn ghost sm" id="dncclr">Remove list</button>' : ''} <span class="xs muted" id="dncm"></span></section>`; }
export function bindDnc(root, after) {
  const f = $('#dncf', root); if (f) f.onchange = async e => { const file = e.target.files[0]; if (!file) return; $('#dncm', root).textContent = 'Reading…'; try { const n = await dncImport(file); toast(`DNC list: ${fmt(n)} numbers on this device`); after && after(); } catch (err) { $('#dncm', root).textContent = 'Could not read: ' + err.message; } };
  const c = $('#dncclr', root); if (c) c.onclick = async () => { if (confirm('Remove the DNC list from this device?')) { await dncClear(); after && after(); } };
}
