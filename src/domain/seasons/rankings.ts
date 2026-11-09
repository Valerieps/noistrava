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

/** The most titles one member takes in a stage. */
export const MAX_TITLES = 2;
/** Relógio Suíço: the fewest whole weeks a variation can be measured over. */
export const STEADY_MIN_WEEKS = 2;

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
 * `noIncrease` (Volta por cima), `notOpen` (the Sprint final's days have not come), `fewWeeks` and
 * `missedWeek` (Relógio Suíço).
 */
export type OutReason = 'zero' | 'noIncrease' | 'notOpen' | 'fewWeeks' | 'missedWeek';

export interface Score {
  readonly memberId: string;
  /** What the ranking orders by: a count, seconds, or (Relógio Suíço) the variation, a fraction. */
  readonly value: number;
  readonly tiebreak: number;
  readonly out: OutReason | null;
  /** With `missedWeek`, the Monday of the first week without activity. */
  readonly week?: CalendarDate;
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

/** Whether a smaller value is better; every tie-break is better larger. */
const LOWER_IS_BETTER: ReadonlySet<RankingKey> = new Set(['steady']);

interface Located extends RaceActivity {
  readonly date: CalendarDate;
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

/** Population standard deviation over the mean. */
function variation(values: readonly number[]): number {
  const mean = values.reduce((n, v) => n + v, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((n, v) => n + (v - mean) ** 2, 0) / values.length);
  return deviation / mean;
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
  const increase = seconds - sum(all.filter((a) => stageOfKey(a.date) === previous));

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

  const weekSeconds = weeks.map((monday) => sum(inStage.filter((a) => a.date >= monday && a.date <= addDays(monday, 6))));
  const missed = weeks.find((_, i) => weekSeconds[i] === 0);
  let steady: Score;
  if (weeks.length < STEADY_MIN_WEEKS) steady = { memberId: id, value: 0, tiebreak: seconds, out: 'fewWeeks' };
  else if (missed) steady = { memberId: id, value: 0, tiebreak: seconds, out: 'missedWeek', week: missed };
  else steady = { memberId: id, value: variation(weekSeconds), tiebreak: seconds, out: null };

  return {
    activities: score(inStage.length, seconds),
    hours: score(seconds, inStage.length),
    momentum: score(greenWeeks, averageIndex),
    weekend: score(weekend.length, sum(weekend)),
    variety: score(new Set(inStage.map((a) => a.sport)).size, inStage.length),
    marathon: score(durations[0] ?? 0, durations[1] ?? 0),
    comeback: score(increase, seconds, increase > 0 ? null : 'noIncrease'),
    sprint: member.today < sprintFrom && sprint.length === 0 ? { ...sprintScore, out: 'notOpen' } : sprintScore,
    steady,
  };
}

/** Negative when `a` goes ahead of `b`. */
function compareScores(key: RankingKey, a: Score, b: Score): number {
  const primary = LOWER_IS_BETTER.has(key) ? a.value - b.value : b.value - a.value;
  return primary || b.tiebreak - a.tiebreak;
}

function rank(key: RankingKey, scores: readonly Score[]): Entry[] {
  const sorted = scores.filter((s) => s.out === null).sort((a, b) => compareScores(key, a, b) || a.memberId.localeCompare(b.memberId));
  const entries: Entry[] = [];
  sorted.forEach((s, i) => {
    const tied = i > 0 && compareScores(key, sorted[i - 1], s) === 0;
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
    list.push({ ...a, date: localTime(a.startedAt, a.timezone).date });
    byMember.set(a.memberId, list);
  }
  const key = stageKey(stage);
  const scores = members
    .filter((m) => (byMember.get(m.id) ?? []).some((a) => stageOf(a.date) !== null && stageKey(stageOf(a.date)!) === key))
    .map((m) => scoresOf(stage, m, byMember.get(m.id) ?? []));
  const result = {} as { [K in RankingKey]: Ranking };
  for (const k of RANKINGS) {
    const list = scores.map((s) => s[k]);
    result[k] = { key: k, entries: rank(k, list), scores: new Map(list.map((s) => [s.memberId, s])) };
  }
  return result;
}

/** The members in first place; several when tied. */
export function leadersOf(ranking: Ranking): Entry[] {
  return ranking.entries.filter((e) => e.position === 1);
}

export interface TitleAward {
  readonly holders: readonly string[];
  /** First in the ranking, but already with the most titles: the title went on. */
  readonly blockedLeaders: readonly string[];
}

/**
 * The titles, in the order of the table: each goes to the best-placed members who still have room,
 * all the tied ones at that position together, and counts towards each one's limit.
 */
export function awardTitles(standings: Standings): { [K in RankingKey]: TitleAward } {
  const count = new Map<string, number>();
  const result = {} as { [K in RankingKey]: TitleAward };
  for (const key of RANKINGS) {
    const entries = standings[key].entries;
    let holders: string[] = [];
    for (const position of [...new Set(entries.map((e) => e.position))]) {
      holders = entries.filter((e) => e.position === position && (count.get(e.memberId) ?? 0) < MAX_TITLES).map((e) => e.memberId);
      if (holders.length) break;
    }
    for (const id of holders) count.set(id, (count.get(id) ?? 0) + 1);
    result[key] = { holders, blockedLeaders: leadersOf(standings[key]).map((e) => e.memberId).filter((id) => !holders.includes(id)) };
  }
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
  | { readonly kind: 'out'; readonly reason: OutReason; readonly missing: number | null; readonly week?: CalendarDate }
  /** No activity in the stage. */
  | { readonly kind: 'absent' };

export function gapFor(ranking: Ranking, memberId: string): Gap {
  const mine = ranking.scores.get(memberId);
  if (!mine) return { kind: 'absent' };
  const leader = ranking.entries[0];
  const lower = LOWER_IS_BETTER.has(ranking.key);
  if (mine.out !== null) {
    const missing = leader && !lower ? Math.max(leader.value - mine.value, 0) : null;
    return mine.week ? { kind: 'out', reason: mine.out, missing, week: mine.week } : { kind: 'out', reason: mine.out, missing };
  }
  const entry = ranking.entries.find((e) => e.memberId === memberId)!;
  if (entry.position === 1) return { kind: 'leader' };
  const tied = entry.value === leader.value;
  const missing = tied ? leader.tiebreak - entry.tiebreak : Math.abs(leader.value - entry.value);
  return { kind: 'behind', position: entry.position, missing, tied };
}

/**
 * How far along the lane to the first place I am, from 0 to 1, for the Estações tab: my value over
 * the first's (the first's over mine in the Relógio Suíço, where less is better).
 */
export function laneProgress(key: RankingKey, leader: number | null, mine: number | null, position: number | null): number {
  if (position === 1) return 1;
  if (leader === null || mine === null || leader <= 0 || mine <= 0) return 0;
  const fraction = LOWER_IS_BETTER.has(key) ? leader / mine : mine / leader;
  return Math.min(Math.max(fraction, 0), 1);
}
