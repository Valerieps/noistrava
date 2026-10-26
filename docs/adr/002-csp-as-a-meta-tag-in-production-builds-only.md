# ADR-002: CSP as a meta tag in production builds only, driven by network-policy.ts

**Status:** Accepted
**Date:** 2026-10-21
**Decision:** `vite.config.ts` injects the Content-Security-Policy as a meta tag in production
builds. `connect-src` is `'self'` plus `ALLOWED_ORIGINS`, and `img-src` is `'self' data:` plus
`IMAGE_ORIGINS`, both from `network-policy.ts`. `src/security.test.ts` reads the same file, so the
CSP, the source scan and the docs agree. The other headers live in `public/_headers`, which Workers
static assets apply.
**Why:** The dev server needs a websocket for hot reload, which a closed `connect-src` blocks. As an
HTTP header the CSP would also apply to a service worker and could stop it caching the app's own
files. One file for the allowed origins keeps the rule from drifting between config and tests.
If the app gets a service worker, `src/security.test.ts` must also check that it makes no network
calls and has no external URLs, since the meta tag does not cover it.
