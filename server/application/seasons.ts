// The Corrida das Estações (docs/spec/corrida-das-estacoes.md): the live rankings of a stage, its
// result once it closes, and each member's titles. The nine rankings are computed together, once
// per change of the activities, and shared by every read until the next change. Privacy: of each
// ranking, the API gives the first place to everyone, the viewer her own place, and the others'
// values without names or positions.
import type {
  SeasonCircuitView,
  SeasonPerson,
  SeasonRankingView,
  SeasonStageRef,
  SeasonStageView,
  SeasonTitleView,
  SeasonYearView,
} from '../../src/application/api-contract';
import { awardTitles, gapFor, leadersOf, othersOf, RANKINGS, standings, type RaceMember, type RankingKey, type Standings } from '../../src/domain/seasons/rankings';
import {
  compareStages,
  FIRST_STAGE,
  inRace,
  isYearEnd,
  nextStage,
  parseStageKey,
  quarterStage,
  stageDates,
  stageKey,
  stageStatusOn,
  stagesOf,
  type Stage,
  type StageStatus,
} from '../../src/domain/seasons/stages';
import { localTime } from '../../src/domain/tracking/tracking';
import { midnightIn, type CalendarDate } from '../../src/domain/time/zones';
import { nowIso, QueryError, type Context } from './context';
import type { Member } from './members';

const zoneOf = (member: { timezone: string | null }) => member.timezone ?? 'UTC';
const todayOf = (ctx: Context, member: { timezone: string | null }) => localTime(ctx.clock.now(), zoneOf(member)).date;

// The rankings, computed once per change (the GroupService clears them on every change).

const cache = new WeakMap<Context['sql'], Map<string, Standings>>();

/** Forgets the computed rankings: the activities or the members changed. */
export function invalidateSeasons(ctx: Context): void {
  cache.delete(ctx.sql);
}

interface MemberRow {
  id: string;
  name: string;
  photo_url: string | null;
  timezone: string | null;
}

function activeMembers(ctx: Context): MemberRow[] {
  return ctx.sql.all<MemberRow>('SELECT id, name, photo_url, timezone FROM members WHERE active = 1');
}

/** The nine rankings of a stage, from the active members' activities, as of each one's today. */
function computeStandings(ctx: Context, stage: Stage, members: readonly RaceMember[]): Standings {
  const key = `${stageKey(stage)}|${members.map((m) => `${m.id}:${m.today}`).join(',')}`;
  let byKey = cache.get(ctx.sql);
  // A day turning in some zone makes a new key; the old ones are dropped beyond a few.
  if (!byKey || byKey.size > 16) cache.set(ctx.sql, (byKey = new Map()));
  const found = byKey.get(key);
  if (found) return found;
  // Up to a day after the stage's last date covers every zone; older ones feed the window index.
  const until = `${stageDates(stage).closesOn}T00:00:00Z`;
  const activities = ctx.sql
    .all<{ member_id: string; started_at: string; timezone: string; duration_seconds: number; sport: string }>(
      `SELECT a.member_id, a.started_at, a.timezone, a.duration_seconds, a.sport FROM activities a
       JOIN members m ON m.id = a.member_id AND m.active = 1
       WHERE a.deleted = 0 AND a.started_at < ?`,
      until,
    )
    .map((a) => ({ memberId: a.member_id, startedAt: a.started_at, timezone: a.timezone, durationSeconds: a.duration_seconds, sport: a.sport }));
  const result = standings(stage, members, activities);
  byKey.set(key, result);
  return result;
}

function liveStandings(ctx: Context, stage: Stage): Standings {
  return computeStandings(
    ctx,
    stage,
    activeMembers(ctx).map((m) => ({ id: m.id, today: todayOf(ctx, m) })),
  );
}

// Closing

function closedAt(ctx: Context, stage: Stage): string | null {
  const [row] = ctx.sql.all<{ closed_at: string }>('SELECT closed_at FROM season_stages WHERE stage = ?', stageKey(stage));
  return row?.closed_at ?? null;
}

/** The result closes once the next quarter has begun for everyone: in the zone furthest behind. */
export function closeMoment(ctx: Context, stage: Stage): Date {
  const zones = ctx.sql.all<{ timezone: string }>('SELECT DISTINCT timezone FROM members WHERE active = 1 AND timezone IS NOT NULL').map((r) => r.timezone);
  const closesOn = stageDates(stage).closesOn;
  return new Date(Math.max(...[...zones, 'UTC'].map((zone) => midnightIn(closesOn, zone).getTime())));
}

/**
 * Closes every stage whose result is due, storing each ranking's final places and the titles.
 * Runs on the cron; returns the stages it closed.
 */
