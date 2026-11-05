// A stand-in for a Durable Object's storage (`ctx.storage`), on node:sqlite, so that the store's tests run against
// objectSqlite without Cloudflare. It refuses what an object refused in spikes/portal-do (RESULTS.md: SQLITE_AUTH for BEGIN,
// COMMIT, ROLLBACK and the PRAGMAs journal_mode, user_version, secure_delete; wal_checkpoint is ours, there is no log of ours
// there), and holds a transaction as transactionSync does: all of it, or nothing if the work throws. The real object is
// checked by the spike's runner (spikes/portal-do/test/run.mjs).

const REFUSED = [/^\s*(BEGIN|COMMIT|ROLLBACK|END)\b/i, /\bPRAGMA\s+(journal_mode|user_version|secure_delete|wal_checkpoint)\b/i];

/** `db` is a node:sqlite DatabaseSync; the tests may also read and write it by hand, past the refusals. */
export function objectStandIn(db) {
  db.exec('PRAGMA foreign_keys = ON'); // on, as on an object
  let depth = 0;
  const sql = {
    exec(query, ...bindings) {
      if (REFUSED.some((refused) => refused.test(query))) throw new Error(`not authorized (SQLITE_AUTH): ${query.trim().slice(0, 60)}`);
      const several = query.trim().replace(/;$/, '').includes(';');
      if (several) {
        db.exec(query);
        return { toArray: () => [] };
      }
      const rows = db.prepare(query).all(...bindings);
      return { toArray: () => rows };
    },
  };
  return {
    sql,
    transactionSync(work) {
      const name = `t${(depth += 1)}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const result = work();
        db.exec(`RELEASE ${name}`);
        return result;
      } catch (err) {
        db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
        throw err;
      } finally {
        depth -= 1;
      }
    },
  };
}
