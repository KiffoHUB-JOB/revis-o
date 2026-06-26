/* Service Worker — Revisão Espaçada
   Estratégia:
   - App shell (HTML, manifest, ícones) em cache para abrir offline.
   - Bibliotecas de CDN: stale-while-revalidate.
   - Requisições do Firebase (Auth/Firestore) NUNCA são interceptadas — vão direto pra rede.
*/
const VERSION = 'v2';
const CACHE = 'revisao-' + VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];
const SHELL_FALLBACK = './index.html';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('revisao-') && k !== CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Hosts dinâmicos do Firebase/Google que não devem ser cacheados
function isApiRequest(url) {
  const h = url.hostname;
  if (h.endsWith('googleapis.com') && h !== 'fonts.googleapis.com') return true; // firestore, identitytoolkit, securetoken, installations
  if (h.endsWith('firebaseio.com')) return true;
  if (h.endsWith('firebaseapp.com')) return true; // handler de auth
  return false;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (isApiRequest(url)) return; // passa direto pra rede

  // Navegação → network-first, com fallback ao app shell offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(SHELL_FALLBACK)) || Response.error();
      }
    })());
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  // Estáticos do próprio site → cache-first
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }

  // CDNs (jsDelivr, Cloudflare, Google Fonts) → stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(fresh => {
      if (fresh && (fresh.ok || fresh.type === 'opaque')) cache.put(req, fresh.clone());
      return fresh;
    }).catch(() => cached);
    return cached || network;
  })());
});
