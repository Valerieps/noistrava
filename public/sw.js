// The service worker, only for the reminders (ADR-012, ADR-013). The reminder to log the activities
// arrives without content and shows its fixed text, which must match strings.reminder in
// src/domain/strings.ts (src/app-identity.test.ts checks it). The window reminder arrives with its
// content, `{title, body, tag}`, which the browser has already decrypted. It caches nothing.
const TITLE = 'Senhoras';
const BODY = 'Fabrício, já registrou suas atividades? 🏃‍♀️';

function message(data) {
  try {
    const content = data && data.json();
    if (content && typeof content.title === 'string' && typeof content.body === 'string' && typeof content.tag === 'string') return content;
  } catch {
    // Not JSON: show the fixed reminder.
  }
  return { title: TITLE, body: BODY, tag: 'lembrete' };
}

self.addEventListener('push', (event) => {
  const { title, body, tag } = message(event.data);
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/icon.svg', tag }));
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
