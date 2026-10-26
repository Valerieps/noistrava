# ADR-005: Google sign-in with the OAuth code flow and a session cookie

**Status:** Accepted
**Date:** 2026-10-21
**Decision:** "Entrar com Google" is a plain link to `/api/auth/login`. The Worker redirects to
Google with `state`, `nonce` and PKCE (S256), kept for 10 minutes in the `__Host-login` cookie.
`/api/auth/callback` checks the state, exchanges the code with the client secret, server to server,
and checks the ID token's issuer, audience, nonce, expiry and `email_verified`
(`server/infrastructure/google-oauth.ts`). The signature is not checked: Google's documentation
allows that for a token received directly from Google over TLS. The `Group` object lets the account
in only when it is an active member or its e-mail has a pending invite; anyone else is sent to
`/?erro=sem-convite` and nothing is stored. A member gets a random session token in the
`__Host-sessao` cookie (HttpOnly, Secure, SameSite=Lax, 180 days). The database keeps only its
SHA-256, so removing a member or signing out ends access at once. Every API POST and the live
connection must carry an `Origin` equal to the app's own origin.
The first admins come from the secret `BOOTSTRAP_ADMIN_EMAILS`, used only while the group has no
admin. Settings: `GOOGLE_CLIENT_ID` (var in `wrangler.jsonc`), `GOOGLE_CLIENT_SECRET` (secret).
**Why:** Invite-only access with Google as the only sign-in (`docs/spec/acesso-e-membros.md`). A
redirect flow loads no third-party script, so the CSP stays closed, and it works in an installed
iPhone web app, where popups and third-party storage fail. Server-side sessions make "perde o
acesso na hora" true without waiting for a token to expire.
**Alternatives:** Google Identity Services (loads a Google script; needs `script-src` and
`frame-src` openings); Cloudflare Access (its own allowlist, outside the app's invite flow).
**Limit:** Google accepts only registered redirect URIs, so sign-in works on the production domain
and on localhost, not on branch previews; there the test sign-in is also off (ADR-007).
