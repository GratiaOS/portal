// The service worker of the installed app: it keeps the shell of the page (its files and its icons) so that the app opens with no network,
// and nothing else. What is said in a room is never here: the portal is the one place that holds it, and forgets it, so no request to
// /api (the stream included), to /skins or to the manifest ever goes through this worker or into its cache.
const SHELL = 'portal-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== SHELL) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // never: what is said, the looks of a room, the name of the portal, this file
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/skins/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    // the page: the network first, so a new version is seen at once; with none, the page that was kept (it says the line is down, and goes on trying)
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) (await caches.open(SHELL)).put('/', fresh.clone());
          return fresh;
        } catch (error) {
          const kept = await caches.match('/');
          if (kept) return kept;
          throw error;
        }
      })(),
    );
  } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    // a file the build named by its content never changes: the one that was kept, or the network and keep it
    event.respondWith(
      (async () => {
        const kept = await caches.match(request);
        if (kept) return kept;
        const fresh = await fetch(request);
        if (fresh.ok) (await caches.open(SHELL)).put(request, fresh.clone());
        return fresh;
      })(),
    );
  }
});
