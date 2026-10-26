// Activities (docs/spec/atividades.md): a member's own, logged by hand or brought from Strava.
// Every change settles the challenges, since their progress is computed from the activities.
import type { ActivityView } from '../../src/application/api-contract';
import { isValidDuration, parseActivity, type ActivitySource } from '../../src/domain/activity';
import { settleAll } from './challenges';
import { failure, nowIso, type CommandResult, type Context } from './context';
import type { Member } from './members';

export interface ActivityRow {
  id: string;
  member_id: string;
  source: ActivitySource;
  strava_id: string | null;
  started_at: string;
  timezone: string;
  duration_seconds: number;
  sport: string;
  edited_by_member: number;
  deleted: number;
}

const CHANGED = ['activities', 'challenge'] as const;

function toView(row: ActivityRow): ActivityView {
  return {
    id: row.id,
    source: row.source,
    startedAt: row.started_at,
    timezone: row.timezone,
    durationSeconds: row.duration_seconds,
    sport: row.sport,
    editedByMember: row.edited_by_member === 1,
  };
}

function findOwn(ctx: Context, actor: Member, activityId: unknown): ActivityRow | null {
  if (typeof activityId !== 'string') return null;
  const [row] = ctx.sql.all<ActivityRow>('SELECT * FROM activities WHERE id = ? AND member_id = ? AND deleted = 0', activityId, actor.id);
  return row ?? null;
}

/**
 * Whether an activity started at `startedAt` counted in a challenge whose result is closed. Its
 * Senhora may edit it only until then (24 hours after the end).
 */
function lockedByClosedChallenge(ctx: Context, memberId: string, startedAt: string): boolean {
  return (
    ctx.sql.all(
      `SELECT 1 FROM challenges c
       WHERE c.closed_at IS NOT NULL AND c.starts_at <= ? AND ? < COALESCE(c.ended_at, c.ends_at)
         AND (EXISTS (SELECT 1 FROM challenge_members m WHERE m.challenge_id = c.id AND m.member_id = ? AND m.response = 'accepted')
           OR EXISTS (SELECT 1 FROM challenge_absences a WHERE a.challenge_id = c.id AND a.member_id = ?))
       LIMIT 1`,
      startedAt,
      startedAt,
      memberId,
      memberId,
    ).length > 0
  );
}

export function listMyActivities(ctx: Context, actor: Member): ActivityView[] {
  return ctx.sql
    .all<ActivityRow>('SELECT * FROM activities WHERE member_id = ? AND deleted = 0 ORDER BY started_at DESC', actor.id)
    .map(toView);
}

/** Anyone logs her own activity by hand, with or without Strava. */
export function createActivity(ctx: Context, actor: Member, input: Record<string, unknown>): CommandResult<ActivityView> {
  const fields = parseActivity(input, 'manual', ctx.clock.now());
  if (!fields) return failure('invalid');
  if (lockedByClosedChallenge(ctx, actor.id, fields.startedAt)) return failure('conflict');
  const id = ctx.ids.next();
  ctx.sql.run(
    `INSERT INTO activities (id, member_id, source, started_at, timezone, duration_seconds, sport, created_at)
     VALUES (?, ?, 'manual', ?, ?, ?, ?, ?)`,
    id,
    actor.id,
    fields.startedAt,
    fields.timezone,
    fields.durationSeconds,
    fields.sport,
    nowIso(ctx),
  );
  settleAll(ctx);
  const [row] = ctx.sql.all<ActivityRow>('SELECT * FROM activities WHERE id = ?', id);
  return { ok: true, value: toView(row), changed: CHANGED };
}

/**
 * Only my own. On a Strava activity only the total time changes, and my edit wins over later
 * updates from Strava.
 */
export function updateActivity(ctx: Context, actor: Member, input: Record<string, unknown>): CommandResult<ActivityView> {
  const row = findOwn(ctx, actor, input.activityId);
  if (!row) return failure('not_found');

  let next: { startedAt: string; timezone: string; durationSeconds: number; sport: string } | null;
  if (row.source === 'strava') {
    const onlyDuration = input.startedAt === undefined && input.timezone === undefined && input.sport === undefined;
    next = onlyDuration && isValidDuration(input.durationSeconds)
      ? { startedAt: row.started_at, timezone: row.timezone, durationSeconds: input.durationSeconds, sport: row.sport }
      : null;
  } else {
    next = parseActivity(
      {
        startedAt: input.startedAt ?? row.started_at,
        timezone: input.timezone ?? row.timezone,
        durationSeconds: input.durationSeconds ?? row.duration_seconds,
        sport: input.sport ?? row.sport,
      },
      'manual',
      ctx.clock.now(),
    );
  }
  if (!next) return failure('invalid');
  if (lockedByClosedChallenge(ctx, actor.id, row.started_at) || lockedByClosedChallenge(ctx, actor.id, next.startedAt)) {
    return failure('conflict');
  }

  ctx.sql.run(
    'UPDATE activities SET started_at = ?, timezone = ?, duration_seconds = ?, sport = ?, edited_by_member = 1 WHERE id = ?',
    next.startedAt,
    next.timezone,
    next.durationSeconds,
    next.sport,
    row.id,
  );
  settleAll(ctx);
  const [updated] = ctx.sql.all<ActivityRow>('SELECT * FROM activities WHERE id = ?', row.id);
  return { ok: true, value: toView(updated), changed: CHANGED };
}

/** A Strava activity I delete stays as a marker, so a later update from Strava does not bring it back. */
export function deleteActivity(ctx: Context, actor: Member, input: { activityId?: unknown }): CommandResult<null> {
  const row = findOwn(ctx, actor, input.activityId);
  if (!row) return failure('not_found');
  if (lockedByClosedChallenge(ctx, actor.id, row.started_at)) return failure('conflict');
  ctx.sql.run('DELETE FROM reactions WHERE activity_id = ?', row.id);
  if (row.source === 'strava') ctx.sql.run('UPDATE activities SET deleted = 1 WHERE id = ?', row.id);
  else ctx.sql.run('DELETE FROM activities WHERE id = ?', row.id);
  settleAll(ctx);
  return { ok: true, value: null, changed: CHANGED };
}

/** When a member leaves the group: her activities and the hearts on them go. */
export function eraseMemberActivities(ctx: Context, memberId: string): void {
  ctx.sql.run('DELETE FROM reactions WHERE member_id = ? OR activity_id IN (SELECT id FROM activities WHERE member_id = ?)', memberId, memberId);
  ctx.sql.run('DELETE FROM activities WHERE member_id = ?', memberId);
}
