// The service worker, only for the reminder (ADR-012). Pushes arrive without content: each one
// shows the reminder's fixed text, which must match strings.reminder in src/domain/strings.ts
// (src/app-identity.test.ts checks it). It caches nothing.
const TITLE = 'Senhoras';
const BODY = 'Fabrício, já registrou suas atividades? 🏃‍♀️';

self.addEventListener('push', (event) => {
  event.waitUntil(self.registration.showNotification(TITLE, { body: BODY, icon: '/icon.svg', tag: 'lembrete' }));
});

// Tapping the notification opens the app, or brings an open one to the front.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow('/');
    }),
  );
});
