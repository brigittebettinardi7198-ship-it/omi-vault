// Advantage tools: likely occupants (who's inside), lease-expiration predictor (Estimated), sale-leaseback targets,
// absentee-owner letters + Avery 5160 labels, tax-appeal talking point. Real public records only; estimates say so and show the triggering record.
import { $, $$, esc, fmt, kmoney, today, addDays, daysBetween, toast } from './util.js';
import { S, val, setting, ownerProps } from './store.js';
import { deal, sfOf } from './scoring.js';
import { nc } from './extras.js';
import { table } from './ui.js';

const SUFX = /\b(LLC|L L C|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LP|LLP|THE|OF|AND|TRUST|TR|TRUSTEE|ESTATE|HOLDINGS?|PROPERTIES|PROPERTY|REALTY|REAL ESTATE|INVESTMENTS?|ENTERPRISES?|GROUP|PARTNERS(HIP)?|VENTURES?|MANAGEMENT|DEVELOPMENT|INDUSTRIAL|INDUSTRIES|ILLINOIS|CHICAGO|USA|AMERICA|NORTH|SOUTH|EAST|WEST|SERVICES?|TRANSPORT(ATION)?|LOGISTICS|TRUCKING|EXPRESS|INTERNATIONAL|SYSTEMS|MANUFACTURING|MFG|SUPPLY|DBA)\b/g;
const toks = s => String(s || '').toUpperCase().replace(/&/g, ' ').replace(/[^A-Z0-9 ]/g, ' ').replace(SUFX, ' ').split(/\s+/).filter(w => w.length >= 4);
const nkey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// ---------- 3) Who's inside ----------
export function occupants(p) {
  const out = [], seen = new Set(), add = (n, src, conf, ref, tel) => { n = String(n || '').replace(/^"|"$/g, '').trim(); const k = nkey(n); if (!n || seen.has(k)) { const e = out.find(x => nkey(x.n) === k); if (e && tel && !e.tel) e.tel = tel; return; } seen.add(k); out.push({ n, src, conf, ref, tel }); };
  for (const b of p.bph || []) add(b.n, b.s === 'FMCSA' ? 'FMCSA carrier registry' : 'OpenStreetMap business', b.s === 'FMCSA' || b.how === 'address' ? 'exact' : 'fuzzy', b.ref || '', b.t);
  if (p.fm) add(String(p.fm).replace(/\s*\(.*$/, ''), 'FMCSA carrier registry', 'exact', (String(p.fm).match(/USDOT \d+/) || [''])[0]);
  if (p.sba) { const m = String(p.sba).match(/ to (.+?), \$/); if (m) add(m[1], 'SBA 504 loan (FOIA)', 'exact', String(p.sba).match(/approved [\d-]+/)?.[0] || ''); }
  if (p.warn) add(String(p.warn).split(':')[0], 'IL WARN notice', 'exact', String(p.warn).match(/WARN notice [\d-]+/)?.[0] || '');
  return out;
}
export const occupantHTML = p => { const L = occupants(p); return L.length ? `<ul class="why occ">${L.map(x => `<li><b>${esc(nc(x.n))}</b> <span class="conf c-${x.conf === 'exact' ? 'pub' : 'inf'}">${x.conf === 'exact' ? 'Exact address match' : 'Fuzzy: mapped at this site'}</span> <span class="xs muted">${esc(x.src)}${x.ref ? ' · ' + esc(x.ref) : ''}</span>${x.tel ? ` <a class="btn sm" href="tel:${esc(x.tel.replace(/[^\d+]/g, ''))}">Call ${esc(x.tel)}</a>` : ''}</li>`).join('')}</ul><div class="xs muted">Likely occupant: a business registered at, or mapped to, this address. Not a confirmed tenant.</div>` : '<div class="muted">No business found at this address in FMCSA, SBA 504, WARN or OpenStreetMap records.</div>'; };
const ownerName = p => (p.ownerId && S.owners.get(p.ownerId)?.name) || val(p, 'taxpayer') || '';
export const ownerOccupied = p => { const ot = new Set(toks(ownerName(p))); if (!ot.size) return null; const hit = occupants(p).find(x => toks(x.n).some(w => ot.has(w))); return hit || (p.sba ? occupants(p).find(x => /SBA/.test(x.src)) : null); };
// ---------- 2) Lease expiration predictor (Estimated) ----------
const BUILD = /INTERIOR|BUILD[- ]?OUT|TENANT|DEMISING|OCCUPANCY|OFFICE (REMODEL|BUILD|ALTERATION)|ALTERATION|REMODEL|RENOVATION/i, NOTBUILD = /ROOF|TUCKPOINT|MASONRY|PARKING|FENCE|SIGN\b|SOLAR|ELEVATOR|BOILER|WRECK|DEMOL|SPRINKLER ONLY|LOW VOLTAGE/i;
export function leaseFlag(p) {
  if (leaseCache.v !== S.version) leaseCache = { v: S.version, m: new Map() }; if (leaseCache.m.has(p.id)) return leaseCache.m.get(p.id);
  const trig = [], t = today(), lo = addDays(t, 183), hi = addDays(t, 730);
  for (const x of [...(p.perm || []), ...(p.cperm || [])]) { const d = x.d, desc = String(x.desc || x.type || ''); if (d && BUILD.test(desc + ' ' + (x.type || '')) && !NOTBUILD.test(desc)) trig.push({ d, why: `buildout / alteration permit ${d}: “${desc.slice(0, 70)}”` }); }
  for (const d of [].concat(p.slb || [])) if (d) trig.push({ d, why: `sale-leaseback recorded ${d} (PTAX-203)` });
  const occ = occupants(p); if (p.sd && occ.length && !ownerOccupied(p)) trig.push({ d: p.sd, why: `sale ${p.sd} with an occupant (${nc(occ[0].n)}) who is not the owner` });
  let best = null;
  for (const g of trig) for (const y of [3, 5, 7, 10]) { const a = addDays(g.d, Math.round(y * 365.25)); if (a >= lo && a <= hi && (!best || a < best.due)) best = { due: a, yrs: y, trig: g.why }; }
  leaseCache.m.set(p.id, best); return best;
}
let leaseCache = { v: -1, m: new Map() };
export const leaseTxt = f => `Estimated lease event ~${f.due.slice(0, 7)} (${f.yrs}-year anniversary of ${f.trig})`;
export function leaseList() { return S.props.map(p => ({ p, f: leaseFlag(p) })).filter(x => x.f).sort((a, b) => a.f.due.localeCompare(b.f.due)); }
// ---------- 4) Sale-leaseback targets ----------
export function slbTargets() {
  const now = today(), out = [];
  for (const p of S.props) {
    if (p.vac) continue; const occ = ownerOccupied(p); if (!occ) continue; const R = [`Owner-user: ${nc(occ.n)} (${occ.src}) at the owner's own address`]; let s = 10;
    const sd = val(p, 'lastSaleDate'), yrs = sd ? daysBetween(sd, now) / 365.25 : p.holdplus ? 27 : 0; if (yrs >= 10) { s += Math.min(30, yrs); R.push(`owned ${Math.floor(yrs)}+ years (equity to unlock)`); }
    const yb = +val(p, 'yearBuilt'); if (yb && yb < 1990) { s += 10; R.push(`built ${yb}`); }
    if (['individual', 'trust', 'estate'].includes(p.ot)) { s += 15; R.push(`${p.ot} owner`); }
    if (p.sba) { s += 8; R.push('SBA 504 borrower (owner-occupied by program rule)'); }
    if (R.length < 2) continue; const d = deal(p); s += Math.min(25, (d.value || 0) / 1e6);
    out.push({ p, s: Math.round(s), R, d });
  }
  return out.sort((a, b) => b.s - a.s);
}
// ---------- 5) Absentee owner letters + Avery 5160 labels ----------
export const letterTarget = p => { const st = String(val(p, 'mailState') || '').toUpperCase(); return (p.abs === 'abs' || p.abs === true) || (st && st !== 'IL') || ['trust', 'estate'].includes(p.ot); };
const mailBlock = p => { const o = p.ownerId && S.owners.get(p.ownerId); const name = nc(o ? o.name : val(p, 'taxpayer') || 'Property Owner'); const a = o?.mail?.addr || val(p, 'mailAddr') || p.maddr || ''; const c = [o?.mail?.city || p.mcity, o?.mail?.st || p.mst, o?.mail?.zip || p.mzip].filter(Boolean).join(' '); return { name, lines: [a, c].filter(Boolean) }; };
export function letterHTML(p) {
  const pr = setting('profile', {}) || {}, m = mailBlock(p), addr = nc(val(p, 'address') || ''), city = nc(val(p, 'city') || '');
  const sign = [pr.name, pr.company, pr.phone, pr.email].filter(Boolean).map(esc).join('<br>') || '[Add your name, phone and email in More → Tools & Data → Your contact info]';
  return `<div class="letter lpage"><p>${new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</p><p>${esc(m.name)}<br>${m.lines.map(esc).join('<br>')}</p><p><b>Re: ${esc(addr)}${city ? ', ' + esc(city) : ''}, Illinois</b></p>
    <p>Dear Owner,</p><p>I'm an industrial real estate broker who works in ${esc(city || 'your area')}. I'm writing because buyers are actively looking for industrial property near ${esc(addr || 'your property')}, and owners who live outside the area often don't hear what buildings like theirs are worth today.</p>
    <p>If it would help, I'll prepare a free, no-obligation value report for your property, using recent recorded sales nearby and the county's own figures. There's no listing or commitment involved, and our conversation stays private.</p>
    <p>You can reach me directly at the number below. Thank you for your time.</p><p>Sincerely,</p><p>${sign}</p></div>`;
}
export function labelsHTML(ps) {
  const L = ps.map(mailBlock); const pages = []; for (let i = 0; i < L.length; i += 30) pages.push(L.slice(i, i + 30));
  return pages.map(pg => `<div class="avery lpage">${pg.map(m => `<div class="lbl">${esc(m.name)}<br>${m.lines.map(esc).join('<br>')}</div>`).join('')}</div>`).join('');
}
export function printHTML(html) {
  let host = $('#printsheet'); if (!host) { host = document.createElement('div'); host.id = 'printsheet'; document.body.appendChild(host); }
  host.innerHTML = html; document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50);
}
export function printLetters(ps, withLabels = true) { const T = ps.filter(letterTarget); if (!T.length) { toast('No absentee, out-of-state, trust or estate owners in this list'); return 0; } printHTML(T.map(letterHTML).join('') + (withLabels ? labelsHTML(T) : '')); return T.length; }
// ---------- 6) Tax appeal talking point ----------
export const appealPoint = p => { const a = p && p.appeal; if (!a || !a.y || a.y < new Date().getFullYear() - 1) return ''; return `Appealed taxes recently (Cook Assessor appeal ${a.y}${a.chg ? ', ' + a.chg : ''}${a.pct ? ` ${a.pct > 0 ? '+' : ''}${a.pct}%` : ''}): ask how the tax bill is affecting their plans.`; };
// ---------- views ----------
export async function occView(el) {
  const rows = S.props.flatMap(p => occupants(p).map(x => ({ p, x }))), ex = rows.filter(r => r.x.conf === 'exact').length;
  el.innerHTML = `<div class="page"><div class="ph"><div><h1>Who's inside</h1><p class="explain">Businesses registered at or mapped to industrial addresses (likely occupants, not confirmed tenants). Call the business line to learn about their space and lease.</p><div class="muted">${fmt(rows.length)} likely occupants · ${fmt(ex)} exact address matches · ${fmt(rows.length - ex)} fuzzy (mapped at the site)</div></div></div><div id="ot"></div></div>`;
  table($('#ot', el), rows, [
    { k: 'n', l: 'Likely occupant', h: r => `<b>${esc(nc(r.x.n))}</b><div class="xs muted">${esc(r.x.src)}${r.x.ref ? ' · ' + esc(r.x.ref) : ''}</div>`, v: r => r.x.n },
    { k: 'c', l: 'Match', h: r => r.x.conf === 'exact' ? 'Exact address' : 'Fuzzy', v: r => r.x.conf },
    { k: 'a', l: 'Property', h: r => `<a href="#/property/${r.p.id}">${esc(nc(val(r.p, 'address') || r.p.pin))}</a><div class="xs muted">${esc(nc(val(r.p, 'city') || ''))}${ownerOccupied(r.p) ? ' · owner-occupied' : ''}</div>`, v: r => val(r.p, 'address') },
    { k: 'sf', l: 'SF', cls: 'num', h: r => sfOf(r.p).sf ? fmt(sfOf(r.p).sf) : '', v: r => sfOf(r.p).sf },
    { k: 't', l: 'Call', h: r => r.x.tel ? `<a class="btn sm" href="tel:${esc(r.x.tel.replace(/[^\d+]/g, ''))}">${esc(r.x.tel)}</a>` : '<span class="xs muted">no public phone</span>', v: r => r.x.tel ? 1 : 0 },
  ], { sort: 't', page: 100, ascKeys: ['n', 'a'] });
}
export async function slbView(el) {
  const T = slbTargets();
  el.innerHTML = `<div class="page"><div class="ph"><div><h1>Sale-leaseback targets</h1><p class="explain">Owner-users (the business inside owns the building) with long ownership, older buildings or individual/trust/estate owners: candidates to sell and lease back to free up cash.</p><div class="muted">${fmt(T.length)} owner-user properties ranked. Owner-user = owner name matches a business at the address, or an SBA 504 borrower there.</div></div></div><div id="st"></div></div>`;
  table($('#st', el), T, [
    { k: 's', l: 'Rank', h: x => `<b>${x.s}</b>`, v: x => x.s },
    { k: 'a', l: 'Property', h: x => `<a href="#/property/${x.p.id}">${esc(nc(val(x.p, 'address') || x.p.pin))}</a><div class="xs muted">${esc(nc(val(x.p, 'city') || ''))} · ${esc(nc(ownerName(x.p)))}</div>`, v: x => val(x.p, 'address') },
    { k: 'w', l: 'Why', h: x => `<span class="xs">${esc(x.R.join(' · '))}</span>` },
    { k: 'v', l: 'Est. value', cls: 'num', h: x => kmoney(x.d.value) || '–', v: x => x.d.value },
    { k: 'c', l: '', h: x => `<button class="btn sm" data-call="${x.p.id}">Call</button>` },
  ], { sort: 's', page: 100, ascKeys: ['a'] });
}
