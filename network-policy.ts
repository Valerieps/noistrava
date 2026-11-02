/**
 * The one place that says which servers the app and its server may talk to (docs/SEGURANCA.md).
 *
 * The app (browser) talks to its own origin only: the Worker serves the files and the API under
 * /api, so the production CSP has `connect-src 'self'` plus ALLOWED_ORIGINS, which stays empty.
 * Requests may only be made from src/infrastructure/; src/security.test.ts checks it.
 */
export const ALLOWED_ORIGINS: readonly string[] = [];

/**
 * Where images may load from (CSP `img-src`): Google profile photos (ADR-006) and the
 * OpenStreetMap tiles of the journey map (ADR-009).
 */
export const IMAGE_ORIGINS: readonly string[] = ['https://lh3.googleusercontent.com', 'https://tile.openstreetmap.org'];

/**
 * The push services the Worker sends the reminder through (ADR-012): Chrome and Android, Firefox,
 * and Safari on the iPhone and the Mac. A browser whose push service is not here cannot turn the
 * reminder on.
 */
export const PUSH_ORIGINS: readonly string[] = [
  'https://fcm.googleapis.com',
  'https://updates.push.services.mozilla.com',
  'https://web.push.apple.com',
];

/**
 * The only servers the Worker (server/) calls: Google sign-in, Strava (ADR-008), OpenStreetMap
 * place search and driving routes for the journey (ADR-009), and the push services (ADR-012). Add
 * an API here with an ADR.
 */
export const SERVER_ORIGINS: readonly string[] = [
  'https://accounts.google.com',
  'https://oauth2.googleapis.com',
  'https://www.strava.com',
  'https://nominatim.openstreetmap.org',
  'https://routing.openstreetmap.de',
  ...PUSH_ORIGINS,
];
