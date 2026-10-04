import { S, val, setting, ownerProps, propLeases, ownerFollowups, idx, CLOSED_STAGES, MOTIVATIONS } from './store.js';
import { today, daysBetween, addMonths } from './util.js';
import { MARKET } from './markets.js';

export const WEIGHT_DEFS = [
  // public-record signals (scaled to 100 by what is available for the parcel)
  ['longHold', 'Long ownership (no sale 15+ yrs)', 18, 'public'], ['absentee', 'Absentee / out-of-state tax-bill address', 12, 'public'],
  ['ownerType', 'Individual / trust / estate owner (inferred from name)', 12, 'public'], ['oldBuilding', 'Older building', 8, 'public'],
  ['underused', 'Low building value vs land (underused / vacant land)', 12, 'public'], ['multiParcel', 'Owner holds several parcels (inferred grouping)', 6, 'public'],
  // broker / derived signals (added as bonus points when present)
  ['leaseExpiring', 'Lease expiring within 24 months', 12, 'broker'], ['motivation', 'Owner motivation noted by broker', 15, 'broker'],
  ['taxDelinquent', 'Tax delinquent (entered)', 10, 'broker'], ['vacancy', 'Vacant / partially vacant (entered)', 8, 'broker'],
  // public-record bonuses (added when present; not every parcel has these sources)
  ['taxSpike', 'Assessment up 25%+ vs prior year (tax spike)', 8, 'bonus'], ['incentive', 'Cook incentive class (6b / 7 / 8): tax jumps when it ends', 8, 'bonus'],
  ['distress', 'Open Chicago building violations or vacant-building 311 complaints', 8, 'bonus'],
  ['closing', 'IL WARN plant-closing / layoff notice at the address', 12, 'bonus'], ['taxDelinqPub', 'Listed in Cook Clerk 20-yr delinquent-tax file (may be resolved)', 6, 'bonus'],
  ['loanMaturity', 'SBA 504 loan estimated to mature within 24 months', 6, 'bonus'], ['distressSale', 'Distressed sale on record (court / REO / short / auction, PTAX)', 4, 'bonus'],
  ['freshChange', 'Fresh public-record change (new owner, sale, mailing address) in last 120 days', 10, 'broker'],
];
// "What changed" events from scheduled refreshes, for one parcel
export const FRESH = { owner: 'Ownership changed', sale: 'Just sold', mail: 'Tax-bill mailing address changed', value: 'Value changed', new: 'New parcel in data' };
export const freshFor = (p, days = 120) => (S.chg.get(p.id) || []).filter(e => daysBetween(e.d, today()) <= days);
export const freshText = e => e.t === 'value' ? `${FRESH.value} ${e.d}: $${(+e.a).toLocaleString()} → $${(+e.b).toLocaleString()}` : e.t === 'sale' ? `${FRESH.sale}: ${e.b}` : e.t === 'new' ? `${FRESH.new} ${e.d}${e.b ? ': ' + e.b : ''}` : `${FRESH[e.t]} ${e.d}: ${e.a} → ${e.b}`;
export const weights = () => Object.assign(Object.fromEntries(WEIGHT_DEFS.map(w => [w[0], w[2]])), setting('weights', {}));

const OT = { estate: [1, 'Estate / heirs ownership'], individual: [.8, 'Individual owner (not institutional)'], trust: [.8, 'Trust / land-trust ownership'], other: [.4, 'Owner name not clearly a company'], company: [.25, 'Private company / LLC owner'], institutional: [0, 'Institutional or utility owner'] };

