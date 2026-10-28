// The challenges: collective hours (docs/spec/desafio-horas.md) and the chain
// (docs/spec/desafio-corrente.md). Progress is never stored: it is computed from the Senhoras'
// activities on every read and every change. `settle` moves the challenge's state and milestones
// to match; closing writes each Senhora's total, and a chain's days, for the history.
import type { ChainView, ChallengeMemberView, ChallengeView, HistoryItemView, LogEntryView } from '../../src/application/api-contract';
import { CHAIN_CLOSE_HOURS, chainDays, chainSummary } from '../../src/domain/challenge/chain';
import {
  activityCounts,
  challengePeriod,
  closesAt,
  goalReached,
  journeyProgressMeters,
  parseChallengeSetup,
  parseDraftSetup,
  percentOfGoal,
  reachedMilestones,
  type ChallengeConfig,
  type ChallengeResponse,
  type ChallengeState,
  type ChallengeType,
  type Participation,
} from '../../src/domain/challenge/challenge';
import { isAdmin } from '../../src/domain/group/roles';
import { failure, nowIso, QueryError, type CommandResult, type Context } from './context';
import type { Member } from './members';

interface ChallengeRow {
  id: string;
  type: ChallengeType;
  name: string;
  creator_id: string;
  starts_at: string;
  ends_at: string;
  state: ChallengeState;
  ended_at: string | null;
  closes_at: string | null;
  closed_at: string | null;
  config: string;
  created_at: string;
  creator_is_senhora: number | null;
  chain_result: string | null;
}

interface CountedActivity {
  id: string;
  member_id: string;
  started_at: string;
  timezone: string;
  duration_seconds: number;
  sport: string;
}

type Window = { startsAt: string; endsAt: string };

const configOf = (row: ChallengeRow) => JSON.parse(row.config) as ChallengeConfig;

/** Activities count from the start until the end: the period's, or earlier if the goal was hit or it was cancelled. */
const countingWindow = (row: ChallengeRow): Window => ({ startsAt: row.starts_at, endsAt: row.ended_at ?? row.ends_at });

function load(ctx: Context, id: unknown): ChallengeRow | null {
  if (typeof id !== 'string') return null;
  const [row] = ctx.sql.all<ChallengeRow>('SELECT * FROM challenges WHERE id = ?', id);
  return row ?? null;
}

/** A draft exists only for its creator; for everyone else it is not found. */
function loadVisible(ctx: Context, actor: Member, id: unknown): ChallengeRow | null {
  const row = load(ctx, id);
  return row && (row.state !== 'draft' || row.creator_id === actor.id) ? row : null;
}

function participations(ctx: Context, challengeId: string): Map<string, Participation & { absences: { leftAt: string; returnedAt: string | null }[] }> {
  const map = new Map<string, Participation & { absences: { leftAt: string; returnedAt: string | null }[] }>();
  for (const row of ctx.sql.all<{ member_id: string; response: ChallengeResponse }>(
    'SELECT member_id, response FROM challenge_members WHERE challenge_id = ?',
    challengeId,
  )) {
    map.set(row.member_id, { response: row.response, absences: [] });
  }
  for (const row of ctx.sql.all<{ member_id: string; left_at: string; returned_at: string | null }>(
    'SELECT member_id, left_at, returned_at FROM challenge_absences WHERE challenge_id = ? ORDER BY left_at',
    challengeId,
  )) {
    map.get(row.member_id)?.absences.push({ leftAt: row.left_at, returnedAt: row.returned_at });
  }
  return map;
}

/** The activities that count for the challenge, newest first. */
function countedActivities(ctx: Context, row: ChallengeRow, window = countingWindow(row)): CountedActivity[] {
  const parts = participations(ctx, row.id);
  return ctx.sql
    .all<CountedActivity>(
      `SELECT id, member_id, started_at, timezone, duration_seconds, sport FROM activities
       WHERE deleted = 0 AND started_at >= ? AND started_at < ? ORDER BY started_at DESC`,
      window.startsAt,
      window.endsAt,
    )
    .filter((a) => {
      const part = parts.get(a.member_id);
      return part !== undefined && activityCounts(a.started_at, window, part);
    });
}

