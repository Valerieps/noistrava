# ADR-006: Image and server origins in network-policy.ts

**Status:** Accepted
**Date:** 2026-10-21
**Decision:** `network-policy.ts` has three lists. `ALLOWED_ORIGINS`: third-party origins the app
may connect to besides its own (empty). `IMAGE_ORIGINS`: `https://lh3.googleusercontent.com` (Google
profile photos), added to the CSP `img-src`. `SERVER_ORIGINS`: the only servers the Worker calls
(Google sign-in). `src/security.test.ts` checks every URL in `src/` against the first two and every
URL in `server/` against the third. A new external API joins `SERVER_ORIGINS` with its own ADR.
**Why:** Loading profile photos directly costs nothing on the free plan; proxying them through the
Worker would only hide the viewer's IP from Google. Listing the server's origins keeps "one place
says which servers" true on both sides, and gives any sender an allowlist against addresses a
member made up.
