// "Call owner": one handler for every Call button ([data-call="<propertyId>"] or [data-call="o:<ownerId>"]).
// Saved owner contacts first, then PUBLIC business lines / emails found at the owner's properties (FMCSA registry, OpenStreetMap),
// always labeled as a business line or email, never as the owner's personal contact. Nothing is guessed.
import { esc, toast } from './util.js';
import { S, val, ownerProps } from './store.js';
import { modal } from './ui.js';
import { nc } from './extras.js';
import { ILSOS, cleanEntity } from './trueowner.js';
const SRC = { FMCSA: 'FMCSA motor carrier registry', OSM: 'OpenStreetMap' };
const enc = encodeURIComponent, digits = t => String(t).replace(/[^\d+]/g, '');
export function contactOptions(p, o) {
  const props = o ? ownerProps(o.id || o) : []; const all = p ? [p, ...props.filter(x => x.id !== p.id)] : props;
  const phones = [], emails = [], seenT = new Set(), seenE = new Set();
  if (o && o.phone) { phones.push({ t: o.phone, l: `Saved contact${o.contactName ? ' · ' + o.contactName : ''}`, sub: (o.cv && o.cv.phone && o.cv.phone.st) || 'Unverified', own: 1 }); seenT.add(digits(o.phone).slice(-10)); }
  if (o && o.email) { emails.push({ e: o.email, l: 'Saved contact email', sub: (o.cv && o.cv.email && o.cv.email.st) || 'Unverified', own: 1 }); seenE.add(o.email.toLowerCase()); }
  for (const x of all.slice(0, 40)) {
    const at = nc(val(x, 'address') || x.pin || '');
    for (const b of x.bph || []) { const k = digits(b.t).slice(-10); if (seenT.has(k)) continue; seenT.add(k); phones.push({ t: b.t, l: `${nc(b.n)} · business line`, sub: `at ${at} · ${SRC[b.s] || b.s} (${b.ref}) · not the owner's personal number`, w: b.w }); }
    for (const b of x.bem || []) { if (seenE.has(b.e)) continue; seenE.add(b.e); emails.push({ e: b.e, l: `${nc(b.n)} · business email`, sub: `at ${at} · ${SRC[b.s] || b.s} (${b.ref}) · not the owner's personal email` }); }
  }
  return { phones, emails };
}
const go = href => { const a = document.createElement('a'); a.href = href; a.className = 'callgo'; document.body.appendChild(a); a.click(); a.remove(); };
export function openCall(key) {
  let p = null, o = null;
  if (key.startsWith('o:')) { o = S.owners.get(key.slice(2)); p = o ? ownerProps(o.id)[0] : null; } else { p = S.prop.get(key); o = p && p.ownerId ? S.owners.get(p.ownerId) : null; }
  const { phones, emails } = contactOptions(p, o), name = nc(o ? o.name : p ? val(p, 'taxpayer') || '' : '');
  if (phones.length === 1 && !emails.length) { go('tel:' + digits(phones[0].t)); return; }
  const logA = o ? `<a class="btn" href="#/prospect/${o.id}" data-close>Log a call</a>` : '';
  if (!phones.length && !emails.length) {
    const ent = cleanEntity(name || '');
    modal(`<div class="cp"><h2>No phone on file yet</h2><p class="muted">${esc(name || 'This owner')}: no saved contact and no public business line or email at ${o ? 'its properties' : 'this property'}.</p>
      <div class="cp-acts">${o ? `<a class="btn primary" href="#/owner/${o.id}" data-close>Add a phone</a>` : ''}<button class="btn" data-sos>True owner: IL Secretary of State</button>
      <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/search?q=${enc('"' + ent + '" phone')}">Search owner online</a><a class="btn" target="_blank" rel="noopener" href="https://opencorporates.com/companies/us_il?q=${enc(ent)}">OpenCorporates</a>${logA}</div>
      <div class="cp-f"><button class="btn ghost" data-close>Close</button></div></div>`, m => { const b = m.querySelector('[data-sos]'); if (b) b.onclick = async () => { try { await navigator.clipboard.writeText(ent); toast('Name copied: paste it into the SOS search'); } catch {} window.open(ILSOS, '_blank', 'noopener'); }; });
    return;
  }
  modal(`<div class="cp"><h2>Call ${esc(name || 'owner')}</h2>
    ${phones.length ? `<div class="cp-l">Phones</div><ul class="cp-list">${phones.map(x => `<li><a class="btn ${x.own ? 'primary' : ''}" href="tel:${digits(x.t)}">☎ ${esc(x.t)}</a><div><b>${esc(x.l)}</b><div class="xs muted">${esc(x.sub)}${x.w ? ` · <a href="${esc(x.w)}" target="_blank" rel="noopener">website</a>` : ''}</div></div></li>`).join('')}</ul>` : '<div class="muted xs">No phone on file yet.</div>'}
    ${emails.length ? `<div class="cp-l">Emails</div><ul class="cp-list">${emails.map(x => `<li><a class="btn" href="mailto:${esc(x.e)}">✉ ${esc(x.e)}</a><div><b>${esc(x.l)}</b><div class="xs muted">${esc(x.sub)}</div></div></li>`).join('')}</ul>` : ''}
    <div class="xs muted">Business lines and emails are public listings at the property; they may reach a tenant or operator, not the owner.</div>
    <div class="cp-f">${o ? `<a class="btn" href="#/owner/${o.id}" data-close>Add a phone</a>` : ''}${logA}<button class="btn ghost" data-close>Close</button></div></div>`);
}
let bound = false;
export function bindCall() { if (bound) return; bound = true;
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-call]'); if (!b) return; e.preventDefault(); e.stopPropagation(); openCall(b.dataset.call); }, true); }
