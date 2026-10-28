import { describe, expect, it } from 'vitest';
import { chainDays, chainSummary, localDate, maxBreaks, parseChainConfig, type ChainActivity } from './chain';
import { parseChallengeSetup, parseDraftSetup } from './challenge';

const act = (memberId: string, startedAt: string, minutes = 30, timezone = 'UTC'): ChainActivity => ({ memberId, startedAt, timezone, durationSeconds: minutes * 60 });

/** 1 to 5 Nov 2026, in UTC, any activity counts, one break allowed. */
function days(activities: ChainActivity[], now: string, extra: { minMinutesPerDay?: number; timezones?: string[] } = {}) {
  return chainDays({
    startDate: '2026-11-01',
    endDate: '2026-11-05',
    config: { allowedBreaks: 1, minMinutesPerDay: extra.minMinutesPerDay ?? 0 },
    activities,
    timezones: extra.timezones ?? ['UTC'],
    now: new Date(now),
  });
}

const states = (list: ReturnType<typeof days>) => list.map((d) => d.state);

describe('the chain', () => {
  it('allows one break for every 10 whole days', () => {
    expect(maxBreaks('2026-11-01', '2026-11-09')).toBe(0);
    expect(maxBreaks('2026-11-01', '2026-11-10')).toBe(1);
    expect(maxBreaks('2026-11-01', '2026-11-19')).toBe(1);
    expect(maxBreaks('2026-02-01', '2026-02-28')).toBe(2);
    expect(parseChainConfig({ allowedBreaks: 2, minMinutesPerDay: 0 }, '2026-02-01', '2026-02-28')).toEqual({ allowedBreaks: 2, minMinutesPerDay: 0 });
    expect(parseChainConfig({ allowedBreaks: 3, minMinutesPerDay: 0 }, '2026-02-01', '2026-02-28')).toBeNull();
    expect(parseChainConfig({ allowedBreaks: 0, minMinutesPerDay: 241 }, '2026-02-01', '2026-02-28')).toBeNull();
  });

  it('parses a chain setup with no goal nor journey', () => {
    const input = { type: 'corrente', name: 'Corrente', startDate: '2026-11-01', endDate: '2026-11-30', chain: { allowedBreaks: 3, minMinutesPerDay: 20 } };
    expect(parseChallengeSetup(input)).toEqual({
      type: 'corrente',
      name: 'Corrente',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      goalMinutes: 0,
      journey: null,
      chain: { allowedBreaks: 3, minMinutesPerDay: 20 },
    });
    expect(parseChallengeSetup({ ...input, chain: undefined })).toBeNull();
    expect(parseChallengeSetup({ ...input, type: 'outro' })).toBeNull();
    expect(parseDraftSetup({ ...input, journeyPending: true })?.journeyPending).toBeUndefined();
  });

  it('dates an activity in its own zone', () => {
    expect(localDate('2026-11-02T01:00:00Z', 'America/Sao_Paulo')).toBe('2026-11-01');
    expect(localDate('2026-11-02T01:00:00Z', 'UTC')).toBe('2026-11-02');
  });

  it('links a day with one active Senhora and waits for the day still open', () => {
    const list = days([act('ana', '2026-11-01T08:00:00Z'), act('bia', '2026-11-02T08:00:00Z')], '2026-11-03T12:00:00Z');
    expect(states(list)).toEqual(['linked', 'linked', 'waiting', 'future', 'future']);
  });

  it('keeps a day open for 24 hours after it ends, then breaks it, at risk until the next day is decided', () => {
    const activities = [act('ana', '2026-11-01T08:00:00Z')];
    expect(states(days(activities, '2026-11-03T23:59:00Z'))[1]).toBe('waiting');
    expect(states(days(activities, '2026-11-04T00:00:00Z'))[1]).toBe('at_risk');
    expect(states(days(activities, '2026-11-05T00:00:00Z'))[1]).toBe('lost');
  });

  it('saves a break when two Senhoras are active the next day', () => {
    const list = days([act('ana', '2026-11-01T08:00:00Z'), act('ana', '2026-11-03T08:00:00Z'), act('bia', '2026-11-03T09:00:00Z')], '2026-11-06T00:00:00Z');
    expect(states(list).slice(0, 3)).toEqual(['linked', 'saved', 'linked']);
    expect(list[1].savedBy).toEqual(['ana', 'bia']);
  });

  it('loses the first of two broken days, and the second can still be saved', () => {
    const list = days([act('ana', '2026-11-01T08:00:00Z'), act('ana', '2026-11-04T08:00:00Z'), act('bia', '2026-11-04T08:00:00Z')], '2026-11-07T00:00:00Z');
    expect(states(list).slice(0, 4)).toEqual(['linked', 'lost', 'saved', 'linked']);
    expect(chainSummary(list, 1)).toMatchObject({ lost: 1, saved: 1, broken: false });
    expect(chainSummary(list, 0).broken).toBe(true);
  });

  it('lets the day after the end save the last day', () => {
    const list = days([act('ana', '2026-11-06T08:00:00Z'), act('bia', '2026-11-06T09:00:00Z')], '2026-11-08T00:00:00Z');
    expect(list.at(-1)).toMatchObject({ date: '2026-11-05', state: 'saved' });
    expect(list).toHaveLength(5);
  });

  it('counts a Senhora active only when her day reaches the minimum', () => {
    const activities = [act('ana', '2026-11-01T08:00:00Z', 10), act('ana', '2026-11-01T18:00:00Z', 10), act('bia', '2026-11-02T08:00:00Z', 15)];
    const list = days(activities, '2026-11-04T00:00:00Z', { minMinutesPerDay: 20 });
    expect(states(list).slice(0, 2)).toEqual(['linked', 'at_risk']);
  });

  it('counts the streak since the last lost break', () => {
    const list = days(
      [act('ana', '2026-11-01T08:00:00Z'), act('ana', '2026-11-03T08:00:00Z'), act('ana', '2026-11-04T08:00:00Z')],
      '2026-11-05T00:00:00Z',
    );
    expect(states(list)).toEqual(['linked', 'lost', 'linked', 'linked', 'waiting']);
    expect(chainSummary(list, 1).streak).toBe(2);
  });

  it('decides a day in the zone furthest behind', () => {
    const list = days([act('ana', '2026-11-01T08:00:00Z')], '2026-11-04T00:00:00Z', { timezones: ['UTC', 'America/Phoenix'] });
    expect(list[1].state).toBe('waiting');
  });
});
