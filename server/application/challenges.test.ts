import { beforeEach, describe, expect, it } from 'vitest';
import type { ChallengeView, HistoryItemView, LogEntryView } from '../../src/application/api-contract';
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

  it('report no change when Strava sends the same activity again', () => {
    service.importStravaActivity('a1', event);
    expect(service.importStravaActivity('a1', event)).toEqual([]);
  });

  it('are backfilled once from the earliest open challenge that began, whatever I answered', () => {
    expect(service.stravaBackfillsDue()).toEqual([]);
    ok(service.command(BIA, 'challenge.create', { name: 'Rascunho', startDate: '2026-11-02', endDate: '2026-11-20', goalHours: 10, creatorIsSenhora: true, draft: true }));
    expect(service.stravaBackfillsDue()).toEqual([]);

    const challenge = create({ creatorIsSenhora: false });
    expect(service.stravaBackfillsDue()).toEqual([{ athleteId: 'a1', since: challenge.startsAt }]);
    expect(service.importStravaBackfill('a1', challenge.startsAt, [event, { ...event, stravaId: 's2', sport: 'Ride' }])).toEqual(['activities', 'challenge']);
    expect(mine()).toHaveLength(2);
    expect(service.stravaBackfillsDue()).toEqual([]);

    ok(service.command(ANA, 'challenge.respond', { challengeId: challenge.id, accept: true }));
    expect(current()?.totalSeconds).toBe(7200);
  });

  it('are backfilled again after reconnecting', () => {
    const challenge = create();
    service.importStravaBackfill('a1', challenge.startsAt, []);
    service.connectStrava(ANA, { athleteId: 'a1', accessToken: 'x2', refreshToken: 'y2', expiresAt: '2026-12-01T00:00:00Z', includePrivate: true });
    expect(service.stravaBackfillsDue()).toEqual([{ athleteId: 'a1', since: challenge.startsAt }]);
  });

  it('stop arriving after disconnecting, and the ones that came stay', () => {
    service.importStravaActivity('a1', event);
    expect(service.stravaCredentials('a1')).toEqual({ accessToken: 'x', refreshToken: 'y', expiresAt: '2026-12-01T00:00:00Z' });
    expect(service.stravaAthlete(ANA)).toEqual({ ok: true, value: 'a1' });

    expect(service.disconnectStrava('a1')).toEqual(['strava']);
    expect(service.disconnectStrava('a1')).toEqual([]);
    expect(service.stravaCredentials('a1')).toBeNull();
    expect(service.stravaAthlete(ANA)).toEqual({ ok: true, value: null });
    expect(service.query(ANA, 'strava', {})).toMatchObject({ ok: true, value: { connected: false } });
    expect(service.importStravaActivity('a1', { ...event, stravaId: 's2' })).toEqual([]);
    expect(mine()).toHaveLength(1);
    create();
    expect(service.stravaBackfillsDue()).toEqual([]);
  });

  it('keep the refreshed tokens', () => {
    service.saveStravaTokens('a1', { accessToken: 'x2', refreshToken: 'y2', expiresAt: '2026-11-03T18:00:00Z' });
    expect(service.stravaCredentials('a1')).toEqual({ accessToken: 'x2', refreshToken: 'y2', expiresAt: '2026-11-03T18:00:00Z' });
    expect(service.stravaAthlete('h-nobody')).toEqual({ ok: false, error: 'unauthenticated' });
  });
});