function totalsByMember(activities: readonly CountedActivity[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const a of activities) totals.set(a.member_id, (totals.get(a.member_id) ?? 0) + a.duration_seconds);
  return totals;
}

const sum = (totals: Map<string, number>) => [...totals.values()].reduce((a, b) => a + b, 0);

const HOUR_MS = 3_600_000;

/**
 * Where a chain stands now: its days come from the activities of the period and of the day after
 * it, which can save the last day. Once closed, the frozen days are read instead.
 */
function chainOf(ctx: Context, row: ChallengeRow): ChainView {
  if (row.chain_result !== null) return JSON.parse(row.chain_result) as ChainView;
  const config = configOf(row);
  const chain = config.chain!;
  const window = { startsAt: row.starts_at, endsAt: new Date(Date.parse(row.ends_at) + 24 * HOUR_MS).toISOString() };
  const days = chainDays({
    startDate: config.startDate,
    endDate: config.endDate,
    config: chain,
    activities: countedActivities(ctx, row, window).map((a) => ({ memberId: a.member_id, startedAt: a.started_at, timezone: a.timezone, durationSeconds: a.duration_seconds })),
    timezones: memberTimezones(ctx),
    now: ctx.clock.now(),
  });
  const names = new Map(ctx.sql.all<{ id: string; name: string }>('SELECT id, name FROM members').map((m) => [m.id, m.name]));
  const { lost, saved, streak } = chainSummary(days, chain.allowedBreaks);
  return {
    ...chain,
    lost,
    saved,
    streak,
    days: days.map((d) => ({
      date: d.date,
      state: d.state,
      activeCount: d.active.length,
      savedBy: d.savedBy.map((id) => ({ memberId: id, name: names.get(id) ?? '' })).sort((x, y) => x.name.localeCompare(y.name)),
    })),
  };
}

/**
 * A chain fails, and closes, the moment more breaks are lost than allowed. When the period passes
 * it succeeds, and the result follows the breaks until it closes, a day later than the hours'.
 */
function settleChain(ctx: Context, row: ChallengeRow): boolean {
  const now = nowIso(ctx);
  const chain = chainOf(ctx, row);
  const broken = chain.lost > chain.allowedBreaks;
  if (row.state === 'open' && broken) {
    ctx.sql.run("UPDATE challenges SET state = 'failed', ended_at = ?, closes_at = ? WHERE id = ?", now, now, row.id);
    close(ctx, load(ctx, row.id) as ChallengeRow);
    return true;
  }
  let state = row.state;
  let endedAt = row.ended_at;
  if (state === 'open' && now >= row.ends_at) endedAt = row.ends_at;
  if (endedAt !== null) state = broken ? 'failed' : 'succeeded';
  if (state === row.state && endedAt === row.ended_at) return false;
  const closes = endedAt === null ? null : new Date(Date.parse(endedAt) + CHAIN_CLOSE_HOURS * HOUR_MS).toISOString();
  ctx.sql.run('UPDATE challenges SET state = ?, ended_at = ?, closes_at = ? WHERE id = ?', state, endedAt, closes, row.id);
  return true;
}

/**
 * Brings a challenge that is not closed in line with its activities: records the milestones
 * reached (they never go back), ends it with success the moment the goal is hit, without success
 * when the period passes. During the 24 hours of tolerance the result follows the total either
 * way. Returns whether anything changed.
 */
