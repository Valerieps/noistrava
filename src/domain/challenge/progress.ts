// What the challenge screen shows about the group's progress: the pace against the programmed
// total, the ranking, the highlights and the accumulated curve. Pure functions over the challenge's
// period, goal and activity log; the app computes them, the server stores none of them.
import { KM_PER_HOUR } from './challenge';

const HOUR = 3600;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "78h40": whole hours and minutes, minutes rounded down. */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

/** "100h" for whole hours, else like formatDuration. */
export function formatGoal(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}h` : formatDuration(minutes * 60);
}

export function secondsToKm(seconds: number): number {
  return (seconds / HOUR) * KM_PER_HOUR;
}

export interface Period {
  readonly startsAt: string;
  readonly endsAt: string;
}

/** The part of the period that has passed, from 0 to 1. */
export function elapsedFraction(period: Period, now: Date): number {
  const start = Date.parse(period.startsAt);
  const end = Date.parse(period.endsAt);
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

/** Where the group would be now dividing the goal equally over the period. */
export function programmedSeconds(period: Period, goalMinutes: number, now: Date): number {
  return goalMinutes * 60 * elapsedFraction(period, now);
}

/** Whole days left in the period, counting today; 0 once it ended. */
export function daysLeft(period: Period, now: Date): number {
  const left = Date.parse(period.endsAt) - now.getTime();
  return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}

export function daysElapsed(period: Period, now: Date): number {
  const passed = Math.min(now.getTime(), Date.parse(period.endsAt)) - Date.parse(period.startsAt);
  return passed <= 0 ? 0 : Math.ceil(passed / DAY_MS);
}

export type PaceTone = 'ahead' | 'onPace' | 'behind' | 'finalStretch';

export interface Pace {
  readonly tone: PaceTone;
  /** Effective minus programmed; negative when behind. */
  readonly differenceSeconds: number;
  readonly programmedSeconds: number;
  readonly remainingSeconds: number;
  readonly daysLeft: number;
  /** What the group needs each remaining day to reach the goal. */
  readonly neededPerDaySeconds: number;
  /** The group's average per day so far. */
  readonly averagePerDaySeconds: number;
  /** When the goal falls at the current average; null when there is no average yet. */
  readonly projectedGoalAt: Date | null;
}

/** Within this share of the goal, the group is "no ritmo". */
const ON_PACE_SHARE = 0.01;
/** The last days of the period, when the message turns to what is left. */
const FINAL_STRETCH_DAYS = 5;

export function pace(period: Period, goalMinutes: number, totalSeconds: number, now: Date): Pace {
  const goalSeconds = goalMinutes * 60;
  const programmed = programmedSeconds(period, goalMinutes, now);
  const difference = totalSeconds - programmed;
  const remaining = Math.max(0, goalSeconds - totalSeconds);
  const left = daysLeft(period, now);
  const elapsedMs = Math.min(now.getTime(), Date.parse(period.endsAt)) - Date.parse(period.startsAt);
  const elapsedDays = Math.max(elapsedMs / DAY_MS, 0);
  const average = elapsedDays >= 1 ? totalSeconds / elapsedDays : totalSeconds;
  const rate = elapsedMs > 0 ? totalSeconds / elapsedMs : 0;
  const projectedGoalAt = rate > 0 ? new Date(Date.parse(period.startsAt) + goalSeconds / rate) : null;

  let tone: PaceTone;
  if (difference > goalSeconds * ON_PACE_SHARE) tone = 'ahead';
  else if (left > 0 && left <= FINAL_STRETCH_DAYS && remaining > 0) tone = 'finalStretch';
  else if (difference < -goalSeconds * ON_PACE_SHARE) tone = 'behind';
  else tone = 'onPace';

  return {
    tone,
    differenceSeconds: difference,
    programmedSeconds: programmed,
    remainingSeconds: remaining,
    daysLeft: left,
    neededPerDaySeconds: left > 0 ? remaining / left : remaining,
    averagePerDaySeconds: average,
    projectedGoalAt,
  };
}

/** The fields of a log entry these rules read. */
export interface LoggedActivity {
  readonly memberId: string;
  readonly startedAt: string;
  readonly timezone: string;
  readonly durationSeconds: number;
  readonly sport: string;
}

/** The calendar date an activity started on, in its own zone. */
export function localDate(startedAt: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(startedAt));
  } catch {
    return startedAt.slice(0, 10);
  }
}

export type RankingKind = 'hours' | 'activities' | 'constancy';

export interface RankingRow {
  readonly memberId: string;
  readonly name: string;
  readonly value: number;
  /** Positions gained (positive) or lost (negative) since 24 hours ago, by hours. */
  readonly move: number;
}

interface RankedMember {
  readonly memberId: string;
  readonly name: string;
}

function rankingValues(members: readonly RankedMember[], log: readonly LoggedActivity[], kind: RankingKind): Map<string, number> {
  const values = new Map(members.map((m) => [m.memberId, 0]));
  if (kind === 'constancy') {
    const days = new Map(members.map((m) => [m.memberId, new Set<string>()]));
    for (const a of log) days.get(a.memberId)?.add(localDate(a.startedAt, a.timezone));
    for (const [id, set] of days) values.set(id, set.size);
    return values;
  }
  for (const a of log) {
    if (!values.has(a.memberId)) continue;
    values.set(a.memberId, (values.get(a.memberId) ?? 0) + (kind === 'hours' ? a.durationSeconds : 1));
  }
  return values;
}

function order(members: readonly RankedMember[], values: Map<string, number>): RankedMember[] {
  return [...members].sort((a, b) => (values.get(b.memberId) ?? 0) - (values.get(a.memberId) ?? 0) || a.name.localeCompare(b.name));
}

/** The Senhoras in order for one tab; the move compares hours with 24 hours ago. */
export function ranking(members: readonly RankedMember[], log: readonly LoggedActivity[], kind: RankingKind, now: Date): RankingRow[] {
  const values = rankingValues(members, log, kind);
  const yesterday = new Date(now.getTime() - DAY_MS).toISOString();
  const before = order(members, rankingValues(members, log.filter((a) => a.startedAt < yesterday), 'hours'));
  const hoursNow = order(members, rankingValues(members, log, 'hours'));
  const position = (list: RankedMember[], id: string) => list.findIndex((m) => m.memberId === id);
  return order(members, values).map((m) => ({
    memberId: m.memberId,
    name: m.name,
    value: values.get(m.memberId) ?? 0,
    move: log.length === 0 ? 0 : position(before, m.memberId) - position(hoursNow, m.memberId),
  }));
}

/** Who passed whom in the last 24 hours, by hours: the first such pair, if any. */
export function latestOvertake(rows: readonly RankingRow[]): { passer: string; passed: string } | null {
  const climber = rows.find((r) => r.move > 0);
  if (!climber) return null;
  const index = rows.indexOf(climber);
  const passed = rows.slice(index + 1).find((r) => r.move < 0);
  return passed ? { passer: climber.name, passed: passed.name } : null;
}

export interface Highlights<T extends LoggedActivity> {
  readonly longest: T | null;
  readonly strongestDay: { readonly date: string; readonly seconds: number } | null;
  /** Consecutive days, up to the latest active one, on which someone moved. */
  readonly streakDays: number;
}

export function highlights<T extends LoggedActivity>(log: readonly T[]): Highlights<T> {
  let longest: T | null = null;
  const perDay = new Map<string, number>();
  for (const a of log) {
    if (!longest || a.durationSeconds > longest.durationSeconds) longest = a;
    const date = localDate(a.startedAt, a.timezone);
    perDay.set(date, (perDay.get(date) ?? 0) + a.durationSeconds);
  }
  let strongestDay: Highlights<T>['strongestDay'] = null;
  for (const [date, seconds] of perDay) if (!strongestDay || seconds > strongestDay.seconds) strongestDay = { date, seconds };

  const dates = [...perDay.keys()].sort();
  let streak = dates.length > 0 ? 1 : 0;
  for (let i = dates.length - 1; i > 0; i--) {
    const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / DAY_MS;
    if (gap !== 1) break;
    streak++;
  }
  return { longest, strongestDay, streakDays: streak };
}

/** Each sport's share of the time, largest first; past `top`, the rest are summed as `null`. */
export function sportShares(log: readonly LoggedActivity[], top = 4): { sport: string | null; share: number }[] {
  const total = log.reduce((sum, a) => sum + a.durationSeconds, 0);
  if (total === 0) return [];
  const bySport = new Map<string, number>();
  for (const a of log) bySport.set(a.sport, (bySport.get(a.sport) ?? 0) + a.durationSeconds);
  const sorted = [...bySport.entries()].sort((a, b) => b[1] - a[1]);
  const shares: { sport: string | null; share: number }[] = sorted.slice(0, top).map(([sport, s]) => ({ sport, share: s / total }));
  const rest = sorted.slice(top).reduce((sum, [, s]) => sum + s, 0);
  if (rest > 0) shares.push({ sport: null, share: rest / total });
  return shares;
}

/** A zone's offset from UTC at `at`, in minutes. */
export function utcOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((local - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** "GMT-3", "GMT+5:30", "GMT". */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return 'GMT';
  const sign = minutes > 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const rest = abs % 60;
  return `GMT${sign}${Math.floor(abs / 60)}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/** The accumulated total over the period, as fractions (0..1) of the period and of `scaleSeconds`. */
export function curvePoints(period: Period, log: readonly LoggedActivity[], scaleSeconds: number, now: Date): [number, number][] {
  const start = Date.parse(period.startsAt);
  const span = Date.parse(period.endsAt) - start;
  if (span <= 0 || scaleSeconds <= 0) return [[0, 0]];
  const sorted = [...log].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const points: [number, number][] = [[0, 0]];
  let total = 0;
  for (const a of sorted) {
    total += a.durationSeconds;
    points.push([Math.min(1, Math.max(0, (Date.parse(a.startedAt) - start) / span)), Math.min(1, total / scaleSeconds)]);
  }
  points.push([elapsedFraction(period, now), Math.min(1, total / scaleSeconds)]);
  return points;
}
