// Optional API hooks. STUBS ONLY: nothing here is called with a key or sends data anywhere.
// A future version could wire free/paid services here; each returns null so the app behaves the same without them.
export const hooks = {
  enabled: false,
  async geocode(address) { return null; },          // e.g. a free geocoder, if ever added
  async enrichOwner(owner) { return null; },        // e.g. SOS entity lookup, if an official API exists
  async enrichCompany(company) { return null; },    // e.g. news/jobs feeds
  async refreshPublicData(market) { return null; }, // public data is refreshed by the scheduled GitHub Action, not the browser
  // Future free cloud sync (not built): every record carries id + `updated` (ms) via store.save(), and backup.js
  // buildBackup()/applyBackup() define the payload. A sync adapter would push records with updated > lastSync
  // and pull/merge newer remote records with applyBackup(). Nothing leaves the device today.
  sync: null, // { async push(payload) {}, async pull(sinceMs) { return payload; } }
};
