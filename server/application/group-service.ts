// The single entry to the group's data. The Durable Object calls it; every method is synchronous,
// so a command runs alone and inside one transaction (ADR-004).
import type { ApiResult, CommandName, Commands, QueryName, Queries, Topic } from '../../src/application/api-contract';
import { createActivity, deleteActivity, listMyActivities, updateActivity } from './activities';
import {
  activateChallenge,
  cancelChallenge,
  challengeLog,
  createChallenge,
  deleteChallenge,
  drafts,
  editChallenge,
  getChallenge,
  history,
  respond,
  runChallengeJobs,
  setReaction,
} from './challenges';
import { failure, QueryError, type CommandResult, type Context } from './context';
import { createInvite, listInvites, revokeInvite } from './invites';
import {
  listMembers,
  me,
  memberForSession,
  removeMember,
  rename,
  setRoles,
  setTimezone,
  signIn,
  signOut,
  type GoogleProfile,
  type Member,
  type SignInResult,
} from './members';
import type { Clock, IdGenerator, Sql } from './ports';
import { migrate } from './schema';
import {
  connectStrava,
  disconnectStrava,
  importStravaActivity,
  importStravaBackfill,
  saveStravaTokens,
  stravaAthlete,
  stravaBackfillsDue,
  stravaConnection,
  stravaCredentials,
  type ConnectStravaResult,
  type NewStravaConnection,
  type StravaActivityEvent,
  type StravaCredentials,
} from './strava';
import { awardBadges, tracking } from './tracking';

type Input = Record<string, unknown>;

type Handler<T> = (ctx: Context, actor: Member, input: Input) => T;

/** Every query the API answers. A handler returns null when the actor may not see it. */
const QUERIES: { [N in QueryName]: Handler<Queries[N]['output'] | QueryError | null> } = {
  me: (_ctx, actor) => me(actor),
  members: (ctx, actor) => listMembers(ctx, actor),
  invites: (ctx, actor) => listInvites(ctx, actor),
  strava: (ctx, actor) => stravaConnection(ctx, actor),
  challenge: (ctx, actor, input) => getChallenge(ctx, actor, input),
  drafts: (ctx, actor) => drafts(ctx, actor),
  challengeLog: (ctx, actor, input) => challengeLog(ctx, actor, input),
  history: (ctx) => history(ctx),
  activities: (ctx, actor) => listMyActivities(ctx, actor),
  tracking: (ctx, actor) => tracking(ctx, actor),
};

/** Every command the API runs; each checks the actor's role itself. */
const COMMANDS: { [N in CommandName]: Handler<CommandResult<Commands[N]['output']>> } = {
  'invite.create': createInvite,
  'invite.revoke': revokeInvite,
  'member.setRoles': setRoles,
  'member.remove': removeMember,
  'member.rename': rename,
  'member.setTimezone': setTimezone,
  'activity.create': createActivity,
  'activity.update': updateActivity,
  'activity.delete': deleteActivity,
  'challenge.create': createChallenge,
  'challenge.edit': editChallenge,
  'challenge.activate': activateChallenge,
  'challenge.respond': respond,
  'challenge.cancel': cancelChallenge,
  'challenge.delete': deleteChallenge,
  'reaction.set': setReaction,
};

export class GroupService {
  private readonly ctx: Context;

  constructor(sql: Sql, clock: Clock, ids: IdGenerator) {
    this.ctx = { sql, clock, ids };
  }

  migrate(): void {
    migrate(this.ctx.sql);
  }

  signIn(profile: GoogleProfile, sessionHash: string, bootstrapAdminEmails: readonly string[]): SignInResult {
    return signIn(this.ctx, profile, sessionHash, bootstrapAdminEmails);
  }

  signOut(sessionHash: string): void {
    signOut(this.ctx, sessionHash);
  }

  memberForSession(sessionHash: string): Member | null {
    return memberForSession(this.ctx, sessionHash);
  }

