/* Офлайн-кэш приложения.
   Стратегия «сеть в приоритете»: при онлайне всегда берём свежую версию
   и обновляем кэш; кэш используется только как запасной вариант офлайн.
   Это исключает залипание на старой версии после деплоя. */
const CACHE = 'bylo-stalo-v10';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './zip.js',
  './compress.js',
  './editor.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