export function closeDueStages(ctx: Context): Stage[] {
  const now = ctx.clock.now();
  const closed: Stage[] = [];
  for (let stage = FIRST_STAGE; compareStages(stage, quarterStage(now.toISOString().slice(0, 10))) < 0; stage = nextStage(stage)) {
    if (closedAt(ctx, stage) || closeMoment(ctx, stage) > now) continue;
    const members = activeMembers(ctx);
    const closesOn = stageDates(stage).closesOn;
    const final = computeStandings(
      ctx,
      stage,
      members.map((m) => ({ id: m.id, today: closesOn })),
    );
    const titles = awardTitles(final);
    const names = new Map(members.map((m) => [m.id, m.name]));
    ctx.sql.transaction(() => {
      ctx.sql.run('INSERT INTO season_stages (stage, closed_at) VALUES (?, ?)', stageKey(stage), nowIso(ctx));
      for (const key of RANKINGS) {
        for (const entry of final[key].entries) {
          ctx.sql.run(
            'INSERT INTO season_results (stage, ranking, member_id, name, position, value, title) VALUES (?, ?, ?, ?, ?, ?, ?)',
            stageKey(stage),
            key,
            entry.memberId,
            names.get(entry.memberId) ?? '',
            entry.position,
            entry.value,
            titles[key].holders.includes(entry.memberId) ? 1 : 0,
          );
        }
      }
    });
    closed.push(stage);
  }
  return closed;
}

// Views

export function stageRef(stage: Stage): SeasonStageRef {
  return { key: stageKey(stage), year: stage.year, season: stage.season, ...stageDates(stage) };
}

/** As the viewer sees it on her today; `counting` until the result closes for the whole group. */
function statusOf(ctx: Context, stage: Stage, today: CalendarDate): StageStatus | 'upcoming' {
  if (closedAt(ctx, stage)) return 'closed';
  const status = stageStatusOn(stage, today);
  return status === 'closed' ? 'counting' : status;
}

function people(ctx: Context): Map<string, SeasonPerson> {
  return new Map(
    ctx.sql.all<MemberRow>('SELECT id, name, photo_url, timezone FROM members').map((m) => [m.id, { memberId: m.id, name: m.name, photoUrl: m.photo_url }]),
  );
}

function liveView(ctx: Context, actor: Member, stage: Stage, status: 'running' | 'counting'): SeasonRankingView[] {
  const all = liveStandings(ctx, stage);
  const titles = status === 'counting' ? awardTitles(all) : null;
  const who = people(ctx);
  const person = (id: string) => who.get(id) ?? { memberId: id, name: '', photoUrl: null };
  return RANKINGS.map((key) => {
    const ranking = all[key];
    const leaders = leadersOf(ranking);
    const mine = ranking.scores.get(actor.id);
    const entry = ranking.entries.find((e) => e.memberId === actor.id);
    const value = mine && (mine.out === null || mine.out === 'zero' || mine.out === 'noIncrease') ? mine.value : null;
    return {
      key,
      leaders: leaders.map((e) => person(e.memberId)),
      leaderValue: leaders[0]?.value ?? null,
      titleHolders: titles ? titles[key].holders.map(person) : [],
      blockedLeaders: titles ? titles[key].blockedLeaders.map(person) : [],
      others: othersOf(ranking.entries, actor.id),
      me: { position: entry?.position ?? null, value, gap: status === 'running' ? gapFor(ranking, actor.id) : null },
    };
  });
}

interface ResultRow {
  ranking: string;
  member_id: string;
  name: string;
  position: number;
  value: number;
  title: number;
}

function closedView(ctx: Context, actor: Member, stage: Stage): SeasonRankingView[] {
  const rows = ctx.sql.all<ResultRow>('SELECT ranking, member_id, name, position, value, title FROM season_results WHERE stage = ?', stageKey(stage));
  const who = people(ctx);
  const person = (r: ResultRow): SeasonPerson => ({ memberId: r.member_id, name: r.name, photoUrl: who.get(r.member_id)?.photoUrl ?? null });
  return RANKINGS.map((key) => {
    const ranking = rows.filter((r) => r.ranking === key);
    const leaders = ranking.filter((r) => r.position === 1);
    const mine = ranking.find((r) => r.member_id === actor.id);
    return {
      key,
      leaders: leaders.map(person),
      leaderValue: leaders[0]?.value ?? null,
      titleHolders: ranking.filter((r) => r.title === 1).map(person),
      blockedLeaders: leaders.filter((r) => r.title === 0).map(person),
      others: othersOf(ranking.map((r) => ({ memberId: r.member_id, position: r.position, value: r.value })), actor.id),
      me: { position: mine?.position ?? null, value: mine?.value ?? null, gap: null },
    };
  });
}

