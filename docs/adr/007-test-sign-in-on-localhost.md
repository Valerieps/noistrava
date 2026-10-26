# ADR-007: Test sign-in without Google, on localhost only

**Status:** Accepted
**Date:** 2026-10-21
**Decision:** `POST /api/auth/dev` (JSON `email`, `name`, sent by the app like any API call, since
the CSP has `form-action 'none'`) starts a session for that e-mail without Google. It runs only when
`DEV_SIGN_IN=1` is set in `.dev.vars` and the request's host is `localhost`, `127.0.0.1` or `[::1]`
(`server/infrastructure/dev-sign-in.ts`); otherwise the route does not exist. It goes through
`GroupService.signIn` like Google, so the invite and bootstrap-admin rules hold, with
`sub` = `dev:<e-mail>` and no photo. The sign-in screen shows the form only on those hosts.
`src/security.test.ts` fails if `wrangler.jsonc` ever mentions `DEV_SIGN_IN`.
**Why:** Without a Google OAuth client registered for the machine (ADR-005), nobody can sign in
locally, so screens behind the login cannot be tried, and testing as several members needs several
Google accounts. It also lets a new app run before its Google Cloud project exists. The two guards
(a secret-file flag and a local host) keep it off in production and in branch previews, where
`.dev.vars` is not used and the host is never local.
**Alternatives:** A fake Google server: more code to keep in step with Google. A sign-in bypass in
the app bundle: the bundle is public, so the check must live in the Worker.
