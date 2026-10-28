// Strava's API v3 and webhook events (ADR-008). An event only says that something changed; the
// activity itself is always fetched with the athlete's own token, and only start, zone, total
// time and sport are kept.
import { stravaTimezone } from '../../src/domain/strava';
import type { StravaActivityEvent } from '../application/strava';

const API = 'https://www.strava.com/api/v3';
const PAGE_SIZE = 100;
/** A backfill reads at most this many pages; a challenge never has more activities than that. */
const MAX_PAGES = 5;

/** The webhook's body, reduced to what the app acts on. */
export type StravaWebhookEvent =
  | { readonly kind: 'activity'; readonly athleteId: string; readonly stravaId: string; readonly aspect: 'create' | 'update' | 'delete' }
  | { readonly kind: 'deauthorized'; readonly athleteId: string };

export function parseWebhookEvent(body: unknown): StravaWebhookEvent | null {
  if (typeof body !== 'object' || body === null) return null;
  const { object_type, object_id, aspect_type, owner_id, updates } = body as Record<string, unknown>;
  if (typeof owner_id !== 'number' || typeof object_id !== 'number') return null;
  const athleteId = String(owner_id);
  if (object_type === 'athlete') {
    const authorized = typeof updates === 'object' && updates !== null ? (updates as { authorized?: unknown }).authorized : undefined;
    return aspect_type === 'update' && authorized === 'false' ? { kind: 'deauthorized', athleteId } : null;
  }
  if (object_type !== 'activity' || (aspect_type !== 'create' && aspect_type !== 'update' && aspect_type !== 'delete')) return null;
  return { kind: 'activity', athleteId, stravaId: String(object_id), aspect: aspect_type };
}

/** An activity from Strava, keeping only the four fields the app stores. */
export function activityFromStrava(body: unknown): StravaActivityEvent | null {
  if (typeof body !== 'object' || body === null) return null;
  const { id, start_date, timezone, elapsed_time, sport_type, type } = body as Record<string, unknown>;
  const sport = typeof sport_type === 'string' ? sport_type : type;
  if (typeof id !== 'number' || typeof start_date !== 'string' || typeof elapsed_time !== 'number' || typeof sport !== 'string') return null;
  return {
    stravaId: String(id),
    startedAt: start_date,
    // A zone Strava writes in a way the app cannot read falls back to UTC rather than losing the activity.
    timezone: (typeof timezone === 'string' && stravaTimezone(timezone)) || 'UTC',
    durationSeconds: elapsed_time,
    sport,
  };
}

/** The result of a call: 'unauthorized' means the token no longer works. */
export type StravaRead<T> = T | 'unauthorized' | null;

/** One activity; 'gone' when Strava no longer shows it to the app (deleted, or made private). */
export async function fetchStravaActivity(accessToken: string, stravaId: string): Promise<StravaRead<StravaActivityEvent | 'gone'>> {
  const response = await fetch(`${API}/activities/${encodeURIComponent(stravaId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 401) return 'unauthorized';
  if (response.status === 403 || response.status === 404) return 'gone';
  if (!response.ok) return null;
  return activityFromStrava(await response.json().catch(() => null));
}

/** The athlete's activities that started from `since` on, oldest pages first. */
export async function listStravaActivities(accessToken: string, since: string): Promise<StravaRead<StravaActivityEvent[]>> {
  const after = Math.floor(Date.parse(since) / 1000) - 1;
  const found: StravaActivityEvent[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({ after: String(after), per_page: String(PAGE_SIZE), page: String(page) });
    const response = await fetch(`${API}/athlete/activities?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 401) return 'unauthorized';
    if (!response.ok) return null;
    const body: unknown = await response.json().catch(() => null);
    if (!Array.isArray(body)) return null;
    for (const item of body) {
      const activity = activityFromStrava(item);
      if (activity) found.push(activity);
    }
    if (body.length < PAGE_SIZE) break;
  }
  return found;
}
