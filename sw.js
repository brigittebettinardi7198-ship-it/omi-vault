// Chicagoland Industrial service worker: shell network-first, data network-first (so scheduled refreshes arrive), cache fallback offline. Nothing is sent anywhere.
const VER = 'omi-pub-202610151751';
const SHELL = ['./', './index.html', './css/app.css', './manifest.webmanifest', './vendor/leaflet.js', './vendor/leaflet.css', './vendor/papaparse.min.js', './vendor/xlsx.full.min.js',
  './js/app.js', './js/db.js', './js/util.js', './js/store.js', './js/scoring.js', './js/seed.js', './js/templates.js', './js/ui.js', './js/views.js', './js/views2.js', './js/markets.js', './js/hooks.js', './js/contacts.js', './js/backup.js', './js/comps.js', './js/views3.js', './js/ask.js', './js/adv.js', './js/buyers.js', './js/callpanel.js', './js/extras.js', './js/favs.js', './js/invest.js', './js/lstat.js', './js/near.js', './js/plan.js', './js/pro.js', './js/sheets.js', './js/trueowner.js', './css/pro.css',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];
const DATA = ['./data/meta.json', './data/changes.json', './data/cook.json', './data/dupage.json', './data/lake.json', './data/mchenry.json', './data/kane.json', './data/will.json', './data/kendall.json', './data/grundy.json', './data/warn.json', './data/parts.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL).then(() => fetch('./data/parts.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(m => { const big = new Set(Object.keys(m).map(n => './data/' + n + '.json')); const L = DATA.filter(u => !big.has(u)).concat(...Object.values(m).map(a => a.map(f => './data/' + f))); return Promise.all(L.map(u => c.add(u).catch(() => {}))); }))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/data/')) {
    const key = u.origin + u.pathname;
    e.respondWith(caches.open(VER).then(c => fetch(key, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(key, r.clone()); return r.ok ? r : c.match(key).then(h => h || r); }).catch(() => c.match(key))));
    return;
  }
  // app shell: network first for freshness when online, cache fallback offline
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cl = r.clone(); caches.open(VER).then(c => c.put(e.request, cl)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(h => h || caches.match('./index.html'))));
});
