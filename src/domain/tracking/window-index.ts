// "Índice de Aproveitamento" (docs/spec/acompanhamento.md): of the last 30 days, the share that kept
// the window of benefits an activity opens. An active day keeps it; so does a pause of at most 2
// days without activity. A longer pause loses all of its days, not only those after the second.
import { addDays, type CalendarDate } from '../time/zones';
import { daysBetween } from './tracking';

/** The days the index looks back on, today included. */
export const INDEX_DAYS = 30;
/** The longest pause, in days without activity, that still keeps the window. */
export const MAX_PAUSE_DAYS = 2;
/** Where the green and the yellow zones start, in percent. */
export const GREEN_FROM = 85;
export const YELLOW_FROM = 60;

export type IndexZone = 'green' | 'yellow' | 'red';

export function indexZone(percent: number): IndexZone {
  if (percent >= GREEN_FROM) return 'green';
  if (percent >= YELLOW_FROM) return 'yellow';
  return 'red';
}

export interface IndexPoint {
  readonly date: CalendarDate;
  /** Whole percent, 0 to 100. */
  readonly percent: number;
  /** The longest pause, whole, that lost days of this point's window; 0 when none did. */
  readonly longestPause: number;
}

/** A day of the window: active, kept by a short pause, or lost in a long one. */
export type WindowState = 'active' | 'kept' | 'lost';

export interface WindowDay {
  readonly date: CalendarDate;
  readonly state: WindowState;
  /** The whole length of the pause the day is in; 0 for an active day. */
  readonly pause: number;
}

/**
 * Each day from the first active day on or after `from` up to `to`, as known on `to`: a pause still
 * open on `to` is judged by its length so far. The days before that first active day are left out.
 */
export function windowDays(active: ReadonlySet<CalendarDate>, from: CalendarDate, to: CalendarDate): WindowDay[] {
  const days: WindowDay[] = [];
  let pause: CalendarDate[] = [];
  const closePause = () => {
    const state = pause.length > MAX_PAUSE_DAYS ? 'lost' : 'kept';
    for (const date of pause) days.push({ date, state, pause: pause.length });
    pause = [];
  };
  let started = false;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (active.has(d)) {
      started = true;
      closePause();
      days.push({ date: d, state: 'active', pause: 0 });
    } else if (started) pause.push(d);
  }
  closePause();
  return days;
}

/** The window state of every day from my first active day up to `today`, as known today. */
export function windowStates(activeDays: readonly CalendarDate[], today: CalendarDate): Map<CalendarDate, WindowState> {
  const active = new Set(activeDays.filter((d) => d <= today));
  if (active.size === 0) return new Map();
  const first = [...active].sort()[0];
  return new Map(windowDays(active, first, today).map((d) => [d.date, d.state]));
}

/**
 * The index on `date`, as known that day: over the 30 days up to it, or since my first active day
 * when that is later. A pause is judged by its whole length, even when it began before the
 * window; one still open on `date` by its length so far.
 */
function indexOn(active: ReadonlySet<CalendarDate>, first: CalendarDate, date: CalendarDate): IndexPoint {
  const back = addDays(date, -(INDEX_DAYS - 1));
  const windowStart = back > first ? back : first;
  let from = windowStart;
  while (!active.has(from)) from = addDays(from, -1);

  let kept = 0;
  let longestPause = 0;
  for (const day of windowDays(active, from, date)) {
    if (day.date < windowStart) continue;
    if (day.state === 'lost') longestPause = Math.max(longestPause, day.pause);
    else kept++;
  }

  const counted = daysBetween(windowStart, date) + 1;
  return { date, percent: Math.round((kept / counted) * 100), longestPause };
}

/** The index on each of the last 30 days up to `today`, oldest first, from my first active day on. */
export function indexSeries(activeDays: readonly CalendarDate[], today: CalendarDate): IndexPoint[] {
  const active = new Set(activeDays.filter((d) => d <= today));
  if (active.size === 0) return [];
  const first = [...active].sort()[0];
  const points: IndexPoint[] = [];
  for (let i = INDEX_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    if (date >= first) points.push(indexOn(active, first, date));
  }
  return points;
}
