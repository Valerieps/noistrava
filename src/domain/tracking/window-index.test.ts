import { describe, expect, it } from 'vitest';
import { addDays } from '../time/zones';
import { closingWindow, indexSeries, indexZone, monthIndex, windowStates } from './window-index';

/** The active days of a timeline, `x` for an active day and `.` for a pause, ending on `today`. */
function days(timeline: string, today: string): string[] {
  const start = addDays(today, -(timeline.length - 1));
  return [...timeline].flatMap((c, i) => (c === 'x' ? [addDays(start, i)] : []));
}

const TODAY = '2026-11-02';
const last = (timeline: string) => indexSeries(days(timeline, TODAY), TODAY).at(-1)!;

describe('indexSeries', () => {
  it('keeps pauses of up to 2 days whole', () => {
    expect(last('x..xx.x..x')).toMatchObject({ percent: 100, longestPause: 0 });
  });

  it('loses every day of a pause longer than 2 days', () => {
    expect(last('x.x....x.x')).toMatchObject({ percent: 60, longestPause: 4 });
    expect(last('xx.....xx.')).toMatchObject({ percent: 50, longestPause: 5 });
  });

  it('judges a pause still open by its length so far', () => {
    expect(last('xxxxxxx..').percent).toBe(100);
    expect(last('xxxxxxx...')).toMatchObject({ percent: 70, longestPause: 3 });
  });

  it('starts on my first active day and gives one point a day, up to 30', () => {
    expect(indexSeries([], TODAY)).toEqual([]);
    const series = indexSeries(days('x.x', TODAY), TODAY);
    expect(series.map((p) => p.date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(indexSeries(days('x'.repeat(40), TODAY), TODAY)).toHaveLength(30);
  });

  it('looks only at the last 30 days, judging a pause that began before them whole', () => {
    // 30 active days, then a pause of 4 whose last 2 days are inside the window.
    const timeline = 'x'.repeat(30) + '....' + 'x'.repeat(28);
    expect(last(timeline)).toMatchObject({ percent: 93, longestPause: 4 });
    expect(last('....' + 'x'.repeat(30)).percent).toBe(100);
  });

  it('shows each day as known that day', () => {
    const series = indexSeries(days('xxxx...', TODAY), TODAY);
    expect(series.map((p) => p.percent)).toEqual([100, 100, 100, 100, 100, 100, 57]);
  });
});

describe('windowStates', () => {
  /** The states of a timeline ending on `today`: `x` active, `k` kept, `l` lost, `-` before the first active day. */
  const states = (timeline: string, today = TODAY) => {
    const map = windowStates(days(timeline, today), today);
    const start = addDays(today, -(timeline.length - 1));
    const marks = { active: 'x', kept: 'k', lost: 'l' } as const;
    return [...timeline]
      .map((_, i) => {
        const state = map.get(addDays(start, i));
        return state ? marks[state] : '-';
      })
      .join('');
  };

  it('keeps a pause of up to 2 days and loses every day of a longer one', () => {
    expect(states('x..x...x....x')).toBe('xkkxlllxllllx');
  });

  it('judges a pause still open today by its length so far', () => {
    expect(states('xx..')).toBe('xxkk');
    expect(states('xx...')).toBe('xxlll');
  });

  it('leaves out the days before my first active day', () => {
    expect(states('...x.x')).toBe('---xkx');
    expect(windowStates([], TODAY).size).toBe(0);
  });

  it('carries a pause across the month boundary', () => {
    // 30 Oct active, then 31 Oct, 1 Nov and 2 Nov idle: a pause of 3 that spans both months.
    const map = windowStates(['2026-10-30'], '2026-11-02');
    expect(['2026-10-31', '2026-11-01', '2026-11-02'].map((d) => map.get(d))).toEqual(['lost', 'lost', 'lost']);
    const kept = windowStates(['2026-10-30', '2026-11-02'], '2026-11-02');
    expect(['2026-10-31', '2026-11-01'].map((d) => kept.get(d))).toEqual(['kept', 'kept']);
  });
});

describe('indexZone', () => {
  it('splits at 85 and 60', () => {
    expect([100, 85, 84, 60, 59, 0].map(indexZone)).toEqual(['green', 'green', 'yellow', 'yellow', 'red', 'red']);
  });
});

describe('monthIndex', () => {
  it("counts only the month's days from my first active day up to today", () => {
    // 2026-10-28 to 2026-11-02: x x . . . x
    const states = windowStates(days('xx...x', TODAY), TODAY);
    expect(monthIndex(states, '2026-10')).toBe(50);
    expect(monthIndex(states, '2026-11')).toBe(50);
  });

  it('is null for a month before my first active day', () => {
    expect(monthIndex(windowStates(days('x', TODAY), TODAY), '2026-10')).toBeNull();
  });
});

describe('closingWindow', () => {
  // Every day of October up to the 29th.
  const october = Array.from({ length: 29 }, (_, i) => addDays('2026-10-01', i));

  it('on the third day without activity, gives the index if I move today and if I do not', () => {
    expect(closingWindow(october, '2026-11-01')).toEqual({ before: 100, ifActive: 100, ifNot: 90 });
  });

  it('is null before the third day, once I moved today, after it, or with no activity at all', () => {
    expect(closingWindow(october, '2026-10-31')).toBeNull();
    expect(closingWindow([...october, '2026-11-01'], '2026-11-01')).toBeNull();
    expect(closingWindow(october, '2026-11-02')).toBeNull();
    expect(closingWindow([], '2026-11-01')).toBeNull();
  });

  it('ignores activities after today', () => {
    expect(closingWindow([...october, '2026-11-03'], '2026-11-01')).toMatchObject({ ifNot: 90 });
  });
});
