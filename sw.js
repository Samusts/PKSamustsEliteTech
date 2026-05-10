// EliteTech Service Worker — v2.0
const CACHE = 'elitetech-v2';
const OFFLINE_URL = '/PKSamustsEliteTech/';

const STATIC = [
  '/PKSamustsEliteTech/',
  '/PKSamustsEliteTech/index.html',
];

// Install
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('workers.dev')) return; // Don't cache API
  if (e.request.url.includes('api.anthropic')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match(OFFLINE_URL)))
  );
});

// Push notifications
self.addEventListener('push', e => {
  const data = e.data?.json() || { title: 'EliteTech', body: 'New update!' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/PKSamustsEliteTech/icon.svg',
      badge: '/PKSamustsEliteTech/icon.svg',
      tag: data.tag || 'elitetech',
      data: { url: data.url || '/PKSamustsEliteTech/' },
      actions: [
        { action: 'view', title: '👀 View' },
        { action: 'dismiss', title: '✕ Dismiss' }
      ]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action !== 'dismiss') {
    e.waitUntil(clients.openWindow(e.notification.data.url));
  }
});
