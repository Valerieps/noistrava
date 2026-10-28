import { describe, expect, it } from 'vitest';
import { badgeStatuses, dayLevel, localTime, nextBadge, rhythm, weekStart, type BadgeStatus, type TrackedActivity } from './tracking';

const at = (startedAt: string, minutes = 60, sport = 'Run', timezone = 'UTC'): TrackedActivity => ({ startedAt, timezone, durationSeconds: minutes * 60, sport });

/** Wednesday 28 Oct 2026, noon UTC. */
const NOW = new Date('2026-10-28T12:00:00Z');

describe('dates', () => {
  it('reads an activity in its own zone, and weeks start on Monday', () => {
    expect(localTime('2026-10-27T02:00:00Z', 'America/Sao_Paulo')).toEqual({ date: '2026-10-26', hour: 23 });
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
  });

  it('tones the calendar by time', () => {
    expect([0, 600, 1800, 3600].map(dayLevel)).toEqual([0, 1, 2, 3]);
  });
});

describe('rhythm', () => {
  it('keeps the streak while the current week has no activity yet', () => {
    const weeks = ['2026-10-05T10:00:00Z', '2026-10-12T10:00:00Z', '2026-10-19T10:00:00Z'].map((d) => at(d));
    expect(rhythm(weeks, NOW, 'UTC').streakWeeks).toBe(3);
    expect(rhythm([...weeks, at('2026-10-27T10:00:00Z')], NOW, 'UTC').streakWeeks).toBe(4);
    expect(rhythm([at('2026-10-05T10:00:00Z'), at('2026-10-19T10:00:00Z')], NOW, 'UTC').streakWeeks).toBe(1);
  });

  it('marks the days of this week and compares with the normal, idle weeks as zero', () => {
    const r = rhythm([at('2026-10-27T10:00:00Z', 120), at('2026-10-28T08:00:00Z', 30), at('2026-10-19T10:00:00Z', 200)], NOW, 'UTC');
    expect(r.week.start).toBe('2026-10-26');
    expect(r.week.activeDays).toEqual([false, true, true, false, false, false, false]);
    expect(r.week.seconds).toBe(150 * 60);
    expect(r.normalSeconds).toBe(50 * 60);
    expect(r.comparePercent).toBe(200);
  });

  it('has no normal when the 4 weeks before were idle', () => {
    const r = rhythm([at('2026-10-27T10:00:00Z'), at('2026-09-01T10:00:00Z')], NOW, 'UTC');
    expect(r.normalSeconds).toBeNull();
    expect(r.comparePercent).toBeNull();
  });

  it('finds the favorite weekday and period over 90 days, and the month', () => {
    const r = rhythm(
      [at('2026-10-27T07:00:00Z', 30, 'Run'), at('2026-10-20T08:00:00Z', 60, 'Yoga'), at('2026-10-23T19:00:00Z', 45, 'Run'), at('2026-05-01T19:00:00Z')],
      NOW,
      'UTC',
    );
    expect(r.favoriteWeekday).toBe(1);
    expect(r.favoritePeriod).toBe('morning');
    expect(r.month).toEqual({ activeDays: 3, sports: [{ sport: 'Run', seconds: 75 * 60 }, { sport: 'Yoga', seconds: 3600 }] });
  });

  it('tells the comeback until the end of its week', () => {
    const back = [at('2026-10-05T10:00:00Z'), at('2026-10-27T10:00:00Z')];
    expect(rhythm(back, NOW, 'UTC').comebackDays).toBe(22);
    expect(rhythm(back, new Date('2026-11-02T12:00:00Z'), 'UTC').comebackDays).toBeNull();
    expect(rhythm([at('2026-10-20T10:00:00Z'), at('2026-10-27T10:00:00Z')], NOW, 'UTC').comebackDays).toBeNull();
  });

  it('adds up each active day', () => {
    expect(rhythm([at('2026-10-27T10:00:00Z', 20), at('2026-10-27T18:00:00Z', 20), at('2026-10-01T10:00:00Z', 5)], NOW, 'UTC').days).toEqual([
      { date: '2026-10-01', seconds: 300 },
      { date: '2026-10-27', seconds: 2400 },
    ]);
  });
});