export function seasonStage(ctx: Context, actor: Member, input: { stage?: unknown }): { yearEnd: boolean; view: SeasonStageView } | QueryError {
  const today = todayOf(ctx, actor);
  const stage = input.stage === undefined ? quarterStage(today) : parseStageKey(input.stage);
  if (!stage || !inRace(stage)) return new QueryError('not_found');
  const status = statusOf(ctx, stage, today);
  if (status === 'upcoming') return new QueryError('not_found');
  const rankings = status === 'closed' ? closedView(ctx, actor, stage) : liveView(ctx, actor, stage, status);
  return { yearEnd: input.stage === undefined && isYearEnd(today), view: { stage: stageRef(stage), status, today, rankings } };
}

// Titles over a year

interface TitleRow {
  memberId: string;
  name: string;
  title: SeasonTitleView;
}

/** Every title of the year: the closed stages' as stored, and the ones in the count as provisional. */
function yearTitles(ctx: Context, actor: Member, year: number): { stages: SeasonYearView['stages']; titles: TitleRow[] } {
  const today = todayOf(ctx, actor);
  const titles: TitleRow[] = [];
  const stages = stagesOf(year).map((stage) => {
    const status = statusOf(ctx, stage, today);
    const base = { stage: stageKey(stage), season: stage.season };
    if (status === 'closed') {
      for (const r of ctx.sql.all<ResultRow>('SELECT ranking, member_id, name FROM season_results WHERE stage = ? AND title = 1', stageKey(stage)))
        titles.push({ memberId: r.member_id, name: r.name, title: { ...base, ranking: r.ranking as RankingKey, provisional: false } });
    } else if (status === 'counting') {
      const awarded = awardTitles(liveStandings(ctx, stage));
      const who = people(ctx);
      for (const key of RANKINGS)
        for (const id of awarded[key].holders) titles.push({ memberId: id, name: who.get(id)?.name ?? '', title: { ...base, ranking: key, provisional: true } });
    }
    return { stage: stageRef(stage), status };
  });
  return { stages, titles };
}

function raceYears(ctx: Context, actor: Member): number[] {
  const current = Number(todayOf(ctx, actor).slice(0, 4));
  const years: number[] = [];
  for (let y = FIRST_STAGE.year; y <= current; y++) years.push(y);
  return years;
}

function pickYear(ctx: Context, actor: Member, input: { year?: unknown }): number | QueryError {
  const years = raceYears(ctx, actor);
  if (input.year === undefined) return years[years.length - 1];
  return typeof input.year === 'number' && years.includes(input.year) ? input.year : new QueryError('not_found');
}

export function seasonYear(ctx: Context, actor: Member, input: { year?: unknown }): SeasonYearView | QueryError {
  const year = pickYear(ctx, actor, input);
  if (year instanceof QueryError) return year;
  const { stages, titles } = yearTitles(ctx, actor, year);
  const who = people(ctx);
  const byMember = new Map<string, SeasonYearView['members'][number]>();
  for (const t of titles) {
    const found = byMember.get(t.memberId) ?? { memberId: t.memberId, name: t.name, photoUrl: who.get(t.memberId)?.photoUrl ?? null, titles: [] };
    byMember.set(t.memberId, { ...found, titles: [...found.titles, t.title] });
  }
  const members = [...byMember.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return { year, years: raceYears(ctx, actor), stages, members };
}

export function seasonCircuit(ctx: Context, actor: Member, input: { memberId?: unknown; year?: unknown }): SeasonCircuitView | QueryError {
  const year = pickYear(ctx, actor, input);
  if (year instanceof QueryError) return year;
  const memberId = input.memberId === undefined ? actor.id : input.memberId;
  if (typeof memberId !== 'string') return new QueryError('invalid');
  const member = people(ctx).get(memberId);
  const [stored] = ctx.sql.all<{ name: string }>('SELECT name FROM season_results WHERE member_id = ? LIMIT 1', memberId);
  if (!member && !stored) return new QueryError('not_found');
  const { stages, titles } = yearTitles(ctx, actor, year);
  const mine = titles.filter((t) => t.memberId === memberId);
  return {
    person: member ?? { memberId, name: stored.name, photoUrl: null },
    year,
    years: raceYears(ctx, actor),
    stages: stages.map((s) => ({ ...s, titles: mine.filter((t) => t.title.stage === s.stage.key).map((t) => t.title) })),
  };
}
