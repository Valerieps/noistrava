// The nine rankings of the Corrida das Estações (docs/spec/corrida-das-estacoes.md, "Rankings" and
// "Títulos"), all computed in one pass over the stage's activities. Each activity counts on its own
// zone's date; weeks go Monday to Sunday. Pure: the server feeds it, and only the server sees
// anyone's position but the viewer's own.
import { addDays, type CalendarDate } from '../time/zones';
import { localTime, weekday } from '../tracking/tracking';
import { GREEN_FROM, weekIndex, windowStates } from '../tracking/window-index';
import { previousStage, sprintStart, stageDates, stageOf, stageKey, type Stage } from './stages';

/** In the order of the spec's table, which is also the order the titles are given in. */
export const RANKINGS = ['activities', 'hours', 'momentum', 'weekend', 'variety', 'marathon', 'comeback', 'sprint', 'steady'] as const;
export type RankingKey = (typeof RANKINGS)[number];

export function isRankingKey(value: unknown): value is RankingKey {
  return typeof value === 'string' && (RANKINGS as readonly string[]).includes(value);
}

/** Relógio Suíço: the fewest activities in the stage to enter it. */
export const STEADY_MIN_ACTIVITIES = 5;
/** Relógio Suíço: how far apart two starts on the same weekday may be and still count as the same time. */
export const STEADY_WINDOW_MINUTES = 30;

export interface RaceActivity {
  readonly memberId: string;
  /** ISO 8601, UTC. */
  readonly startedAt: string;
  readonly timezone: string;
  readonly durationSeconds: number;
  readonly sport: string;
}

export interface RaceMember {
  readonly id: string;
  /** Today in her zone: the whole weeks she has finished so far. */
  readonly today: CalendarDate;
}

/**
 * Why a member who moved in the stage is not in a ranking: `zero` (nothing of what it counts yet),
 * `noIncrease` (Volta por cima), `notOpen` (the Sprint final's days have not come), `fewActivities`
 * (Relógio Suíço).
 */
export type OutReason = 'zero' | 'noIncrease' | 'notOpen' | 'fewActivities';

export interface Score {
  readonly memberId: string;
  /** What the ranking orders by: a count, seconds, or (Relógio Suíço) a fraction of the activities. */
  readonly value: number;
  readonly tiebreak: number;
  readonly out: OutReason | null;
}

export interface Entry extends Score {
  /** 1 for the first; tied members share a position, and the next one skips. */
  readonly position: number;
}

export interface Ranking {
  readonly key: RankingKey;
  /** The members in the ranking, first to last. */
  readonly entries: readonly Entry[];
  /** Every member who moved in the stage, in the ranking or not. */
  readonly scores: ReadonlyMap<string, Score>;
}

export type Standings = { readonly [K in RankingKey]: Ranking };

interface Located extends RaceActivity {
  readonly date: CalendarDate;
  /** Minutes since midnight, in the activity's zone. */
  readonly minutes: number;
}

/** The Mondays of the stage's whole weeks that are already over on `asOf`. */
export function wholeWeeks(stage: Stage, asOf: CalendarDate): CalendarDate[] {
  const { start, end } = stageDates(stage);
  const last = asOf < end ? asOf : end;
  const weeks: CalendarDate[] = [];
  for (let monday = addDays(start, (7 - weekday(start)) % 7); addDays(monday, 6) <= last; monday = addDays(monday, 7)) weeks.push(monday);
  return weeks;
}

const sum = (activities: readonly Located[]) => activities.reduce((n, a) => n + a.durationSeconds, 0);

/**
 * Relógio Suíço: the share of the activities that start on the same weekday and around the same time
 * as another one of hers in another week.
 */
function onSchedule(activities: readonly Located[]): number {
  const repeated = activities.filter((a) =>
    activities.some(
      (b) => b.date !== a.date && weekday(b.date) === weekday(a.date) && Math.abs(b.minutes - a.minutes) <= STEADY_WINDOW_MINUTES,
    ),
  );
  return repeated.length / activities.length;
}

/** One member's score in each ranking, from her activities: all of them, for the window index. */
function scoresOf(stage: Stage, member: RaceMember, all: readonly Located[]): { [K in RankingKey]: Score } {
  const key = stageKey(stage);
  const previous = stageKey(previousStage(stage));
  const stageOfKey = (date: CalendarDate) => {
    const s = stageOf(date);
    return s ? stageKey(s) : null;
  };
  const inStage = all.filter((a) => stageOfKey(a.date) === key);
  const id = member.id;
  const score = (value: number, tiebreak: number, out: OutReason | null = value > 0 ? null : 'zero'): Score => ({ memberId: id, value, tiebreak, out });

  const seconds = sum(inStage);
  const weekend = inStage.filter((a) => weekday(a.date) >= 5);
  const durations = inStage.map((a) => a.durationSeconds).sort((a, b) => b - a);
  const previousSeconds = sum(all.filter((a) => stageOfKey(a.date) === previous));
  const increase = seconds - previousSeconds;

  const sprintFrom = sprintStart(stage);
  const sprint = inStage.filter((a) => a.date >= sprintFrom);
  const sprintScore = score(sprint.length, sum(sprint));

  const asOf = addDays(member.today, -1);
  const weeks = wholeWeeks(stage, asOf);
  const states = windowStates(
    all.map((a) => a.date),
    asOf < stageDates(stage).end ? asOf : stageDates(stage).end,
  );
  const indexes = weeks.map((monday) => weekIndex(states, monday)).filter((i): i is number => i !== null);
  const greenWeeks = indexes.filter((i) => i >= GREEN_FROM).length;
  const averageIndex = indexes.length ? indexes.reduce((n, i) => n + i, 0) / indexes.length : 0;

  const steady =
    inStage.length < STEADY_MIN_ACTIVITIES ? score(0, inStage.length, 'fewActivities') : score(onSchedule(inStage), inStage.length);

  return {
    activities: score(inStage.length, seconds),
    hours: score(seconds, inStage.length),
    momentum: score(greenWeeks, averageIndex),
    weekend: score(weekend.length, sum(weekend)),
    variety: score(new Set(inStage.map((a) => a.sport)).size, inStage.length),
    marathon: score(durations[0] ?? 0, durations[1] ?? 0),
    // Fewer hours in the previous stage goes ahead: every tie-break is better larger.
    comeback: score(increase, -previousSeconds, increase > 0 ? null : 'noIncrease'),
    sprint: member.today < sprintFrom && sprint.length === 0 ? { ...sprintScore, out: 'notOpen' } : sprintScore,
    steady,
  };
}