describe('badges', () => {
  const statuses = (activities: TrackedActivity[], extra: Partial<{ heartsGiven: string[]; flawlessChains: string[] }> = {}) =>
    badgeStatuses({ activities, heartsGiven: [], flawlessChains: [], now: NOW, timeZone: 'UTC', ...extra });
  const of = (list: BadgeStatus[], key: string) => list.find((s) => s.key === key)!;

  it('counts early and late starts in the activity zone, dated by the 5th', () => {
    const early = [1, 2, 3, 4, 5].map((d) => at(`2026-10-0${d}T04:30:00Z`, 30, 'Run', 'Europe/Lisbon'));
    const list = statuses(early);
    expect(of(list, 'early_bird')).toEqual({ key: 'early_bird', earnedAt: '2026-10-05T04:30:00Z', progress: { done: 5, goal: 5 } });
    expect(of(list, 'night_owl').progress).toEqual({ done: 0, goal: 5 });
    expect(of(statuses([at('2026-10-01T23:00:00Z'), at('2026-10-02T03:00:00Z')]), 'night_owl').progress).toEqual({ done: 2, goal: 5 });
  });

  it('gives Consistente after 4 weeks in a row with 3 active days', () => {
    const weeks = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
    const days = weeks.flatMap((monday) => [0, 1, 2].map((i) => at(`${monday.slice(0, 8)}${String(Number(monday.slice(8)) + i).padStart(2, '0')}T10:00:00Z`)));
    const list = statuses(days);
    expect(of(list, 'consistent').earnedAt).toBe('2026-10-21T10:00:00Z');
    expect(of(statuses(days.slice(3)), 'consistent')).toMatchObject({ earnedAt: null, progress: { done: 3, goal: 4 } });
  });

  it('gives Volta por cima after 14 days without activity', () => {
    expect(of(statuses([at('2026-10-01T10:00:00Z'), at('2026-10-14T10:00:00Z')]), 'comeback').earnedAt).toBeNull();
    expect(of(statuses([at('2026-10-01T10:00:00Z'), at('2026-10-15T10:00:00Z')]), 'comeback').earnedAt).toBe('2026-10-15T10:00:00Z');
  });

  it('gives Eclética for 5 sports in one month, and the hour marks', () => {
    const sports = ['Run', 'Yoga', 'Ride', 'Swim', 'Walk'].map((s, i) => at(`2026-10-0${i + 1}T10:00:00Z`, 150, s));
    const list = statuses(sports);
    expect(of(list, 'eclectic').earnedAt).toBe('2026-10-05T10:00:00Z');
    expect(of(list, 'hours_10')).toMatchObject({ earnedAt: '2026-10-04T10:00:00Z', progress: { done: 10, goal: 10 } });
    expect(of(list, 'hours_50').progress).toEqual({ done: 12, goal: 50 });
  });

  it('gives Elo de ouro and Torcida fiel from the chains and the hearts', () => {
    const hearts = Array.from({ length: 50 }, (_, i) => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString());
    const list = statuses([], { heartsGiven: hearts, flawlessChains: ['2026-10-10T03:00:00.000Z'] });
    expect(of(list, 'golden_link').earnedAt).toBe('2026-10-10T03:00:00.000Z');
    expect(of(list, 'loyal_fan').earnedAt).toBe(hearts[49]);
  });

  it('picks the next badge by the fraction done, ties by the table order', () => {
    const list = statuses([at('2026-10-01T05:00:00Z', 30)], { heartsGiven: Array(42).fill('2026-10-01T00:00:00Z') });
    expect(nextBadge(list)).toBe('loyal_fan');
    expect(nextBadge(statuses([]))).toBe('early_bird');
    expect(nextBadge(list.map((s) => ({ ...s, earnedAt: 'x' })))).toBeNull();
  });
});