  /** Called by the Worker after the Strava redirect, for the member signed in on that browser. */
  connectStrava(sessionHash: string, connection: NewStravaConnection): ConnectStravaResult | { ok: false; error: 'unauthenticated' } {
    const actor = this.memberForSession(sessionHash);
    return actor ? connectStrava(this.ctx, actor, connection) : { ok: false, error: 'unauthenticated' };
  }

  /** Called by the Worker for each Strava webhook event; returns the topics that changed. */
  importStravaActivity(athleteId: string, event: StravaActivityEvent): Topic[] {
    return this.withBadges(importStravaActivity(this.ctx, athleteId, event)) ? ['activities', 'challenge'] : [];
  }

  /** The activities since a challenge's start, fetched by the Worker for a backfill that was due. */
  importStravaBackfill(athleteId: string, since: string, events: readonly StravaActivityEvent[]): Topic[] {
    return this.withBadges(importStravaBackfill(this.ctx, athleteId, since, events)) ? ['activities', 'challenge'] : [];
  }

  stravaBackfillsDue(): { athleteId: string; since: string }[] {
    return stravaBackfillsDue(this.ctx);
  }

  stravaCredentials(athleteId: string): StravaCredentials | null {
    return stravaCredentials(this.ctx, athleteId);
  }

  saveStravaTokens(athleteId: string, tokens: StravaCredentials): void {
    saveStravaTokens(this.ctx, athleteId, tokens);
  }

  /** The athlete of the signed-in member's connection; null when she has none. */
  stravaAthlete(sessionHash: string): { ok: true; value: string | null } | { ok: false; error: 'unauthenticated' } {
    const actor = this.memberForSession(sessionHash);
    return actor ? { ok: true, value: stravaAthlete(this.ctx, actor) } : { ok: false, error: 'unauthenticated' };
  }

  /** From the profile, or Strava's deauthorization event; returns the topics that changed. */
  disconnectStrava(athleteId: string): Topic[] {
    return disconnectStrava(this.ctx, athleteId) ? ['strava'] : [];
  }

  query(sessionHash: string, name: string, input: unknown): ApiResult<unknown> {
    const actor = this.memberForSession(sessionHash);
    if (!actor) return failure('unauthenticated');
    const handler = Object.hasOwn(QUERIES, name) ? QUERIES[name as QueryName] : undefined;
    if (!handler) return failure('not_found');
    const value = handler(this.ctx, actor, asInput(input));
    if (value instanceof QueryError) return failure(value.error);
    return value === null ? failure('forbidden') : { ok: true, value };
  }

  command(sessionHash: string, name: string, input: unknown): CommandResult<unknown> {
    const actor = this.memberForSession(sessionHash);
    if (!actor) return failure('unauthenticated');
    const handler = Object.hasOwn(COMMANDS, name) ? COMMANDS[name as CommandName] : undefined;
    if (!handler) return failure('not_found');
    return this.ctx.sql.transaction(() => {
      const result = handler(this.ctx, actor, asInput(input));
      if (result.ok && result.changed.some((t) => t === 'activities' || t === 'challenge')) awardBadges(this.ctx);
      return result;
    });
  }

  /** Badges are earned whenever the activities, the hearts or the chains change. */
  private withBadges(changed: boolean): boolean {
    if (changed) this.ctx.sql.transaction(() => awardBadges(this.ctx));
    return changed;
  }

  /**
   * Runs the time-based jobs that are due (ADR-004: one cron, every few minutes; each job decides
   * whether it is due). Returns the topics that changed, for the open apps.
   */
  tick(): Topic[] {
    this.ctx.sql.run('DELETE FROM sessions WHERE expires_at <= ?', this.ctx.clock.now().toISOString());
    const changed = runChallengeJobs(this.ctx);
    // Also gives the badges of what the app had before they existed.
    this.ctx.sql.transaction(() => awardBadges(this.ctx));
    return changed ? ['challenge', 'history'] : [];
  }
}

function asInput(input: unknown): Input {
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Input) : {};
}
