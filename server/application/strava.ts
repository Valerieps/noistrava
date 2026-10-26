// The Strava connection (docs/spec/strava.md, ADR-008). The OAuth exchange and the token
// encryption happen in the Worker; this stores the result.
import type { StravaConnectionView } from '../../src/application/api-contract';
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
  include_private: number;
  active: number;
}

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
         consented_at = excluded.consented_at, active = 1`,
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