describe('edge cases of the rules', () => {
  const at = (hash: string, startedAt: string, durationSeconds: number) =>
    service.command(hash, 'activity.create', { startedAt, timezone: 'UTC', durationSeconds, sport: 'Run' });
  const memberTotal = (name: string) => current()?.members.find((m) => m.name === name)?.totalSeconds;

  it('counts only what started before the goal was hit', () => {
    create();
    log(ANA, '2026-11-02T08:00:00Z', 10);
    expect(current()).toMatchObject({ state: 'succeeded', endedAt: '2026-11-03T12:00:00.000Z' });
    clock.set('2026-11-03T15:00:00Z');
    log(ANA, '2026-11-03T13:00:00Z', 1);
    expect(current()?.totalSeconds).toBe(36_000);
    log(ANA, '2026-11-03T09:00:00Z', 1);
    expect(current()?.totalSeconds).toBe(39_600);
  });

  it('keeps the milestones reached when the goal goes up', () => {
    const { id } = create();
    log(ANA, '2026-11-02T08:00:00Z', 3);
    ok(service.command(ANA, 'challenge.edit', { challengeId: id, name: 'Semana', startDate: '2026-11-02', endDate: '2026-11-08', goalHours: 100 }));
    expect(current()).toMatchObject({ state: 'open', percent: 3, milestones: [{ milestone: '25%', reachedAt: '2026-11-03T12:00:00.000Z' }] });
  });

  it('lets the torcida become Senhora, counted from the start', () => {
    const { id } = create();
    ok(service.command(BIA, 'challenge.respond', { challengeId: id, accept: false }));
    log(BIA, '2026-11-02T08:00:00Z', 1);
    expect(memberTotal('Bia')).toBe(0);
    ok(service.command(BIA, 'challenge.respond', { challengeId: id, accept: true }));
    expect(memberTotal('Bia')).toBe(3600);
    // Answering the same again changes nothing.
    expect(service.command(BIA, 'challenge.respond', { challengeId: id, accept: true })).toMatchObject({ ok: true, changed: [] });
  });

  it('shows a challenge to whoever joins the group during it, as torcida, and lets her accept', () => {
    const { id } = create();
    service.command(ANA, 'invite.create', { email: 'carla@example.com' });
    service.signIn(profile('carla@example.com', 'Carla'), 'h-carla', []);
    expect(current('h-carla')).toMatchObject({ id, myResponse: 'pending' });
    log('h-carla', '2026-11-02T08:00:00Z', 2);
    ok(service.command('h-carla', 'challenge.respond', { challengeId: id, accept: true }));
    expect(memberTotal('Carla')).toBe(7200);
  });

  it('does not count a creator who is not a Senhora', () => {
    expect(create({ creatorIsSenhora: false }).myResponse).toBe('declined');
    log(ANA, '2026-11-02T08:00:00Z', 2);
    expect(current()?.totalSeconds).toBe(0);
    expect(service.command(ANA, 'challenge.create', { name: 'X', startDate: '2026-11-10', endDate: '2026-11-11', goalHours: 1 })).toEqual({ ok: false, error: 'invalid' });
  });

  it('counts from the first instant of the period, not from the instant it ends', () => {
    create();
    clock.set('2026-11-09T00:30:00Z');
    expect(at(ANA, '2026-11-01T23:59:59Z', 3600)).toMatchObject({ ok: true });
    expect(at(ANA, '2026-11-02T00:00:00Z', 60)).toMatchObject({ ok: true });
    expect(at(ANA, '2026-11-09T00:00:00Z', 3600)).toMatchObject({ ok: true });
    expect(current()).toMatchObject({ state: 'failed', totalSeconds: 60, endedAt: '2026-11-09T00:00:00.000Z' });
  });

  it('lets a Senhora fix her activities during the 24 hours after the end', () => {
    create();
    const activity = log(ANA, '2026-11-02T08:00:00Z', 2);
    clock.set('2026-11-09T12:00:00Z');
    service.tick();
    expect(ok(service.command(ANA, 'activity.update', { activityId: activity, durationSeconds: 3 * 3600 }))).toMatchObject({ durationSeconds: 10_800, editedByMember: true });
    expect(current()).toMatchObject({ state: 'failed', totalSeconds: 10_800 });
  });

  it('closes a cancelled challenge with no tolerance', () => {
    const { id } = create();
    log(ANA, '2026-11-02T08:00:00Z', 1);
    ok(service.command(ANA, 'challenge.cancel', { challengeId: id }));
    expect(at(ANA, '2026-11-02T10:00:00Z', 3600)).toEqual({ ok: false, error: 'conflict' });
    for (const name of ['challenge.cancel', 'challenge.respond']) {
      expect(service.command(ANA, name, { challengeId: id, accept: true })).toEqual({ ok: false, error: 'conflict' });
    }
    expect(service.command(ANA, 'challenge.edit', { challengeId: id, name: 'X', startDate: '2026-11-02', endDate: '2026-11-08', goalHours: 5 })).toEqual({
      ok: false,
      error: 'conflict',
    });
  });

  it('cannot be cancelled once the goal is hit', () => {
    const { id } = create();
    log(ANA, '2026-11-02T08:00:00Z', 10);
    expect(service.command(ANA, 'challenge.cancel', { challengeId: id })).toEqual({ ok: false, error: 'conflict' });
  });

  it('answers unknown challenges and bad input', () => {
    const { id } = create();
    const activity = log(ANA, '2026-11-02T08:00:00Z', 1);
    const notFound = { ok: false, error: 'not_found' };
    expect(service.command(BIA, 'challenge.respond', { challengeId: 'nope', accept: true })).toEqual(notFound);
    expect(service.command(ANA, 'challenge.cancel', { challengeId: 'nope' })).toEqual(notFound);
    expect(service.command(ANA, 'challenge.delete', { challengeId: 'nope' })).toEqual(notFound);
    expect(service.command(ANA, 'challenge.edit', { challengeId: 42 })).toEqual(notFound);
    expect(service.command(BIA, 'reaction.set', { challengeId: 'nope', activityId: activity, heart: true })).toEqual(notFound);
    expect(service.query(BIA, 'challengeLog', {})).toEqual(notFound);
    expect(service.command(BIA, 'challenge.respond', { challengeId: id, accept: 'sim' })).toEqual({ ok: false, error: 'invalid' });
    expect(service.command(BIA, 'reaction.set', { challengeId: id, activityId: activity, heart: 1 })).toEqual({ ok: false, error: 'invalid' });
    expect(service.command(ANA, 'challenge.edit', { challengeId: id, name: 'X', startDate: '2026-11-02', endDate: '2026-11-08', goalHours: 0 })).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('takes the hearts away with the activity', () => {
    const { id } = create();
    const activity = log(ANA, '2026-11-02T08:00:00Z', 1);
    ok(service.command(BIA, 'reaction.set', { challengeId: id, activityId: activity, heart: true }));
    ok(service.command(ANA, 'activity.delete', { activityId: activity }));
    log(ANA, '2026-11-02T09:00:00Z', 1);
    expect(ok(service.query(BIA, 'challengeLog', { challengeId: id }))).toEqual([expect.objectContaining({ hearts: 0, heartedByMe: false })]);
  });

  it('walks a journey: the stops are milestones and the goal comes from the distance', () => {
    const journey = {
      start: { name: 'Lisboa', lat: 38.7, lng: -9.1 },
      end: { name: 'Sintra', lat: 38.8, lng: -9.4 },
      stops: [{ name: 'Queluz', lat: 38.75, lng: -9.25, distanceMeters: 20_000 }],
      distanceMeters: 50_000,
      route: [
        [38.7, -9.1],
        [38.8, -9.4],
      ],
    };
    expect(create({ goalHours: undefined, journey })).toMatchObject({ goalMinutes: 600, journey: { progressMeters: 0 } });
    log(ANA, '2026-11-02T08:00:00Z', 5);
    expect(current()).toMatchObject({ journey: { progressMeters: 25_000, distanceMeters: 50_000 }, percent: 50 });
    expect(current()?.milestones.map((m) => m.milestone).sort()).toEqual(['25%', '50%', 'parada:Queluz']);
  });

  it('lets an admin delete a closed challenge from the history; the activities stay', () => {
    const { id } = create();
    log(ANA, '2026-11-02T08:00:00Z', 1);
    ok(service.command(ANA, 'challenge.cancel', { challengeId: id }));
    ok(service.command(ANA, 'challenge.delete', { challengeId: id }));
    expect(ok(service.query(ANA, 'history', {}))).toEqual([]);
    expect(ok<unknown[]>(service.query(ANA, 'activities', {}))).toHaveLength(1);
  });

  it('does not count Strava activities from before the period, nor broken ones', () => {
    create();
    service.connectStrava(ANA, { athleteId: 'a1', accessToken: 'x', refreshToken: 'y', expiresAt: '2026-12-01T00:00:00Z', includePrivate: false });
    service.importStravaActivity('a1', { stravaId: 's1', startedAt: '2026-11-01T08:00:00Z', timezone: 'UTC', durationSeconds: 3600, sport: 'Run' });
    expect(current()?.totalSeconds).toBe(0);
    expect(service.importStravaActivity('a1', { stravaId: 's2', startedAt: 'garbage', timezone: 'UTC', durationSeconds: 3600, sport: 'Run' })).toEqual([]);
  });
});

describe('drafts', () => {
  const setup = { name: 'Próximo', startDate: '2026-11-10', endDate: '2026-11-20', goalHours: 20, creatorIsSenhora: false };
  const draft = (hash = BIA, extra: Record<string, unknown> = {}) => ok<ChallengeView>(service.command(hash, 'challenge.create', { ...setup, draft: true, ...extra }));
  const drafts = (hash: string) => ok<ChallengeView[]>(service.query(hash, 'drafts', {}));

  it('saves any number while a challenge is open, seen only by the creator', () => {
    const open = create();
    const first = draft();
    draft(BIA, { name: 'Outro' });
    expect(first).toMatchObject({ state: 'draft', members: [{ response: 'pending' }, { response: 'pending' }] });
    expect(drafts(BIA).map((d) => d.name)).toEqual(['Outro', 'Próximo']);
    expect(drafts(ANA)).toEqual([]);
    expect(current(BIA)?.id).toBe(open.id);
    expect(service.query(ANA, 'challenge', { challengeId: first.id })).toEqual({ ok: false, error: 'not_found' });
    expect(service.command(ANA, 'challenge.edit', { ...setup, challengeId: first.id })).toEqual({ ok: false, error: 'not_found' });
    // Even an admin does not see someone else's draft.
    expect(service.command(ANA, 'challenge.delete', { challengeId: first.id })).toEqual({ ok: false, error: 'not_found' });
  });

  it('checks only the format, and a journey may wait for its route', () => {
    expect(draft(BIA, { startDate: '2026-10-01', endDate: '2026-10-02' })).toMatchObject({ state: 'draft' });
    expect(service.command(BIA, 'challenge.create', { ...setup, draft: true, goalHours: 0 })).toEqual({ ok: false, error: 'invalid' });
    const pending = draft(BIA, { goalHours: undefined, journeyPending: true });
    expect(pending).toMatchObject({ journeyPending: true, goalMinutes: 0, percent: 0, journey: null });
    expect(service.command(BIA, 'challenge.activate', { challengeId: pending.id })).toEqual({ ok: false, error: 'invalid' });
    // An open challenge never waits for its route.
    expect(service.command(BIA, 'challenge.create', { ...setup, goalHours: undefined, journeyPending: true })).toEqual({ ok: false, error: 'invalid' });
  });

  it('activates only while no challenge is open, and then invites everyone', () => {
    create();
    const { id } = draft(BIA, { creatorIsSenhora: true });
    expect(service.command(BIA, 'challenge.activate', { challengeId: id })).toEqual({ ok: false, error: 'conflict' });
    // The open one ends with its period; its tolerance does not hold the next one back.
    clock.set('2026-11-09T01:00:00Z');
    service.tick();
    expect(service.command(ANA, 'challenge.activate', { challengeId: id })).toEqual({ ok: false, error: 'not_found' });
    const active = ok<ChallengeView>(service.command(BIA, 'challenge.activate', { challengeId: id }));
    expect(active).toMatchObject({ state: 'open', startsAt: '2026-11-10T00:00:00.000Z' });
    expect(active.members.map((m) => [m.name, m.response])).toEqual([
      ['Ana', 'pending'],
      ['Bia', 'accepted'],
    ]);
    expect(current(ANA)?.id).toBe(id);
    expect(drafts(BIA)).toEqual([]);
    expect(service.command(BIA, 'challenge.activate', { challengeId: id })).toEqual({ ok: false, error: 'conflict' });
  });

  it('refuses to activate once the end has passed, until the dates are edited', () => {
    const { id } = draft(BIA, { startDate: '2026-10-01', endDate: '2026-10-02' });
    expect(service.command(BIA, 'challenge.activate', { challengeId: id })).toEqual({ ok: false, error: 'invalid' });
    ok(service.command(BIA, 'challenge.edit', { ...setup, challengeId: id, creatorIsSenhora: true }));
    expect(ok<ChallengeView>(service.command(BIA, 'challenge.activate', { challengeId: id })).myResponse).toBe('accepted');
  });

  it('lets the creator delete her draft without the admin, but not an open challenge', () => {
    const { id } = draft();
    expect(service.command(BIA, 'challenge.cancel', { challengeId: id })).toEqual({ ok: false, error: 'conflict' });
    expect(service.command(BIA, 'challenge.delete', { challengeId: id })).toMatchObject({ ok: true });
    expect(drafts(BIA)).toEqual([]);
    const open = ok<ChallengeView>(service.command(BIA, 'challenge.create', { ...setup, creatorIsSenhora: true }));
    expect(service.command(BIA, 'challenge.delete', { challengeId: open.id })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('counts no activity and takes no answer while it is a draft', () => {
    const { id } = draft(BIA, { startDate: '2026-11-01', creatorIsSenhora: true });
    log(BIA, '2026-11-02T08:00:00Z', 2);
    expect(service.command(ANA, 'challenge.respond', { challengeId: id, accept: true })).toEqual({ ok: false, error: 'not_found' });
    expect(ok<ChallengeView>(service.query(BIA, 'challenge', { challengeId: id }))).toBeDefined();
    expect(drafts(BIA)[0]).toMatchObject({ state: 'draft', totalSeconds: 0 });
  });
});

describe('the chain', () => {
  /** A chain from Mon 2 Nov, Ana and Bia as Senhoras. */
  function createChain(endDate: string, allowedBreaks: number): ChallengeView {
    const chain = ok<ChallengeView>(
      service.command(ANA, 'challenge.create', { type: 'corrente', name: 'Corrente', startDate: '2026-11-02', endDate, chain: { allowedBreaks, minMinutesPerDay: 0 }, creatorIsSenhora: true }),
    );
    ok(service.command(BIA, 'challenge.respond', { challengeId: chain.id, accept: true }));
    return chain;
  }

  const day = (date: string) => current()?.chain?.days.find((d) => d.date === date);

  it('refuses more breaks than one for every 10 days, and a new type on an open challenge', () => {
    expect(service.command(ANA, 'challenge.create', { type: 'corrente', name: 'C', startDate: '2026-11-02', endDate: '2026-11-15', chain: { allowedBreaks: 2, minMinutesPerDay: 0 }, creatorIsSenhora: true })).toEqual({
      ok: false,
      error: 'invalid',
    });
    const { id } = createChain('2026-11-15', 1);
    expect(current()).toMatchObject({ type: 'corrente', goalMinutes: 0, journey: null, milestones: [], chain: { allowedBreaks: 1, lost: 0, saved: 0 } });
    expect(service.command(ANA, 'challenge.edit', { challengeId: id, name: 'C', startDate: '2026-11-02', endDate: '2026-11-15', goalHours: 10 })).toEqual({ ok: false, error: 'invalid' });
  });

  it('saves a break with two Senhoras the next day, and fails once more breaks are lost than allowed', () => {
    createChain('2026-11-15', 1);
    log(ANA, '2026-11-02T08:00:00Z', 1);
    clock.set('2026-11-04T12:00:00Z');
    log(ANA, '2026-11-04T08:00:00Z', 1);
    log(BIA, '2026-11-04T09:00:00Z', 1);
    expect(day('2026-11-03')?.state).toBe('waiting');
    clock.set('2026-11-05T01:00:00Z');
    expect(day('2026-11-03')).toMatchObject({ state: 'saved', savedBy: [{ name: 'Ana' }, { name: 'Bia' }] });

    clock.set('2026-11-06T12:00:00Z');
    log(ANA, '2026-11-06T08:00:00Z', 1);
    clock.set('2026-11-08T00:00:00Z');
    service.tick();
    expect(current()).toMatchObject({ state: 'open', chain: { lost: 1, saved: 1, streak: 1 } });
    expect(day('2026-11-05')?.state).toBe('lost');

    clock.set('2026-11-10T00:00:00Z');
    expect(service.tick()).toEqual(['challenge', 'history']);
    expect(current()).toBeNull();
    const [item] = ok<HistoryItemView[]>(service.query(ANA, 'history', {}));
    expect(item).toMatchObject({ type: 'corrente', state: 'failed', chain: { allowedBreaks: 1, lost: 2, saved: 1 } });
  });

  it('lets the day after the end save the last day, without counting its activities', () => {
    const { id } = createChain('2026-11-03', 0);
    log(ANA, '2026-11-02T08:00:00Z', 1);
    clock.set('2026-11-04T01:00:00Z');
    service.tick();
    expect(current()).toMatchObject({ state: 'succeeded', closesAt: '2026-11-06T00:00:00.000Z', closed: false });

    clock.set('2026-11-04T12:00:00Z');
    log(ANA, '2026-11-04T08:00:00Z', 1);
    log(BIA, '2026-11-04T09:00:00Z', 1);
    clock.set('2026-11-06T00:00:00Z');
    service.tick();
    const closed = ok<{ challenge: ChallengeView }>(service.query(ANA, 'challenge', { challengeId: id })).challenge;
    expect(closed).toMatchObject({ state: 'succeeded', closed: true, totalSeconds: 3600, chain: { lost: 0, saved: 1 } });
    expect(ok<LogEntryView[]>(service.query(ANA, 'challengeLog', { challengeId: id }))).toHaveLength(1);
  });

  it('fails when the last day is not saved', () => {
    createChain('2026-11-03', 0);
    log(ANA, '2026-11-02T08:00:00Z', 1);
    clock.set('2026-11-04T12:00:00Z');
    log(ANA, '2026-11-04T08:00:00Z', 1);
    clock.set('2026-11-06T00:00:00Z');
    service.tick();
    const [item] = ok<HistoryItemView[]>(service.query(ANA, 'history', {}));
    expect(item).toMatchObject({ state: 'failed', chain: { lost: 1, saved: 0 } });
  });
});
