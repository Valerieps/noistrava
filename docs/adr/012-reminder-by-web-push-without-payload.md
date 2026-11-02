# ADR-012: The reminder by Web Push without a payload

**Status:** Accepted, updated by ADR-013
**Date:** 2026-11-02
**Decision:** The reminder to log the activities (`docs/spec/notificacoes.md`) goes out by standard
Web Push, with no library:
- **Device:** turning the reminder on registers `public/sw.js`, asks for the permission and
  subscribes with the server's VAPID public key (`POST /api/push/key`). The app sends only the
  subscription's `endpoint` (`push.subscribe`); the server keeps it in `push_subscriptions` and
  accepts only endpoints on `PUSH_ORIGINS` in `network-policy.ts` (FCM for Chrome and Android,
  Mozilla, Apple), which are also in `SERVER_ORIGINS`.
- **No payload:** the push carries no content, so nothing is encrypted (no RFC 8291). The service
  worker shows the fixed text, which `src/app-identity.test.ts` keeps equal to `strings.reminder`.
- **Signing:** each push carries a VAPID JWT (RFC 8292, ES256 with WebCrypto) signed with the P-256
  key in the `VAPID_KEY` secret, `{"subject", "jwk"}`, made by `scripts/vapid-key.mjs`. The public
  key is derived from it. `server/infrastructure/web-push.ts` builds and sends the request.
- **Timing:** the existing 5-minute cron asks the `Group` for the devices due now (`remindersDue`,
  rule in `src/domain/reminder.ts`), which marks the day as sent first; the Worker sends the pushes
  and drops the endpoints that answer 404 or 410.

**Why:** A web app has no other way to show a notification while it is closed: scheduled local
notifications (Notification Triggers) never shipped. The text is the same for everyone, so an empty
push is enough, and skipping the payload encryption keeps the code small and dependency-free.
Marking before sending means a failed push is lost for that day rather than repeated every five
minutes.
**Alternatives:** The `web-push` npm package (Node-only, and a dependency for ~60 lines of
WebCrypto); a payload with per-member text (needs RFC 8291 encryption, not needed for one fixed
text); e-mail (another server and another provider).
**Limits:** Edge on Windows uses `*.notify.windows.com`, a host per region, so it is not in
`PUSH_ORIGINS` and cannot turn the reminder on. On the iPhone, pushes only reach the app added to
the home screen (iOS 16.4 or later). Changing `VAPID_KEY` invalidates every subscription: each
device has to turn the reminder on again.

**Update (2026-11-02):** The window reminder's push carries an encrypted payload, and devices keep
their `p256dh` and `auth` keys (ADR-013). The reminder to log still goes without content.
