const CACHE = 'jogo-de-cartas-v2';
const ARQUIVOS = [
  './',
  './index.html',
  './style.css',
  './js/script.js',
  './js/online.js',
  './js/peerjs.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './img/foto1.jpg',
  './img/foto2.jpg',
  './img/foto3.jpg',
  './img/foto4.jpg',
  './img/foto5.jpg',
  './img/foto6.jpg',
  './img/foto7.jpg',
  './img/foto8.jpg',
  './img/foto9.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // só mexe em arquivos do próprio site (nunca nas chamadas do PeerJS)
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cached => cached || fetch(e.request).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
