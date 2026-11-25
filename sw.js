// Offline-cache. Verhoog VERSION bij elke update zodat iPhones de nieuwe bestanden ophalen.
const VERSION = 'gymlog-v1.3.0';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/store.js',
  'js/core.js',
  'js/i18n.js',
  'js/util.js',
  'js/ui.js',
  'js/logic.js',
  'js/library.js',
  'js/charts.js',
  'js/importer.js',
  'js/visual.js',
  'js/cloud.js',
  'js/move.js',
  'js/views/account.js',
  'js/views/shared.js',
  'js/views/home.js',
  'js/views/workout.js',
  'js/views/template.js',
  'js/views/history.js',
  'js/views/exercises.js',
  'js/views/profile.js',
  'js/views/import.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = altijd vers van de server, niet uit de HTTP-cache van de browser
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : undefined))),
  );
});
