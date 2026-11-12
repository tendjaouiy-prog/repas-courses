// Garde l'appli utilisable sans réseau (au magasin) : page et fichiers en cache.
// La page est toujours redemandée au serveur (sans cache HTTP) quand le réseau répond,
// pour que les mises à jour arrivent tout de suite. Les fichiers de /assets/ ont un nom
// qui change à chaque version : ceux en cache sont donc toujours bons.
// Les échanges avec le Sheet ne passent pas par ici (autre domaine, POST).
const CACHE = 'repas-courses-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // vérification de mise à jour (cache: 'no-store') : laissée au navigateur
  if (req.method !== 'GET' || url.origin !== self.location.origin || req.cache === 'no-store') return;
  const hashed = url.pathname.includes('/assets/');
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = req.mode === 'navigate' ? new URL('./', self.location.href).href : req;
      const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      if (hashed && cached) return cached;
      try {
        const res = await fetch(req.mode === 'navigate' ? key : req, { cache: 'no-cache' });
        if (res.ok) cache.put(key, res.clone());
        return res;
      } catch (e) {
        if (cached) return cached;
        throw e;
      }
    }),
  );
});
