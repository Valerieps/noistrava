// My own tracking on the profile (docs/spec/acompanhamento.md): my rhythm and my badges. Pure
// functions over my activities; each activity counts in its own zone, and weeks go Monday to
// Sunday. Shared by the app and the server.
import { addDays, type CalendarDate } from '../time/zones';

export interface TrackedActivity {
  /** ISO 8601, UTC. */
  readonly startedAt: string;
  readonly timezone: string;
  readonly durationSeconds: number;
  readonly sport: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A return after this many days without activity is a comeback. */
export const COMEBACK_DAYS = 14;
/** How far back the favorite weekday and period of the day look. */
export const HABIT_DAYS = 90;
/** The complete weeks before the current one that make my normal. */
export const NORMAL_WEEKS = 4;

/** Madrugada, manhã, tarde, noite: 0h, 6h, 12h and 18h. */
export type DayPeriod = 'dawn' | 'morning' | 'afternoon' | 'night';
const PERIODS: readonly DayPeriod[] = ['dawn', 'morning', 'afternoon', 'night'];

export interface LocalTime {
  readonly date: CalendarDate;
  readonly hour: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let found = formatters.get(timeZone);
  if (!found) {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' };
    try {
      found = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
    } catch {
      found = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
    }
    formatters.set(timeZone, found);
  }
  return found;
}

/** The calendar date and hour of an instant in `timeZone`. */
export function localTime(instant: string | Date, timeZone: string): LocalTime {
  const parts = formatter(timeZone).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '0';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}

/** 0 for Monday to 6 for Sunday. */
export function weekday(date: CalendarDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The Monday of the week of `date`. */
export function weekStart(date: CalendarDate): CalendarDate {
  return addDays(date, -weekday(date));
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function dayPeriod(hour: number): DayPeriod {
  return PERIODS[Math.floor(hour / 6)];
}

/** How strong a day of the month calendar is: 0 without activity, then up to 3 by its time. */
export function dayLevel(seconds: number): 0 | 1 | 2 | 3 {
  if (seconds <= 0) return 0;
  if (seconds < 30 * 60) return 1;
  if (seconds < 60 * 60) return 2;
  return 3;
}

interface Located extends TrackedActivity {
  readonly local: LocalTime;
}

/** Oldest first, each with its own date and hour. */
function locate(activities: readonly TrackedActivity[]): Located[] {
  return [...activities]
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .map((a) => ({ ...a, local: localTime(a.startedAt, a.timezone) }));
}

export interface DayTotal {
  readonly date: CalendarDate;
  readonly seconds: number;
}

export interface Rhythm {
  /** Today, in my zone. */
  readonly today: CalendarDate;
  /** Active weeks in a row; the current week counts only once it has an activity. */
  readonly streakWeeks: number;
  readonly week: {
    /** Monday. */
    readonly start: CalendarDate;
    /** Monday to Sunday. */
    readonly activeDays: readonly boolean[];
    readonly seconds: number;
  };
  /** The average of the 4 complete weeks before this one, idle ones as zero; null when all were idle. */
  readonly normalSeconds: number | null;
  /** This week against the normal, in whole percent; null without a normal. */
  readonly comparePercent: number | null;
  /** Over the last 90 days: 0 (Monday) to 6, and the period of the day; null without activities. */
  readonly favoriteWeekday: number | null;
  readonly favoritePeriod: DayPeriod | null;
  /** The current month, in my zone. */
  readonly month: { readonly activeDays: number; readonly sports: readonly { readonly sport: string; readonly seconds: number }[] };
  /** The days without activity before my comeback this week; null when there was none. */
  readonly comebackDays: number | null;
  /** Every active day and its time, oldest first. */
  readonly days: readonly DayTotal[];
}

/** Picks the most frequent index; a tie goes to the lowest. */
function favorite(counts: readonly number[]): number | null {
  let best: number | null = null;
  counts.forEach((count, i) => {
    if (count > 0 && (best === null || count > counts[best])) best = i;
  });
  return best;
}

export function rhythm(activities: readonly TrackedActivity[], now: Date, timeZone: string): Rhythm {
  const located = locate(activities);
  const today = localTime(now, timeZone).date;
  const thisWeek = weekStart(today);

  const byDay = new Map<CalendarDate, number>();
  const byWeek = new Map<CalendarDate, number>();
  for (const a of located) {
    byDay.set(a.local.date, (byDay.get(a.local.date) ?? 0) + a.durationSeconds);
    const week = weekStart(a.local.date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + a.durationSeconds);
  }

  let streakWeeks = 0;
  for (let w = byWeek.has(thisWeek) ? thisWeek : addDays(thisWeek, -7); byWeek.has(w); w = addDays(w, -7)) streakWeeks++;

  const weekSeconds = byWeek.get(thisWeek) ?? 0;
  let previous = 0;
  for (let i = 1; i <= NORMAL_WEEKS; i++) previous += byWeek.get(addDays(thisWeek, -7 * i)) ?? 0;
  const normalSeconds = previous > 0 ? previous / NORMAL_WEEKS : null;

  const since = now.getTime() - HABIT_DAYS * DAY_MS;
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  const periods = [0, 0, 0, 0];
  for (const a of located) {
    const at = Date.parse(a.startedAt);
    if (at < since || at > now.getTime()) continue;
    weekdays[weekday(a.local.date)]++;
    periods[Math.floor(a.local.hour / 6)]++;
  }
  const favoritePeriod = favorite(periods);

  const month = today.slice(0, 7);
  const monthDays = new Set<CalendarDate>();
  const sports = new Map<string, number>();
  for (const a of located) {
    if (!a.local.date.startsWith(month)) continue;
    monthDays.add(a.local.date);
    sports.set(a.sport, (sports.get(a.sport) ?? 0) + a.durationSeconds);
  }

  let comebackDays: number | null = null;
  for (let i = 1; i < located.length; i++) {
    const gap = daysBetween(located[i - 1].local.date, located[i].local.date);
    if (located[i].local.date >= thisWeek && gap >= COMEBACK_DAYS) comebackDays = gap;
  }

  return {
    today,
    streakWeeks,
    week: {
      start: thisWeek,
      activeDays: Array.from({ length: 7 }, (_, i) => byDay.has(addDays(thisWeek, i))),
      seconds: weekSeconds,
    },
    normalSeconds,
    comparePercent: normalSeconds === null ? null : Math.round(((weekSeconds - normalSeconds) / normalSeconds) * 100),
    favoriteWeekday: favorite(weekdays),
    favoritePeriod: favoritePeriod === null ? null : PERIODS[favoritePeriod],
    month: {
      activeDays: monthDays.size,
      sports: [...sports.entries()].map(([sport, seconds]) => ({ sport, seconds })).sort((a, b) => b.seconds - a.seconds || a.sport.localeCompare(b.sport)),
    },
    comebackDays,
    days: [...byDay.entries()].map(([date, seconds]) => ({ date, seconds })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// Badges

/** In the order of the spec's table, which also breaks ties for the next badge. */
export const BADGES = ['early_bird', 'night_owl', 'consistent', 'comeback', 'eclectic', 'hours_10', 'hours_50', 'hours_100', 'golden_link', 'loyal_fan'] as const;
export type BadgeKey = (typeof BADGES)[number];

export function isBadgeKey(value: string): value is BadgeKey {
  return (BADGES as readonly string[]).includes(value);
}

/** What each counted badge needs. */
export const BADGE_GOALS = {
  early_bird: 5,
  night_owl: 5,
  consistent: 4,
  eclectic: 5,
  hours_10: 10,
  hours_50: 50,
  hours_100: 100,
  loyal_fan: 50,
} as const;

/** Consistente: active days a week needs. */
export const CONSISTENT_DAYS = 3;

export interface BadgeStatus {
  readonly key: BadgeKey;
  /** When the activity, heart or chain that gave it happened; null while missing. */
  readonly earnedAt: string | null;
  /** How far a counted badge is, capped at its goal; null for the badges not measured by a count. */
  readonly progress: { readonly done: number; readonly goal: number } | null;
}

export interface BadgeInput {
  readonly activities: readonly TrackedActivity[];
  /** When each heart I gave was given. */
  readonly heartsGiven: readonly string[];
  /** When each chain I was a Senhora of ended without a lost break. */
  readonly flawlessChains: readonly string[];
  readonly now: Date;
  /** My zone, for the current week and month. */
  readonly timeZone: string;
}

/** The `n`-th instant (1-based) once sorted, or null when there are fewer. */
function nth(instants: readonly string[], n: number): string | null {
  const sorted = [...instants].sort((a, b) => Date.parse(a) - Date.parse(b));
  return sorted[n - 1] ?? null;
}

/** Weeks in a row, ending at `end`, with at least 3 active days each. */
function consistentRun(daysByWeek: Map<CalendarDate, Set<CalendarDate>>, end: CalendarDate): number {
  let run = 0;
  for (let w = end; (daysByWeek.get(w)?.size ?? 0) >= CONSISTENT_DAYS; w = addDays(w, -7)) run++;
  return run;
}

/** Every badge, earned or not, computed over everything the app has. */
export function badgeStatuses(input: BadgeInput): BadgeStatus[] {
  const located = locate(input.activities);
  const today = localTime(input.now, input.timeZone).date;
  const counted = (key: keyof typeof BADGE_GOALS, done: number, earnedAt: string | null): BadgeStatus => ({
    key,
    earnedAt,
    progress: { done: Math.min(done, BADGE_GOALS[key]), goal: BADGE_GOALS[key] },
  });

  const early = located.filter((a) => a.local.hour >= 4 && a.local.hour < 6).map((a) => a.startedAt);
  const owl = located.filter((a) => a.local.hour >= 21 || a.local.hour < 4).map((a) => a.startedAt);

  const daysByWeek = new Map<CalendarDate, Set<CalendarDate>>();
  const sportsByMonth = new Map<string, Set<string>>();
  let consistentAt: string | null = null;
  let eclecticAt: string | null = null;
  let comebackAt: string | null = null;
  let total = 0;
  const hoursAt: Record<'hours_10' | 'hours_50' | 'hours_100', string | null> = { hours_10: null, hours_50: null, hours_100: null };
  located.forEach((a, i) => {
    const week = weekStart(a.local.date);
    const days = daysByWeek.get(week) ?? new Set<CalendarDate>();
    days.add(a.local.date);
    daysByWeek.set(week, days);
    if (!consistentAt && consistentRun(daysByWeek, week) >= BADGE_GOALS.consistent) consistentAt = a.startedAt;

    const month = a.local.date.slice(0, 7);
    const sports = sportsByMonth.get(month) ?? new Set<string>();
    sports.add(a.sport);
    sportsByMonth.set(month, sports);
    if (!eclecticAt && sports.size >= BADGE_GOALS.eclectic) eclecticAt = a.startedAt;

    if (!comebackAt && i > 0 && daysBetween(located[i - 1].local.date, a.local.date) >= COMEBACK_DAYS) comebackAt = a.startedAt;

    total += a.durationSeconds;
    for (const key of ['hours_10', 'hours_50', 'hours_100'] as const) {
      if (!hoursAt[key] && total >= BADGE_GOALS[key] * 3600) hoursAt[key] = a.startedAt;
    }
  });

  const thisWeek = weekStart(today);
  const run = Math.max(consistentRun(daysByWeek, thisWeek), consistentRun(daysByWeek, addDays(thisWeek, -7)));
  const hours = Math.floor(total / 3600);

  return [
    counted('early_bird', early.length, nth(early, BADGE_GOALS.early_bird)),
    counted('night_owl', owl.length, nth(owl, BADGE_GOALS.night_owl)),
    counted('consistent', run, consistentAt),
    { key: 'comeback', earnedAt: comebackAt, progress: null },
    counted('eclectic', sportsByMonth.get(today.slice(0, 7))?.size ?? 0, eclecticAt),
    counted('hours_10', hours, hoursAt.hours_10),
    counted('hours_50', hours, hoursAt.hours_50),
    counted('hours_100', hours, hoursAt.hours_100),
    { key: 'golden_link', earnedAt: nth(input.flawlessChains, 1), progress: null },
    counted('loyal_fan', input.heartsGiven.length, nth(input.heartsGiven, BADGE_GOALS.loyal_fan)),
  ];
}

/** The missing counted badge closest to done; a tie goes to the table's order. */
export function nextBadge(statuses: readonly BadgeStatus[]): BadgeKey | null {
  let best: BadgeStatus | null = null;
  for (const status of statuses) {
    if (status.earnedAt !== null || !status.progress) continue;
    const fraction = status.progress.done / status.progress.goal;
    if (!best || fraction > best.progress!.done / best.progress!.goal) best = status;
  }
  return best?.key ?? null;
}
