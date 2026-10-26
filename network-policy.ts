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
 * The only servers the Worker (server/) calls: Google sign-in, Strava (ADR-008), and OpenStreetMap
 * place search and walking routes for the journey (ADR-009), and Overpass for the journey's
 * automatic stops (ADR-011). Add an API here with an ADR.
 */
export const SERVER_ORIGINS: readonly string[] = [
  'https://accounts.google.com',
  'https://oauth2.googleapis.com',
  'https://www.strava.com',
  'https://nominatim.openstreetmap.org',
  'https://routing.openstreetmap.de',
  'https://overpass-api.de',
];
