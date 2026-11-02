import { describe, expect, it } from 'vitest';
import { addDays } from '../time/zones';
import { indexSeries, indexZone } from './window-index';

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

describe('indexZone', () => {
  it('splits at 85 and 60', () => {
    expect([100, 85, 84, 60, 59, 0].map(indexZone)).toEqual(['green', 'green', 'yellow', 'yellow', 'red', 'red']);
  });
});
