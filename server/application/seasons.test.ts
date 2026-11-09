import { beforeEach, describe, expect, it } from 'vitest';
import type { Queries, SeasonRankingView } from '../../src/application/api-contract';
import { fixedClock, memorySql, sequentialIds } from '../testing/node-sql';
import { GroupService } from './group-service';
import type { GoogleProfile } from './members';

const profile = (email: string, name: string): GoogleProfile => ({ sub: `sub:${email}`, email, name, picture: null });
const ANA = 'h-ana';
const BIA = 'h-bia';
const CRIS = 'h-cris';

let clock: ReturnType<typeof fixedClock>;
let service: GroupService;

/** Ana (admin), Bia and Cris, all in UTC; it is Monday 9 Nov 2026, noon, in the Primavera 2026. */
beforeEach(() => {
  clock = fixedClock('2026-11-09T12:00:00Z');
  service = new GroupService(memorySql(), clock, sequentialIds());
  service.migrate();
  service.signIn(profile('ana@example.com', 'Ana'), ANA, ['ana@example.com']);
  for (const [email, name, hash] of [
    ['bia@example.com', 'Bia', BIA],
    ['cris@example.com', 'Cris', CRIS],
  ]) {
    service.command(ANA, 'invite.create', { email });
    service.signIn(profile(email, name), hash, []);
  }
  for (const hash of [ANA, BIA, CRIS]) service.command(hash, 'member.setTimezone', { timezone: 'UTC' });
});

function ok<T>(result: { ok: boolean; value?: unknown }): T {
  expect(result).toMatchObject({ ok: true });
  return result.value as T;
}

function log(hash: string, startedAt: string, minutes: number, sport = 'Run'): string {
  return ok<{ id: string }>(service.command(hash, 'activity.create', { startedAt, timezone: 'UTC', durationSeconds: minutes * 60, sport })).id;
}

const stage = (hash: string, input: Queries['seasonStage']['input'] = {}) => ok<Queries['seasonStage']['output']>(service.query(hash, 'seasonStage', input));
const ranking = (hash: string, key: string, input: Queries['seasonStage']['input'] = {}) =>
  stage(hash, input).view.rankings.find((r) => r.key === key) as SeasonRankingView;
const memberId = (hash: string) => ok<{ id: string }>(service.query(hash, 'me', {})).id;

