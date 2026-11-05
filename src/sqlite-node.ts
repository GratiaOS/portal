import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import type { Row, Sqlite, SqlValue } from './sqlite.js';

/** A portal's database as a file (or `:memory:` for tests), through `node:sqlite`: the first home, a machine of your own. */
export function nodeSqlite(path: string): Sqlite {
  const db = new DatabaseSync(path);
  // secure_delete: what the portal forgets is overwritten in the file, not only unlinked from it
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;');
  const statements = new Map<string, StatementSync>();
  const prepared = (sql: string) => {
    let statement = statements.get(sql);
    if (!statement) statements.set(sql, (statement = db.prepare(sql)));
    return statement;
  };

  return {
    exec: (sql) => db.exec(sql),
    all: (sql, ...params) => prepared(sql).all(...params) as Row[],
    run(sql, ...params: SqlValue[]) {
      const { changes, lastInsertRowid } = prepared(sql).run(...params);
      return { changes: Number(changes), lastInsertRowid: Number(lastInsertRowid) };
    },
    transaction<T>(work: () => T): T {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = work();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    version: () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
    setVersion: (version) => db.exec(`PRAGMA user_version = ${Math.trunc(version)};`),
    // the write-ahead log still holds the frames written before, the forgotten text among them: they go into the file, where
    // secure_delete has overwritten it, and the log is emptied
    afterForget: () => db.exec('PRAGMA wal_checkpoint(TRUNCATE);'),
    close: () => db.close(),
  };
}
