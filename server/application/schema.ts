// The group's database (docs/ARQUITETURA.md). Migrations run in order, once each, when the
// Durable Object starts. Never edit a migration that has shipped: add the next one.
import type { Sql } from './ports';

export const MIGRATIONS: readonly (readonly string[])[] = [
  // 1: members, their sessions and the invites.
  [
    `CREATE TABLE members (
      id TEXT PRIMARY KEY,
      google_sub TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      photo_url TEXT,
      roles TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      joined_at TEXT NOT NULL,
      removed_at TEXT
    )`,
    `CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES members(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`,
    `CREATE INDEX sessions_member ON sessions(member_id)`,
    `CREATE TABLE invites (
      email TEXT PRIMARY KEY,
      invited_by TEXT NOT NULL REFERENCES members(id),
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      accepted_at TEXT,
      revoked_at TEXT
    )`,
  ],
];

export function migrate(sql: Sql): void {
  sql.run('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const [{ current }] = sql.all<{ current: number | null }>('SELECT MAX(version) AS current FROM schema_migrations');
  for (let version = (current ?? 0) + 1; version <= MIGRATIONS.length; version++) {
    sql.transaction(() => {
      for (const statement of MIGRATIONS[version - 1]) sql.run(statement);
      sql.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', version, new Date().toISOString());
    });
  }
}
