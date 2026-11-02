import { describe, expect, it } from 'vitest';
import { memorySql } from '../testing/node-sql';
import { migrate } from './schema';

describe('migrate', () => {
  it('capitalizes names stored as Google sent them, and only once', () => {
    const sql = memorySql();
    migrate(sql);
    sql.run("INSERT INTO members (id, email, name, roles, joined_at) VALUES ('m1', 'v@example.com', 'valeria souza', '[]', '2026-01-01')");
    migrate(sql);
    expect(sql.all<{ name: string }>('SELECT name FROM members')).toEqual([{ name: 'Valeria Souza' }]);
  });
});
