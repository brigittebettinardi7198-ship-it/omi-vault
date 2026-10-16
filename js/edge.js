// Deal edge: value pitch, tax shock, estate leads, buyer alerts, drive day, follow-up autopilot drafts, weekly scorecard.
// Public data only; every computed dollar figure is labeled an estimate and hidden when inputs are missing.
import { $, $$, esc, fmt, kmoney, today, addDays, daysBetween, toast } from './util.js';
import { S, val, setting, setSetting, addFollowup, firm } from './store.js';
import { deal, sfOf, activeMatchMap } from './scoring.js';
import { nearbySales } from './comps.js';
import { nc } from './extras.js';

const YR = new Date().getFullYear();
const miles = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * 3959; };
// ---------- 4. instant value pitch ----------
export function valuePitch(p) {
  const sp = +val(p, 'lastSalePrice'), sd = String(val(p, 'lastSaleDate') || ''), d = deal(p);
  if (!sp || sp < 10000 || !sd || !d.value || d.value <= sp) return null;
  return { sp, yr: sd.slice(0, 4), value: d.value, eq: d.value - sp, kind: d.kind };
}
// ---------- 8. tax shock (Cook: assessment change vs prior year) ----------
const COOK_EQ = 3.0163, COOK_RATE = 0.10;   // 2024 Cook equalizer; ~10% typical suburban composite rate (ESTIMATE)
export function taxShock(p) {
  const chg = +p.avchg, av = +val(p, 'assessedTotal'); if (!chg || chg < 25 || !av) return null;
  const tax = +val(p, 'annualTax'), dAV = av * chg / (100 + chg);
  const up = tax ? tax * chg / (100 + chg) : (p.co === 'Cook' ? dAV * COOK_EQ * COOK_RATE : 0);
  return up >= 1000 ? { pct: Math.round(chg), up, basis: tax ? 'your tax bill scaled by the assessment jump' : `assessed jump × Cook equalizer ${COOK_EQ} × ~${COOK_RATE * 100}% typical tax rate` } : null;
}
export function pitchLine(p) {
  const v = valuePitch(p), t = taxShock(p), out = [];
  if (v) out.push(`You bought it for about ${kmoney(v.sp)} in ${v.yr}; it's likely worth around ${kmoney(v.value)} today, roughly ${kmoney(v.eq)} of gain before any loans (my estimate).`);
  if (t) out.push(`Your assessment went up about ${t.pct}%, which could mean roughly ${kmoney(t.up)} more in property tax a year (estimate).`);
  return out.join(' ');
}
// ---------- 5. estate leads ----------
const PROBATE = { Cook: 'https://casesearch.cookcountyclerkofcourt.org/', DuPage: 'https://eaccess.dupagecircuitclerk.gov', Will: 'https://www.circuitclerkofwillcounty.com/Public-Access/Case-Lookup', Kane: 'https://kanecoportal.co.kane.il.us/portal', McHenry: 'https://caseinfo.mchenrycountyil.gov/PublicCaseAccess', Lake: 'https://www.lakecountycircuitclerk.org/', Kendall: 'https://www.kendallcountyil.gov/offices/circuit-clerk/online-court-records', Grundy: 'https://www.google.com/search?q=Grundy+County+Illinois+circuit+clerk+court+records' };
export function estateCand(p) { const y = +String(val(p, 'lastSaleDate') || '').slice(0, 4); return /individual|trust|estate/.test(p.ot || '') && ((y && YR - y >= 20) || p.holdplus); }
export const estateOn = id => !!(setting('estate', {}) || {})[id];
function estateHTML(p) {
  if (!estateCand(p) && !estateOn(p.id)) return '';
  const name = nc(val(p, 'taxpayer') || ''), city = nc(val(p, 'mailCity') || val(p, 'city') || ''), on = estateOn(p.id);
  const ob = `https://www.google.com/search?q=${encodeURIComponent(`site:legacy.com "${name.replace(/\b(TRUST|TR|TRUSTEE|ESTATE OF|LIVING|REVOCABLE|DECLARATION|DTD|U\/T\/A|C\/O)\b.*$/i, '').trim()}" ${city}`)}`;
  return `<div class="edge-row"><b>Estate check</b> <span class="xs muted">${esc(p.ot)} owner, held 20+ years</span>${on ? ' <span class="tag" style="background:#7c3aed;color:#fff">Estate</span>' : ''}
    <div class="btnrow"><a class="btn sm" target="_blank" rel="noopener" href="${ob}">Check obituaries</a><a class="btn sm" target="_blank" rel="noopener" href="${PROBATE[p.co] || PROBATE.Cook}">Probate (${esc(p.co)} circuit clerk)</a><button class="btn sm ${on ? '' : 'primary'}" data-estate="${esc(p.id)}">${on ? 'Unmark estate' : 'Mark estate confirmed'}</button></div>
    <details class="pc-sc"><summary>Gentle script</summary><p>${esc(`Hi, this is [your name] with ${firm()}. First, I'm sorry for your loss. I'm not calling to push anything. When families are ready to sort out a property like ${nc(val(p, 'address') || 'this one')}, I can give a free, private value estimate and handle it quietly. Would it help if I sent that over?`)}</p></details><div class="xs muted">Obituaries search Legacy.com via Google. Probate: search the owner's name in the clerk's case search${p.co === 'Cook' ? ' (Probate division)' : ''}.</div></div>`;
}
export function propertyEdgeHTML(p) {
  const v = valuePitch(p), t = taxShock(p), comps = p.lat ? nearbySales(p, 3) : [], est = estateHTML(p);
  if (!v && !t && !comps.length && !est) return '';
  return `<section class="card edge" style="margin:12px 0;padding:14px"><h2 style="margin:0 0 8px">Value pitch <span class="tag est">estimate</span></h2>
    ${v ? `<div class="edge-big" style="font-size:17px">You bought for <b>${kmoney(v.sp)}</b> in ${esc(v.yr)}; it's worth about <b>${kmoney(v.value)}</b> today; that's <b class="pos">${kmoney(v.eq)}</b> of equity before any loans.</div><div class="xs muted">Estimate: last recorded sale vs. ${esc(v.kind)}. Not an appraisal.</div>` : ''}
    ${t ? `<div style="margin-top:8px">Tax shock: assessment up ${t.pct}% ≈ <b>${kmoney(t.up)}/yr</b> more property tax <span class="xs muted">(estimate: ${esc(t.basis)})</span></div>` : ''}
    ${comps.length ? `<div style="margin-top:10px"><b>3 closest recent sales</b>${comps.map(c => `<div class="xs">${c.pid ? `<a href="#/property/${esc(c.pid)}">${esc(nc(c.addr))}</a>` : esc(nc(c.addr))} · ${esc(c.d || '')} · ${kmoney(c.price)}${c.psf ? ` ($${Math.round(c.psf)}/SF)` : ''} · ${c.mi.toFixed(1)} mi</div>`).join('')}</div>` : ''}
    ${pitchLine(p) ? `<details class="pc-sc" style="margin-top:8px"><summary>Say this</summary><p>${esc(pitchLine(p))}${comps[0] ? ` ${esc(`A building near you at ${nc(comps[0].addr)} sold for ${kmoney(comps[0].price)} in ${String(comps[0].d).slice(0, 4)}.`)}` : ''}</p></details>` : ''}
    ${est}</section>`;
}
export function bindEstate(root, after) { $$('[data-estate]', root).forEach(b => b.onclick = async () => { const E = { ...(setting('estate', {}) || {}) }; if (E[b.dataset.estate]) delete E[b.dataset.estate]; else E[b.dataset.estate] = today(); await setSetting('estate', E); toast(E[b.dataset.estate] ? 'Flagged Estate: now at the top of Today' : 'Estate flag removed'); after && after(); }); }
// ---------- 9. follow-up autopilot ----------
export async function autopilot(oid, pid) {
  const t = today(), p = S.prop.get(pid), o = S.owners.get(oid), a = nc(val(p, 'address') || 'your building');
  for (const [n, kind] of [[30, 'sale'], [60, 'value'], [90, 'check']]) {
    let msg;
    if (kind === 'sale') { const c = p && p.lat ? nearbySales(p, 1)[0] : null; msg = c ? `Hi, it's [your name] from ${firm()}. Quick update: ${nc(c.addr)} near ${a} sold for ${kmoney(c.price)}${c.d ? ' (' + String(c.d).slice(0, 7) + ')' : ''}. Happy to share what that means for your building.` : `Hi, it's [your name] from ${firm()}. Industrial buyers are still active near ${a}. Happy to share recent sales if useful.`; }
    else if (kind === 'value') { const v = p && valuePitch(p); msg = `Hi, it's [your name] from ${firm()}. I refreshed my numbers on ${a}${v ? `: my estimate is around ${kmoney(v.value)} today (estimate, not an appraisal)` : ''}. Want the one-page value summary?`; }
    else msg = `Hi, it's [your name] from ${firm()}. Checking in on ${a}. Any change in your plans for the building this year?`;
    await addFollowup({ ownerId: oid, propertyId: pid, due: addDays(t, n), note: `${n}-day touch (autopilot)`, draft: msg, auto: 1 });
  }
}
export function draftBtns(f) {
  if (!f.draft) return ''; const o = S.owners.get(f.ownerId), ph = o && o.phone ? String(o.phone).replace(/[^\d+]/g, '') : '', em = o && o.email;
  return `<details class="pc-sc"><summary>Ready-to-send draft</summary><p>${esc(f.draft)}</p><div class="btnrow"><a class="btn sm" href="sms:${esc(ph)}${/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(f.draft)}">Text</a><a class="btn sm" href="mailto:${esc(em || '')}?subject=${encodeURIComponent('Your industrial property')}&body=${encodeURIComponent(f.draft)}">Email</a></div><div class="xs muted">Opens your Messages / Mail app; nothing is sent until you hit send.</div></details>`;
}
// ---------- 10. weekly scorecard ----------
export function scorecardHTML() {
  const t = today(), dow = (new Date().getDay() + 6) % 7, mon = addDays(t, -dow), O = setting('outc', {}) || {}; let dials = 0, conv = 0, mtg = 0, prop = 0;
  for (const k in O) for (const e of O[k]) if (e.d >= mon) { dials++; if (['talked', 'int', 'no', 'mtg', 'prop'].includes(e.o)) conv++; if (e.o === 'mtg') mtg++; if (e.o === 'prop') prop++; }
  const g = setting('goals', { dials: 300, conv: 25, mtg: 3, prop: 1 }) || {}, cell = (l, n, goal) => `<div style="flex:1;min-width:70px;text-align:center"><div class="xs muted">${l}</div><b style="font-size:20px">${n}</b><span class="xs muted">/${goal}</span><div class="gbar"><i style="width:${Math.min(100, n / goal * 100)}%"></i></div></div>`;
  return `<section class="card" style="padding:12px;margin:10px 0"><div class="ch"><h2 style="margin:0">This week</h2><span class="xs muted">since Mon ${esc(mon)}, counted from outcome buttons</span></div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">${cell('Dials', dials, g.dials || 300)}${cell('Conversations', conv, g.conv || 25)}${cell('Meetings', mtg, g.mtg || 3)}${cell('Proposals', prop, g.prop || 1)}</div></section>`;
}
// ---------- 6. buyer alerts ----------
export function buyerAlertsHTML() {
  const x = setting('seen', null), since = x ? x.prev : addDays(today(), -14), ids = [...new Set((S.changes.ev || []).filter(e => e.d >= since && S.prop.has(e.id)).map(e => e.id))];
  if (!ids.length || ![...S.requirements.values()].length) return '';
  const mm = activeMatchMap(), hits = ids.map(id => ({ p: S.prop.get(id), m: mm.get(id) })).filter(h => h.m && h.m.length).slice(0, 8);
  if (!hits.length) return '';
  return `<h2 class="plan-h">Buyer alerts <span class="cnt">${hits.length}</span></h2><div class="xs muted" style="margin:-4px 0 8px">New public-record changes since ${esc(since)} that fit one of your saved buyers.</div>${hits.map(h => `<div class="pcall"><div class="pc-top"><div class="pc-who"><a href="#/property/${esc(h.p.id)}"><b>${esc(nc(val(h.p, 'address') || h.p.pin))}</b></a><span class="xs muted">${esc(nc(val(h.p, 'city') || ''))}${sfOf(h.p).sf ? ' · ' + fmt(sfOf(h.p).sf) + ' SF' : ''}</span></div><button class="bact primary pc-call" data-call="${esc(h.p.id)}">Call owner</button>${(() => { const r = h.m[0].req, ph = r.contactPhone; if (!ph) return ''; const sf = sfOf(h.p).sf; return `<a class="bact pc-call" href="sms:${esc(String(ph).replace(/[^\d+]/g, ''))}&body=${encodeURIComponent(`Hi${r.clientName ? ' ' + nc(r.clientName).split(' ')[0] : ''}, I may have an off-market ${sf ? fmt(sf) + ' SF ' : ''}building in ${nc(val(h.p, 'city') || 'your area')} that fits what you need. Want me to approach the owner?`)}">Text buyer</a>`; })()}</div><div class="pc-why">Fits your buyer <a href="#/requirement/${esc(h.m[0].req.id)}"><b>${esc(h.m[0].req.name)}</b></a>${h.m.length > 1 ? ` and ${h.m.length - 1} more` : ''}</div></div>`).join('')}`;
}
export function estateListHTML() {
  const E = setting('estate', {}) || {}, ids = Object.keys(E).filter(id => S.prop.has(id)); if (!ids.length) return '';
  return `<h2 class="plan-h">Estate leads <span class="cnt">${ids.length}</span></h2>${ids.map(id => { const p = S.prop.get(id); return `<div class="pcall"><div class="pc-top"><span class="tag" style="background:#7c3aed;color:#fff">Estate</span><div class="pc-who"><a href="#/property/${esc(id)}"><b>${esc(nc(val(p, 'address') || p.pin))}</b></a><span class="xs muted">${esc(nc(val(p, 'taxpayer') || ''))} · confirmed ${esc(E[id])}</span></div><button class="bact primary pc-call" data-call="${esc(id)}">Call</button></div></div>`; }).join('')}`;
}
// ---------- 7. drive day ----------
export function driveRoute(leads) {
  const pts = leads.filter(c => c.p && c.p.lat); if (!pts.length) return [];
  let best = [];
  for (const s of pts.slice(0, 15)) { const near = pts.filter(c => miles(s.p.lat, s.p.lon, c.p.lat, c.p.lon) <= 4); if (near.length > best.length) best = near; if (best.length >= 12) break; }
  best = best.slice(0, 12); const route = [best.shift()];
  while (best.length) { const l = route[route.length - 1].p; best.sort((a, b) => miles(l.lat, l.lon, a.p.lat, a.p.lon) - miles(l.lat, l.lon, b.p.lat, b.p.lon)); route.push(best.shift()); }
  return route;
}
export function driveHTML(route) {
  if (route.length < 2) return '<div class="muted">Not enough nearby leads with map locations for a drive day.</div>';
  const q = c => `${c.p.lat.toFixed(5)},${c.p.lon.toFixed(5)}`, addr = c => `${nc(val(c.p, 'address') || '')}, ${nc(val(c.p, 'city') || '')}, IL`;
  const apple = `https://maps.apple.com/?saddr=${encodeURIComponent(addr(route[0]))}&daddr=${route.slice(1).map(c => encodeURIComponent(addr(c))).join('+to:')}&dirflg=d`;
  const goog = `https://www.google.com/maps/dir/${route.map(q).join('/')}`;
  return `<ol style="padding-left:20px;margin:6px 0">${route.map(c => `<li><a href="#/property/${esc(c.p.id)}">${esc(nc(val(c.p, 'address') || c.p.pin))}</a> <span class="xs muted">${esc(nc(val(c.p, 'city') || ''))} · ${esc(nc(c.o ? c.o.name : ''))}</span></li>`).join('')}</ol>
    <div class="btnrow"><a class="btn primary" href="${apple}" target="_blank" rel="noopener">Open in Apple Maps</a><a class="btn" href="${goog}" target="_blank" rel="noopener">Google Maps</a></div><div class="xs muted">${route.length} stops within about 4 miles, in driving order (nearest next). If Apple Maps shows only one stop, use Google Maps.</div>`;
}