export function settle(ctx: Context, row: ChallengeRow): boolean {
  if (row.closed_at !== null || row.state === 'cancelled' || row.state === 'draft') return false;
  if (row.type === 'corrente') return settleChain(ctx, row);
  const now = nowIso(ctx);
  let state = row.state;
  let endedAt = row.ended_at;
  if (state === 'open' && now >= row.ends_at) endedAt = row.ends_at;

  const total = sum(totalsByMember(countedActivities(ctx, row, { startsAt: row.starts_at, endsAt: endedAt ?? row.ends_at })));
  const reached = goalReached(total, configOf(row).goalMinutes);
  if (state === 'open') {
    if (reached) {
      state = 'succeeded';
      endedAt ??= now;
    } else if (endedAt !== null) {
      state = 'failed';
    }
  } else {
    state = reached ? 'succeeded' : 'failed';
  }

  let changed = false;
  const known = new Set(ctx.sql.all<{ milestone: string }>('SELECT milestone FROM challenge_milestones WHERE challenge_id = ?', row.id).map((m) => m.milestone));
  for (const milestone of reachedMilestones(configOf(row), total)) {
    if (known.has(milestone)) continue;
    ctx.sql.run('INSERT INTO challenge_milestones (challenge_id, milestone, reached_at) VALUES (?, ?, ?)', row.id, milestone, now);
    changed = true;
  }
  if (state !== row.state || endedAt !== row.ended_at) {
    const closes = endedAt === null ? null : closesAt(new Date(endedAt)).toISOString();
    ctx.sql.run('UPDATE challenges SET state = ?, ended_at = ?, closes_at = ? WHERE id = ?', state, endedAt, closes, row.id);
    changed = true;
  }
  return changed;
}

export function settleAll(ctx: Context): boolean {
  let changed = false;
  for (const row of ctx.sql.all<ChallengeRow>("SELECT * FROM challenges WHERE closed_at IS NULL AND state NOT IN ('cancelled', 'draft')")) {
    changed = settle(ctx, row) || changed;
  }
  return changed;
}

/** Freezes the result: each Senhora's total goes to `challenge_results`, which the history reads. */
function close(ctx: Context, row: ChallengeRow): void {
  const totals = totalsByMember(countedActivities(ctx, row));
  const senhoras = ctx.sql.all<{ id: string; name: string }>(
    `SELECT members.id, members.name FROM members WHERE members.active = 1 AND (
       EXISTS (SELECT 1 FROM challenge_members m WHERE m.challenge_id = ? AND m.member_id = members.id AND m.response = 'accepted')
       OR EXISTS (SELECT 1 FROM challenge_absences a WHERE a.challenge_id = ? AND a.member_id = members.id))`,
    row.id,
    row.id,
  );
  for (const senhora of senhoras) {
    ctx.sql.run(
      'INSERT OR REPLACE INTO challenge_results (challenge_id, member_id, name, total_seconds) VALUES (?, ?, ?, ?)',
      row.id,
      senhora.id,
      senhora.name,
      totals.get(senhora.id) ?? 0,
    );
  }
  const chain = row.type === 'corrente' ? JSON.stringify(chainOf(ctx, row)) : null;
  ctx.sql.run('UPDATE challenges SET closed_at = ?, chain_result = ? WHERE id = ?', nowIso(ctx), chain, row.id);
}

/** The cron's part: ends challenges whose period passed and closes those past the tolerance. */
export function runChallengeJobs(ctx: Context): boolean {
  return ctx.sql.transaction(() => {
    let changed = settleAll(ctx);
    const due = ctx.sql.all<ChallengeRow>('SELECT * FROM challenges WHERE closed_at IS NULL AND closes_at IS NOT NULL AND closes_at <= ?', nowIso(ctx));
    for (const row of due) close(ctx, row);
    changed = changed || due.length > 0;
    return changed;
  });
}

