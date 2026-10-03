// Offline cache for the encrypted build: stores only ciphertext (app.enc, data/*.enc) and the unlock page.
const VER = 'omi-enc-202610030540';
const SHELL = ['./', './index.html', './app.enc', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png'];
const DATA = ["./data/changes.enc","./data/cook.enc","./data/dupage.enc","./data/kane.enc","./data/lake.enc","./data/mchenry.enc","./data/meta.enc","./data/warn.enc","./data/will.enc"];
self.addEventListener('install', e => e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL).then(() => Promise.all(DATA.map(u => c.add(u).catch(() => {}))))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cl = r.clone(); caches.open(VER).then(c => c.put(e.request, cl)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match('./index.html'))));
});
