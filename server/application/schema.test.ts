import { describe, expect, it } from 'vitest';
import { memorySql } from '../testing/node-sql';
import { migrate, MIGRATIONS } from './schema';

describe('migration 11 (challenge status)', () => {
  it('archives the 30h challenge with each Senhora\'s total, and leaves the others', () => {
    const sql = memorySql();
    sql.run('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    MIGRATIONS.slice(0, 10).forEach((statements, index) => {
      for (const statement of statements) sql.run(statement);
      sql.run("INSERT INTO schema_migrations (version, applied_at) VALUES (?, '2026-01-01')", index + 1);
    });
    sql.run("INSERT INTO members (id, email, name, roles, joined_at) VALUES ('a', 'a@x.com', 'Ana', '[]', '2026-01-01'), ('b', 'b@x.com', 'Bia', '[]', '2026-01-01')");
    const challenge = (id: string, name: string, state: string, closedAt: string | null, endsAt: string, endedAt: string | null) =>
      sql.run(
        'INSERT INTO challenges (id, type, name, creator_id, starts_at, ends_at, state, ended_at, closed_at, config, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, 'horas_colaborativas', name, 'a', '2026-10-01T00:00:00.000Z', endsAt, state, endedAt, closedAt, '{}', '2026-10-01T00:00:00.000Z',
      );
    challenge('thirty', 'Desafio 30h', 'succeeded', null, '2999-01-01T00:00:00.000Z', '2026-11-05T00:00:00.000Z');
    challenge('old', 'Antigo', 'succeeded', '2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    challenge('over', 'Passou', 'failed', null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    challenge('now', 'Agora', 'open', null, '2999-01-01T00:00:00.000Z', null);
    sql.run("INSERT INTO challenge_members (challenge_id, member_id, response) VALUES ('thirty', 'a', 'accepted'), ('thirty', 'b', 'declined')");
    const activity = (id: string, member: string, at: string, seconds: number) =>
      sql.run("INSERT INTO activities (id, member_id, source, started_at, timezone, duration_seconds, sport, created_at) VALUES (?, ?, 'manual', ?, 'UTC', ?, 'Run', ?)", id, member, at, seconds, at);
    activity('x1', 'a', '2026-10-10T08:00:00.000Z', 3600);
    activity('x2', 'a', '2026-11-06T08:00:00.000Z', 3600); // after the goal was hit: does not count
    activity('x3', 'b', '2026-10-10T08:00:00.000Z', 3600); // torcida: does not count

    migrate(sql);

    expect(sql.all('SELECT id, status FROM challenges ORDER BY id')).toEqual([
      { id: 'now', status: 'active' },
      { id: 'old', status: 'archived' },
      { id: 'over', status: 'finished' },
      { id: 'thirty', status: 'archived' },
    ]);
    expect(sql.all('SELECT closed_at IS NOT NULL AS closed FROM challenges WHERE id = ?', 'thirty')).toEqual([{ closed: 1 }]);
    expect(sql.all('SELECT name, total_seconds FROM challenge_results WHERE challenge_id = ?', 'thirty')).toEqual([{ name: 'Ana', total_seconds: 3600 }]);
  });
});

describe('migrate', () => {
  it('capitalizes names stored as Google sent them, and only once', () => {
    const sql = memorySql();
    migrate(sql);
    sql.run("INSERT INTO members (id, email, name, roles, joined_at) VALUES ('m1', 'v@example.com', 'valeria souza', '[]', '2026-01-01')");
    migrate(sql);
    expect(sql.all<{ name: string }>('SELECT name FROM members')).toEqual([{ name: 'Valeria Souza' }]);
  });
});
