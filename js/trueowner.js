// True owner behind LLC / Corp / trust owners: one-tap lookups on OFFICIAL free registries (opened by the user;
// nothing is queried automatically) + an on-device "True owner" record that applies to every parcel of the same entity.
import { $, $$, esc, toast, today, kmoney } from './util.js';
import { S, val, setting, setSetting, ownerProps } from './store.js';
import { MARKET } from './markets.js';
import { deal, scoreOf, priorityOf } from './scoring.js';
import { modal, kindTag } from './ui.js';
import { nc } from './extras.js';

export const ILSOS = 'https://apps.ilsos.gov/businessentitysearch/';
// ILSOS search only accepts a POST form behind bot protection (no GET / prefilled URL), so we copy the name and open the official page.
export const STATE_SOS = {
  DE: ['Delaware Division of Corporations', 'https://icis.corp.delaware.gov/ecorp/entitysearch/namesearch.aspx'],
  IN: ['Indiana Secretary of State', 'https://bsd.sos.in.gov/publicbusinesssearch'],
  WI: ['Wisconsin DFI', 'https://apps.dfi.wi.gov/apps/corpsearch/search.aspx'],
  MI: ['Michigan LARA (MiBusiness Registry)', 'https://mibusinessregistry.lara.state.mi.us/search/business'],
  NJ: ['New Jersey business records', 'https://www.njportal.com/DOR/BusinessNameSearch/Search/BusinessName'],
  NY: ['New York Department of State', 'https://apps.dos.ny.gov/publicInquiry/'],
  TX: ['Texas Comptroller entity search (free)', 'https://comptroller.texas.gov/taxes/franchise/account-status/search'],
  FL: ['Florida Sunbiz', 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName'],
  CA: ['California bizfile', 'https://bizfileonline.sos.ca.gov/search/business'],
  OH: ['Ohio Secretary of State', 'https://businesssearch.ohiosos.gov/'],
  MN: ['Minnesota Secretary of State', 'https://mblsportal.sos.state.mn.us/Business/Search'],
  MO: ['Missouri Secretary of State', 'https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx?SearchType=0'],
  PA: ['Pennsylvania Department of State', 'https://file.dos.pa.gov/search/business'],
  GA: ['Georgia Secretary of State', 'https://ecorp.sos.ga.gov/BusinessSearch'],
  IA: ['Iowa Secretary of State', 'https://sos.iowa.gov/search/business/search.aspx'],
  CO: ['Colorado Secretary of State', 'https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do'],
  AZ: ['Arizona Corporation Commission', 'https://ecorp.azcc.gov/EntitySearch/Index'],
  MA: ['Massachusetts Corporations Division', 'https://corp.sec.state.ma.us/corpweb/CorpSearch/CorpSearch.aspx'],
  CT: ['Connecticut business search', 'https://service.ct.gov/business/s/onlinebusinesssearch'],
  NV: ['Nevada SilverFlume', 'https://esos.nv.gov/EntitySearch/OnlineEntitySearch'],
  TN: ['Tennessee Secretary of State', 'https://tnbear.tn.gov/Ecommerce/FilingSearch.aspx'],
  NC: ['North Carolina Secretary of State', 'https://www.sosnc.gov/online_services/search/by_title/_Business_Registration'],
  VA: ['Virginia SCC', 'https://cis.scc.virginia.gov/EntitySearch/Index'],
  MD: ['Maryland Business Express', 'https://egov.maryland.gov/BusinessExpress/EntitySearch'],
  KY: ['Kentucky Secretary of State', 'https://sosbes.sos.ky.gov/BusSearchNProfile/search.aspx'],
  WA: ['Washington Corporations & Charities', 'https://ccfs.sos.wa.gov/'],
};
const ENT_RX = /\b(L\.?\s?L\.?\s?C\.?|INC\.?|INCORPORATED|CORP\.?|CORPORATION|CO\.?|COMPANY|L\.?\s?P\.?|L\.?\s?L\.?\s?P\.?|LTD\.?|LIMITED|TRUST|TRST|TR|TRUSTEE|LAND TRU\w*)(\s|$|,)/i;
export const LANDTRUST_RX = /\b(LAND TRU\w*|LAND TR|TRUST NO|TR NO|TRUST #|TR #|TRUST\s*\d{3,}|U\/T\/A|UTA|UTD|AS TRUSTEE|TRUSTEE)\b|\b(CHICAGO TITLE|ATG TRUST|FIRST AMERICAN BANK|MARQUETTE|PARKWAY BANK|AMERICAN NATIONAL BANK|STANDARD BANK)\b.*\bTR/i;
export const isEntityName = n => ENT_RX.test(String(n || '').toUpperCase() + ' ');
export const isLandTrust = n => LANDTRUST_RX.test(String(n || '').toUpperCase());
// Display / copy form: drop care-of and tax-department lines, trust numbers stay (they identify the trust)
export function cleanEntity(n) {
  let s = String(n || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(C\/O|ATTN:?|ATTENTION|TAX DEPT\.?|TAX DEPARTMENT|PROPERTY TAX( DEPT)?)\b.*$/i, '').replace(/[,;]+$/, '').trim();
  return nc(s);
}
// Normalized key: one record per legal entity, shared by every parcel billed to that name
export function normEnt(n) {
  return String(n || '').toUpperCase().replace(/\b(C\/O|ATTN|TAX DEPT|TAX DEPARTMENT)\b.*$/, '').replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\bL L C\b/g, 'LLC').replace(/\bL L P\b/g, 'LLP').replace(/\bL P\b/g, 'LP').replace(/\bINCORPORATED\b/g, 'INC').replace(/\bCORPORATION\b/g, 'CORP')
    .replace(/\bCOMPANY\b/g, 'CO').replace(/\bLIMITED\b/g, 'LTD').replace(/^THE /, '').replace(/\bLAND TRU\w*\b|\bLAND TR\b/g, 'LAND TRUST').replace(/\s+/g, ' ').trim();
}
export const records = () => setting('trueOwners', {}) || {};
export const recordFor = name => records()[normEnt(name)] || null;
export async function saveRecord(name, rec) { const all = { ...records() }; const k = normEnt(name); if (!k) return; all[k] = { ...rec, key: k, name: cleanEntity(name), saved: Date.now() }; await setSetting('trueOwners', all); }
// Entity names behind an owner group (owner name, grouped entities, taxpayer names on its parcels)
export function ownerEntities(o) {
  const ps = o ? ownerProps(o.id) : [];
  const names = [o?.name, ...(o?.entities || []), ...ps.map(p => val(p, 'taxpayer'))].filter(Boolean);
  const seen = new Map(); for (const n of names) { const k = normEnt(n); if (k && !seen.has(k) && (isEntityName(n) || isLandTrust(n))) seen.set(k, n); }
  return [...seen.values()];
}
export const ownerRecords = o => ownerEntities(o).map(n => recordFor(n)).filter(Boolean);
export const trueOwnerKnown = o => ownerRecords(o).some(r => (r.trueOwner || '').trim());

// Commercial registered-agent services represent thousands of unrelated companies: never link on them alone.
const AGENT_SVC = /\b(C ?T CORPORATION|CORPORATION SERVICE|CSC\b|ILLINOIS CORPORATION SERVICE|REGISTERED AGENTS?( INC| SOLUTIONS| LLC)?|NATIONAL REGISTERED|INCORP SERVICES|NORTHWEST REGISTERED|COGENCY|UNITED STATES CORPORATION AGENTS|LEGALZOOM|HARBOR COMPLIANCE|UNITED AGENT|INCORPORATING SERVICES|BUSINESS FILINGS|VCORP|WOLTERS KLUWER)\b/i;
const nAddr = a => String(a || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\b(SUITE|STE|UNIT|FL|FLOOR)\b.*$/, '').replace(/\s+/g, ' ').trim();
const people = r => String(r.managers || '').split(/[,;\n]/).map(s => s.toUpperCase().replace(/\(.*?\)/g, '').replace(/\b(MANAGER|MEMBER|PRESIDENT|SECRETARY|OFFICER|DIRECTOR|MGR|MBR)\b/g, '').replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim()).filter(s => s.length > 4);
// Entities linked to this record through shared principal office, manager / officer, or a (non-commercial) registered agent + address
export function linkedRecords(rec) {
  if (!rec) return [];
  const out = [], pa = nAddr(rec.principalAddr), ag = String(rec.agent || '').toUpperCase().trim(), aa = nAddr(rec.agentAddr), pp = new Set(people(rec));
  for (const r of Object.values(records())) {
    if (r.key === rec.key) continue; const why = [];
    if (pa && pa.length > 6 && nAddr(r.principalAddr) === pa) why.push('same principal office');
    const shared = people(r).filter(x => pp.has(x)); if (shared.length) why.push('shared manager / officer: ' + nc(shared[0]));
    if (ag && !AGENT_SVC.test(ag) && String(r.agent || '').toUpperCase().trim() === ag && (!aa || nAddr(r.agentAddr) === aa)) why.push('same registered agent');
    if (why.length) out.push({ r, why });
  }
  return out;
}
// Owner groups that hold parcels billed to the linked entities
export function linkedOwners(o) {
  const mine = new Set(ownerEntities(o).map(normEnt)), res = new Map();
  for (const rec of ownerRecords(o)) for (const { r, why } of linkedRecords(rec)) {
    if (mine.has(r.key)) continue;
    for (const p of S.props) if (normEnt(val(p, 'taxpayer')) === r.key && p.ownerId && p.ownerId !== o.id) { const g = res.get(p.ownerId) || { o: S.owners.get(p.ownerId), ents: new Set(), why: new Set(), n: 0, v: 0 }; g.ents.add(r.name); why.forEach(w => g.why.add(w)); g.n++; g.v += deal(p).value || 0; res.set(p.ownerId, g); }
  }
  return [...res.values()].filter(g => g.o);
}

const enc = encodeURIComponent;
function countyLinks(p) { const c = p && MARKET.counties[val(p, 'county')] || {}; const tp = p ? Object.fromEntries(['address', 'city', 'zip', 'county', 'pin'].map(k => [k, val(p, k)])) : null;
  return { recorder: tp && c.recorder ? c.recorder(tp) : null, treasurer: tp && c.treasurer ? c.treasurer(tp) : null, assessor: tp && c.assessor ? c.assessor(tp) : null }; }
// One entity row: lookup buttons + saved record summary
function entityRow(name, st, p) {
  const rec = recordFor(name), clean = cleanEntity(name), lt = isLandTrust(name), oos = st && st !== 'IL' ? st : '';
  const sos = oos && STATE_SOS[oos], L = (l, u, cls = 'btn sm ghost') => u ? `<a class="${cls}" target="_blank" rel="noopener" href="${esc(u)}">${esc(l)} ↗</a>` : '', cl = countyLinks(p);
  const facts = rec ? [['Registered agent', [rec.agent, rec.agentAddr].filter(Boolean).join(' · ')], ['Managers / officers / members', rec.managers], ['Principal office', rec.principalAddr], ['Entity status', rec.status], ['File number', rec.fileNo]].filter(x => x[1]) : [];
  const src = rec && (rec.source || rec.checked) ? `<span class="xs muted">${esc(rec.source || 'source not noted')}${rec.checked ? ' · checked ' + esc(rec.checked) : ''}</span>` : '';
  return `<div class="tor" data-ent="${esc(normEnt(name))}">
    <div class="tor-h"><b>${esc(clean)}</b>${rec ? (rec.trueOwner ? ` <span class="tag ${rec.conf === 'Confirmed' ? 'match' : ''}">${esc(rec.conf || 'Unverified')}</span>` : ' <span class="tag">Details saved</span>') : ' <span class="tag cnone">True owner not identified</span>'}</div>
    ${lt ? `<div class="xs muted tor-lt" title="Illinois land trusts are recorded with the county, not the Secretary of State, and the beneficiaries are private.">Land trust: beneficiaries aren't public in SOS records. Check the deed at the recorder and the tax-bill mailing name instead.</div>
      <div class="btnrow">${L('Recorder / deed', cl.recorder)}${L('Tax bill (mailing name)', cl.treasurer)}${L('Assessor record', cl.assessor)}<button class="btn sm ghost" data-sos="${esc(clean)}">Look up trustee on IL Secretary of State</button></div>`
      : `<div class="btnrow"><button class="btn sm ${rec ? 'ghost' : 'primary'}" data-sos="${esc(clean)}">Look up on IL Secretary of State</button>${sos ? L(sos[0], sos[1]) : ''}${L('OpenCorporates', `https://opencorporates.com/companies${oos ? '/us_' + oos.toLowerCase() : ''}?q=${enc(clean)}`)}${oos && !sos ? `<span class="xs muted">Owner mails from ${esc(oos)}; search that state's business registry.</span>` : ''}</div>`}
    ${rec ? `<ul class="why tor-facts">${rec.trueOwner ? `<li>${kindTag(rec.conf === 'Confirmed' ? 'fact' : 'broker')} True owner / decision maker: <b>${esc(rec.trueOwner)}</b> ${rec.conf !== 'Confirmed' ? `<span class="xs muted">(${esc(rec.conf || 'Unverified')}, broker note)</span>` : ''}</li>` : ''}
      ${facts.map(([l, v]) => `<li>${kindTag(rec.source ? 'fact' : 'broker')} ${esc(l)}: ${esc(v)}</li>`).join('')}${rec.note ? `<li>${kindTag('broker')} ${esc(rec.note)}</li>` : ''}</ul>${src}` : ''}
    <div><button class="btn sm ghost" data-toedit="${esc(name)}">${rec ? 'Edit true owner details' : 'Add true owner details'}</button></div></div>`;
}
// Card used on the property Owner & Contacts tab and on owner pages
export function trueOwnerHTML({ names, st, p, o }) {
  const ents = [...new Map(names.filter(n => isEntityName(n) || isLandTrust(n)).map(n => [normEnt(n), n])).values()].slice(0, 6);
  if (!ents.length) return '';
  const lk = o ? linkedOwners(o) : [];
  return `<section class="card trueowner"><div class="ch"><h2>True owner</h2></div>
    <div class="xs muted">Copies the name and opens the official IL Secretary of State search (paste it in; nothing is looked up automatically). Saved details apply to every parcel with this name.</div>
    ${ents.map(n => entityRow(n, st, p)).join('')}
    ${lk.length ? `<div class="tor-link"><b>Linked through Secretary of State records</b><ul class="why">${lk.slice(0, 8).map(g => `<li><a href="#/owner/${g.o.id}">${esc(nc(g.o.name))}</a> <span class="xs muted">${[...g.why].join(' · ')} · ${g.n} parcel${g.n > 1 ? 's' : ''} · ${kmoney(g.v)}</span></li>`).join('')}</ul><div class="xs muted">Inferred from details you saved; confirm before treating as one owner.</div></div>` : ''}</section>`;
}
export function bindTrueOwner(root, after) {
  $$('[data-sos]', root).forEach(b => b.onclick = () => { const n = b.dataset.sos; try { navigator.clipboard?.writeText(n).catch(() => {}); } catch {} window.open(ILSOS, '_blank', 'noopener'); toast(`Copied "${n}". Paste it into the Secretary of State search.`); });
  $$('[data-toedit]', root).forEach(b => b.onclick = () => editModal(b.dataset.toedit, after));
}
export function editModal(name, after) {
  const r = recordFor(name) || {};
  const f = (k, l, ph = '') => `<label>${l}<input name="${k}" value="${esc(r[k] || '')}" placeholder="${esc(ph)}"></label>`;
  modal(`<h2>True owner · ${esc(cleanEntity(name))}</h2><form id="tof" class="fgrid2">
    <div class="full lbl2">${kindTag('fact')} From the Secretary of State record (known facts)</div>
    ${f('agent', 'Registered agent')}${f('agentAddr', 'Agent address')}<label class="full">Managers / officers / members<input name="managers" value="${esc(r.managers || '')}" placeholder="Comma separated, e.g. Jane Smith (Manager), John Doe"></label>
    ${f('principalAddr', 'Principal office address')}${f('status', 'Entity status', 'Active, Dissolved, Revoked…')}${f('fileNo', 'File number')}
    <div class="full lbl2">${kindTag('broker')} Your conclusion (broker note)</div>
    ${f('trueOwner', 'True owner / decision maker')}<label>Confidence<select name="conf">${['Unverified', 'Likely', 'Confirmed'].map(c => `<option ${c === (r.conf || 'Unverified') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    ${f('source', 'Source', 'e.g. IL SOS file 12345678, annual report 2026')}<label>Date checked<input name="checked" type="date" value="${esc(r.checked || today())}"></label>
    <label class="full">Note<input name="note" value="${esc(r.note || '')}"></label></form>
    <div class="mfoot"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="tosave">Save</button></div>`, (m, close) => {
    $('#tosave', m).onclick = async () => { const rec = Object.fromEntries(new FormData($('#tof', m)).entries()); for (const k in rec) rec[k] = String(rec[k]).trim(); await saveRecord(name, rec); close(); toast('Saved. Applies to every parcel billed to this name.'); after && after(); };
  });
}
// Research queue: entity owners whose true owner isn't identified yet, best opportunities first
export function trueOwnerQueue(limit = 40, bigOnly = false) {
  const out = [];
  for (const o of S.owners.values()) {
    if (o.stage === 'Do not contact') continue;
    const ps = ownerProps(o.id); if (!ps.length) continue;
    const ents = ownerEntities(o); if (!ents.length || trueOwnerKnown(o)) continue;
    let best = null, val$ = 0; for (const p of ps) { const d = deal(p); val$ += d.value || 0; const pr = priorityOf(p); if (!best || pr > best.pr) best = { p, pr, s: scoreOf(p).score }; }
    if (bigOnly && !ps.some(p => deal(p).big)) continue;
    out.push({ o, ents, best, value: val$, lt: ents.some(isLandTrust) });
  }
  return out.sort((a, b) => b.best.pr - a.best.pr || b.best.s - a.best.s || b.value - a.value).slice(0, limit);
}