function view(ctx: Context, actor: Member, id: string): ChallengeView {
  const row = load(ctx, id) as ChallengeRow;
  const config = configOf(row);
  const totals =
    row.closed_at === null
      ? totalsByMember(countedActivities(ctx, row))
      : new Map(
          ctx.sql
            .all<{ member_id: string; total_seconds: number }>('SELECT member_id, total_seconds FROM challenge_results WHERE challenge_id = ?', row.id)
            .map((r) => [r.member_id, r.total_seconds]),
        );
  const total = sum(totals);
  const members: ChallengeMemberView[] = ctx.sql
    .all<{ id: string; name: string; photo_url: string | null; response: ChallengeResponse | null }>(
      `SELECT members.id, members.name, members.photo_url, cm.response FROM members
       LEFT JOIN challenge_members cm ON cm.member_id = members.id AND cm.challenge_id = ?
       WHERE members.active = 1 ORDER BY members.name COLLATE NOCASE`,
      row.id,
    )
    .map((m) => ({ memberId: m.id, name: m.name, photoUrl: m.photo_url, response: m.response ?? 'pending', totalSeconds: totals.get(m.id) ?? 0 }));
  const [creator] = ctx.sql.all<{ name: string }>('SELECT name FROM members WHERE id = ?', row.creator_id);

  return {
    id: row.id,
    type: row.type,
    name: row.name,
    creatorId: row.creator_id,
    creatorName: creator?.name ?? '',
    startDate: config.startDate,
    endDate: config.endDate,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    state: row.state,
    endedAt: row.ended_at,
    closesAt: row.closes_at,
    closed: row.closed_at !== null,
    goalMinutes: config.goalMinutes,
    totalSeconds: total,
    percent: percentOfGoal(total, config.goalMinutes),
    journey: config.journey ? { ...config.journey, progressMeters: journeyProgressMeters(config.journey, total) } : null,
    members,
    milestones: ctx.sql
      .all<{ milestone: string; reached_at: string }>('SELECT milestone, reached_at FROM challenge_milestones WHERE challenge_id = ? ORDER BY reached_at, milestone', row.id)
      .map((m) => ({ milestone: m.milestone, reachedAt: m.reached_at })),
    myResponse: members.find((m) => m.memberId === actor.id)?.response ?? 'pending',
    creatorIsSenhora: row.creator_is_senhora === 1,
    journeyPending: config.journeyPending === true,
    chain: row.type === 'corrente' ? chainOf(ctx, row) : null,
  };
}

/** The zones of the active members who have one; the period stretches to cover all of them. */
function memberTimezones(ctx: Context): string[] {
  return ctx.sql.all<{ timezone: string }>('SELECT DISTINCT timezone FROM members WHERE active = 1 AND timezone IS NOT NULL').map((r) => r.timezone);
}

// Queries

export function getChallenge(ctx: Context, actor: Member, input: { challengeId?: unknown }): { challenge: ChallengeView | null } | QueryError {
  if (input.challengeId !== undefined) {
    const row = loadVisible(ctx, actor, input.challengeId);
    return row ? { challenge: view(ctx, actor, row.id) } : new QueryError('not_found');
  }
  const [row] = ctx.sql.all<ChallengeRow>(
    "SELECT * FROM challenges WHERE closed_at IS NULL AND state != 'draft' ORDER BY state = 'open' DESC, created_at DESC LIMIT 1",
  );
  return { challenge: row ? view(ctx, actor, row.id) : null };
}

export function drafts(ctx: Context, actor: Member): ChallengeView[] {
  return ctx.sql
    .all<{ id: string }>("SELECT id FROM challenges WHERE state = 'draft' AND creator_id = ? ORDER BY created_at DESC, id DESC", actor.id)
    .map((row) => view(ctx, actor, row.id));
}

