// The service worker, only for the reminders (ADR-012, ADR-013). The reminder to log the activities
// arrives without content and shows its fixed text, which must match strings.reminder in
// src/domain/strings.ts (src/app-identity.test.ts checks it). The window reminder arrives with its
// content, `{title, body, tag}`, which the browser has already decrypted; the Corrida das Estações
// notices also carry `url`, a path of the app to open. It caches nothing.
const TITLE = 'Senhoras';
const BODY = 'Fabrício, já registrou suas atividades? 🏃‍♀️';

function message(data) {
  try {
    const content = data && data.json();
    if (content && typeof content.title === 'string' && typeof content.body === 'string' && typeof content.tag === 'string') {
      // Only a path of the app itself, never another site.
      const url = typeof content.url === 'string' && /^\/[a-z/-]*$/.test(content.url) ? content.url : '/';
      return { title: content.title, body: content.body, tag: content.tag, url };
    }
  } catch {
    // Not JSON: show the fixed reminder.
  }
  return { title: TITLE, body: BODY, tag: 'lembrete', url: '/' };
}

self.addEventListener('push', (event) => {
  const { title, body, tag, url } = message(event.data);
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/icon.svg', tag, data: { url } }));
});

// Tapping the notification opens the app on its path, or brings an open one there.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      return url === '/' ? open.focus() : open.focus().then((w) => (w && w.navigate ? w.navigate(url) : w));
    }),
  );
});
