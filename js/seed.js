// Loads the public-record snapshot into IndexedDB, groups parcels into inferred owners, keeps all broker data.
import * as db from './db.js';
import { S, bump, save, setSetting } from './store.js';
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
  const q = `?v=${encodeURIComponent(meta.generated)}`, get = f => fetch(`data/${f}${q}`, { cache: 'no-cache' }).then(r => r.json());
  const man = await fetch(`data/parts.json${q}`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  // Memory-safe (iPhone): download and convert ONE file at a time, keep a single slim copy of each record, write in small batches.
  const files = MARKET.dataFiles.flatMap(f => man[f] && man[f].length ? man[f] : [f + '.json']);
  const out = [], keyN = [], keyA = [];
  for (let fi = 0; fi < files.length; fi++) {
    progress(`Downloading public-record parcels… ${fi + 1}/${files.length}`);
    let part = await get(files[fi]);
    for (let i = 0; i < part.length; i++) {
      const r = part[i]; part[i] = null;
      const p = {}; for (const k in r) if (!DROP.includes(k) && k[0] !== '_') p[k] = r[k];
      if (p.oz === 1) p.oz = 'Yes'; if (p.flood === 1) p.flood = 'Yes (FEMA SFHA)';
      p.src = 'public'; p.srcName = (MARKET.counties[r.co] || {}).source || r.co;
      const n = normName(r.own), ok = n && !/^(TAXPAYER|CURRENT OWNER|OWNER|UNKNOWN)/.test(n);
      keyN.push(ok ? n : ''); keyA.push(ok && normAddr(r.maddr) ? normAddr(r.maddr) + '|' + String(r.mzip || '').slice(0, 5) : '');
      out.push(p);
    }
    part = null;
  }
  progress('Grouping owners…');
  // inferred owner grouping: same normalized taxpayer name, or same mailing address shared by <= 5 names
  const parent = new Map(); const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(b, a); };
  let addrNames = new Map();
  for (let i = 0; i < out.length; i++) {
    const n = keyN[i]; if (!n) continue; if (!parent.has(n)) parent.set(n, n);
    const a = keyA[i]; if (a) { if (!addrNames.has(a)) addrNames.set(a, new Set()); addrNames.get(a).add(n); }
  }
  for (const [, names] of addrNames) if (names.size > 1 && names.size <= 5) { const arr = [...names]; arr.slice(1).forEach(x => union(arr[0], x)); }
  addrNames = null;
  const owners = new Map();
  for (let i = 0; i < out.length; i++) {
    const r = out[i], old = S.prop.get(r.id);
    if (keyN[i]) {
      const id = 'o_' + hash(find(keyN[i]));
      let o = owners.get(id);
      if (!o) { o = { id, name: r.own, inferred: true, entities: [], mail: { addr: r.maddr, city: r.mcity, st: r.mst, zip: r.mzip }, ot: r.ot }; owners.set(id, o); }
      if (!o.entities.includes(r.own)) o.entities.push(r.own);
      if (r.ot === 'institutional') o.inst = true;
      r.ownerId = id;
    }
    if (old) { ['ed', 'cf', 'priority', 'tags', 'research', 'needsResearch', 'ownerLocked', 'created'].forEach(k => { if (old[k] !== undefined) r[k] = old[k]; }); if (old.ownerLocked) r.ownerId = old.ownerId; }
    if (!r.ownerId) delete r.ownerId;
  }
  keyN.length = 0; keyA.length = 0;
  progress('Saving to this device…');
  // merge: public fields (mailing address, owner type) refresh from the new snapshot; everything you entered is kept
  const ownersOut = [...owners.values()].map(o => { const old = S.owners.get(o.id); return old ? { ...old, mail: o.mail, ot: o.ot, inst: o.inst, entities: [...new Set([...(old.entities || []), ...o.entities])] } : o; });
  owners.clear();
  for (let i = 0; i < out.length; i += 2000) await db.putMany('properties', out.slice(i, i + 2000));
  for (let i = 0; i < ownersOut.length; i += 2000) await db.putMany('owners', ownersOut.slice(i, i + 2000));
  // swap in the new snapshot directly (no second full read from the database); broker-entered properties are kept
  const seen = new Set(out.map(p => p.id));
  for (const p of S.props) if (!seen.has(p.id)) out.push(p);
  S.props = out; S.prop = new Map(out.map(p => [p.id, p]));
  for (const o of ownersOut) S.owners.set(o.id, o);
  if (!S.templates.size) await db.putMany('templates', DEFAULT_TEMPLATES);
  else { const miss = DEFAULT_TEMPLATES.filter(t => t.id === 't_slb' && !S.templates.has(t.id)); if (miss.length) { await db.putMany('templates', miss); miss.forEach(t => S.templates.set(t.id, t)); } }
  bump();
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