/** Everyone sees the log, torcida included: who, when, how long, the sport and the hearts. */
export function challengeLog(ctx: Context, actor: Member, input: { challengeId?: unknown }): LogEntryView[] | QueryError {
  const row = loadVisible(ctx, actor, input.challengeId);
  if (!row) return new QueryError('not_found');
  const names = new Map(ctx.sql.all<{ id: string; name: string }>('SELECT id, name FROM members').map((m) => [m.id, m.name]));
  const hearts = new Map(
    ctx.sql
      .all<{ activity_id: string; hearts: number; mine: number }>(
        'SELECT activity_id, COUNT(*) AS hearts, SUM(member_id = ?) AS mine FROM reactions WHERE challenge_id = ? GROUP BY activity_id',
        actor.id,
        row.id,
      )
      .map((h) => [h.activity_id, h]),
  );
  return countedActivities(ctx, row).map((a) => ({
    activityId: a.id,
    memberId: a.member_id,
    memberName: names.get(a.member_id) ?? '',
    startedAt: a.started_at,
    timezone: a.timezone,
    durationSeconds: a.duration_seconds,
    sport: a.sport,
    hearts: hearts.get(a.id)?.hearts ?? 0,
    heartedByMe: (hearts.get(a.id)?.mine ?? 0) > 0,
  }));
}

/** Closed challenges read only their stored results, so members who left still show. */
export function history(ctx: Context): HistoryItemView[] {
  return ctx.sql.all<ChallengeRow>('SELECT * FROM challenges WHERE closed_at IS NOT NULL ORDER BY starts_at DESC, created_at DESC').map((row) => {
    const results = ctx.sql
      .all<{ member_id: string; name: string; total_seconds: number }>(
        'SELECT member_id, name, total_seconds FROM challenge_results WHERE challenge_id = ? ORDER BY total_seconds DESC, name',
        row.id,
      )
      .map((r) => ({ memberId: r.member_id, name: r.name, totalSeconds: r.total_seconds }));
    const total = results.reduce((a, r) => a + r.totalSeconds, 0);
    const { goalMinutes } = configOf(row);
    const chain = row.type === 'corrente' && row.chain_result !== null ? (JSON.parse(row.chain_result) as ChainView) : null;
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      state: row.state,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      endedAt: row.ended_at,
      goalMinutes,
      totalSeconds: total,
      percent: percentOfGoal(total, goalMinutes),
      results,
      chain: chain && { allowedBreaks: chain.allowedBreaks, lost: chain.lost, saved: chain.saved },
    };
  });
}

// Commands

const isOpen = (ctx: Context) => ctx.sql.all("SELECT 1 FROM challenges WHERE state = 'open'").length > 0;

/** Opens the challenge: every member is invited, and the creator's own answer is the one she chose. */
function invite(ctx: Context, id: string, creatorId: string, creatorIsSenhora: boolean): void {
  ctx.sql.run(
    "INSERT INTO challenge_members (challenge_id, member_id, response) SELECT ?, id, 'pending' FROM members WHERE active = 1",
    id,
  );
  ctx.sql.run(
    'UPDATE challenge_members SET response = ?, responded_at = ? WHERE challenge_id = ? AND member_id = ?',
    creatorIsSenhora ? 'accepted' : 'declined',
    nowIso(ctx),
    id,
    creatorId,
  );
  settle(ctx, load(ctx, id) as ChallengeRow);
}

/**
 * Any member creates one. A draft any time, seen only by her and checked only for its format; an
 * open one while no other is open, and then every member is invited.
 */
