// The Strava connection (docs/spec/strava.md, ADR-008). The OAuth exchange and the token
// encryption happen in the Worker; this stores the result.
import type { StravaConnectionView } from '../../src/application/api-contract';
import { parseActivity } from '../../src/domain/activity';
import type { ActivityRow } from './activities';
import { settleAll } from './challenges';
import { nowIso, type Context } from './context';
import type { Member } from './members';

/** What the Worker brings back from Strava, with the tokens already encrypted. */
export interface NewStravaConnection {
  readonly athleteId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  /** When the access token expires, ISO 8601. */
  readonly expiresAt: string;
  /** From the scope the member granted, not the one asked. */
  readonly includePrivate: boolean;
}

export type ConnectStravaResult = { ok: true } | { ok: false; error: 'conflict' };

interface ConnectionRow {
  member_id: string;
  athlete_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  include_private: number;
  active: number;
  backfilled_since: string | null;
  consented_at: string;
}

/** How far back connecting brings my activities (docs/spec/strava.md). */
export const STRAVA_BACKFILL_DAYS = 90;

export function stravaConnection(ctx: Context, actor: Member): StravaConnectionView {
  const [row] = ctx.sql.all<ConnectionRow>('SELECT * FROM strava_connections WHERE member_id = ?', actor.id);
  return row?.active === 1 ? { connected: true, includePrivate: row.include_private === 1 } : { connected: false, includePrivate: false };
}

/**
 * Stores the member's connection, replacing an earlier one. The member accepted sharing before
 * the Worker sent her to Strava, so the acceptance date is now. One Strava account serves one
 * member only.
 */
export function connectStrava(ctx: Context, actor: Member, connection: NewStravaConnection): ConnectStravaResult {
  return ctx.sql.transaction(() => {
    const taken = ctx.sql.all<ConnectionRow>(
      'SELECT * FROM strava_connections WHERE athlete_id = ? AND active = 1 AND member_id != ?',
      connection.athleteId,
      actor.id,
    );
    if (taken.length > 0) return { ok: false, error: 'conflict' } as const;
    ctx.sql.run(
      `INSERT INTO strava_connections (member_id, athlete_id, access_token, refresh_token, expires_at, include_private, consented_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT (member_id) DO UPDATE SET athlete_id = excluded.athlete_id, access_token = excluded.access_token,
         refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, include_private = excluded.include_private,
         consented_at = excluded.consented_at, active = 1, backfilled_since = NULL`,
      actor.id,
      connection.athleteId,
      connection.accessToken,
      connection.refreshToken,
      connection.expiresAt,
      connection.includePrivate ? 1 : 0,
      nowIso(ctx),
    );
    return { ok: true } as const;
  });
}

/** An activity event from Strava, with the activity already fetched by the Worker (ADR-008). */
export type StravaActivityEvent =
  | { readonly stravaId: string; readonly deleted: true }
  | {
      readonly stravaId: string;
      readonly deleted?: false;
      readonly startedAt: string;
      readonly timezone: string;
      readonly durationSeconds: number;
      readonly sport: string;
    };

/**
 * Brings a new, updated or deleted Strava activity in for the member connected to that athlete.
 * One she deleted in the app never comes back; one whose time she edited keeps her time. Keeps
 * only start, zone, total time and sport. Returns whether anything changed.
 */
export function importStravaActivity(ctx: Context, athleteId: string, event: StravaActivityEvent): boolean {
  return ctx.sql.transaction(() => {
    const connection = activeConnection(ctx, athleteId);
    if (!connection || !importOne(ctx, connection, event)) return false;
    settleAll(ctx);
    return true;
  });
}

/**
 * The activities Strava lists from `since` on, brought in at once; the connection then counts as
 * backfilled from `since`, so the next backfill only happens for an earlier challenge start.
 */
export function importStravaBackfill(ctx: Context, athleteId: string, since: string, events: readonly StravaActivityEvent[]): boolean {
  return ctx.sql.transaction(() => {
    const connection = activeConnection(ctx, athleteId);
    if (!connection) return false;
    let changed = false;
    for (const event of events) changed = importOne(ctx, connection, event) || changed;
    ctx.sql.run('UPDATE strava_connections SET backfilled_since = ? WHERE member_id = ?', since, connection.member_id);
    if (changed) settleAll(ctx);
    return changed;
  });
}

function activeConnection(ctx: Context, athleteId: string): ConnectionRow | undefined {
  const [connection] = ctx.sql.all<ConnectionRow>('SELECT * FROM strava_connections WHERE athlete_id = ? AND active = 1', athleteId);
  return connection;
}

