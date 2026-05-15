// EliteTech Service Worker — v3.0
// Handles: caching, offline, background push notifications

const CACHE_NAME = 'elitetech-v3';
const OFFLINE_URL = '/PKSamustsEliteTech/';
const STATIC_URLS = [
  '/PKSamustsEliteTech/',
  '/PKSamustsEliteTech/index.html',
  '/PKSamustsEliteTech/manifest.json',
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch — network first, cache fallback ────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('workers.dev')) return;  // never cache API
  if (e.request.url.includes('api.anthropic.com')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(r => r || caches.match(OFFLINE_URL))
      )
  );
});

// ── Push Notification Received ───────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'EliteTech', body: 'You have a new update!', icon: '/PKSamustsEliteTech/icon.png', url: '/PKSamustsEliteTech/' };

  if (e.data) {
    try { Object.assign(data, e.data.json()); } 
    catch { data.body = e.data.text(); }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/PKSamustsEliteTech/icon.png',
    badge: data.badge || '/PKSamustsEliteTech/icon.png',
    tag: data.tag || 'elitetech-notif',
    renotify: true,
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/PKSamustsEliteTech/' },
    actions: [
      { action: 'view', title: '👀 View Now' },
      { action: 'dismiss', title: '✕ Dismiss' }
    ]
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── Notification Click ────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();

  if (e.action === 'dismiss') return;

  const targetUrl = e.notification.data?.url || '/PKSamustsEliteTech/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Focus existing tab if open
        for (const client of clientList) {
          if (client.url.includes('PKSamustsEliteTech') && 'focus' in client) {
            client.focus();
            client.postMessage({ type: 'PUSH_NAV', url: targetUrl });
            return;
          }
        }
        // Otherwise open new tab
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

// ── Push Subscription Change ──────────────────────────────────
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options)
      .then(sub => {
        // Re-save new subscription
        return fetch('https://elitetech-proxy.samuelphilip002.workers.dev/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() })
        });
      })
  );
});
