// Fellerhoff Med Tec Sales Tracker – Service Worker
// Übernimmt: Offline-Cache der App-Shell + Anzeige von Benachrichtigungen

const VERSION = 'v1.0.0';
const CACHE_APP  = 'fellerhoff-app-' + VERSION;
const CACHE_LIBS = 'fellerhoff-libs-' + VERSION;

// App-Shell (lokale Dateien) – werden beim Install vorgeladen
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/favicon-16x16.png',
  './icons/favicon-32x32.png',
  './icons/apple-touch-icon.png',
];

// Externe Ressourcen (Fonts, XLSX-Bibliothek) – werden bei Bedarf gecacht
const EXTERNAL_URLS = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap',
];

// ========== INSTALL ==========
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    // Best-effort: einzelne Fehlversuche nicht das ganze Install kippen lassen
    await Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(() => {})));
    // Externe Libraries im separaten Cache
    const libCache = await caches.open(CACHE_LIBS);
    await Promise.allSettled(EXTERNAL_URLS.map(url =>
      fetch(url, { mode: 'no-cors' })
        .then(res => libCache.put(url, res))
        .catch(() => {})
    ));
    self.skipWaiting();
  })());
});

// ========== ACTIVATE ==========
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Alte Caches aufräumen
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(n => n !== CACHE_APP && n !== CACHE_LIBS)
        .map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// ========== FETCH – Cache-first für App-Shell, Network-first für Rest ==========
self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  const isAppShell = url.origin === self.location.origin;

  if(isAppShell){
    // Cache-first
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        // Erfolgreiche Antworten mitspeichern
        if(res && res.status === 200){
          const clone = res.clone();
          caches.open(CACHE_APP).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./index.html')))
    );
  } else {
    // Externe Ressourcen: Network-first, Fallback auf Cache
    event.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_LIBS).then(c => c.put(req, clone)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
  }
});

// ========== NOTIFICATION CLICK – App fokussieren oder öffnen ==========
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for(const client of allClients){
      if(client.url.includes(self.location.origin) && 'focus' in client){
        return client.focus();
      }
    }
    if(self.clients.openWindow){
      return self.clients.openWindow('./');
    }
  })());
});
