import * as db from './db.js';
import { uid } from './util.js';
// ---- Field definitions (property). s = key in the public-record seed record ----
export const OPT = {
  propType: ['Warehouse / distribution', 'Manufacturing', 'Flex / light industrial', 'Truck terminal', 'Outdoor storage (IOS)', 'Cold storage', 'Industrial land', 'Other'],
  sprinklers: ['ESFR', 'Wet', 'Dry', 'None', 'Unknown'],
  yesno: ['Yes', 'No', 'Unknown'],
  occupancy: ['Owner-user', 'Single-tenant leased', 'Multi-tenant', 'Vacant', 'Partially vacant', 'Unknown'],
  marketStatus: ['Off-market', 'Listed for sale', 'Listed for lease', 'Under contract', 'Recently sold', 'Unknown'],
  condition: ['Excellent', 'Good', 'Fair', 'Poor', 'Unknown'],
};
export const FIELDS = [
  ['Location', [
    { k: 'address', s: 'addr', l: 'Address' }, { k: 'city', s: 'city', l: 'City' }, { k: 'municipality', s: 'muni', l: 'Municipality' },
    { k: 'county', s: 'co', l: 'County' }, { k: 'zip', s: 'zip', l: 'ZIP' }, { k: 'pin', s: 'pin', l: 'PIN' },
    { k: 'submarket', l: 'Submarket' }, { k: 'corridor', s: 'corr', l: 'Industrial corridor' }, { k: 'zoning', s: 'zone', l: 'Zoning' }]],
  ['Building', [
    { k: 'propClass', s: 'cd', l: 'Assessor class' }, { k: 'propType', l: 'Property type', o: 'propType' }, { k: 'bldgSf', s: 'bsf', l: 'Building SF', t: 'num' },
    { k: 'officeSf', l: 'Office SF', t: 'num' }, { k: 'landSf', s: 'lsf', l: 'Land SF', t: 'num' }, { k: 'clearHeight', l: 'Clear height (ft)', t: 'num' },
    { k: 'docks', l: 'Dock doors', t: 'num' }, { k: 'driveIns', l: 'Drive-in doors', t: 'num' }, { k: 'yearBuilt', s: 'yb', l: 'Year built', t: 'num' },
    { k: 'construction', l: 'Construction' }, { k: 'sprinklers', l: 'Sprinklers', o: 'sprinklers' }, { k: 'power', l: 'Power' },
    { k: 'rail', l: 'Rail served', o: 'yesno' }, { k: 'trailerParking', l: 'Trailer parking', t: 'num' }, { k: 'carParking', l: 'Car parking', t: 'num' },
    { k: 'condition', l: 'Condition', o: 'condition' }, { k: 'description', s: 'desc', l: 'Assessor description' }]],
  ['Occupancy & market', [
    { k: 'occupancy', l: 'Occupancy', o: 'occupancy' }, { k: 'tenantName', l: 'Tenant(s)' }, { k: 'marketStatus', l: 'Market status', o: 'marketStatus' },
    { k: 'askingPrice', l: 'Asking price', t: 'num' }, { k: 'askingRent', l: 'Asking rent ($/SF/yr)', t: 'num' }]],
  ['Value, tax & sale', [
    { k: 'assessedTotal', s: 'avt', l: 'Assessed value', t: 'num' }, { k: 'assessedBldg', s: 'avb', l: 'Assessed bldg', t: 'num' },
    { k: 'assessedLand', s: 'avl', l: 'Assessed land', t: 'num' }, { k: 'assessedYear', s: 'avy', l: 'Assessment year' },
    { k: 'marketValue', s: 'mv', l: 'Market value', t: 'num' }, { k: 'annualTax', s: 'tax', l: 'Annual tax', t: 'num' },
    { k: 'taxDelinquent', l: 'Tax delinquent', o: 'yesno' }, { k: 'lastSaleDate', s: 'sd', l: 'Last sale date', t: 'date' },
    { k: 'lastSalePrice', s: 'sp', l: 'Last sale price', t: 'num' }, { k: 'lastBuyer', s: 'buyer', l: 'Last buyer (deed)' }, { k: 'lastSeller', s: 'seller', l: 'Last seller (deed)' },
    { k: 'deedType', s: 'sdt', l: 'Last deed type' }, { k: 'avChange', s: 'avchg', l: 'Assessment change vs prior year (%)', t: 'num' }]],
  ['Zones, incentives & city records', [
    { k: 'tif', s: 'tif', l: 'TIF district' }, { k: 'oz', s: 'oz', l: 'Opportunity Zone (federal)' }, { k: 'ez', s: 'ez', l: 'Enterprise growth zone (Cook)' },
    { k: 'igz', s: 'igz', l: 'Industrial growth zone (Cook)' }, { k: 'flood', s: 'flood', l: 'FEMA flood hazard area' },
    { k: 'violations', s: 'bv', l: 'Open Chicago building violations (2 yrs)', t: 'num' }, { k: 'violationsLast', s: 'bvl', l: 'Latest violation date' },
    { k: 'vacant311', s: 'v311', l: 'Vacant/abandoned 311 complaints (2 yrs)', t: 'num' }, { k: 'vacant311Last', s: 'v311l', l: 'Latest 311 complaint' }]],
  ['Public-record signals', [
    { k: 'saleAdvertised', s: 'ptadv', l: 'Last sale advertised? (PTAX-203; No = off-market sale)' }, { k: 'saleLeaseback', s: 'slb', l: 'Sale-leaseback recorded (PTAX-203 date)' },
    { k: 'distressSale', s: 'dsale', l: 'Distressed sale on record (PTAX-203)' }, { k: 'taxDelinqFile', s: 'tdel', l: 'In Cook Clerk 20-yr delinquent-tax file (file date)' },
    { k: 'warnNotice', s: 'warn', l: 'IL WARN layoff / closing notice at this address' }, { k: 'sbaLoan', s: 'sba', l: 'SBA 504 loan at this address (SBA FOIA)' },
    { k: 'sbaMaturity', s: 'sbamat', l: 'SBA loan maturity (ESTIMATE: approval + term)' }, { k: 'carriers', s: 'fm', l: 'Trucking companies registered here (FMCSA)' },
    { k: 'ownerSource', s: 'ownsrc', l: 'Owner name source' }, { k: 'saleSource', s: 'sdsrc', l: 'Sale date source' }]],
  ['Taxpayer of record', [
    { k: 'taxpayer', s: 'own', l: 'Tax-bill name (may be a trust or manager)' }, { k: 'mailAddress', s: 'maddr', l: 'Tax-bill mailing address (may be an agent)' },
    { k: 'mailCity', s: 'mcity', l: 'Mailing city' }, { k: 'mailState', s: 'mst', l: 'Mailing state' }, { k: 'mailZip', s: 'mzip', l: 'Mailing ZIP' }]],
  ['Notes', [{ k: 'notes', l: 'Property notes', t: 'area' }]],
];
export const FLAT = FIELDS.flatMap(g => g[1]);
export const FBY = Object.fromEntries(FLAT.map(f => [f.k, f]));
export const STAGES = ['New', 'Researching', 'Attempted', 'Connected', 'Nurturing', 'Interested', 'Meeting set', 'Proposal / BOV', 'Listing / deal', 'Not interested', 'Do not contact'];
export const CLOSED_STAGES = ['Not interested', 'Do not contact'];
export const MOTIVATIONS = [['retirement', 'Owner nearing retirement'], ['estate', 'Estate / succession'], ['relocating', 'Business relocating / downsizing'], ['distress', 'Financial distress'], ['vacancy', 'Vacancy / tenant leaving'], ['partners', 'Partner dispute / buyout'], ['capex', 'Big capital needs (roof, etc.)'], ['taxes', 'Property tax burden'], ['portfolio', 'Portfolio rebalancing'], ['unsolicited', 'Open to unsolicited offers']];

