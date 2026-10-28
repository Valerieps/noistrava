import { describe, expect, it } from 'vitest';
import { measureRoute, pointAt, stretch } from './journey-map';
import {
  curvePoints,
  daysLeft,
  formatDuration,
  formatGoal,
  highlights,
  latestOvertake,
  localDate,
  pace,
  programmedSeconds,
  ranking,
  sportShares,
  type LoggedActivity,
} from './progress';

const period = { startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z' };
const HOUR = 3600;

function activity(memberId: string, startedAt: string, hours: number, sport = 'Run', timezone = 'UTC'): LoggedActivity {
  return { memberId, startedAt, timezone, durationSeconds: hours * HOUR, sport };
}

describe('formatting', () => {
  it('writes durations as the mockups do', () => {
    expect(formatDuration(78 * HOUR + 40 * 60 + 59)).toBe('78h40');
    expect(formatDuration(50 * 60)).toBe('0h50');
    expect(formatGoal(6000)).toBe('100h');
    expect(formatGoal(90)).toBe('1h30');
  });
});

describe('pace', () => {
  it('programs the goal evenly over the period', () => {
    const half = new Date('2026-10-16T12:00:00.000Z');
    expect(programmedSeconds(period, 6000, half)).toBeCloseTo(50 * HOUR);
    expect(daysLeft(period, half)).toBe(16);
    expect(daysLeft(period, new Date('2026-11-02T00:00:00Z'))).toBe(0);
  });

  it('says whether the group is ahead, on pace, behind or in the final stretch', () => {
    const half = new Date('2026-10-16T12:00:00.000Z');
    expect(pace(period, 6000, 60 * HOUR, half).tone).toBe('ahead');
    expect(pace(period, 6000, 50 * HOUR, half).tone).toBe('onPace');
    expect(pace(period, 6000, 40 * HOUR, half).tone).toBe('behind');
    expect(pace(period, 6000, 70 * HOUR, new Date('2026-10-28T00:00:00Z')).tone).toBe('finalStretch');
  });

  it('projects when the goal falls at the current average', () => {
    const half = new Date('2026-10-16T12:00:00.000Z');
    const p = pace(period, 6000, 100 * HOUR, half);
    expect(p.projectedGoalAt?.toISOString()).toBe(half.toISOString());
    expect(pace(period, 6000, 0, half).projectedGoalAt).toBeNull();
    expect(p.remainingSeconds).toBe(0);
  });
});

describe('ranking and highlights', () => {
  const members = [
    { memberId: 'a', name: 'Ana' },
    { memberId: 'b', name: 'Bia' },
  ];
  const now = new Date('2026-10-10T12:00:00Z');
  const log = [
    activity('a', '2026-10-05T10:00:00Z', 3),
    activity('b', '2026-10-06T10:00:00Z', 1),
    activity('b', '2026-10-10T08:00:00Z', 3, 'Yoga'),
  ];

  it('orders by hours, activities or active days, and shows who climbed in the last day', () => {
    const hours = ranking(members, log, 'hours', now);
    expect(hours.map((r) => [r.name, r.value, r.move])).toEqual([
      ['Bia', 4 * HOUR, 1],
      ['Ana', 3 * HOUR, -1],
    ]);
    expect(latestOvertake(hours)).toEqual({ passer: 'Bia', passed: 'Ana' });
    expect(ranking(members, log, 'activities', now)[0]).toMatchObject({ name: 'Bia', value: 2 });
    expect(ranking(members, log, 'constancy', now)[0]).toMatchObject({ name: 'Bia', value: 2 });
  });

  it('finds the longest activity and the streak', () => {
    const h = highlights([...log, activity('a', '2026-10-09T10:00:00Z', 1)]);
    expect(h.longest?.durationSeconds).toBe(3 * HOUR);
    expect(h.streakDays).toBe(2);
    expect(highlights([]).streakDays).toBe(0);
  });

  it('dates an activity in its own zone', () => {
    expect(localDate('2026-10-10T02:00:00Z', 'America/Sao_Paulo')).toBe('2026-10-09');
  });

  it('shares time by sport, the rest as others', () => {
    const shares = sportShares(log, 1);
    expect(shares).toEqual([
      { sport: 'Run', share: 4 / 7 },
      { sport: null, share: 3 / 7 },
    ]);
  });

  it('accumulates the curve over the period', () => {
    const points = curvePoints(period, log, 100 * HOUR, now);
    expect(points[0]).toEqual([0, 0]);
    expect(points[points.length - 1][1]).toBeCloseTo(0.07);
  });
});

describe('journey map', () => {
  const journey = {
    distanceMeters: 2000,
    route: [
      [0, 0],
      [0, 0.01],
      [0.01, 0.01],
    ] as [number, number][],
  };

  it('measures the route and finds a distance along it', () => {
    const route = measureRoute(journey);
    expect(route.along[route.along.length - 1]).toBeCloseTo(2000);
    expect(route.points).toEqual(journey.route);
    const middle = pointAt(route, 1000);
    expect(middle[0]).toBeCloseTo(route.points[1][0]);
    expect(stretch(route, 500, 1500)).toHaveLength(3);
  });
});