// Large public companies, utilities and heavy-industry operators (rarely off-market sellers) -> treated like institutions.
const BIGCO = /\b(COM ?ED|COMMONWEALTH EDISON|NICOR|PEOPLES GAS|EXELON|MIDWEST GENERATION|NRG|EXXON|MOBIL|CITGO|MARATHON|BP AMOCO|SHELL OIL|KINDER MORGAN|GATX|HANSON|HEIDELBERG|VULCAN|OWENS CORNING|OWENS ILLINOIS|LAFARGE|HOLCIM|FORD MOTOR|GENERAL MOTORS|CLEVE ?CLIFFS|CLEVELAND CLIFFS|ARCELOR|US STEEL|INGREDION|NORTHROP|BOEING|CATERPILLAR|DEERE|PEPSI|COCA COLA|KRAFT|MONDELEZ|NALCO|ECOLAB|SHERWIN|WASTE MANAGEMENT|REPUBLIC SERVICES|CSX|NORFOLK SOUTHERN|UNION PACIFIC|BNSF|CANADIAN NATIONAL|METRA|CHICAGO TRANSIT|ARCHER DANIELS|CARGILL|BUNGE|HOME DEPOT|WAL ?MART|COSTCO|KROGER|JEWEL|SYSCO|WALGREEN|ABBOTT|ABBVIE|BAXTER|MOTOROLA|HONEYWELL|GENERAL ELECTRIC|LINDE|PRAXAIR|AIR PRODUCTS|AIR LIQUIDE|INTERNATIONAL PAPER|WESTROCK|SMURFIT|GREIF|AMAZON|FEDEX|UNITED PARCEL|PROLOGIS|IIP|LPC|NEWARK GROUP|CARAUSTAR|BUCKEYE PARTNERS|UOP|EQUILON|MOTIVA|PHILLIPS 66|ENBRIDGE|MAGELLAN|VALERO|IMTT|PACTIV|GRAPHIC PACKAGING|EARLE M JORGENSEN|KTR CAPITAL|CONAGRA|NESTLE|UNILEVER|MARS|FERRARA|TYSON|HORMEL|KELLOGG|GENERAL MILLS|QUAKER|DOW CHEMICAL|DUPONT|BASF|3M|PPG|AKZO|STEPAN|NAVISTAR|CNH|ILLINOIS TOOL|ITW|WM RECYCLE|LAKESHORE RECYCLING|CHICAGO SOUTH SHORE|BELT RAILWAY|INDIANA HARBOR BELT|IHB|AT ?& ?T|VERIZON|COMCAST|AMEREN)\b/;
// Operating-business words: likely an owner-occupant company (sells less often off-market than an investor).
const OPS = /\b(STEEL|METALS?|FOODS?|BAKING|BAKERY|BOTTL\w*|TRANSPORT\w*|EXPRESS|FREIGHT|LOGISTICS|TRUCKING|CHEMICALS?|REFIN\w*|PETROLEUM|OIL|GAS|ELECTRIC|ENERGY|POWER|GENERATION|MANUFACTURING|MFG|INDUSTRIES|PRODUCTS|PACKAGING|PLASTICS|GLASS|PAPER|CONTAINER|BOX|MACHINE\w*|TOOLS?|FORGING|AGGREGATES|MATERIALS|CEMENT|CONCRETE|TERMINALS?|PIPELINE|RAIL\w*|AIRLINES|MOTORS?|AUTO|WASTE|RECYCLING|SCRAP|GRAIN|MILLS?|BREW\w*|DAIRY|MEATS?|PHARMA\w*|LABORATOR\w*|CANDY|SPICES|PICKLE|LEATHER|WIRE|TUBE|PIPE|SALT)\b/;
const INVESTOR = /\b(PROP\w*|REALTY|REAL ESTATE|INVEST\w*|HOLDINGS?|PARTNERS|CAPITAL|VENTURES?|LAND|DEVELOP\w*|ASSOC\w*|EQUIT\w*|FUND|TRUST|ASSET|MGMT|MANAGEMENT|ENTERPRISES?|ENTERPPRISES)\b/;
// Owner type used for scoring: the name-based guess, corrected for big corporates and for "people" who hold 5+ industrial parcels.
const LANDTR = /\b(LAND TRU\w*|LAND TR|TRUST NO|TR NO|TRUST #|TRUSTEE|U\/T\/A|UTA|UTD)\b/;
export function ownerTypeOf(p) {
  const name = String(val(p, 'taxpayer') || '').toUpperCase(); let ot = p.ot, why = '';
  if (LANDTR.test(name) && !BIGCO.test(name)) { ot = 'trust'; why = ' (bank land trust: hides the real, usually private, owner)'; }
  else if (ot && ot !== 'institutional' && BIGCO.test(name)) { ot = 'institutional'; why = ' (large corporation / utility, from name)'; }
  else if ((ot === 'individual' || ot === 'other') && p.ownerId) { const n = ownerProps(p.ownerId).length; if (n >= 5) { ot = 'company'; why = ` (${n} parcels in group, so not treated as an individual)`; } }
  const st = String(val(p, 'mailState') || '').toUpperCase(), oos = st && st !== 'IL';
  // operating company: business words, a corporate tax department on the tax bill, or an out-of-state corporation that is not a real-estate investor or LLC
  const op = (ot === 'company' || ot === 'institutional') && (OPS.test(name) || /\b(TAX|TAX DEPT|ATTN|C\/O TAX)\b/.test(name) || (oos && !INVESTOR.test(name) && !/\bL ?L ?C?\b|\bLLC\b/.test(name)));
  return { ot, why, op };
}
// Missing data is treated as average (this share of each missing factor's weight), not as a bad sign.
export const NEUTRAL = .35, BONUS_CAP = 20;
export function offMarket(p, W = weights()) {
  const R = []; let num = 0, den = 0, pubAll = 0, bonus = 0, pubBonus = 0; const got = {}, missing = [];
  WEIGHT_DEFS.forEach(w => { if (w[3] === 'public') pubAll += W[w[0]]; });
  const add = (k, s, text, kind) => { const w = W[k]; den += w; got[k] = { w, s }; if (s > 0) { num += w * s; R.push({ k, text, kind, pts: w * s }); } };
  // long hold
  const sd = val(p, 'lastSaleDate');
  if (sd) { const y = daysBetween(sd, today()) / 365.25; add('longHold', y >= 25 ? 1 : y >= 15 ? .7 : y >= 10 ? .35 : 0, `Last recorded sale ${sd.slice(0, 4)} (${Math.floor(y)} yrs ago)`, 'fact'); }
  else if (p.holdplus) add('longHold', 1, 'No recorded sale since 1999 in county sales data (27+ yrs)', 'fact');
  else missing.push(['longHold', 'sale history']);
  // absentee
  const OTx = ownerTypeOf(p), corp = OTx.ot === 'institutional' || (OTx.ot === 'company' && p.ownerId && ownerProps(p.ownerId).length >= 10);
  const st = (val(p, 'mailState') || '').toUpperCase(), ma = val(p, 'mailAddress');
  const cnote = corp ? ' (half weight: out-of-area tax bills are normal for large companies with a head office elsewhere)' : '';
  if (st || ma) {
    if (st && st !== 'IL') add('absentee', corp ? .5 : 1, `Tax bill mails out of state (${st})${cnote}`, 'fact');
    else add('absentee', p.abs ? (corp ? .25 : .5) : 0, 'Tax bill mails to a different address than the property' + (p.abs ? cnote : ''), 'fact');
  } else missing.push(['absentee', 'tax-bill mailing address']);
  const nGroup = p.ownerId ? ownerProps(p.ownerId).length : 1;
  if (OTx.ot === 'company' && !OTx.op && nGroup <= 2) add('ownerType', .45, 'Small LLC / private investor owner (from name)', 'inferred');
  else if (OTx.ot && OT[OTx.ot]) add('ownerType', OT[OTx.ot][0], OT[OTx.ot][1] + (OTx.why || ' (from name)'), 'inferred');
  else missing.push(['ownerType', 'owner name']);
  const yb = +val(p, 'yearBuilt');
  if (yb) add('oldBuilding', yb < 1970 ? 1 : yb < 1990 ? .5 : 0, `Built ${yb}`, 'fact'); else missing.push(['oldBuilding', 'year built']);
  const avt = +val(p, 'assessedTotal'), avb = +val(p, 'assessedBldg') || 0;
  if (avt) { const r = avb / avt; add('underused', p.vac || r < .05 ? .8 : r < .3 ? 1 : r < .5 ? .5 : 0, p.vac && !(+val(p, 'bldgSf') > 0) ? 'Vacant / unimproved industrial land' : `Buildings only ${Math.round(r * 100)}% of assessed value (underused site)`, 'fact'); }
  else if (p.vac) add('underused', .8, 'Vacant / unimproved industrial land (class)', 'fact');
  else missing.push(['underused', 'assessed values']);
  if (p.ownerId) { const n = ownerProps(p.ownerId).length; if (n > 1 || den) add('multiParcel', n >= 10 ? .4 : n >= 3 ? 1 : n === 2 ? .5 : 0, n >= 10 ? `Large portfolio: ${n} parcels grouped to this owner` : `${n} parcels grouped to this owner`, 'inferred'); }
  // old building + low building value are correlated (old buildings depreciate): count the smaller one at half
  const ob = R.find(r => r.k === 'oldBuilding'), uu = R.find(r => r.k === 'underused');
  if (ob && uu) { const lo = ob.pts <= uu.pts ? ob : uu; num -= lo.pts / 2; lo.pts /= 2; lo.text += ' (half weight: overlaps with the other building signal)'; }
  // multi-parcel weight only applies when the owner is grouped; otherwise it is not "missing"
  const missW = missing.reduce((a, [k]) => a + W[k], 0), allW = den + missW;
  const scale = allW ? 100 / allW : 0;
  R.forEach(r => { r.pts *= scale; });
  if (missing.length) R.push({ text: `Not in the public data for this parcel: ${missing.map(m => m[1]).join(', ')}. Counted as average, not as a negative`, kind: 'inferred', pts: NEUTRAL * missW * scale, neutral: 1 });
  let pub = allW && den ? (num + NEUTRAL * missW) * scale : 0;
  // Large corporations, utilities, railroads, government and REITs, and operating companies that occupy their own plants, rarely sell off-market.
  const f = OTx.ot === 'institutional' ? .65 : OTx.op ? (nGroup >= 5 ? .75 : .8) : 1;
  if (f < 1 && pub) { const cut = pub * (1 - f); R.push({ text: OTx.ot === 'institutional' ? `Large corporation, utility, railroad, government or REIT owner: rarely sells off-market (score × ${f})` : `Operating company name, likely an owner-occupant: less likely to sell off-market (score × ${f})`, kind: 'inferred', pts: -cut }); pub -= cut; }
  // broker / derived bonuses
  const now = today();
  const ls = propLeases(p.id).filter(l => l.expiration && l.expiration >= now);
  if (ls.length) { const m = Math.min(...ls.map(l => daysBetween(now, l.expiration))) / 30.4; if (m <= 24) { const pts = W.leaseExpiring * (m <= 12 ? 1 : .6); bonus += pts; R.push({ text: `Lease expires in ${Math.round(m)} months (${ls[0].expType === 'known' ? 'known' : 'estimated'})`, kind: ls[0].expType === 'known' ? 'broker' : 'estimated', pts }); } }
  const o = p.ownerId && S.owners.get(p.ownerId);
  if (o && o.motivations && o.motivations.length) { const pts = W.motivation * Math.min(1, o.motivations.length * .6); bonus += pts; R.push({ text: 'Motivation: ' + o.motivations.map(m => (MOTIVATIONS.find(x => x[0] === m) || [m, m])[1]).join(', '), kind: 'broker', pts }); }
  if (val(p, 'taxDelinquent') === 'Yes') { bonus += W.taxDelinquent; R.push({ text: 'Tax delinquent (entered)', kind: 'broker', pts: W.taxDelinquent }); }
  const occ = val(p, 'occupancy');
  if (occ === 'Vacant' || occ === 'Partially vacant') { bonus += W.vacancy; R.push({ text: occ + ' (entered)', kind: 'broker', pts: W.vacancy }); }
  const ac = +val(p, 'avChange');
  // Assessment jump: small public bonus (60% of the taxSpike weight at +25%, full at +50%), inside the capped bonus pool (BONUS_CAP)
  if (ac >= 25) { const pts = W.taxSpike * (ac >= 50 ? 1 : .6); pubBonus += pts; R.push({ text: `Assessment up ${ac}% vs ${p.avprevy || 'prior year'} (higher tax bill coming)`, kind: 'fact', pts }); }
  if (p.co === 'Cook' && /^[678]/.test(p.cls || '')) { const pts = W.incentive * .6; pubBonus += pts; R.push({ text: `Cook incentive class ${p.cls} (6b / 7 / 8 family). These incentives run about 10–12 years and can be renewed. Taxes jump when one ends, so check the expiration with the assessor`, kind: 'fact', pts }); }
  if (+p.bv || +p.v311) { const pts = W.distress * Math.min(1, ((+p.bv || 0) >= 5 ? .7 : .4) + (+p.v311 ? .5 : 0)); pubBonus += pts; R.push({ text: [p.bv ? `${p.bv} open City building violations (latest ${p.bvl})` : '', p.v311 ? `${p.v311} vacant/abandoned-building 311 complaint(s) (latest ${p.v311l})` : ''].filter(Boolean).join('; '), kind: 'fact', pts }); }
  if (p.warn) { const cl = /clos/i.test(p.warn); const pts = W.closing * (cl ? 1 : .5); pubBonus += pts; R.push({ text: (cl ? 'Plant closing notice: ' : 'Layoff notice: ') + p.warn + ' (source: IL WARN reports)', kind: 'fact', pts }); }
  if (p.tdel && val(p, 'taxDelinquent') !== 'Yes') { pubBonus += W.taxDelinqPub; R.push({ text: `Listed in the Cook County Clerk 20-year delinquent-tax file dated ${p.tdel}. It may since have been paid, so check the Clerk's site for current status`, kind: 'fact', pts: W.taxDelinqPub }); }
  if (p.sbamat) { const m = daysBetween(now, p.sbamat + '-01') / 30.4; if (m >= -6 && m <= 24) { const pts = W.loanMaturity; pubBonus += pts; R.push({ text: `SBA 504 loan matures about ${p.sbamat} (ESTIMATE: approval date + term; may be paid off early). Refinance or sale decision coming`, kind: 'estimated', pts }); } }
  if (p.dsale && p.ptd && daysBetween(p.ptd, now) <= 3 * 365) { pubBonus += W.distressSale; R.push({ text: 'Distressed sale on record (PTAX-203): ' + p.dsale, kind: 'fact', pts: W.distressSale }); }
  if (p.ptadv === 'No' && p.ptd) R.push({ text: `Last sale (${p.ptd}) was NOT advertised per the PTAX-203 filing: an off-market deal${p.buyer ? '. Buyer ' + p.buyer + ' buys off-market' : ''}`, kind: 'fact', pts: 0 });
  if (p.slb) R.push({ text: `Sale-leaseback recorded ${p.slb} (PTAX-203): the seller likely stayed as tenant. Typical terms run 10–20 yrs (estimate)`, kind: 'fact', pts: 0 });
  if (p.fm) R.push({ text: 'Trucking companies registered at this address (FMCSA): ' + p.fm, kind: 'fact', pts: 0 });
  if (p.perm && p.perm.length) R.push({ text: `Recent commercial permit: ${p.perm[0].job || ''} $${Math.round(p.perm[0].amt || 0).toLocaleString()} (${p.perm[0].d}, Cook Assessor permits)`, kind: 'fact', pts: 0 });
  const fr = freshFor(p);
  if (fr.length) { const e = fr.find(x => x.t === 'mail') || fr.find(x => x.t === 'owner' || x.t === 'sale') || fr[0]; const pts = W.freshChange * ({ mail: 1, owner: .6, sale: .6, value: .3, new: .2 }[e.t] || .2); bonus += pts; R.push({ text: freshText(e) + (e.t === 'mail' ? ' (possible management change or sale prep)' : e.t === 'owner' || e.t === 'sale' ? ' (new owner may reposition or lease up; seller may be a 1031 buyer)' : ''), kind: 'fresh', pts }); }
  if (val(p, 'marketStatus') && /^Listed|Under contract/.test(val(p, 'marketStatus'))) R.push({ text: 'Already on market: ' + val(p, 'marketStatus'), kind: 'broker', pts: 0 });
  if (pubBonus > BONUS_CAP) { R.push({ text: `Public-record bonus signals add up to ${Math.round(pubBonus)}; capped at ${BONUS_CAP} so no stack of tax/permit flags dominates`, kind: 'inferred', pts: BONUS_CAP - pubBonus }); pubBonus = BONUS_CAP; }
  bonus += pubBonus;
  R.sort((a, b) => b.pts - a.pts);
  return { score: Math.min(100, Math.round(pub + bonus)), reasons: R, pub: Math.round(pub), bonus: Math.round(bonus) };
}
// Cached scores, recomputed when data changes
let cache = { v: -1, m: new Map() };
export function scoreOf(p) {
  if (cache.v !== S.version) cache = { v: S.version, m: new Map() };
  let r = cache.m.get(p.id); if (!r) { r = offMarket(p); cache.m.set(p.id, r); } return r;
}
export function allScores() { if (cache.v !== S.version || cache.m.size < S.props.length) { cache = { v: S.version, m: new Map() }; const W = weights(); S.props.forEach(p => cache.m.set(p.id, offMarket(p, W))); } return cache.m; }

// ---- Expansion score (companies) ----
export const EXP = [['hiring', 'Hiring surge (many open ops/warehouse roles)', 20], ['headcount', 'Headcount growth', 15], ['contract', 'New contract / major customer', 15], ['funding', 'Funding or PE investment', 12], ['outgrowing', 'Outgrowing current space', 20], ['consolidating', 'Consolidating locations', 10], ['acquisition', 'Merger / acquisition', 10], ['newline', 'New product line / capacity', 10], ['permits', 'Permit / build-out activity', 8]];
export function expansion(c) {
  const R = []; let s = 0; const sig = c.signals || {};
  EXP.forEach(([k, l, w]) => { if (sig[k] && sig[k].on) { s += w; R.push({ text: l + (sig[k].date ? ` (${sig[k].date})` : ''), kind: sig[k].conf || 'broker', pts: w }); } });
  const now = today();
  const ls = [...S.leases.values()].filter(l => l.companyId === c.id && l.expiration && l.expiration >= now);
  if (ls.length) { const m = Math.min(...ls.map(l => daysBetween(now, l.expiration))) / 30.4; if (m <= 18) { s += 15; R.push({ text: `Lease expires in ${Math.round(m)} months`, kind: ls[0].expType === 'known' ? 'broker' : 'estimated', pts: 15 }); } }
  return { score: Math.min(100, s), reasons: R };
}
// ---- Lease outreach ----
export function leaseInfo(l) {
  const p = l.propertyId && S.prop.get(l.propertyId);
  const sf = +l.sf || (p && +val(p, 'bldgSf')) || 0;
  const lead = MARKET.leaseLeadMonths(sf);
  const outreach = l.outreachDate || (l.expiration ? addMonths(l.expiration, -lead) : null);
  const now = today();
  let urgency = 'Unknown', rank = 9;
  if (l.expiration) {
    const dExp = daysBetween(now, l.expiration), dOut = outreach ? daysBetween(now, outreach) : 999;
    if (dExp < 0) { urgency = 'Expired'; rank = 5; } else if (dOut <= 0) { urgency = 'Act now'; rank = 0; } else if (dOut <= 90) { urgency = 'Soon'; rank = 1; } else if (dOut <= 365) { urgency = 'This year'; rank = 2; } else { urgency = 'Later'; rank = 3; }
  }
  return { sf, lead, outreach, urgency, rank };
}
// ---- Requirement matching ----
export function matchOne(r, p) {
  const sf = +val(p, 'bldgSf') || 0, lsf = +val(p, 'landSf') || 0, R = [];
  const min = +r.sfMin || 0, max = +r.sfMax || 0, landOnly = r.dealType === 'Land';
  if (r.counties && r.counties.length && !r.counties.includes(val(p, 'county'))) return null;
  const munis = (r.munis || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const pm = [(val(p, 'municipality') || ''), (val(p, 'city') || ''), (val(p, 'submarket') || '')].join(' ').toLowerCase();
  if (munis.length && r.muniStrict && !munis.some(m => pm.includes(m))) return null;
  let s = 0;
  if (!landOnly) {
    if (!sf) return null;
    if ((min && sf < min * .8) || (max && sf > max * 1.2)) return null;
    if ((!min || sf >= min) && (!max || sf <= max)) { s += 35; R.push(`Size fits: ${sf.toLocaleString()} SF`); } else { s += 15; R.push(`Size close: ${sf.toLocaleString()} SF (within 20%)`); }
  } else s += 20;
  const acres = lsf / 43560;
  if (+r.landMinAc) { if (!lsf || acres < +r.landMinAc * .8) return null; s += acres >= +r.landMinAc ? 10 : 4; R.push(`Land ${acres.toFixed(1)} ac`); } else s += 5;
  if (munis.length) { if (munis.some(m => pm.includes(m))) { s += 20; R.push('In target area'); } else s += 4; } else s += 12;
  const ch = +val(p, 'clearHeight'); if (+r.clearMin) { if (ch && ch < +r.clearMin - 2) return null; if (ch) { s += 10; R.push(`Clear ${ch}' (known)`); } else { s += 3; R.push('Clear height unknown – verify'); } } else s += 5;
  const dk = +val(p, 'docks'); if (+r.docksMin) { if (dk && dk < +r.docksMin) return null; if (dk) { s += 10; R.push(`${dk} docks`); } else { s += 3; R.push('Docks unknown – verify'); } } else s += 5;
  const yb = +val(p, 'yearBuilt'); if (+r.yearMin && yb && yb < +r.yearMin) return null;
  const st = val(p, 'marketStatus'); if (st && /Under contract|Recently sold/.test(st)) return null;
  const pt = val(p, 'propType'); if (r.assetType) { if (pt && pt !== r.assetType) return null; if (pt) { s += 5; R.push(pt); } }
  if (+r.budgetMax && r.dealType !== 'Lease') {
    const price = +val(p, 'askingPrice') || +val(p, 'marketValue'), b = +r.budgetMax;
    if (price) { if (price > b * 1.4) return null; const lab = val(p, 'askingPrice') ? 'asking' : 'est. value'; if (price <= b) { s += 10; R.push(`${lab} $${(price / 1e6).toFixed(1)}M within budget`); } else { s += 4; R.push(`${lab} $${(price / 1e6).toFixed(1)}M slightly over budget`); } }
    else { s += 2; R.push('Value unknown'); }
  }
  if (r.dealType === 'Investment' && /leased|Multi-tenant/i.test(val(p, 'occupancy') || '')) { s += 5; R.push('Leased (income)'); }
  const om = scoreOf(p).score; s += Math.round(om / 5); if (om >= 50) R.push(`Off-market score ${om}`);
  return { score: Math.min(100, s), reasons: R };
}
export function matches(r, minScore = 0) {
  const out = [];
  for (const p of S.props) { const m = matchOne(r, p); if (m && m.score >= minScore) out.push({ p, ...m }); }
  return out.sort((a, b) => b.score - a.score);
}
let mcache = { v: -1, m: null };
export function activeMatchMap() { // propertyId -> [{req, score}] for active requirements (score >= 60)
  if (mcache.v === S.version) return mcache.m;
  const m = new Map();
  for (const r of S.requirements.values()) if ((r.status || 'Active') === 'Active') for (const x of matches(r, 60)) { if (!m.has(x.p.id)) m.set(x.p.id, []); m.get(x.p.id).push({ req: r, score: x.score }); }
  mcache = { v: S.version, m }; return m;
}
// Big corporations, utilities, railroads, REITs, institutions and government: kept out of Today's "Call next / Up next" by default
// (still searchable, still in the full call list and every other list). A due follow-up or broker priority A/B overrides.
export function isInstitutionalOwner(ownerId) { const o = S.owners.get(ownerId), nm = String(o?.name || '').toUpperCase(); if (BIGCO.test(nm)) return true; if (LANDTR.test(nm)) return false; const ps = ownerProps(ownerId); return ps.length > 0 && ps.filter(p => ownerTypeOf(p).ot === 'institutional').length * 2 > ps.length; }
export const quietSeller = c => (c.fu && c.fu.due <= today()) || c.o.priority === 'A' || c.o.priority === 'B' || !isInstitutionalOwner(c.o.id);
// ---- Who should I call today ----
export function callList(limit = 50, bigOnly = false) {
  const now = today(), sc = allScores(), mm = activeMatchMap(), { lastAct } = idx(), out = [];
  const exclDays = setting('recentDays', 7);
  const fuByOwner = new Map();
  for (const f of S.followups.values()) if (!f.done && f.ownerId) { const c = fuByOwner.get(f.ownerId); if (!c || f.due < c.due) fuByOwner.set(f.ownerId, f); }
  for (const o of S.owners.values()) {
    const fu = fuByOwner.get(o.id), closed = CLOSED_STAGES.includes(o.stage);
    if (o.stage === 'Do not contact') continue;
    const props = ownerProps(o.id); const R = []; let s = 0;
    if (fu && fu.due <= now) { const late = daysBetween(fu.due, now); s += late > 0 ? 35 + Math.min(late, 10) : 30; R.push({ text: late > 0 ? `Follow-up overdue ${late}d: ${fu.note || ''}` : `Follow-up due today: ${fu.note || ''}`, kind: 'crm' }); }
    else { if (closed) continue; const la = lastAct.get(o.id); if (la && (Date.now() - la) / 864e5 < exclDays) continue; if (fu) continue; }
    let best = null; for (const p of props) { const x = sc.get(p.id); if (x && (!best || x.score > best.x.score)) best = { p, x }; }
    if (best) { s += best.x.score * .35; if (best.x.score >= 50) R.push({ text: `Off-market score ${best.x.score}: ${best.x.reasons.slice(0, 2).map(r => r.text).join('; ')}`, kind: 'score' }); }
    let lease = null; for (const p of props) for (const l of propLeases(p.id)) { const li = leaseInfo(l); if (['Act now', 'Soon'].includes(li.urgency)) lease = { l, li }; }
    if (lease) { s += 15; R.push({ text: `Lease ${lease.li.urgency.toLowerCase()}: expires ${lease.l.expiration}`, kind: lease.l.expType === 'known' ? 'broker' : 'estimated' }); }
    const cos = new Set(); for (const p of props) for (const l of propLeases(p.id)) if (l.companyId) cos.add(l.companyId);
    for (const cid of cos) { const c = S.companies.get(cid); if (c) { const e = expansion(c); if (e.score >= 40) { s += 10; R.push({ text: `Tenant ${c.name} expansion score ${e.score}`, kind: 'broker' }); break; } } }
    let reqs = []; for (const p of props) for (const m of (mm.get(p.id) || [])) reqs.push(m);
    if (reqs.length) { s += Math.min(25, 15 + 5 * (reqs.length - 1)); R.push({ text: `Matches requirement: ${[...new Set(reqs.map(m => m.req.name))].slice(0, 2).join(', ')}`, kind: 'match' }); }
    { let fe = null; for (const p of props) for (const e of freshFor(p, 45)) if (!fe || e.d > fe.d) fe = e; if (fe) { s += 12; R.push({ text: 'Fresh: ' + freshText(fe), kind: 'fresh' }); } }
    if (o.priority === 'A') { s += 20; R.push({ text: 'Broker priority A', kind: 'broker' }); } else if (o.priority === 'B') { s += 10; R.push({ text: 'Broker priority B', kind: 'broker' }); }
    const od = ownerDeal(o.id);
    if (bigOnly && !od.big && !(fu && fu.due <= now)) continue;
    if (od.size > .05) { s += 30 * od.size * (sizeWeight() / .35); R.push({ text: `Deal size: ${od.sf ? Math.round(od.sf).toLocaleString() + ' SF' : od.acres.toFixed(1) + ' ac'} · est. value $${(od.value / 1e6).toFixed(1)}M`, kind: 'estimated' }); }
    if (s < 20 && !fu) continue;
    out.push({ o, s: Math.round(s), R, best, fu, props, od });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, limit);
}

// ---- Buyer <-> seller pairing ----
export const isBuySide = r => ['Buy (owner-user)', 'Investment', 'Land'].includes(r.dealType);
export function sellersForReq(r, limit = 200) { // match score blended with likelihood the owner would sell
  const sc = allScores(), out = [];
  const w = sizeWeight(); for (const m of matches(r, 40)) { const om = sc.get(m.p.id).score; out.push({ ...m, om, d: deal(m.p), pair: Math.round((m.score * .5 + om * .5) * (1 - w) + deal(m.p).size * 100 * w) }); }
  return out.sort((a, b) => b.pair - a.pair).slice(0, limit);
}
export function buyersForProp(p) {
  const out = [];
  for (const r of S.requirements.values()) if ((r.status || 'Active') === 'Active') { const m = matchOne(r, p); if (m && m.score >= 40) out.push({ r, ...m }); }
  return out.sort((a, b) => b.score - a.score);
}
let pcache = { v: -1, x: null };
export function dealPairs(limit = 20, bigOnly = false) {
  const f = x => bigOnly ? x.filter(m => m.d.big) : x;
  if (pcache.v === S.version) return f(pcache.x).slice(0, limit);
  const out = [];
  for (const r of S.requirements.values()) if ((r.status || 'Active') === 'Active') { const seen = new Set(); for (const m of sellersForReq(r, 60)) if (m.om >= 40 && m.p.ownerId && !seen.has(m.p.ownerId) && S.owners.get(m.p.ownerId)?.stage !== 'Do not contact') { seen.add(m.p.ownerId); out.push({ r, ...m }); } }
  out.sort((a, b) => b.pair - a.pair); pcache = { v: S.version, x: out }; return f(out).slice(0, limit);
}
// Owners holding several industrial parcels are possible buyers too (inferred). Recent purchase = active acquirer.
export function buyerSignal(o) {
  const props = ownerProps(o.id); if (o.inst) return null;
  const nb = props.flatMap(p => freshFor(p).filter(e => e.t === 'owner' || e.t === 'sale').map(e => ({ p, e })))[0];
  if (nb) return { n: props.length, recent: nb.e.d, active: true, text: `New owner of ${val(nb.p, 'address') || nb.p.pin} (public-record change ${nb.e.d})` };
  if (props.length < 2) return null;
  const recent = props.map(p => val(p, 'lastSaleDate')).filter(Boolean).sort().pop();
  const yrs = recent ? daysBetween(recent, today()) / 365.25 : 99;
  return { n: props.length, recent, active: yrs <= 5, text: `Owns ${props.length} industrial parcels` + (yrs <= 5 ? `; bought ${recent.slice(0, 4)}` : '') };
}
export function possibleBuyers(limit = 20) {
  const out = [];
  for (const o of S.owners.values()) { if (o.stage === 'Do not contact') continue; const b = buyerSignal(o); if (b && b.active && b.n <= 25) out.push({ o, b }); }
  return out.sort((a, b) => ownerDeal(b.o.id).sf - ownerDeal(a.o.id).sf).slice(0, limit);
}

// ---- Deal size (big deals first). Values are labeled by where they come from. ----
export function dealInfo(p) {
  const sf = +val(p, 'bldgSf') || 0, lsf = +val(p, 'landSf') || 0, acres = lsf / 43560;
  // Asking price wins; a broker-entered value is used as-is; otherwise take the higher of the assessor value and a $/SF estimate
  // (assessor values often lag industrial market pricing). Always labeled as an estimate.
  let value = +val(p, 'askingPrice'), kind = 'asking price';
  const brokerVal = p.ed && +p.ed.marketValue;
  if (!value && brokerVal) { value = brokerVal; kind = 'your entered value'; }
  if (!value) {
    const av = +val(p, 'marketValue') || 0, est = sf ? sf * setting('psfBldg', 100) : lsf * setting('psfLand', 8);
    if (av >= est && av) { value = av; kind = p.mvest ? 'est. from assessed value' : 'assessor market value'; }
    else if (est) { value = est; kind = sf ? `est. at $${setting('psfBldg', 100)}/SF bldg` : `est. at $${setting('psfLand', 8)}/SF land`; }
  }
  const commission = value ? value * setting('commRate', 3) / 100 : 0;
  const big = sf >= setting('bigSf', 50000) || acres >= setting('bigAcres', 5) || value >= setting('bigValue', 5000000);
  const size = Math.min(1, Math.max(sf / 200000, acres / 20, (value || 0) / 20000000));
  return { sf, acres, value, kind, commission, big, size };
}
let dcache = { v: -1, m: new Map() };
// Building SF for matching/filtering: official assessor SF when present, else the roof-footprint estimate (est_bldg_sf, source: footprint)
export const sfOf = p => { const o = +val(p, 'bldgSf') || 0; return o ? { sf: o, est: false } : +p.est_bldg_sf ? { sf: +p.est_bldg_sf, est: true } : { sf: 0, est: false }; };
export const ESTTAG = '<span class="tag est" title="Estimated: measured from Microsoft building roof footprints (free, ODbL). Not an official figure.">est.</span>';
export function deal(p) { if (dcache.v !== S.version) dcache = { v: S.version, m: new Map() }; let d = dcache.m.get(p.id); if (!d) { d = dealInfo(p); dcache.m.set(p.id, d); } return d; }
// Deal priority: off-market likelihood blended with deal size (weight adjustable)
export const sizeWeight = () => setting('sizeWeight', 35) / 100;
export function priorityOf(p) { const w = sizeWeight(); return Math.round(scoreOf(p).score * (1 - w) + deal(p).size * 100 * w); }
export function ownerDeal(oid) {
  let sf = 0, value = 0, commission = 0, big = false, acres = 0;
  // Cook repeats a multi-PIN building's SF on every PIN: count identical building+land figures in one owner group once.
  const seen = new Set();
  for (const p of ownerProps(oid)) { const d = deal(p); big = big || d.big; const k = d.sf ? d.sf + '|' + Math.round(d.acres * 100) : null; if (k && seen.has(k)) continue; if (k) seen.add(k); sf += d.sf; acres += d.acres; value += d.value || 0; commission += d.commission; }
  const size = Math.min(1, Math.max(sf / 300000, acres / 30, value / 30000000));
  return { sf, acres, value, commission, big: big || sf >= setting('bigSf', 50000) || value >= setting('bigValue', 5000000), size };
}