export function createChallenge(ctx: Context, actor: Member, input: Record<string, unknown>): CommandResult<ChallengeView> {
  const draft = input.draft === true;
  const setup = draft ? parseDraftSetup(input) : parseChallengeSetup(input);
  if (!setup || typeof input.creatorIsSenhora !== 'boolean') return failure('invalid');
  if (!draft && isOpen(ctx)) return failure('conflict');
  const period = challengePeriod(setup.startDate, setup.endDate, memberTimezones(ctx));
  if (!draft && period.endsAt.getTime() <= ctx.clock.now().getTime()) return failure('invalid');

  const id = ctx.ids.next();
  const { type, name, ...config } = setup;
  ctx.sql.run(
    `INSERT INTO challenges (id, type, name, creator_id, starts_at, ends_at, state, config, created_at, creator_is_senhora)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    type,
    name,
    actor.id,
    period.startsAt.toISOString(),
    period.endsAt.toISOString(),
    draft ? 'draft' : 'open',
    JSON.stringify(config),
    nowIso(ctx),
    input.creatorIsSenhora ? 1 : 0,
  );
  if (!draft) invite(ctx, id, actor.id, input.creatorIsSenhora);
  return { ok: true, value: view(ctx, actor, id), changed: ['challenge'] };
}

/**
 * The creator activates her draft while no other challenge is open. Every rule of creating applies
 * now: the end must not have passed, a journey needs its route, and the period follows today's zones.
 */
export function activateChallenge(ctx: Context, actor: Member, input: { challengeId?: unknown }): CommandResult<ChallengeView> {
  const row = loadVisible(ctx, actor, input.challengeId);
  if (!row) return failure('not_found');
  if (row.creator_id !== actor.id) return failure('forbidden');
  if (row.state !== 'draft') return failure('conflict');
  const config = configOf(row);
  if (config.journeyPending) return failure('invalid');
  if (isOpen(ctx)) return failure('conflict');
  const period = challengePeriod(config.startDate, config.endDate, memberTimezones(ctx));
  if (period.endsAt.getTime() <= ctx.clock.now().getTime()) return failure('invalid');

  ctx.sql.run(
    "UPDATE challenges SET state = 'open', starts_at = ?, ends_at = ?, created_at = ? WHERE id = ?",
    period.startsAt.toISOString(),
    period.endsAt.toISOString(),
    nowIso(ctx),
    row.id,
  );
  invite(ctx, row.id, actor.id, row.creator_is_senhora === 1);
  return { ok: true, value: view(ctx, actor, row.id), changed: ['challenge'] };
}

/**
 * The creator changes name, dates, goal and journey until the end; the period is recomputed. A
 * draft is checked only for its format, and in it she may change whether she is a Senhora.
 */
export function editChallenge(ctx: Context, actor: Member, input: Record<string, unknown>): CommandResult<ChallengeView> {
  const row = loadVisible(ctx, actor, input.challengeId);
  if (!row) return failure('not_found');
  if (row.creator_id !== actor.id) return failure('forbidden');
  const draft = row.state === 'draft';
  if (!draft && row.state !== 'open') return failure('conflict');
  const setup = draft ? parseDraftSetup(input) : parseChallengeSetup(input);
  if (!setup) return failure('invalid');
  // The type changes only in a draft: an open challenge keeps the one everyone accepted.
  if (!draft && setup.type !== row.type) return failure('invalid');
  if (input.creatorIsSenhora !== undefined && (!draft || typeof input.creatorIsSenhora !== 'boolean')) return failure('invalid');
  const period = challengePeriod(setup.startDate, setup.endDate, memberTimezones(ctx));
  if (!draft && period.endsAt.getTime() <= ctx.clock.now().getTime()) return failure('invalid');
  if (typeof input.creatorIsSenhora === 'boolean') {
    ctx.sql.run('UPDATE challenges SET creator_is_senhora = ? WHERE id = ?', input.creatorIsSenhora ? 1 : 0, row.id);
  }

  const { type, name, ...config } = setup;
  ctx.sql.run(
    'UPDATE challenges SET type = ?, name = ?, starts_at = ?, ends_at = ?, config = ? WHERE id = ?',
    type,
    name,
    period.startsAt.toISOString(),
    period.endsAt.toISOString(),
    JSON.stringify(config),
    row.id,
  );
  settle(ctx, load(ctx, row.id) as ChallengeRow);
  return { ok: true, value: view(ctx, actor, row.id), changed: ['challenge'] };
}

/**
 * Accepting makes me a Senhora (my activities since the start count); declining makes me torcida,
 * or takes me out if I had accepted. Coming back, the time I was out never counts.
 */
export function respond(ctx: Context, actor: Member, input: { challengeId?: unknown; accept?: unknown }): CommandResult<ChallengeView> {
  const row = loadVisible(ctx, actor, input.challengeId);
  if (!row) return failure('not_found');
  if (typeof input.accept !== 'boolean') return failure('invalid');
  if (row.state !== 'open') return failure('conflict');

  const now = nowIso(ctx);
  const [current] = ctx.sql.all<{ response: ChallengeResponse }>(
    'SELECT response FROM challenge_members WHERE challenge_id = ? AND member_id = ?',
    row.id,
    actor.id,
  );
  const response: ChallengeResponse = input.accept ? 'accepted' : 'declined';
  if (current?.response === response) return { ok: true, value: view(ctx, actor, row.id), changed: [] };

  if (input.accept) {
    ctx.sql.run('UPDATE challenge_absences SET returned_at = ? WHERE challenge_id = ? AND member_id = ? AND returned_at IS NULL', now, row.id, actor.id);
  } else if (current?.response === 'accepted') {
    ctx.sql.run('INSERT INTO challenge_absences (challenge_id, member_id, left_at) VALUES (?, ?, ?)', row.id, actor.id, now);
  }
  ctx.sql.run(
    `INSERT INTO challenge_members (challenge_id, member_id, response, responded_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (challenge_id, member_id) DO UPDATE SET response = excluded.response, responded_at = excluded.responded_at`,
    row.id,
    actor.id,
    response,
    now,
  );
  settle(ctx, row);
  return { ok: true, value: view(ctx, actor, row.id), changed: ['challenge'] };
}

/** The creator cancels before the end; the result closes at once with the totals so far. */
export function cancelChallenge(ctx: Context, actor: Member, input: { challengeId?: unknown }): CommandResult<null> {
  const row = loadVisible(ctx, actor, input.challengeId);
  if (!row) return failure('not_found');
  if (row.creator_id !== actor.id) return failure('forbidden');
  if (row.state !== 'open') return failure('conflict');
  const now = nowIso(ctx);
  ctx.sql.run("UPDATE challenges SET state = 'cancelled', ended_at = ?, closes_at = ? WHERE id = ?", now, now, row.id);
  close(ctx, load(ctx, row.id) as ChallengeRow);
  return { ok: true, value: null, changed: ['challenge', 'history'] };
}

/**
 * Admins, in any state; a draft, also its creator. Everything about the challenge goes. Activities
 * stay: they are the members'.
 */
export function deleteChallenge(ctx: Context, actor: Member, input: { challengeId?: unknown }): CommandResult<null> {
  const row = loadVisible(ctx, actor, input.challengeId);
  if (!row) return failure(isAdmin(actor) ? 'not_found' : 'forbidden');
  if (!isAdmin(actor) && row.state !== 'draft') return failure('forbidden');
  for (const table of ['reactions', 'challenge_milestones', 'challenge_results', 'challenge_absences', 'challenge_members']) {
    ctx.sql.run(`DELETE FROM ${table} WHERE challenge_id = ?`, row.id);
  }
  ctx.sql.run('DELETE FROM challenges WHERE id = ?', row.id);
  return { ok: true, value: null, changed: ['challenge', 'history'] };
}

/** Anyone, torcida included, puts or takes her own heart on an activity of the log. */
export function setReaction(ctx: Context, actor: Member, input: { challengeId?: unknown; activityId?: unknown; heart?: unknown }): CommandResult<null> {
  if (typeof input.activityId !== 'string' || typeof input.heart !== 'boolean') return failure('invalid');
  const row = loadVisible(ctx, actor, input.challengeId);
  if (!row) return failure('not_found');
  const activityId = input.activityId;
  if (!countedActivities(ctx, row).some((a) => a.id === activityId)) return failure('not_found');
  if (input.heart) {
    ctx.sql.run(
      'INSERT OR IGNORE INTO reactions (activity_id, challenge_id, member_id, created_at) VALUES (?, ?, ?, ?)',
      activityId,
      row.id,
      actor.id,
      nowIso(ctx),
    );
  } else {
    ctx.sql.run('DELETE FROM reactions WHERE activity_id = ? AND challenge_id = ? AND member_id = ?', activityId, row.id, actor.id);
  }
  return { ok: true, value: null, changed: ['challenge'] };
}
