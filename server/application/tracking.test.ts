import { beforeEach, describe, expect, it } from 'vitest';
import type { ChallengeView, TrackingView } from '../../src/application/api-contract';
import { fixedClock, memorySql, sequentialIds } from '../testing/node-sql';
import { GroupService } from './group-service';
import type { GoogleProfile } from './members';

const profile = (email: string, name: string): GoogleProfile => ({ sub: `sub:${email}`, email, name, picture: null });
const ANA = 'h-ana';
const BIA = 'h-bia';

let clock: ReturnType<typeof fixedClock>;
let service: GroupService;

/** Ana (admin) and Bia, both in UTC; it is Wednesday 4 Nov 2026, noon. */
beforeEach(() => {
  clock = fixedClock('2026-11-04T12:00:00Z');
  service = new GroupService(memorySql(), clock, sequentialIds());
  service.migrate();
  service.signIn(profile('ana@example.com', 'Ana'), ANA, ['ana@example.com']);
  service.command(ANA, 'invite.create', { email: 'bia@example.com' });
  service.signIn(profile('bia@example.com', 'Bia'), BIA, []);
  for (const hash of [ANA, BIA]) service.command(hash, 'member.setTimezone', { timezone: 'UTC' });
});

function ok<T>(result: { ok: boolean; value?: unknown }): T {
  expect(result).toMatchObject({ ok: true });
  return result.value as T;
}

function log(hash: string, startedAt: string, minutes: number, sport = 'Run'): string {
  return ok<{ id: string }>(service.command(hash, 'activity.create', { startedAt, timezone: 'UTC', durationSeconds: minutes * 60, sport })).id;
}

const tracking = (hash = ANA) => ok<TrackingView>(service.query(hash, 'tracking', {}));
const badge = (hash: string, key: string) => tracking(hash).badges.find((b) => b.key === key);

describe('tracking', () => {
  it('shows only my own activities, in or out of a challenge', () => {
    log(ANA, '2026-11-02T10:00:00Z', 60);
    log(BIA, '2026-11-03T10:00:00Z', 90);
    expect(tracking(ANA)).toMatchObject({ streakWeeks: 1, week: { start: '2026-11-02', seconds: 3600 }, days: [{ date: '2026-11-02', seconds: 3600 }] });
    expect(tracking(BIA).week.seconds).toBe(5400);
  });

  it('keeps a badge after I delete the activity that gave it', () => {
    const id = log(ANA, '2026-11-02T10:00:00Z', 10 * 60);
    expect(badge(ANA, 'hours_10')?.earnedAt).toBe('2026-11-02T10:00:00.000Z');
    ok(service.command(ANA, 'activity.delete', { activityId: id }));
    expect(badge(ANA, 'hours_10')).toMatchObject({ earnedAt: '2026-11-02T10:00:00.000Z', progress: { done: 0 } });
    expect(tracking(ANA).nextBadge).toBe('early_bird');
  });

  it('counts my part, my challenges, the hearts and the days I pulled the group', () => {
    const challenge = ok<ChallengeView>(
      service.command(ANA, 'challenge.create', { name: 'Semana', startDate: '2026-11-02', endDate: '2026-11-08', goalHours: 10, creatorIsSenhora: true }),
    );
    ok(service.command(BIA, 'challenge.respond', { challengeId: challenge.id, accept: true }));
    const mine = log(ANA, '2026-11-02T10:00:00Z', 90);
    log(ANA, '2026-11-03T10:00:00Z', 30);
    const hers = log(BIA, '2026-11-03T18:00:00Z', 120);
    ok(service.command(BIA, 'reaction.set', { challengeId: challenge.id, activityId: mine, heart: true }));
    ok(service.command(ANA, 'reaction.set', { challengeId: challenge.id, activityId: hers, heart: true }));
    ok(service.command(ANA, 'reaction.set', { challengeId: challenge.id, activityId: mine, heart: true }));

    expect(tracking(ANA).contribution).toEqual({
      current: { name: 'Semana', percent: 50 },
      asSenhora: 1,
      won: 0,
      heartsGiven: 2,
      heartsReceived: 1,
      pulledDays: 1,
    });
    expect(tracking(BIA).contribution).toMatchObject({ current: { percent: 50 }, heartsGiven: 1, heartsReceived: 1, pulledDays: 0 });
  });
});
