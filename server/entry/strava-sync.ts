// Bringing activities from Strava into the Group (ADR-008): the webhook's events, the backfill
// since a challenge's start, and disconnecting. The tokens are decrypted only here, in the Worker,
// and refreshed when they are about to expire.
import type { StravaCredentials } from '../application/strava';
import { decryptText, encryptText, isValidTokenKey } from '../infrastructure/crypto';
import { fetchStravaActivity, listStravaActivities, type StravaWebhookEvent } from '../infrastructure/strava-api';
import { deauthorizeStrava, refreshStravaToken } from '../infrastructure/strava-oauth';
import type { Env } from './env';
import type { Group } from './group-object';

type GroupStub = DurableObjectStub<Group>;
export type StravaEnv = Env & { readonly STRAVA_CLIENT_SECRET: string; readonly STRAVA_TOKEN_KEY: string };

/** A token this close to expiring is refreshed first. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/** Previews and local runs without the secrets never call Strava. */
export function stravaReady(env: Env): env is StravaEnv {
  return Boolean(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET && isValidTokenKey(env.STRAVA_TOKEN_KEY));
}

/**
 * A working access token for the athlete, refreshing it when it expires. Null when she is not
 * connected or Strava is down; a refresh token Strava refuses disconnects her.
 */
async function accessToken(env: StravaEnv, group: GroupStub, athleteId: string): Promise<string | null> {
  const credentials = (await group.stravaCredentials(athleteId)) as StravaCredentials | null;
  if (!credentials) return null;
  if (Date.parse(credentials.expiresAt) - EXPIRY_MARGIN_MS > Date.now()) return decryptText(env.STRAVA_TOKEN_KEY, credentials.accessToken);

  const refreshed = await refreshStravaToken({
    refreshToken: await decryptText(env.STRAVA_TOKEN_KEY, credentials.refreshToken),
    clientId: env.STRAVA_CLIENT_ID,
    clientSecret: env.STRAVA_CLIENT_SECRET,
  });
  if (refreshed === 'revoked') {
    await group.disconnectStrava(athleteId);
    return null;
  }
  if (!refreshed) return null;
  await group.saveStravaTokens(athleteId, {
    accessToken: await encryptText(env.STRAVA_TOKEN_KEY, refreshed.accessToken),
    refreshToken: await encryptText(env.STRAVA_TOKEN_KEY, refreshed.refreshToken),
    expiresAt: refreshed.expiresAt,
  });
  return refreshed.accessToken;
}

/** One webhook event. Events for athletes nobody connected never reach Strava's API. */
export async function handleStravaEvent(env: StravaEnv, group: GroupStub, event: StravaWebhookEvent): Promise<void> {
  if (event.kind === 'deauthorized') return group.disconnectStrava(event.athleteId);
  if (event.aspect === 'delete') return group.importStravaActivity(event.athleteId, { stravaId: event.stravaId, deleted: true });

  const token = await accessToken(env, group, event.athleteId);
  if (!token) return;
  const activity = await fetchStravaActivity(token, event.stravaId);
  if (activity === 'unauthorized') return group.disconnectStrava(event.athleteId);
  if (activity === 'gone') return group.importStravaActivity(event.athleteId, { stravaId: event.stravaId, deleted: true });
  if (!activity) throw new Error(`Strava did not answer for activity ${event.stravaId}`);
  await group.importStravaActivity(event.athleteId, activity);
}

/**
 * Brings each connection's activities since the earliest open challenge's start, when it does not
 * have them yet. Runs after connecting, after a change to a challenge, and on the cron, so a
 * failure is retried five minutes later.
 */
export async function runStravaBackfills(env: StravaEnv, group: GroupStub): Promise<void> {
  const due = (await group.stravaBackfillsDue()) as { athleteId: string; since: string }[];
  for (const { athleteId, since } of due) {
    try {
      const token = await accessToken(env, group, athleteId);
      if (!token) continue;
      const activities = await listStravaActivities(token, since);
      if (activities === 'unauthorized') await group.disconnectStrava(athleteId);
      else if (activities) await group.importStravaBackfill(athleteId, since, activities);
    } catch (error) {
      console.error('Strava backfill failed', error instanceof Error ? error.message : 'unknown error');
    }
  }
}

/**
 * "Puxar do Strava" from the profile: lists my activities in the window again, for when the
 * webhook missed one. Answers whether anything changed, `disconnected` when Strava refused the
 * app, and `unavailable` when Strava did not answer.
 */
export async function syncStravaMember(
  env: StravaEnv,
  group: GroupStub,
  athleteId: string,
  since: string,
): Promise<{ changed: boolean } | 'disconnected' | 'unavailable'> {
  const token = await accessToken(env, group, athleteId);
  if (!token) return (await group.stravaCredentials(athleteId)) ? 'unavailable' : 'disconnected';
  const activities = await listStravaActivities(token, since);
  if (activities === 'unauthorized') {
    await group.disconnectStrava(athleteId);
    return 'disconnected';
  }
  if (!activities) return 'unavailable';
  return { changed: Boolean(await group.importStravaBackfill(athleteId, since, activities)) };
}

/**
 * "Desconectar o Strava" from the profile: the app's access is removed on Strava too, when Strava
 * answers; the connection here goes either way.
 */
export async function disconnectStravaMember(env: Env, group: GroupStub, athleteId: string): Promise<void> {
  if (stravaReady(env)) {
    try {
      const token = await accessToken(env, group, athleteId);
      if (token) await deauthorizeStrava(token);
    } catch (error) {
      console.error('Strava deauthorization failed', error instanceof Error ? error.message : 'unknown error');
    }
  }
  await group.disconnectStrava(athleteId);
}
