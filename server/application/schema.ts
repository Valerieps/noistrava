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
  // 2: each member's Strava connection (ADR-008). Tokens are encrypted before they get here.
  [
    `CREATE TABLE strava_connections (
      member_id TEXT PRIMARY KEY REFERENCES members(id),
      athlete_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      expires_at TEXT,
      include_private INTEGER NOT NULL,
      consented_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE INDEX strava_connections_athlete ON strava_connections(athlete_id)`,
  ],
  // 3: the member's time zone, activities and the collective-hours challenge.
  [
    `ALTER TABLE members ADD COLUMN timezone TEXT`,
    `CREATE TABLE activities (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES members(id),
      source TEXT NOT NULL,
      strava_id TEXT UNIQUE,
      started_at TEXT NOT NULL,
      timezone TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      sport TEXT NOT NULL,
      edited_by_member INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX activities_started ON activities(started_at)`,
    `CREATE INDEX activities_member ON activities(member_id, started_at)`,
    `CREATE TABLE challenges (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      creator_id TEXT NOT NULL REFERENCES members(id),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      state TEXT NOT NULL,
      ended_at TEXT,
      closes_at TEXT,
      closed_at TEXT,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE challenge_members (
      challenge_id TEXT NOT NULL REFERENCES challenges(id),
      member_id TEXT NOT NULL REFERENCES members(id),
      response TEXT NOT NULL,
      responded_at TEXT,
      PRIMARY KEY (challenge_id, member_id)
    )`,
    `CREATE TABLE challenge_absences (
      challenge_id TEXT NOT NULL REFERENCES challenges(id),
      member_id TEXT NOT NULL REFERENCES members(id),
      left_at TEXT NOT NULL,
      returned_at TEXT,
      PRIMARY KEY (challenge_id, member_id, left_at)
    )`,
    `CREATE TABLE reactions (
      activity_id TEXT NOT NULL REFERENCES activities(id),
      challenge_id TEXT NOT NULL REFERENCES challenges(id),
      member_id TEXT NOT NULL REFERENCES members(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (activity_id, challenge_id, member_id)
    )`,
    `CREATE TABLE challenge_milestones (
      challenge_id TEXT NOT NULL REFERENCES challenges(id),
      milestone TEXT NOT NULL,
      reached_at TEXT NOT NULL,
      PRIMARY KEY (challenge_id, milestone)
    )`,
    `CREATE TABLE challenge_results (
      challenge_id TEXT NOT NULL REFERENCES challenges(id),
      member_id TEXT NOT NULL,
      name TEXT NOT NULL,
      total_seconds INTEGER NOT NULL,
      PRIMARY KEY (challenge_id, member_id)
    )`,
  ],
  // 4: drafts keep the creator's answer until she activates them.
  [`ALTER TABLE challenges ADD COLUMN creator_is_senhora INTEGER`],
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
