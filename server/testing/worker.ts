// The Worker and the Group Durable Object in one Node process, for route and contract tests.
// The Durable Object's storage is node:sqlite behind the same `sql.exec` / `transactionSync` API
// the runtime gives, and calls cross an RPC-like boundary: async, with arguments and results
// copied, as between the Worker and the Durable Object in production.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Env } from '../entry/env';
import { Group } from '../entry/group-object';

/** A live connection as the Durable Object sees it: what it sent, and how it was closed. */
export class FakeSocket {
  readonly sent: unknown[] = [];
  closed: { code: number; reason?: string } | null = null;

  send(text: string): void {
    if (this.closed) throw new Error('socket closed');
    this.sent.push(JSON.parse(text));
  }

  close(code: number, reason?: string): void {
    this.closed = { code, reason };
  }
}

export interface FakeDurableObject {
  readonly db: DatabaseSync;
  readonly state: DurableObjectState;
  /** Opens a live connection for the member, as `acceptWebSocket` would. */
  connect(memberId: string): FakeSocket;
}

export function fakeDurableObject(): FakeDurableObject {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const sockets: { ws: FakeSocket; tags: string[] }[] = [];
  let depth = 0;

  const storage = {
    sql: {
      exec(query: string, ...bindings: SQLInputValue[]) {
        // The runtime refuses these; atomic blocks go through transactionSync.
        if (/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(query)) throw new Error('transaction statements are not allowed');
        const rows = db.prepare(query).all(...bindings);
        return { toArray: () => rows };
      },
    },
    transactionSync<T>(fn: () => T): T {
      const name = `t${depth++}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const result = fn();
        db.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw error;
      } finally {
        depth--;
      }
    },
  };

  const state = {
    storage,
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
    acceptWebSocket: (ws: FakeSocket, tags: string[] = []) => sockets.push({ ws, tags }),
    getWebSockets: (tag?: string) => sockets.filter((s) => tag === undefined || s.tags.includes(tag)).map((s) => s.ws),
  } as unknown as DurableObjectState;

  return {
    db,
    state,
    connect(memberId) {
      const ws = new FakeSocket();
      sockets.push({ ws, tags: [memberId] });
      return ws;
    },
  };
}

/** Like an RPC stub: every call is async and its arguments and result are copies. */
function rpc(target: Group): Group {
  return new Proxy(target, {
    get(object, property) {
      const value: unknown = Reflect.get(object, property);
      if (typeof value !== 'function') return value;
      if (property === 'fetch') return (request: Request) => value.call(object, request);
      return async (...args: unknown[]) => structuredClone(await value.apply(object, structuredClone(args)));
    },
  });
}

export interface TestWorker {
  readonly env: Env;
  readonly durableObject: FakeDurableObject;
  readonly assets: Request[];
  /** Evicts the Durable Object: the next call builds a new one over the same storage. */
  restart(): void;
}

export function testWorker(vars: Partial<Env> = {}): TestWorker {
  const durableObject = fakeDurableObject();
  const assets: Request[] = [];
  let instance: Group | null = null;
  const env = {
    ASSETS: {
      fetch: async (request: Request) => {
        assets.push(request);
        return new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } });
      },
    },
    GROUP: {
      idFromName: (name: string) => name,
      get: () => rpc((instance ??= new Group(durableObject.state, env))),
    },
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    BOOTSTRAP_ADMIN_EMAILS: '',
    STRAVA_CLIENT_ID: 'strava-client',
    ...vars,
  } as unknown as Env;
  return { env, durableObject, assets, restart: () => (instance = null) };
}
