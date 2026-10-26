// The one Durable Object that holds the whole group (ADR-004): its SQLite database, and the live
// WebSocket connections of every open app. Calls are processed one at a time, so each command
// runs alone; its writes commit in one transaction.
import { DurableObject } from 'cloudflare:workers';
import type { LiveMessage, Topic } from '../../src/application/api-contract';
import { GroupService } from '../application/group-service';
import type { GoogleProfile, SignInResult } from '../application/members';
import type { NewStravaConnection, StravaActivityEvent } from '../application/strava';
import { durableObjectSql } from '../infrastructure/durable-object-sql';
import type { Env } from './env';

export const SESSION_HASH_HEADER = 'x-app-session-hash';

export class Group extends DurableObject<Env> {
  private readonly service: GroupService;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.service = new GroupService(durableObjectSql(ctx.storage), { now: () => new Date() }, { next: () => crypto.randomUUID() });
    void ctx.blockConcurrencyWhile(async () => this.service.migrate());
  }

  signIn(profile: GoogleProfile, sessionHash: string, bootstrapAdminEmails: string[]): SignInResult {
    return this.service.signIn(profile, sessionHash, bootstrapAdminEmails);
  }

  signOut(sessionHash: string): void {
    this.service.signOut(sessionHash);
  }

  connectStrava(sessionHash: string, connection: NewStravaConnection) {
    const result = this.service.connectStrava(sessionHash, connection);
    if (result.ok) this.broadcast(['strava']);
    return result;
  }

  /** The Strava webhook's activity, already fetched by the Worker (ADR-008). */
  importStravaActivity(athleteId: string, event: StravaActivityEvent): void {
    const changed = this.service.importStravaActivity(athleteId, event);
    if (changed.length > 0) this.broadcast(changed);
  }

  query(sessionHash: string, name: string, input: unknown) {
    return this.service.query(sessionHash, name, input);
  }

  command(sessionHash: string, name: string, input: unknown) {
    const result = this.service.command(sessionHash, name, input);
    if (result.ok && result.changed.length > 0) this.broadcast(result.changed);
    // A removed member's open apps lose the live connection now; their sessions are already gone.
    if (result.ok) for (const memberId of result.disconnect ?? []) this.disconnect(memberId);
    return result;
  }

  tick(): void {
    const changed = this.service.tick();
    if (changed.length > 0) this.broadcast(changed);
  }

  /** Live connection: the Worker already checked the origin and passes the session hash. */
  override async fetch(request: Request): Promise<Response> {
    const member = this.service.memberForSession(request.headers.get(SESSION_HASH_HEADER) ?? '');
    if (!member) return new Response(null, { status: 401 });
    const pair = new WebSocketPair();
    // Hibernation API: idle connections cost nothing; the tag finds a member's sockets.
    this.ctx.acceptWebSocket(pair[1], [member.id]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override webSocketMessage(): void {
    // The app never sends anything but keep-alives; commands go through HTTP.
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    ws.close(code === 1005 ? 1000 : code);
  }

  private disconnect(memberId: string): void {
    for (const ws of this.ctx.getWebSockets(memberId)) {
      try {
        ws.close(4401, 'removed');
      } catch {
        // Already closing.
      }
    }
  }

  private broadcast(topics: readonly Topic[]): void {
    const message: LiveMessage = { type: 'changed', topics };
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // A closing socket; the app reconnects and refetches on its own.
      }
    }
  }
}
