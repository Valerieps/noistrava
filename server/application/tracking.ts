// My tracking on the profile (docs/spec/acompanhamento.md): my rhythm, my contribution to the
// group and my badges, shown to me only. Computed from the activities on every read; only the
// badges are stored, since one earned stays even if its activity is edited or deleted.
import type { ChainView, TrackingView } from '../../src/application/api-contract';
import { badgeStatuses, isBadgeKey, localTime, nextBadge, rhythm, type BadgeStatus, type TrackedActivity } from '../../src/domain/tracking/tracking';
import { getChallenge } from './challenges';
import type { Context } from './context';
import type { Member } from './members';

const zoneOf = (member: { timezone: string | null }) => member.timezone ?? 'UTC';

function activitiesOf(ctx: Context, memberId: string): TrackedActivity[] {
  return ctx.sql
    .all<{ started_at: string; timezone: string; duration_seconds: number; sport: string }>(
      'SELECT started_at, timezone, duration_seconds, sport FROM activities WHERE member_id = ? AND deleted = 0',
      memberId,
    )
    .map((a) => ({ startedAt: a.started_at, timezone: a.timezone, durationSeconds: a.duration_seconds, sport: a.sport }));
}

/** The badges as the activities, hearts and chains give them now, before the stored ones. */
function computedBadges(ctx: Context, member: { id: string; timezone: string | null }): BadgeStatus[] {
  const heartsGiven = ctx.sql.all<{ created_at: string }>('SELECT created_at FROM reactions WHERE member_id = ?', member.id).map((r) => r.created_at);
  const flawlessChains = ctx.sql
    .all<{ ended_at: string | null; ends_at: string; chain_result: string }>(
      `SELECT c.ended_at, c.ends_at, c.chain_result FROM challenges c
       JOIN challenge_members m ON m.challenge_id = c.id AND m.member_id = ? AND m.response = 'accepted'
       WHERE c.type = 'corrente' AND c.state = 'succeeded' AND c.chain_result IS NOT NULL`,
      member.id,
    )
    .filter((c) => (JSON.parse(c.chain_result) as ChainView).lost === 0)
    .map((c) => c.ended_at ?? c.ends_at);
  return badgeStatuses({ activities: activitiesOf(ctx, member.id), heartsGiven, flawlessChains, now: ctx.clock.now(), timeZone: zoneOf(member) });
}

/** Stores every badge just earned, for every member. Runs after each change and on the cron. */
export function awardBadges(ctx: Context): void {
  for (const member of ctx.sql.all<{ id: string; timezone: string | null }>('SELECT id, timezone FROM members WHERE active = 1')) {
    for (const badge of computedBadges(ctx, member)) {
      if (badge.earnedAt === null) continue;
      ctx.sql.run('INSERT OR IGNORE INTO member_badges (member_id, badge, earned_at) VALUES (?, ?, ?)', member.id, badge.key, badge.earnedAt);
    }
  }
}

/** Days, in my zone, inside a challenge I was a Senhora of, when I moved and no other Senhora of it did. */
function pulledDays(ctx: Context, actor: Member): number {
  const zone = zoneOf(actor);
  const now = ctx.clock.now().toISOString();
  const days = new Set<string>();
  const challenges = ctx.sql.all<{ id: string; starts_at: string; ends_at: string; ended_at: string | null }>(
    `SELECT c.id, c.starts_at, c.ends_at, c.ended_at FROM challenges c
     JOIN challenge_members m ON m.challenge_id = c.id AND m.member_id = ? AND m.response = 'accepted'
     WHERE c.state NOT IN ('draft', 'cancelled')`,
    actor.id,
  );
  for (const c of challenges) {
    const end = [c.ended_at ?? c.ends_at, now].sort()[0];
    const activities = ctx.sql.all<{ member_id: string; started_at: string }>(
      `SELECT a.member_id, a.started_at FROM activities a
       JOIN challenge_members m ON m.challenge_id = ? AND m.member_id = a.member_id AND m.response = 'accepted'
       WHERE a.deleted = 0 AND a.started_at >= ? AND a.started_at < ?`,
      c.id,
      c.starts_at,
      end,
    );
    const mine = new Set<string>();
    const others = new Set<string>();
    for (const a of activities) (a.member_id === actor.id ? mine : others).add(localTime(a.started_at, zone).date);
    for (const day of mine) if (!others.has(day)) days.add(day);
  }
  return days.size;
}

function contribution(ctx: Context, actor: Member): TrackingView['contribution'] {
  const result = getChallenge(ctx, actor, {});
  const open = 'challenge' in result ? result.challenge : null;
  let current: TrackingView['contribution']['current'] = null;
  if (open && open.state === 'open' && open.type === 'horas_colaborativas' && open.myResponse === 'accepted') {
    const mine = open.members.find((m) => m.memberId === actor.id)?.totalSeconds ?? 0;
    current = { name: open.name, percent: open.totalSeconds > 0 ? Math.round((mine / open.totalSeconds) * 100) : 0 };
  }
  const [{ asSenhora, won }] = ctx.sql.all<{ asSenhora: number; won: number | null }>(
    `SELECT COUNT(*) AS asSenhora, SUM(c.state = 'succeeded') AS won FROM challenges c
     JOIN challenge_members m ON m.challenge_id = c.id AND m.member_id = ? AND m.response = 'accepted'
     WHERE c.state NOT IN ('draft', 'cancelled')`,
    actor.id,
  );
  const [{ given }] = ctx.sql.all<{ given: number }>('SELECT COUNT(*) AS given FROM reactions WHERE member_id = ?', actor.id);
  const [{ received }] = ctx.sql.all<{ received: number }>(
    'SELECT COUNT(*) AS received FROM reactions r JOIN activities a ON a.id = r.activity_id WHERE a.member_id = ? AND r.member_id != ?',
    actor.id,
    actor.id,
  );
  return { current, asSenhora, won: won ?? 0, heartsGiven: given, heartsReceived: received, pulledDays: pulledDays(ctx, actor) };
}

/** Only my own: there is no way to ask for anyone else's. */
export function tracking(ctx: Context, actor: Member): TrackingView {
  const stored = new Map(
    ctx.sql
      .all<{ badge: string; earned_at: string }>('SELECT badge, earned_at FROM member_badges WHERE member_id = ?', actor.id)
      .filter((b) => isBadgeKey(b.badge))
      .map((b) => [b.badge, b.earned_at]),
  );
  const badges = computedBadges(ctx, actor).map((b) => ({ ...b, earnedAt: stored.get(b.key) ?? b.earnedAt }));
  return {
    ...rhythm(activitiesOf(ctx, actor.id), ctx.clock.now(), zoneOf(actor)),
    badges,
    nextBadge: nextBadge(badges),
    contribution: contribution(ctx, actor),
  };
}
