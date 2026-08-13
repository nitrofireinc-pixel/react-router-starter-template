/* East Forsyth Band — calendar web push service worker */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      const text = event.data ? event.data.text() : '';
      data = text ? { body: text } : {};
    } catch {
      data = {};
    }
  }

  const title = String(data.title || data.notification_title || 'Calendar update').trim() || 'Calendar update';
  const body = String(data.body || data.notification_body || data.title || 'The band calendar changed.').trim();
  const url = String(data.url || '/calendar.html').trim() || '/calendar.html';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/assets/efhs-icon.png',
      badge: '/assets/efhs-icon.png',
      tag: `efhs-calendar-${data.revision || data.event_id || 'update'}`,
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = String(event.notification?.data?.url || '/calendar.html');
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) {
        if ('navigate' in client) {
          try { await client.navigate(targetUrl); } catch { /* keep focusing existing tab */ }
        }
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    return undefined;
  })());
});
