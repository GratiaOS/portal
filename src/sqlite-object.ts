import type { Row, Sqlite, SqlValue } from './sqlite.js';

/**
 * The part of a Cloudflare Durable Object's storage the store uses (`ctx.storage`), written out so that the portal's core
 * needs nothing from Cloudflare: an object passes its own storage in.
 */
export type ObjectStorage = {
  sql: { exec(query: string, ...bindings: unknown[]): { toArray(): Row[] } };
  transactionSync<T>(work: () => T): T;
};

// A Durable Object refuses `BEGIN`, `PRAGMA user_version`, `journal_mode`, `secure_delete` and `wal_checkpoint` (SQLITE_AUTH,
// spikes/portal-do/RESULTS.md); `foreign_keys` is on. So a transaction is `transactionSync`, and the schema version is a table
// of one row, made only when a version is written, so that reading it (and refusing a newer database) writes nothing.
const VERSION_TABLE = '_portal_version';

/** A portal's database as one Durable Object: the second home, on Cloudflare. One object is one portal. */
export function objectSqlite(storage: ObjectStorage): Sqlite {
  const { sql } = storage;
  const rows = (query: string, ...params: SqlValue[]) => sql.exec(query, ...params).toArray();

  return {
    exec(query) {
      sql.exec(query).toArray();
    },
    all: rows,
    run(query, ...params) {
      sql.exec(query, ...params).toArray();
      // the same numbers node:sqlite gives, asked of SQLite itself
      const [{ changes, id }] = rows('SELECT changes() AS changes, last_insert_rowid() AS id') as { changes: number; id: number }[];
      return { changes: Number(changes), lastInsertRowid: Number(id) };
    },
    transaction: (work) => storage.transactionSync(work),
    version() {
      if (!rows("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", VERSION_TABLE).length) return 0;
      const [row] = rows(`SELECT v FROM ${VERSION_TABLE} WHERE id = 1`) as { v: number }[];
      return row ? Number(row.v) : 0;
    },
    setVersion(version) {
      sql.exec(`CREATE TABLE IF NOT EXISTS ${VERSION_TABLE} (id INTEGER PRIMARY KEY CHECK (id = 1), v INTEGER NOT NULL)`).toArray();
      sql.exec(`INSERT INTO ${VERSION_TABLE} (id, v) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET v = excluded.v`, Math.trunc(version)).toArray();
    },
    // there is no log of ours to empty on an object; whether it overwrites what is deleted is Cloudflare's to say
    afterForget() {},
    close() {},
  };
}
