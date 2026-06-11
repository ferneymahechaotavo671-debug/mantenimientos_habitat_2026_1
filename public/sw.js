// ── v23 — cambia este número con cada deploy para forzar actualización ──
const CACHE = 'mantenimientos-v28';

self.addEventListener('install', e => {
  // Tomar control inmediatamente sin esperar
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Borrar TODOS los cachés anteriores
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // API: siempre red, nunca caché
  if (e.request.url.includes('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('{"error":"Sin conexión"}', {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Todo lo demás: red primero, caché como respaldo
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Guardar copia fresca en caché
        if (res && res.status === 200 && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
