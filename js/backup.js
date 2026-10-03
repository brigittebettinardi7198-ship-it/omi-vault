// Backup / restore of everything you entered. Public-record parcels are not included (they reload from the site).
// Single entry points (buildBackup / applyBackup) so a future free cloud sync can reuse the same payload format.
import * as db from './db.js';
import { S, loadAll, setting, setSetting } from './store.js';
import { today, download, toast } from './util.js';
export function buildBackup() {
  const props = S.props.filter(p => p.src !== 'public' || p.ed || p.priority || p.research || p.needsResearch || p.ownerLocked);
  const worked = o => !o.inferred || o.stage || o.phone || o.email || o.linkedin || o.notes || o.motivations?.length || o.priority || o.needsResearch || o.contactName || o.cv || o.fro || o.foundNames;
  return { app: 'omi-broker', version: 2, exported: new Date().toISOString(), properties: props, owners: [...S.owners.values()].filter(worked), companies: [...S.companies.values()], leases: [...S.leases.values()], requirements: [...S.requirements.values()], activities: [...S.activities.values()], followups: [...S.followups.values()], templates: [...S.templates.values()], comps: [...S.comps.values()], settings: S.settings ? [S.settings] : [] };
}
export async function downloadBackup() {
  download(`omi-backup-${today()}.json`, JSON.stringify(buildBackup()), 'application/json');
  await setSetting('lastBackup', new Date().toISOString()); toast('Backup downloaded. Keep it in iCloud Drive, Google Drive or email it to yourself.');
}
export async function applyBackup(bk) {
  if (!bk || bk.app !== 'omi-broker') throw new Error('Not an Off-Market Industrial backup');
  for (const s of db.STORES) if (bk[s]) await db.putMany(s, s === 'properties' ? bk[s].map(p => ({ ...(S.prop.get(p.id) || {}), ...p })) : bk[s]);
  await loadAll();
}
export async function restoreFromFile(file) {
  if (/\.zip$/i.test(file.name || '')) { const { unzipFile } = await import('./extras.js'); const t = unzipFile(await file.arrayBuffer(), 'backup.json'); if (!t) throw new Error('backup.json not found in the ZIP'); await applyBackup(JSON.parse(t)); }
  else await applyBackup(JSON.parse(await file.text()));
  toast('Backup restored');
}
// Weekly reminder: only once you have entered something worth backing up
export function hasBrokerData() { return S.activities.size || S.requirements.size || S.companies.size || S.leases.size || S.followups.size || S.comps.size || [...S.owners.values()].some(o => o.stage || o.phone || o.email || o.notes); }
export function backupDue() {
  if (!hasBrokerData()) return false;
  const last = setting('lastBackup', ''), snooze = setting('backupSnooze', 0);
  if (snooze && Date.now() < snooze) return false;
  return !last || (Date.now() - new Date(last)) / 864e5 >= 7;
}
