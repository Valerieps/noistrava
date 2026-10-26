/**
 * The one place that says which servers the app and its server may talk to (docs/SEGURANCA.md).
 *
 * The app (browser) talks to its own origin only: the Worker serves the files and the API under
 * /api, so the production CSP has `connect-src 'self'` plus ALLOWED_ORIGINS, which stays empty.
 * Requests may only be made from src/infrastructure/; src/security.test.ts checks it.
 */
export const ALLOWED_ORIGINS: readonly string[] = [];

/** Where images may load from (CSP `img-src`): Google profile photos (ADR-006). */
export const IMAGE_ORIGINS: readonly string[] = ['https://lh3.googleusercontent.com'];

/** The only servers the Worker (server/) calls: Google sign-in. Add an API here with an ADR. */
export const SERVER_ORIGINS: readonly string[] = ['https://accounts.google.com', 'https://oauth2.googleapis.com'];
