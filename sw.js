const CACHE = 'zigouigoui-v34';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=play34',
  './js/audio.js?v=play34',
  './js/data.js?v=play34',
  './js/ads.js?v=play34',
  './js/game.js?v=play34',
  './js/main.js?v=play34',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const isNav = event.request.mode === 'navigate' || event.request.destination === 'document';
  event.respondWith(
    fetch(event.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => {});
      return res;
    }).catch(() => isNav ? caches.match('./index.html') : caches.match(event.request))
  );
});
