// The single entry to the group's data. The Durable Object calls it; every method is synchronous,
// so a command runs alone and inside one transaction (ADR-004).
import type { ApiResult, CommandName, Commands, QueryName, Queries, Topic } from '../../src/application/api-contract';
import { failure, QueryError, type CommandResult, type Context } from './context';
import { createInvite, listInvites, revokeInvite } from './invites';
import {
  listMembers,
  me,
  memberForSession,
  removeMember,
  rename,
  setRoles,
  signIn,
  signOut,
  type GoogleProfile,
  type Member,
  type SignInResult,
} from './members';
import type { Clock, IdGenerator, Sql } from './ports';
import { migrate } from './schema';

type Input = Record<string, unknown>;

type Handler<T> = (ctx: Context, actor: Member, input: Input) => T;

/** Every query the API answers. A handler returns null when the actor may not see it. */
const QUERIES: { [N in QueryName]: Handler<Queries[N]['output'] | QueryError | null> } = {
  me: (_ctx, actor) => me(actor),
  members: (ctx, actor) => listMembers(ctx, actor),
  invites: (ctx, actor) => listInvites(ctx, actor),
};

/** Every command the API runs; each checks the actor's role itself. */
const COMMANDS: { [N in CommandName]: Handler<CommandResult<Commands[N]['output']>> } = {
  'invite.create': createInvite,
  'invite.revoke': revokeInvite,
  'member.setRoles': setRoles,
  'member.remove': removeMember,
  'member.rename': rename,
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
    return this.ctx.sql.transaction(() => handler(this.ctx, actor, asInput(input)));
  }

  /**
   * Runs the time-based jobs that are due (ADR-004: one cron, every few minutes; each job decides
   * whether it is due). Returns the topics that changed, for the open apps.
   */
  tick(): Topic[] {
    this.ctx.sql.run('DELETE FROM sessions WHERE expires_at <= ?', this.ctx.clock.now().toISOString());
    return [];
  }
}

function asInput(input: unknown): Input {
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Input) : {};
}
