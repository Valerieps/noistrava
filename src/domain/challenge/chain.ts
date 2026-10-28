// The chain challenge (docs/spec/desafio-corrente.md): a day has its link when a Senhora was active
// on it; a day without one is a break, saved when 2 Senhoras are active the next day, else lost.
// Pure rules, shared by the app and the server.
import { addDays, type CalendarDate } from '../time/zones';
import { challengePeriod, TOLERANCE_HOURS } from './challenge';

/** One break may be allowed for every 10 whole days of the period. */
export const DAYS_PER_BREAK = 10;
export const CHAIN_MIN_MINUTES_MAX = 240;
/** Active Senhoras needed the next day to save a break. */
export const SAVERS_NEEDED = 2;
/** After the period, a day to save the last day plus that day's 24 hours of tolerance; then the result closes. */
export const CHAIN_CLOSE_HOURS = 48;

const HOUR_MS = 3_600_000;

export interface ChainConfig {
  readonly allowedBreaks: number;
  /** 0: any activity makes a Senhora active that day. */
  readonly minMinutesPerDay: number;
}

/**
 * `linked`: a Senhora was active. `saved`/`lost`: a decided break, saved or not by the next day.
 * `at_risk`: a decided break the next day can still save. `waiting`: started, not decided, no link
 * yet. `future`: not started.
 */
export type ChainDayState = 'linked' | 'saved' | 'lost' | 'at_risk' | 'waiting' | 'future';

export interface ChainDay {
  readonly date: CalendarDate;
  readonly state: ChainDayState;
  /** The Senhoras active that day. */
  readonly active: readonly string[];
  /** On a saved day, the Senhoras active the next day. */
  readonly savedBy: readonly string[];
}

export interface ChainActivity {
  readonly memberId: string;
  readonly startedAt: string;
  readonly timezone: string;
  readonly durationSeconds: number;
}

export interface ChainSummary {
  readonly lost: number;
  readonly saved: number;
  /** Days with a link or saved since the last lost break, up to the last decided or linked day. */
  readonly streak: number;
  /** More breaks lost than allowed: the challenge has failed. */
  readonly broken: boolean;
}

export function periodDays(startDate: CalendarDate, endDate: CalendarDate): number {
  return Math.round((Date.parse(endDate) - Date.parse(startDate)) / (24 * HOUR_MS)) + 1;
}

export function maxBreaks(startDate: CalendarDate, endDate: CalendarDate): number {
  return Math.max(0, Math.floor(periodDays(startDate, endDate) / DAYS_PER_BREAK));
}

/** The calendar date an instant falls on in `timeZone`. */
export function localDate(iso: string, timeZone: string): CalendarDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** Who was active on each date: her activities that day reach the minimum. */
function activeByDate(activities: readonly ChainActivity[], minMinutesPerDay: number): Map<CalendarDate, string[]> {
  const seconds = new Map<string, number>();
  for (const a of activities) {
    const key = `${localDate(a.startedAt, a.timezone)}|${a.memberId}`;
    seconds.set(key, (seconds.get(key) ?? 0) + a.durationSeconds);
  }
  const byDate = new Map<CalendarDate, string[]>();
  for (const [key, total] of seconds) {
    if (total <= 0 || total < minMinutesPerDay * 60) continue;
    const [date, memberId] = key.split('|');
    byDate.set(date, [...(byDate.get(date) ?? []), memberId]);
  }
  return byDate;
}

/**
 * Each day of the period, from the Senhoras' counted activities (the day after the end included,
 * since it can save the last one). A day is decided 24 hours after it ends in the zone furthest
 * behind; before that it can still get its link.
 */
export function chainDays(input: {
  startDate: CalendarDate;
  endDate: CalendarDate;
  config: ChainConfig;
  activities: readonly ChainActivity[];
  timezones: readonly string[];
  now: Date;
}): ChainDay[] {
  const active = activeByDate(input.activities, input.config.minMinutesPerDay);
  const now = input.now.getTime();
  const span = (date: CalendarDate) => challengePeriod(date, date, input.timezones);
  const decided = (date: CalendarDate) => now >= span(date).endsAt.getTime() + TOLERANCE_HOURS * HOUR_MS;

  const days: ChainDay[] = [];
  for (let date = input.startDate; date <= input.endDate; date = addDays(date, 1)) {
    const today = active.get(date) ?? [];
    const next = addDays(date, 1);
    const tomorrow = active.get(next) ?? [];
    let state: ChainDayState;
    if (today.length > 0) state = 'linked';
    else if (now < span(date).startsAt.getTime()) state = 'future';
    else if (!decided(date)) state = 'waiting';
    else if (tomorrow.length >= SAVERS_NEEDED) state = 'saved';
    else if (decided(next)) state = 'lost';
    else state = 'at_risk';
    days.push({ date, state, active: today, savedBy: state === 'saved' ? tomorrow : [] });
  }
  return days;
}

export function chainSummary(days: readonly ChainDay[], allowedBreaks: number): ChainSummary {
  let lost = 0;
  let saved = 0;
  let streak = 0;
  for (const day of days) {
    if (day.state === 'lost') {
      lost++;
      streak = 0;
    } else if (day.state === 'saved') {
      saved++;
      streak++;
    } else if (day.state === 'linked') {
      streak++;
    }
  }
  return { lost, saved, streak, broken: lost > allowedBreaks };
}

/** Validates the chain's own settings for a period. */
export function parseChainConfig(value: unknown, startDate: CalendarDate, endDate: CalendarDate): ChainConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const { allowedBreaks, minMinutesPerDay } = value as Record<string, unknown>;
  if (typeof allowedBreaks !== 'number' || !Number.isInteger(allowedBreaks) || allowedBreaks < 0 || allowedBreaks > maxBreaks(startDate, endDate)) return null;
  if (typeof minMinutesPerDay !== 'number' || !Number.isInteger(minMinutesPerDay) || minMinutesPerDay < 0 || minMinutesPerDay > CHAIN_MIN_MINUTES_MAX) return null;
  return { allowedBreaks, minMinutesPerDay };
}