function importOne(ctx: Context, connection: ConnectionRow, event: StravaActivityEvent): boolean {
  const [existing] = ctx.sql.all<ActivityRow>('SELECT * FROM activities WHERE strava_id = ?', event.stravaId);
  if (existing && existing.member_id !== connection.member_id) return false;

  if (event.deleted) {
    if (!existing) return false;
    ctx.sql.run('DELETE FROM reactions WHERE activity_id = ?', existing.id);
    ctx.sql.run('DELETE FROM activities WHERE id = ?', existing.id);
    return true;
  }
  const fields = parseActivity(event, 'strava', ctx.clock.now());
  if (!fields || existing?.deleted === 1) return false;
  if (!existing) {
    ctx.sql.run(
      `INSERT INTO activities (id, member_id, source, strava_id, started_at, timezone, duration_seconds, sport, created_at)
       VALUES (?, ?, 'strava', ?, ?, ?, ?, ?, ?)`,
      ctx.ids.next(),
      connection.member_id,
      event.stravaId,
      fields.startedAt,
      fields.timezone,
      fields.durationSeconds,
      fields.sport,
      nowIso(ctx),
    );
    return true;
  }
  const duration = existing.edited_by_member === 1 ? existing.duration_seconds : fields.durationSeconds;
  if (
    existing.started_at === fields.startedAt &&
    existing.timezone === fields.timezone &&
    existing.duration_seconds === duration &&
    existing.sport === fields.sport
  ) {
    return false;
  }
  ctx.sql.run(
    'UPDATE activities SET started_at = ?, timezone = ?, duration_seconds = ?, sport = ? WHERE id = ?',
    fields.startedAt,
    fields.timezone,
    duration,
    fields.sport,
    existing.id,
  );
  return true;
}

/** A connection's tokens, still encrypted: only the Worker holds the key (ADR-008). */
export interface StravaCredentials {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** ISO 8601. */
  readonly expiresAt: string;
}

export function stravaCredentials(ctx: Context, athleteId: string): StravaCredentials | null {
  const connection = activeConnection(ctx, athleteId);
  if (!connection?.access_token || !connection.refresh_token || !connection.expires_at) return null;
  return { accessToken: connection.access_token, refreshToken: connection.refresh_token, expiresAt: connection.expires_at };
}

/** The tokens Strava gave back on a refresh, already encrypted. */
export function saveStravaTokens(ctx: Context, athleteId: string, tokens: StravaCredentials): void {
  ctx.sql.run(
    'UPDATE strava_connections SET access_token = ?, refresh_token = ?, expires_at = ? WHERE athlete_id = ? AND active = 1',
    tokens.accessToken,
    tokens.refreshToken,
    tokens.expiresAt,
    athleteId,
  );
}

/** The athlete of my own active connection, so the Worker can disconnect it. */
export function stravaAthlete(ctx: Context, actor: Member): string | null {
  const [row] = ctx.sql.all<ConnectionRow>('SELECT * FROM strava_connections WHERE member_id = ? AND active = 1', actor.id);
  return row?.athlete_id ?? null;
}

/**
 * Disconnecting, from the profile or by removing the app on Strava: the tokens go and new
 * activities stop arriving; the ones that came stay. Returns whether a connection was active.
 */
export function disconnectStrava(ctx: Context, athleteId: string): boolean {
  if (!activeConnection(ctx, athleteId)) return false;
  ctx.sql.run(
    `UPDATE strava_connections SET access_token = NULL, refresh_token = NULL, expires_at = NULL, active = 0, backfilled_since = NULL
     WHERE athlete_id = ? AND active = 1`,
    athleteId,
  );
  return true;
}

/**
 * The connections that still miss activities: the webhook only brings what happens after
 * connecting, so each one needs the 90 days before connecting, for the tracking, and the
 * activities since the start of the earliest open challenge that already began, if that is
 * earlier. Open challenges count whatever the member answered, so accepting late finds her
 * activities already here.
 */
export function stravaBackfillsDue(ctx: Context): { athleteId: string; since: string }[] {
  const now = ctx.clock.now().getTime();
  const earliestStart = ctx.sql
    .all<{ starts_at: string }>("SELECT starts_at FROM challenges WHERE state = 'open'")
    .map((row) => Date.parse(row.starts_at))
    .filter((start) => start <= now)
    .sort((a, b) => a - b)[0];
  return ctx.sql
    .all<ConnectionRow>('SELECT * FROM strava_connections WHERE active = 1')
    .map((row) => {
      const tracked = Date.parse(row.consented_at) - STRAVA_BACKFILL_DAYS * 24 * 60 * 60 * 1000;
      return { row, since: new Date(earliestStart !== undefined ? Math.min(tracked, earliestStart) : tracked).toISOString() };
    })
    .filter(({ row, since }) => !row.backfilled_since || Date.parse(since) < Date.parse(row.backfilled_since))
    .map(({ row, since }) => ({ athleteId: row.athlete_id, since }));
}
