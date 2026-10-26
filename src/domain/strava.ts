// Strava connection rules (docs/spec/strava.md, ADR-008). Shared by the app and the server.
import { isValidTimezone } from './time/zones';

/** The scope asked from Strava: private activities only when the member chose to include them. */
export function stravaScope(includePrivate: boolean): string {
  return includePrivate ? 'activity:read_all' : 'activity:read';
}

/**
 * Reads the scope the member actually granted on Strava's page, where she may untick boxes.
 * Null when the app cannot read her activities at all.
 */
export function grantedAccess(scope: string | null): { includePrivate: boolean } | null {
  const granted = (scope ?? '').split(/[ ,]/);
  if (granted.includes('activity:read_all')) return { includePrivate: true };
  if (granted.includes('activity:read')) return { includePrivate: false };
  return null;
}

/** Strava's `timezone` reads "(GMT-03:00) America/Sao_Paulo"; the IANA name is the last word. */
export function stravaTimezone(raw: string): string | null {
  const name = raw.trim().split(/\s+/).pop() ?? '';
  return isValidTimezone(name) ? name : null;
}
