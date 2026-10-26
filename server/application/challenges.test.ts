import { beforeEach, describe, expect, it } from 'vitest';
import type { ChallengeView } from '../../src/application/api-contract';
import { fixedClock, memorySql, sequentialIds } from '../testing/node-sql';
import { GroupService } from './group-service';
import type { GoogleProfile } from './members';

const profile = (email: string, name: string): GoogleProfile => ({ sub: `sub:${email}`, email, name, picture: null });
const ANA = 'h-ana';
const BIA = 'h-bia';

let clock: ReturnType<typeof fixedClock>;
let service: GroupService;

/** Ana (admin) and Bia, both in UTC; it is Tuesday 3 Nov 2026, noon. */
beforeEach(() => {
  clock = fixedClock('2026-11-03T12:00:00Z');
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

/** Mon 2 Nov to Sun 8 Nov, 10 hours, Ana as Senhora. */
function create(extra: Record<string, unknown> = {}): ChallengeView {
  return ok(service.command(ANA, 'challenge.create', { name: 'Semana', startDate: '2026-11-02', endDate: '2026-11-08', goalHours: 10, creatorIsSenhora: true, ...extra }));
}

function log(hash: string, startedAt: string, hours: number): string {
  return ok<{ id: string }>(service.command(hash, 'activity.create', { startedAt, timezone: 'UTC', durationSeconds: hours * 3600, sport: 'Run' })).id;
}

const current = (hash = ANA) => ok<{ challenge: ChallengeView | null }>(service.query(hash, 'challenge', {})).challenge;

describe('creating a challenge', () => {
  it('invites everyone, and allows one open challenge at a time', () => {
    const challenge = create();
    expect(challenge).toMatchObject({ startsAt: '2026-11-02T00:00:00.000Z', endsAt: '2026-11-09T00:00:00.000Z', state: 'open', goalMinutes: 600 });
    expect(challenge.members.map((m) => [m.name, m.response])).toEqual([
      ['Ana', 'accepted'],
      ['Bia', 'pending'],
    ]);
    expect(current(BIA)?.myResponse).toBe('pending');
    expect(service.command(BIA, 'challenge.create', { name: 'Outro', startDate: '2026-11-02', endDate: '2026-11-08', goalHours: 1, creatorIsSenhora: true })).toEqual({
      ok: false,
      error: 'conflict',
    });
  });

  it('stretches the period over every member zone', () => {
    service.command(BIA, 'member.setTimezone', { timezone: 'America/Phoenix' });
    expect(create()).toMatchObject({ startsAt: '2026-11-02T00:00:00.000Z', endsAt: '2026-11-09T07:00:00.000Z' });
  });

  it('refuses a period that already ended, and bad input', () => {
    expect(service.command(ANA, 'challenge.create', { name: 'Velho', startDate: '2026-10-01', endDate: '2026-10-02', goalHours: 1, creatorIsSenhora: true })).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(service.command(ANA, 'challenge.create', { name: 'Sem meta', startDate: '2026-11-02', endDate: '2026-11-08', creatorIsSenhora: true })).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('lets only the creator edit, before the end', () => {
    const { id } = create();
    expect(service.command(BIA, 'challenge.edit', { challengeId: id, name: 'X', startDate: '2026-11-02', endDate: '2026-11-08', goalHours: 5 })).toEqual({
      ok: false,
      error: 'forbidden',
    });
    log(ANA, '2026-11-02T08:00:00Z', 6);
    // Lowering the goal below the total ends the challenge with success at once.
    expect(ok<ChallengeView>(service.command(ANA, 'challenge.edit', { challengeId: id, name: 'X', startDate: '2026-11-02', endDate: '2026-11-08', goalHours: 5 }))).toMatchObject({
      name: 'X',
      state: 'succeeded',
      endedAt: '2026-11-03T12:00:00.000Z',
    });
    expect(service.command(ANA, 'challenge.edit', { challengeId: id, name: 'Y', startDate: '2026-11-02', endDate: '2026-11-08', goalHours: 50 })).toEqual({
      ok: false,
      error: 'conflict',
    });
  });
});

describe('goal, end and tolerance', () => {
  it('ends with success the moment the goal is hit, and records milestones that never go back', () => {
    const { id } = create();
    log(ANA, '2026-11-02T08:00:00Z', 3);
    expect(current()?.milestones.map((m) => m.milestone)).toEqual(['25%']);
    const late = log(ANA, '2026-11-03T08:00:00Z', 7);
    expect(current()).toMatchObject({ state: 'succeeded', totalSeconds: 36_000, percent: 100, endedAt: '2026-11-03T12:00:00.000Z', closesAt: '2026-11-04T12:00:00.000Z' });

    // During the tolerance the result follows the total, both ways.
    ok(service.command(ANA, 'activity.delete', { activityId: late }));
    expect(current()).toMatchObject({ id, state: 'failed', percent: 30 });
    expect(current()?.milestones.map((m) => m.milestone)).toEqual(['25%', '50%', '75%']);
    log(ANA, '2026-11-03T09:00:00Z', 7);
    expect(current()?.state).toBe('succeeded');
  });

  it('ends without success when the period passes, and late activities still count for 24 hours', () => {
    const { id } = create();
    log(ANA, '2026-11-02T08:00:00Z', 4);
    clock.set('2026-11-09T01:00:00Z');
    expect(service.tick()).toEqual(['challenge', 'history']);
    expect(current()).toMatchObject({ state: 'failed', endedAt: '2026-11-09T00:00:00.000Z', percent: 40 });

    // A Strava sync that arrived late, for an activity inside the period.
    log(ANA, '2026-11-08T20:00:00Z', 6);
    expect(current()?.state).toBe('succeeded');

    clock.set('2026-11-10T00:30:00Z');
    service.tick();
    expect(current()).toBeNull();
    expect(ok(service.query(ANA, 'history', {}))).toEqual([
      expect.objectContaining({ id, state: 'succeeded', totalSeconds: 36_000, percent: 100, results: [{ memberId: expect.any(String), name: 'Ana', totalSeconds: 36_000 }] }),
    ]);
  });

  it('locks a Senhora\'s activities in a closed challenge', () => {
    create();
    const activity = log(ANA, '2026-11-02T08:00:00Z', 1);
    clock.set('2026-11-10T01:00:00Z');
    service.tick();
    service.tick();
    expect(service.command(ANA, 'activity.update', { activityId: activity, durationSeconds: 60 })).toEqual({ ok: false, error: 'conflict' });
    expect(service.command(ANA, 'activity.delete', { activityId: activity })).toEqual({ ok: false, error: 'conflict' });
    // Bia was never a Senhora: her own activities stay hers to edit.
    const bias = log(BIA, '2026-11-02T08:00:00Z', 1);
    expect(service.command(BIA, 'activity.delete', { activityId: bias })).toMatchObject({ ok: true });
  });
});

describe('answering the invite', () => {
  it('counts a late Senhora from the start, keeps what came before she left, skips the time she was out', () => {
    const { id } = create();
    log(BIA, '2026-11-02T08:00:00Z', 1);
    expect(current()?.totalSeconds).toBe(0);

    ok(service.command(BIA, 'challenge.respond', { challengeId: id, accept: true }));
    expect(current()?.totalSeconds).toBe(3600);

    clock.set('2026-11-04T12:00:00Z');
    ok(service.command(BIA, 'challenge.respond', { challengeId: id, accept: false }));
    clock.set('2026-11-04T14:00:00Z');
    log(BIA, '2026-11-04T13:00:00Z', 1);
    clock.set('2026-11-05T12:00:00Z');
    ok(service.command(BIA, 'challenge.respond', { challengeId: id, accept: true }));
    clock.set('2026-11-05T14:00:00Z');
    log(BIA, '2026-11-05T13:00:00Z', 1);
    expect(current()?.members.find((m) => m.name === 'Bia')).toMatchObject({ response: 'accepted', totalSeconds: 7200 });
  });

  it('closes when the challenge ended', () => {
    const { id } = create({ goalHours: 1 });
    log(ANA, '2026-11-02T08:00:00Z', 1);
    expect(service.command(BIA, 'challenge.respond', { challengeId: id, accept: true })).toEqual({ ok: false, error: 'conflict' });
  });
});

describe('log and hearts', () => {
  it('lets anyone, torcida included, put and take a heart on a logged activity', () => {
    const { id } = create();
    const activity = log(ANA, '2026-11-02T08:00:00Z', 1);
    const outside = log(BIA, '2026-11-02T08:00:00Z', 1);
    ok(service.command(BIA, 'reaction.set', { challengeId: id, activityId: activity, heart: true }));
    ok(service.command(BIA, 'reaction.set', { challengeId: id, activityId: activity, heart: true }));
    expect(ok(service.query(BIA, 'challengeLog', { challengeId: id }))).toEqual([
      expect.objectContaining({ activityId: activity, memberName: 'Ana', durationSeconds: 3600, hearts: 1, heartedByMe: true }),
    ]);
    expect(service.command(ANA, 'reaction.set', { challengeId: id, activityId: outside, heart: true })).toEqual({ ok: false, error: 'not_found' });
    ok(service.command(BIA, 'reaction.set', { challengeId: id, activityId: activity, heart: false }));
    expect(ok(service.query(ANA, 'challengeLog', { challengeId: id }))).toEqual([expect.objectContaining({ hearts: 0, heartedByMe: false })]);
  });
});

describe('cancel and delete', () => {
  it('lets the creator cancel; the result closes at once', () => {
    const { id } = create();
    log(ANA, '2026-11-02T08:00:00Z', 2);
    expect(service.command(BIA, 'challenge.cancel', { challengeId: id })).toEqual({ ok: false, error: 'forbidden' });
    ok(service.command(ANA, 'challenge.cancel', { challengeId: id }));
    expect(current()).toBeNull();
    expect(ok(service.query(ANA, 'history', {}))).toEqual([expect.objectContaining({ state: 'cancelled', totalSeconds: 7200, percent: 20 })]);
    // A new one can start right away.
    create();
  });

  it('lets only admins delete', () => {
    const { id } = create();
    expect(service.command(BIA, 'challenge.delete', { challengeId: id })).toEqual({ ok: false, error: 'forbidden' });
    ok(service.command(ANA, 'challenge.delete', { challengeId: id }));
    expect(service.query(ANA, 'challenge', { challengeId: id })).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('activities', () => {
  it('are edited and deleted by their owner only', () => {
    const activity = log(ANA, '2026-11-02T08:00:00Z', 1);
    expect(service.command(BIA, 'activity.update', { activityId: activity, durationSeconds: 60 })).toEqual({ ok: false, error: 'not_found' });
    expect(ok(service.command(ANA, 'activity.update', { activityId: activity, sport: 'Swim' }))).toMatchObject({ sport: 'Swim', durationSeconds: 3600 });
    expect(service.command(ANA, 'activity.create', { startedAt: '2026-11-04T08:00:00Z', timezone: 'UTC', durationSeconds: 60, sport: 'Run' })).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('go with the member removed from the group; the history keeps her totals', () => {
    const { id } = create();
    ok(service.command(BIA, 'challenge.respond', { challengeId: id, accept: true }));
    log(BIA, '2026-11-02T08:00:00Z', 2);
    clock.set('2026-11-10T01:00:00Z');
    service.tick();
    const bia = ok<{ id: string }[]>(service.query(ANA, 'members', {})).find((m) => m.id !== ok<{ id: string }>(service.query(ANA, 'me', {})).id)!;
    ok(service.command(ANA, 'member.remove', { memberId: bia.id }));
    expect(ok(service.query(ANA, 'history', {}))).toEqual([
      expect.objectContaining({ totalSeconds: 7200, results: expect.arrayContaining([expect.objectContaining({ name: 'Bia', totalSeconds: 7200 })]) }),
    ]);
  });
});

describe('activities from Strava', () => {
  const event = { stravaId: 's1', startedAt: '2026-11-02T08:00:00Z', timezone: 'UTC', durationSeconds: 3600, sport: 'TrailRun' };

  beforeEach(() => {
    service.connectStrava(ANA, { athleteId: 'a1', accessToken: 'x', refreshToken: 'y', expiresAt: '2026-12-01T00:00:00Z', includePrivate: false });
  });

  const mine = () => ok<{ id: string; durationSeconds: number }[]>(service.query(ANA, 'activities', {}));

  it('arrive, and my edit of the time wins over later updates', () => {
    expect(service.importStravaActivity('a1', event)).toEqual(['activities', 'challenge']);
    expect(service.importStravaActivity('unknown', { ...event, stravaId: 's2' })).toEqual([]);
    const [activity] = mine();
    expect(service.command(ANA, 'activity.update', { activityId: activity.id, sport: 'Run' })).toEqual({ ok: false, error: 'invalid' });
    ok(service.command(ANA, 'activity.update', { activityId: activity.id, durationSeconds: 1800 }));
    service.importStravaActivity('a1', { ...event, durationSeconds: 7200 });
    expect(mine()).toEqual([expect.objectContaining({ durationSeconds: 1800 })]);
  });

  it('do not come back once I delete them, and leave when deleted on Strava', () => {
    service.importStravaActivity('a1', event);
    ok(service.command(ANA, 'activity.delete', { activityId: mine()[0].id }));
    service.importStravaActivity('a1', event);
    expect(mine()).toEqual([]);

    service.importStravaActivity('a1', { ...event, stravaId: 's2' });
    service.importStravaActivity('a1', { stravaId: 's2', deleted: true });
    expect(mine()).toEqual([]);
  });
});