describe('seasonStage', () => {
  beforeEach(() => {
    log(ANA, '2026-10-05T10:00:00Z', 120);
    log(ANA, '2026-10-06T10:00:00Z', 60);
    log(BIA, '2026-10-05T10:00:00Z', 30);
    log(CRIS, '2026-10-05T10:00:00Z', 20);
  });

  it("opens on today's stage, running, with the first of each ranking", () => {
    const { yearEnd, view } = stage(BIA);
    expect(yearEnd).toBe(false);
    expect(view).toMatchObject({ stage: { key: '2026-spring', start: '2026-10-01', end: '2026-12-17', closesOn: '2027-01-01' }, status: 'running', today: '2026-11-09' });
    expect(view.rankings.map((r) => r.key)).toEqual(['activities', 'hours', 'momentum', 'weekend', 'variety', 'marathon', 'comeback', 'sprint', 'steady']);
    expect(ranking(BIA, 'hours')).toMatchObject({ leaders: [{ name: 'Ana' }], leaderValue: 180 * 60 });
  });

  it('gives me my own place and what I miss, and nobody else’s place', () => {
    expect(ranking(BIA, 'hours').me).toEqual({ position: 2, value: 30 * 60, gap: { kind: 'behind', position: 2, missing: 150 * 60, tied: false } });
    expect(ranking(ANA, 'hours').me).toEqual({ position: 1, value: 180 * 60, gap: { kind: 'leader' } });
    // Cris's third place and Bia's lead over her reach neither Ana nor Bia.
    for (const hash of [ANA, BIA]) {
      const text = JSON.stringify(stage(hash));
      expect(text).not.toContain(String(20 * 60));
      expect(text).not.toContain('Cris');
    }
  });

  it('follows a new activity at once', () => {
    log(CRIS, '2026-11-08T10:00:00Z', 300);
    expect(ranking(BIA, 'hours').leaders).toMatchObject([{ name: 'Cris' }]);
  });

  it('drops who leaves from the running stage', () => {
    ok(service.command(ANA, 'member.remove', { memberId: memberId(CRIS) }));
    log(BIA, '2026-11-08T10:00:00Z', 1000);
    expect(ranking(ANA, 'hours').leaders).toMatchObject([{ name: 'Bia' }]);
  });

  it('shows the count with provisional places, without what I miss, and ignores its days', () => {
    clock.set('2026-12-20T12:00:00Z');
    log(BIA, '2026-12-19T10:00:00Z', 1000);
    const { yearEnd, view } = stage(BIA);
    expect(yearEnd).toBe(true);
    expect(view.status).toBe('counting');
    expect(ranking(BIA, 'hours')).toMatchObject({ leaders: [{ name: 'Ana' }], me: { position: 2, gap: null }, titleHolders: [{ name: 'Ana' }] });
  });

  it('refuses a stage before the race or still to come', () => {
    expect(service.query(ANA, 'seasonStage', { stage: '2026-winter' })).toEqual({ ok: false, error: 'not_found' });
    expect(service.query(ANA, 'seasonStage', { stage: '2027-summer' })).toEqual({ ok: false, error: 'not_found' });
    expect(service.query(ANA, 'seasonStage', { stage: 'nope' })).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('closing a stage', () => {
  beforeEach(() => {
    // Ana leads activities, hours and variety: the variety title goes on to Bia.
    log(ANA, '2026-10-05T10:00:00Z', 120, 'Run');
    log(ANA, '2026-10-06T10:00:00Z', 120, 'Yoga');
    log(ANA, '2026-10-07T10:00:00Z', 120, 'Swim');
    log(BIA, '2026-10-05T10:00:00Z', 30, 'Run');
    log(BIA, '2026-10-06T10:00:00Z', 30, 'Ride');
  });

  it('closes on the first day of the next quarter in the zone furthest behind', () => {
    service.command(CRIS, 'member.setTimezone', { timezone: 'America/Los_Angeles' });
    clock.set('2027-01-01T06:00:00Z');
    service.tick();
    expect(stage(ANA, { stage: '2026-spring' }).view.status).toBe('counting');
    clock.set('2027-01-01T08:05:00Z');
    expect(service.tick()).toContain('seasons');
    expect(stage(ANA, { stage: '2026-spring' }).view.status).toBe('closed');
    // Closing twice changes nothing.
    expect(service.tick()).not.toContain('seasons');
  });

  it('keeps the titles, at most 2 each, and the note of the first who already had 2', () => {
    clock.set('2027-01-01T00:05:00Z');
    service.tick();
    const variety = ranking(ANA, 'variety', { stage: '2026-spring' });
    expect(variety).toMatchObject({ leaders: [{ name: 'Ana' }], titleHolders: [{ name: 'Bia' }], blockedLeaders: [{ name: 'Ana' }], me: { position: 1, gap: null } });
    expect(ranking(ANA, 'activities', { stage: '2026-spring' }).titleHolders).toMatchObject([{ name: 'Ana' }]);
  });

  it('stays as it closed after an activity changes or someone leaves', () => {
    clock.set('2027-01-01T00:05:00Z');
    service.tick();
    ok(service.command(ANA, 'member.remove', { memberId: memberId(BIA) }));
    log(CRIS, '2026-10-05T10:00:00Z', 1000);
    expect(ranking(ANA, 'variety', { stage: '2026-spring' }).titleHolders).toMatchObject([{ name: 'Bia' }]);
    expect(ranking(ANA, 'hours', { stage: '2026-spring' }).leaders).toMatchObject([{ name: 'Ana' }]);
  });

  it('opens on the new stage once the quarter turns', () => {
    clock.set('2027-01-02T12:00:00Z');
    service.tick();
    expect(stage(ANA).view).toMatchObject({ stage: { key: '2027-summer' }, status: 'running' });
  });
});

describe('seasonYear and seasonCircuit', () => {
  beforeEach(() => {
    log(ANA, '2026-10-05T10:00:00Z', 120, 'Run');
    log(ANA, '2026-10-06T10:00:00Z', 120, 'Yoga');
    log(BIA, '2026-10-05T10:00:00Z', 30, 'Ride');
  });

  it('has no titles while the stage runs', () => {
    const year = ok<Queries['seasonYear']['output']>(service.query(BIA, 'seasonYear', {}));
    expect(year).toMatchObject({ year: 2026, years: [2026], stages: [{ stage: { key: '2026-spring' }, status: 'running' }], members: [] });
  });

  it('lists who took titles, in alphabetical order, provisional in the count', () => {
    clock.set('2026-12-20T12:00:00Z');
    const year = ok<Queries['seasonYear']['output']>(service.query(BIA, 'seasonYear', {}));
    expect(year.members.map((m) => m.name)).toEqual(['Ana', 'Bia']);
    expect(year.members[0].titles).toContainEqual({ stage: '2026-spring', season: 'spring', ranking: 'activities', provisional: true });
    clock.set('2027-01-01T00:05:00Z');
    service.tick();
    const closed = ok<Queries['seasonYear']['output']>(service.query(BIA, 'seasonYear', { year: 2026 }));
    expect(closed.members[0].titles.every((t) => !t.provisional)).toBe(true);
    expect(closed.years).toEqual([2026, 2027]);
  });

  it("shows anyone's circuit, mine by default", () => {
    clock.set('2027-01-01T00:05:00Z');
    service.tick();
    const mine = ok<Queries['seasonCircuit']['output']>(service.query(ANA, 'seasonCircuit', { year: 2026 }));
    expect(mine.person.name).toBe('Ana');
    expect(mine.stages[0].titles.map((t) => t.ranking)).toEqual(['activities', 'hours']);
    const bias = ok<Queries['seasonCircuit']['output']>(service.query(ANA, 'seasonCircuit', { year: 2026, memberId: memberId(BIA) }));
    expect(bias.stages[0].titles.length).toBeGreaterThan(0);
    expect(service.query(ANA, 'seasonCircuit', { memberId: 'nobody' })).toEqual({ ok: false, error: 'not_found' });
    expect(service.query(ANA, 'seasonYear', { year: 2025 })).toEqual({ ok: false, error: 'not_found' });
  });
});