// ---- In-memory state mirrored to IndexedDB ----
export const S = { props: [], prop: new Map(), owners: new Map(), companies: new Map(), leases: new Map(), requirements: new Map(), activities: new Map(), followups: new Map(), templates: new Map(), comps: new Map(), settings: null, version: 0, meta: null, changes: { ev: [], runs: [] }, chg: new Map() };
const MAP = { properties: 'prop', owners: 'owners', companies: 'companies', leases: 'leases', requirements: 'requirements', activities: 'activities', followups: 'followups', templates: 'templates', comps: 'comps' };

export async function loadAll() {
  const [props, ...rest] = await Promise.all(['properties', 'owners', 'companies', 'leases', 'requirements', 'activities', 'followups', 'templates', 'settings', 'comps'].map(db.getAll));
  S.props = props; S.prop = new Map(props.map(p => [p.id, p]));
  ['owners', 'companies', 'leases', 'requirements', 'activities', 'followups', 'templates'].forEach((k, i) => S[k] = new Map(rest[i].map(o => [o.id, o])));
  S.settings = rest[7].find(x => x.id === 'main') || null;
  S.comps = new Map(rest[8].map(o => [o.id, o]));
  bump();
}
export function bump() { S.version++; S._idx = null; }
export async function save(store, obj) {
  obj.updated = Date.now();
  if (store === 'properties') { if (!S.prop.has(obj.id)) S.props.push(obj); S.prop.set(obj.id, obj); }
  else if (store === 'settings') S.settings = obj;
  else S[MAP[store]].set(obj.id, obj);
  bump(); await db.put(store, obj); return obj;
}
export async function remove(store, id) {
  if (store === 'properties') { S.props = S.props.filter(p => p.id !== id); S.prop.delete(id); } else S[MAP[store]].delete(id);
  bump(); await db.del(store, id);
}
// ---- Property value accessors (broker edits layered over public record) ----
export function val(p, k) {
  if (p.ed && k in p.ed && p.ed[k] !== '' && p.ed[k] != null) return p.ed[k];
  const f = FBY[k]; return f && f.s ? p[f.s] : undefined;
}
export function conf(p, k) {
  if (p.ed && k in p.ed && p.ed[k] !== '' && p.ed[k] != null) return (p.cf && p.cf[k]) || 'broker';
  const f = FBY[k];
  if (f && f.s && p[f.s] != null && p[f.s] !== '') {
    if (p.src && p.src !== 'public') return (p.cf && p.cf[k]) || 'unverified';
    if (k === 'marketValue' && p.mvest) return 'estimated';
    return 'public';
  }
  return 'unknown';
}
export const P = p => new Proxy({}, { get: (_, k) => k === 'id' ? p.id : k === 'lat' ? p.lat : k === 'lon' ? p.lon : val(p, k) });
export function setting(k, d) { return S.settings && S.settings[k] != null ? S.settings[k] : d; }
export async function setSetting(k, v) { const s = S.settings || { id: 'main' }; s[k] = v; await save('settings', s); }
export const ownerProps = oid => { idx(); return S._idx.byOwner.get(oid) || []; };
export const propLeases = pid => { idx(); return S._idx.leaseByProp.get(pid) || []; };
export const ownerFollowups = oid => [...S.followups.values()].filter(f => f.ownerId === oid && !f.done).sort((a, b) => a.due.localeCompare(b.due));
export const activitiesFor = (k, id) => [...S.activities.values()].filter(a => a[k] === id).sort((a, b) => b.ts - a.ts);
export function idx() {
  if (S._idx) return S._idx;
  const byOwner = new Map(), leaseByProp = new Map(), lastAct = new Map();
  for (const p of S.props) if (p.ownerId) { if (!byOwner.has(p.ownerId)) byOwner.set(p.ownerId, []); byOwner.get(p.ownerId).push(p); }
  for (const l of S.leases.values()) if (l.propertyId) { if (!leaseByProp.has(l.propertyId)) leaseByProp.set(l.propertyId, []); leaseByProp.get(l.propertyId).push(l); }
  for (const a of S.activities.values()) if (a.ownerId && (!lastAct.has(a.ownerId) || lastAct.get(a.ownerId) < a.ts)) lastAct.set(a.ownerId, a.ts);
  S._idx = { byOwner, leaseByProp, lastAct };
  return S._idx;
}
export async function addActivity(a) { a.id = a.id || uid('a'); a.ts = a.ts || Date.now(); return save('activities', a); }
export async function addFollowup(f) { f.id = f.id || uid('f'); f.created = Date.now(); f.done = false; return save('followups', f); }
