// Owner contact verification + "Find the real owner" workflow. Links only: nothing is looked up automatically,
// and no contact is ever guessed. A contact counts as "found" only when the broker marks it Verified.
import { $, $$, esc, today, d8, toast } from './util.js';
import { S, save, val, ownerProps } from './store.js';
import { MARKET } from './markets.js';
const enc = encodeURIComponent, g = q => `https://www.google.com/search?q=${enc(q)}`;
export const CFIELDS = [['contactName', 'Decision maker', 'text'], ['phone', 'Phone', 'tel'], ['email', 'Email', 'email'], ['linkedin', 'LinkedIn URL', 'url']];
export const CSTAT = { contactName: ['Unverified', 'Verified', 'Wrong person'], phone: ['Unverified', 'Verified', 'Bad number'], email: ['Unverified', 'Verified', 'Bounced'], linkedin: ['Unverified', 'Verified', 'Wrong person'] };
export const TAXNOTE = 'Public record (tax bill). May be a trust, manager, tax agent or attorney, not the decision maker.';
// Contact status for one field (migrates the older single "contact confidence" field)
export function cstat(o, k) { const c = (o.cv || {})[k]; if (c) return c; if (!o[k]) return null; return { st: o.contactConf === 'confirmed' ? 'Verified' : 'Unverified', src: o.contactConf === 'broker' ? 'Broker entered' : '', dt: '' }; }
export const isGood = (o, k) => !!o[k] && cstat(o, k)?.st === 'Verified';
export const contactFound = o => !!o && (isGood(o, 'phone') || isGood(o, 'email'));
export function contactBadge(o) {
  if (!o) return '';
  if (contactFound(o)) return '<span class="tag cfound" title="Phone or email marked Verified">✓ Contact found</span>';
  if (o.phone || o.email) return '<span class="tag cunv" title="Contact info on file but not verified">Contact unverified</span>';
  return '<span class="tag cnone" title="No phone or email on file">No contact</span>';
}
// Call-ready phone: never offer a number marked bad
export const callablePhone = o => o && o.phone && cstat(o, 'phone')?.st !== 'Bad number' ? o.phone : '';
export function contactFormHTML(o) {
  return `<div class="cgrid">${CFIELDS.map(([k, l, t]) => { const c = cstat(o, k) || {}; return `<div class="crow"><label>${l}<input name="c_${k}" type="${t}" value="${esc(o[k] || '')}"></label>
    <label>Status<select name="cs_${k}">${CSTAT[k].map(s => `<option ${s === (c.st || 'Unverified') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label>Source<input name="csrc_${k}" value="${esc(c.src || '')}" placeholder="e.g. IL SOS annual report, called & confirmed"></label>
    <label>Date checked<input name="cdt_${k}" type="date" value="${esc(c.dt || '')}"></label></div>`; }).join('')}
    <div class="xs muted">Only enter contact info you found in a real source. Mark it Verified once you have confirmed it (e.g. reached the person). Unverified and bad numbers never count as "contact found".</div></div>`;
}
export function readContactForm(o, fd) {
  o.cv = o.cv || {};
  for (const [k] of CFIELDS) {
    const v = (fd.get('c_' + k) || '').trim(), prev = cstat(o, k) || {}, st = fd.get('cs_' + k), src = (fd.get('csrc_' + k) || '').trim(); let dt = fd.get('cdt_' + k) || '';
    if (v && !dt && (v !== (o[k] || '') || st !== (prev.st || 'Unverified'))) dt = today();
    o[k] = v; o.cv[k] = v ? { st, src, dt } : null;
  }
}
// Call results update phone status (reaching someone verifies the number; wrong number marks it bad)
export function phoneFromResult(o, result) {
  if (!o || !o.phone) return; o.cv = o.cv || {};
  if (result === 'Wrong number') o.cv.phone = { ...(cstat(o, 'phone') || {}), st: 'Bad number', src: 'Call result: wrong number', dt: today() };
  else if (['Call back later', 'Send info', 'Interested', 'Meeting set', 'Not interested'].includes(result)) o.cv.phone = { ...(cstat(o, 'phone') || {}), st: 'Verified', src: 'Reached owner on call', dt: today() };
}
const isEntity = n => /\b(LLC|L L C|INC|CORP|CORPORATION|CO|COMPANY|LP|LLP|LTD|TRUST|PARTNERS|HOLDINGS|PROPERTIES|REALTY|INVESTMENTS?|ENTERPRISES|GROUP|VENTURES)\b/i.test(n);
export const FRO_STEPS = [
  ['tax', 'Tax bill name + mailing address checked (assessor / treasurer)'], ['deed', 'Deed pulled: grantee and date from county recorder'],
  ['sos', 'IL Secretary of State: registered agent, managers / members (tip: search by Manager name to find their other LLCs)'], ['oc', 'OpenCorporates: officers and related entities'],
  ['web', 'Web search: entity + LLC / manager, mailing address'], ['people', 'People found and searched on LinkedIn'], ['logged', 'Contact recorded with source and date'],
];
export function findOwnerHTML(o) {
  const props = ownerProps(o.id), top = props[0];
  const tp = top ? Object.fromEntries(['address', 'city', 'zip', 'county', 'pin'].map(k => [k, val(top, k)])) : null, cty = tp && MARKET.counties[tp.county] || {};
  const names = [...new Set([o.name, ...(o.entities || [])])].slice(0, 4), mail = [o.mail?.addr, o.mail?.city, o.mail?.st].filter(Boolean).join(' ');
  const L = (l, u) => u ? `<a class="lnk" target="_blank" rel="noopener" href="${esc(u)}">${esc(l)} ↗</a>` : '';
  const ppl = (o.foundNames || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  const step = (k, l, links) => `<li><label><input type="checkbox" data-fro="${k}" ${(o.fro || {})[k] ? 'checked' : ''}> ${esc(l)}</label><div class="fl">${links}</div></li>`;
  return `<ol class="fro">
    ${step('tax', FRO_STEPS[0][1], (tp ? L('Assessor', cty.assessor && cty.assessor(tp)) + L('Treasurer / tax bill', cty.treasurer && cty.treasurer(tp)) : '') + `<div class="xs muted">${TAXNOTE}</div>`)}
    ${step('deed', FRO_STEPS[1][1], tp ? L(`${tp.county} recorder`, cty.recorder && cty.recorder(tp)) + `<span class="xs muted"> search PIN ${esc(tp.pin || '')}; the grantee on the last deed is the legal owner</span>` : '')}
    ${step('sos', FRO_STEPS[2][1], L('IL SOS business search', MARKET.sos.url()) + names.filter(isEntity).map(n => `<button class="btn xs ghost" data-copy="${esc(n)}" title="Copy, then paste into the SOS search">Copy “${esc(n)}”</button>`).join(''))}
    ${step('oc', FRO_STEPS[3][1], names.map(n => L('OpenCorporates: ' + n, `https://opencorporates.com/companies/us_il?q=${enc(n)}`)).join(''))}
    ${step('web', FRO_STEPS[4][1], names.map(n => L(`“${n}” LLC manager`, g(`"${n}" LLC OR manager OR member OR president`))).join('') + names.slice(0, 2).map(n => L(`“${n}” registered agent`, g(`"${n}" "registered agent"`))).join('') + (mail ? L('Mailing address', g(`"${o.mail.addr}" ${o.mail.city || ''}`)) : ''))}
    ${step('people', FRO_STEPS[5][1], `<label class="full">Names found (managers, members, agent, grantee; comma separated)<input id="fnames" value="${esc(o.foundNames || '')}" placeholder="e.g. Jane Smith, John Doe"></label>${ppl.map(n => L('LinkedIn: ' + n, `https://www.linkedin.com/search/results/people/?keywords=${enc(n)}`) + L(`Google: ${n} + owner`, g(`"${n}" "${o.name}"`))).join('')}`)}
    ${step('logged', FRO_STEPS[6][1], '<span class="xs muted">Enter it in Contact below with status, source and date.</span>')}
  </ol>`;
}
export function bindFindOwner(root, o, after) {
  $$('[data-fro]', root).forEach(c => c.onchange = async () => { o.fro = { ...(o.fro || {}), [c.dataset.fro]: c.checked }; await save('owners', o); });
  $$('[data-copy]', root).forEach(b => b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('Copied: ' + b.dataset.copy), () => toast(b.dataset.copy)));
  const f = $('#fnames', root); if (f) f.onchange = async () => { o.foundNames = f.value.trim(); await save('owners', o); after && after(); };
}
export const froDone = o => FRO_STEPS.filter(([k]) => (o.fro || {})[k]).length;
