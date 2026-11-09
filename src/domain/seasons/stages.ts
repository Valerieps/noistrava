// The stages of the Corrida das Estações (docs/spec/corrida-das-estacoes.md, "Etapas"): one per
// quarter, named after the season in Brazil. A stage runs from the quarter's first day to two weeks
// before its last; those two weeks are the count (apuração), and the result closes on the first day
// of the next quarter. Pure calendar arithmetic, shared by the app and the server.
import { addDays, type CalendarDate } from '../time/zones';

export const SEASONS = ['summer', 'autumn', 'winter', 'spring'] as const;
export type Season = (typeof SEASONS)[number];

/** Days before the quarter's last day that the stage ends: the two weeks of the count. */
export const COUNT_DAYS = 14;

export interface Stage {
  readonly year: number;
  readonly season: Season;
}

/** The first stage the app ran; the stages before it have no podium (the owner's choice). */
export const FIRST_STAGE: Stage = { year: 2026, season: 'spring' };

/** `2026-spring`: how the API names a stage. */
export function stageKey(stage: Stage): string {
  return `${stage.year}-${stage.season}`;
}

export function parseStageKey(key: unknown): Stage | null {
  if (typeof key !== 'string') return null;
  const match = /^(\d{4})-(summer|autumn|winter|spring)$/.exec(key);
  return match ? { year: Number(match[1]), season: match[2] as Season } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The stage's dates: it counts from `start` to `end`; the result closes on `closesOn`. */
export interface StageDates {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  /** The first day of the next quarter. */
  readonly closesOn: CalendarDate;
}

export function stageDates(stage: Stage): StageDates {
  const quarter = SEASONS.indexOf(stage.season);
  const start = `${stage.year}-${pad(quarter * 3 + 1)}-01`;
  const closesOn = quarter === 3 ? `${stage.year + 1}-01-01` : `${stage.year}-${pad(quarter * 3 + 4)}-01`;
  return { start, end: addDays(closesOn, -(COUNT_DAYS + 1)), closesOn };
}

/** The stage of the quarter that `date` is in, whether its days still count or are the count. */
export function quarterStage(date: CalendarDate): Stage {
  const month = Number(date.slice(5, 7));
  return { year: Number(date.slice(0, 4)), season: SEASONS[Math.floor((month - 1) / 3)] };
}

/** The stage an activity of that local date counts for; null in the two weeks of the count. */
export function stageOf(date: CalendarDate): Stage | null {
  const stage = quarterStage(date);
  return date <= stageDates(stage).end ? stage : null;
}

export function previousStage(stage: Stage): Stage {
  const i = SEASONS.indexOf(stage.season);
  return i === 0 ? { year: stage.year - 1, season: 'spring' } : { year: stage.year, season: SEASONS[i - 1] };
}

export function nextStage(stage: Stage): Stage {
  const i = SEASONS.indexOf(stage.season);
  return i === 3 ? { year: stage.year + 1, season: 'summer' } : { year: stage.year, season: SEASONS[i + 1] };
}

/** Negative, zero or positive, as `a` comes before, with or after `b`. */
export function compareStages(a: Stage, b: Stage): number {
  return a.year - b.year || SEASONS.indexOf(a.season) - SEASONS.indexOf(b.season);
}

/** Whether the race had the stage: from the first one on. */
export function inRace(stage: Stage): boolean {
  return compareStages(stage, FIRST_STAGE) >= 0;
}

/** `running`: its days still count; `counting`: the two weeks of the count; `closed`. */
export type StageStatus = 'running' | 'counting' | 'closed';

/**
 * Where the stage stands on `today`, by that calendar date. The result closes for the whole group
 * at another moment (the zone furthest behind); the server passes `closed` once it has.
 */
export function stageStatusOn(stage: Stage, today: CalendarDate): StageStatus | 'upcoming' {
  const { start, end, closesOn } = stageDates(stage);
  if (today < start) return 'upcoming';
  if (today <= end) return 'running';
  return today < closesOn ? 'counting' : 'closed';
}

/** From 18 to 31 December, once the spring stage ends, the tab opens on the year's summary. */
export function isYearEnd(today: CalendarDate): boolean {
  return today.slice(5) > stageDates({ year: 2000, season: 'spring' }).end.slice(5);
}

/** The last 7 days of the stage: the Sprint final. */
export function sprintStart(stage: Stage): CalendarDate {
  return addDays(stageDates(stage).end, -6);
}

/** The stages of a year that the race had, in order. */
export function stagesOf(year: number): Stage[] {
  return SEASONS.map((season) => ({ year, season })).filter(inRace);
}
