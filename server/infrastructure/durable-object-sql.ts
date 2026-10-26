// The Sql port over the Durable Object's SQLite storage.
import type { Sql, SqlValue } from '../application/ports';

export function durableObjectSql(storage: DurableObjectStorage): Sql {
  return {
    all: <T>(query: string, ...bindings: SqlValue[]) => storage.sql.exec(query, ...bindings).toArray() as T[],
    run: (query, ...bindings) => {
      storage.sql.exec(query, ...bindings).toArray();
    },
    // Durable Objects forbid BEGIN/COMMIT; transactionSync is the atomic block.
    transaction: (fn) => storage.transactionSync(fn),
  };
}
