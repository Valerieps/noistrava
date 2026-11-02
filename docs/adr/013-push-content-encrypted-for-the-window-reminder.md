# ADR-013: Push content encrypted for the window reminder

**Status:** Accepted
**Date:** 2026-11-02
**Decision:** The window reminder (`docs/spec/notificacoes.md`, "O lembrete da janela") carries its
own text, since it shows each member's index. Its push has a payload encrypted for the device with
the standard Web Push encryption (RFC 8291, one `aes128gcm` record of RFC 8188), written with
WebCrypto in `encryptPayload` of `server/infrastructure/web-push.ts`, with no library.
- **Keys:** the app sends the subscription's `p256dh` and `auth` with `push.subscribe`; the server
  keeps them in `push_subscriptions` (migration 10). A device subscribed before keeps working for
  the reminder to log; opening "Notificações" on it sends its keys with `push.refreshKeys`, which
  only updates a device the member already has, so it never takes a shared device from someone else.
- **Due:** `windowRemindersDue` in `server/application/reminders.ts` uses the same days, time and
  one-hour window as the other reminder (`reminderDue`), marks the day as checked first, and builds
  `{title, body, tag}` when `closingWindow` (`src/domain/tracking/window-index.ts`) says today is the
  window's last day. Only devices with keys get it.
- **Showing:** `public/sw.js` shows the decrypted `{title, body, tag}` when a push has one, and the
  fixed text of ADR-012 otherwise. The two reminders have different tags, so one does not replace
  the other.

**Why:** The text depends on each member's activities, so a fixed text in the service worker is not
enough, and push services require an encrypted payload. Encryption is ~40 lines of WebCrypto that
the Worker and Node both run, and the push service never sees the text.
**Alternatives:** An empty push after which the service worker fetches the text from the API (needs
a valid session cookie at that moment, which expires, and an extra request before showing; iOS
revokes subscriptions whose push shows nothing); the `web-push` npm package (Node-only).
