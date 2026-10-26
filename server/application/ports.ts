// Ports the server's use cases depend on. The Durable Object implements them in production;
// tests use node:sqlite (server/testing/). Nothing here imports Cloudflare types.

export type SqlValue = string | number | null;

/** Synchronous SQLite, as the Durable Object's storage provides it. */
export interface Sql {
  all<T = Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): T[];
  run(query: string, ...bindings: SqlValue[]): void;
  /** Runs `fn` atomically: every write inside commits together or not at all. */
  transaction<T>(fn: () => T): T;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
