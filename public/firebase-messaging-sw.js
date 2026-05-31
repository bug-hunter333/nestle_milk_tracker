/* ─────────────────────────────────────────────────────────────────
   Nestlé Fleet — Firebase Cloud Messaging Service Worker
   Place this file at the SITE ROOT (e.g. /firebase-messaging-sw.js).
   Both driver.html and dashboard.html register it on load.

   Handles:
     • Background push messages (tab closed / minimised / different tab)
     • Notification click → open or focus the right page
     • Dedupe based on payload.data.tag so duplicate dispatch events
       don't pile up as multiple toasts.
───────────────────────────────────────────────────────────────── */

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDtTMrEGjIJ5aJYNJQnARXxXrJDnEUt4vM",
  authDomain: "rural-logistics-app.firebaseapp.com",
  databaseURL: "https://rural-logistics-app-default-rtdb.firebaseio.com",
  projectId: "rural-logistics-app",
  storageBucket: "rural-logistics-app.firebasestorage.app",
  messagingSenderId: "684830139102",
  appId: "1:684830139102:web:850e4e5802aac76335584f"
});

const messaging = firebase.messaging();

/* ── Background message handler ──
   `payload` arrives with both .notification (auto-rendered by browser
   for notification-type FCM) and .data (custom). We control the
   rendering explicitly so we can attach action buttons and a routing
   target URL via payload.data.click_action. */
messaging.onBackgroundMessage((payload) => {
  console.log('[fb-sw] background message:', payload);

  const title = (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    'Nestlé Fleet';
  const body = (payload.notification && payload.notification.body) ||
    (payload.data && payload.data.body) ||
    '';
  const type = (payload.data && payload.data.type) || 'GENERIC';

  // Dedupe key — same `tag` collapses notifications. We default to
  // type + assignment_id (or chat partner) so e.g. five identical
  // "DRIVER_ACCEPTED" pings only show as one updated notification.
  const tag =
    (payload.data && payload.data.tag) ||
    type + ':' + ((payload.data && (payload.data.assignment_id ||
      payload.data.driver_uid ||
      payload.data.chatId)) || 'general');

  // Icon — keep small, FCM uses 192x192 sweet spot. Fall back to logo.
  const icon = (payload.notification && payload.notification.icon) || '/firebase-logo.png';

  // Click action — where to open when the notification is tapped.
  // For chats, jump into the chat. For dispatches, open the dashboard
  // (manager) or driver app (driver). Default to current scope.
  const clickAction =
    (payload.data && payload.data.click_action) ||
    (type === 'CHAT_MESSAGE' && payload.data && payload.data.role === 'driver'
      ? '/driver.html'
      : type === 'CHAT_MESSAGE'
        ? '/dashboard.html'
        : type.startsWith('DRIVER_') ||
          type === 'GEOFENCE_ENTERED' ||
          type === 'DELIVERED'
          ? '/dashboard.html'
          : '/');

  const options = {
    body,
    icon,
    badge: '/firebase-logo.png',
    tag,                   // dedupe / replace older with same tag
    renotify: true,        // re-fire notification sound even when replacing
    requireInteraction: type === 'CHAT_MESSAGE' || type === 'SOS',
    data: Object.assign({}, payload.data, { click_action: clickAction }),
    vibrate: [120, 60, 120]
  };

  self.registration.showNotification(title, options);
});

/* ── Click handler ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.click_action) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      // Try to focus an existing tab pointing at the same page
      for (const client of clientsList) {
        try {
          const u = new URL(client.url);
          if (u.pathname === target || u.pathname.endsWith(target)) {
            return client.focus();
          }
        } catch (_) { }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

/* ── PWA Caching — Offline Support for Driver Hub ── */
const CACHE_NAME = 'nestle-driver-v1';
const ASSETS_TO_CACHE = [
  '/driver.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[fb-sw] Precaching assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[fb-sw] Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase/Google API calls to avoid issues with real-time data
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('firebaseio.com') ||
      event.request.url.includes('google-analytics') ||
      event.request.url.includes('fcm.googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((response) => {
        // Cache external assets like fonts/leaflets
        if (event.request.url.includes('fonts.gstatic.com') || 
            event.request.url.includes('unpkg.com')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        // If fetch fails (offline) and no cache, try to return driver.html if it's a navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/driver.html');
        }
      });
    })
  );
});