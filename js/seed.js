// Loads the public-record snapshot into IndexedDB, groups parcels into inferred owners, keeps all broker data.
import * as db from './db.js';
import { S, loadAll, save, setSetting } from './store.js';
import { MARKET } from './markets.js';
import { normName, normAddr, hash, uid } from './util.js';
import { DEFAULT_TEMPLATES } from './templates.js';

const DROP = ['why', 'score', 'np', 'sig', '_s', 't'];
// "What changed" feed produced by each scheduled refresh (see .github/workflows/refresh.yml)
export async function loadChanges() {
  const c = await fetch('data/changes.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  fetch('data/warn.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(w => { if (w) { S.warn = w; S.version++; } }).catch(() => {});
  if (!c) return; S.changes = c; S.chg = new Map();
  for (const e of c.ev || []) { if (!S.chg.has(e.id)) S.chg.set(e.id, []); S.chg.get(e.id).push(e); }
  S.version++;
}
export async function ensureSeed(progress = () => {}) {
  const meta = await fetch('data/meta.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => null);
  if (!meta) return false;
  S.meta = meta; await loadChanges();
  if (S.settings && S.settings.seedGenerated === meta.generated && S.props.length) return false;
  progress('Downloading public-record parcels…');
  const parts = await Promise.all(MARKET.dataFiles.map(f => fetch(`data/${f}.json?v=${encodeURIComponent(meta.generated)}`, { cache: 'no-cache' }).then(r => r.json())));
  progress('Grouping owners…');
  const recs = parts.flat();
  // inferred owner grouping: same normalized taxpayer name, or same mailing address shared by <= 5 names
  const parent = new Map(); const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(b, a); };
  const addrNames = new Map();
  for (const r of recs) {
    const n = normName(r.own); if (!n || /^(TAXPAYER|CURRENT OWNER|OWNER|UNKNOWN)/.test(n)) continue;
    r._n = n; if (!parent.has(n)) parent.set(n, n);
    const a = normAddr(r.maddr) && (normAddr(r.maddr) + '|' + String(r.mzip || '').slice(0, 5));
    if (a) { r._a = a; if (!addrNames.has(a)) addrNames.set(a, new Set()); addrNames.get(a).add(n); }
  }
  for (const [, names] of addrNames) if (names.size > 1 && names.size <= 5) { const arr = [...names]; arr.slice(1).forEach(x => union(arr[0], x)); }
  const owners = new Map();
  for (const r of recs) {
    if (!r._n) continue;
    const root = find(r._n), id = 'o_' + hash(root);
    let o = owners.get(id);
    if (!o) { o = { id, name: r.own, inferred: true, entities: [], mail: { addr: r.maddr, city: r.mcity, st: r.mst, zip: r.mzip }, ot: r.ot }; owners.set(id, o); }
    if (!o.entities.includes(r.own)) o.entities.push(r.own);
    if (r.ot === 'institutional') o.inst = true;
    r.ownerId = id;
  }
  progress('Saving to this device…');
  const out = [];
  for (const r of recs) {
    const old = S.prop.get(r.id);
    const p = {}; for (const k in r) if (!DROP.includes(k) && k[0] !== '_') p[k] = r[k];
    if (p.oz === 1) p.oz = 'Yes'; if (p.flood === 1) p.flood = 'Yes (FEMA SFHA)';
    p.src = 'public'; p.srcName = (MARKET.counties[r.co] || {}).source || r.co;
    if (old) { ['ed', 'cf', 'priority', 'tags', 'research', 'needsResearch', 'ownerLocked', 'created'].forEach(k => { if (old[k] !== undefined) p[k] = old[k]; }); if (old.ownerLocked) p.ownerId = old.ownerId; }
    if (!p.ownerId) delete p.ownerId;
    out.push(p);
  }
  // merge: public fields (mailing address, owner type) refresh from the new snapshot; everything you entered is kept
  const ownersOut = [...owners.values()].map(o => { const old = S.owners.get(o.id); return old ? { ...old, mail: o.mail, ot: o.ot, inst: o.inst, entities: [...new Set([...(old.entities || []), ...o.entities])] } : o; });
  await db.putMany('properties', out);
  await db.putMany('owners', ownersOut);
  if (!S.templates.size) await db.putMany('templates', DEFAULT_TEMPLATES);
  await loadAll();
  await setSetting('seedGenerated', meta.generated);
  await migrateV1();
  return true;
}
// One-time import of the v1 app's localStorage pipeline (status + notes) into the CRM
async function migrateV1() {
  const raw = localStorage.getItem('omi_pipeline'); if (!raw || localStorage.getItem('omi_v1_migrated')) return;
  const map = { new: 'Researching', contacted: 'Attempted', follow: 'Connected', dead: 'Not interested' };
  try {
    for (const [pid, v] of Object.entries(JSON.parse(raw))) {
      const p = S.prop.get(pid); if (!p || !p.ownerId) continue; const o = S.owners.get(p.ownerId); if (!o) continue;
      if (v.status && map[v.status]) o.stage = map[v.status]; await save('owners', o);
      if (v.notes) await save('activities', { id: uid('a'), ts: v.updated || Date.now(), type: 'Note', ownerId: o.id, propertyId: pid, note: v.notes + ' (imported from v1 pipeline)' });
    }
  } catch (e) {}
  localStorage.setItem('omi_v1_migrated', '1');
}