/** Negative when `a` goes ahead of `b`: every value and tie-break is better larger. */
function compareScores(a: Score, b: Score): number {
  return b.value - a.value || b.tiebreak - a.tiebreak;
}

function rank(scores: readonly Score[]): Entry[] {
  const sorted = scores.filter((s) => s.out === null).sort((a, b) => compareScores(a, b) || a.memberId.localeCompare(b.memberId));
  const entries: Entry[] = [];
  sorted.forEach((s, i) => {
    const tied = i > 0 && compareScores(sorted[i - 1], s) === 0;
    entries.push({ ...s, position: tied ? entries[i - 1].position : i + 1 });
  });
  return entries;
}

/**
 * The nine rankings of a stage, at once. `activities` are the members' activities up to the end of
 * the stage, the previous one included (Volta por cima) and older ones too (the window index of the
 * Sem Perder o Embalo). Only the members given, with an activity in the stage, take part.
 */
export function standings(stage: Stage, members: readonly RaceMember[], activities: readonly RaceActivity[]): Standings {
  const byMember = new Map<string, Located[]>();
  for (const a of activities) {
    const list = byMember.get(a.memberId) ?? [];
    const local = localTime(a.startedAt, a.timezone);
    list.push({ ...a, date: local.date, minutes: local.hour * 60 + local.minute });
    byMember.set(a.memberId, list);
  }
  const key = stageKey(stage);
  const scores = members
    .filter((m) => (byMember.get(m.id) ?? []).some((a) => stageOf(a.date) !== null && stageKey(stageOf(a.date)!) === key))
    .map((m) => scoresOf(stage, m, byMember.get(m.id) ?? []));
  const result = {} as { [K in RankingKey]: Ranking };
  for (const k of RANKINGS) {
    const list = scores.map((s) => s[k]);
    result[k] = { key: k, entries: rank(list), scores: new Map(list.map((s) => [s.memberId, s])) };
  }
  return result;
}

/** The members in first place; several when tied. */
export function leadersOf(ranking: Ranking): Entry[] {
  return ranking.entries.filter((e) => e.position === 1);
}

/** The titles: each goes to the first of its ranking, all the tied ones together, with no limit per member. */
export function awardTitles(standings: Standings): { [K in RankingKey]: readonly string[] } {
  const result = {} as { [K in RankingKey]: readonly string[] };
  for (const key of RANKINGS) result[key] = leadersOf(standings[key]).map((e) => e.memberId);
  return result;
}

/**
 * What separates me from the first place, for "quanto falta" (docs/spec/corrida-das-estacoes.md,
 * "Quem vê"). Never how far the first is ahead of the second: as the first, only `leader`.
 * `missing` is in the ranking's own unit; `tied` when I equal the first's value and lose on the
 * tie-break, and then `missing` is in the tie-break's unit.
 */
export type Gap =
  | { readonly kind: 'leader' }
  | { readonly kind: 'behind'; readonly position: number; readonly missing: number; readonly tied: boolean }
  | { readonly kind: 'out'; readonly reason: OutReason; readonly missing: number | null }
  /** No activity in the stage. */
  | { readonly kind: 'absent' };

export function gapFor(ranking: Ranking, memberId: string): Gap {
  const mine = ranking.scores.get(memberId);
  if (!mine) return { kind: 'absent' };
  const leader = ranking.entries[0];
  if (mine.out !== null) return { kind: 'out', reason: mine.out, missing: leader ? Math.max(leader.value - mine.value, 0) : null };
  const entry = ranking.entries.find((e) => e.memberId === memberId)!;
  if (entry.position === 1) return { kind: 'leader' };
  const tied = entry.value === leader.value;
  const missing = tied ? leader.tiebreak - entry.tiebreak : leader.value - entry.value;
  return { kind: 'behind', position: entry.position, missing, tied };
}

/**
 * The values of the others in a ranking, for their anonymous circles on my lane: everyone but me and
 * the first ones (already at the finish), smallest first, so the order says nothing of who is who.
 */
export function othersOf(entries: readonly { readonly memberId: string; readonly position: number; readonly value: number }[], meId: string): number[] {
  return entries
    .filter((e) => e.position !== 1 && e.memberId !== meId)
    .map((e) => e.value)
    .sort((a, b) => a - b);
}

/**
 * How far along the lane to the first place I am, from 0 to 1, for the Estações tab: my value over
 * the first's.
 */
export function laneProgress(leader: number | null, mine: number | null, position: number | null): number {
  if (position === 1) return 1;
  if (leader === null || mine === null || leader <= 0 || mine <= 0) return 0;
  return Math.min(Math.max(mine / leader, 0), 1);
}
