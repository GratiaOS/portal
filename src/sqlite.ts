// The storage boundary: what the store asks of a SQLite, and nothing more. The SQL the store writes is the same everywhere;
// how a transaction is held, where the schema version is kept and what follows forgetting differ from one home to another.
// Two homes have it: a file through `node:sqlite` (sqlite-node.ts) and a Cloudflare Durable Object (sqlite-object.ts).

export type SqlValue = string | number | bigint | null | Uint8Array;
export type Row = Record<string, unknown>;

export interface Sqlite {
  /** Statements that give nothing back, several at once if joined by `;`. */
  exec(sql: string): void;
  /** One statement, its rows. */
  all(sql: string, ...params: SqlValue[]): Row[];
  /** One statement that writes: how many rows it changed, and the last rowid it gave. */
  run(sql: string, ...params: SqlValue[]): { changes: number; lastInsertRowid: number };
  /** `work` as one transaction: all of it, or nothing of it if it throws. */
  transaction<T>(work: () => T): T;
  /** The schema version of this database, 0 for a new one. Reading it writes nothing. */
  version(): number;
  /** Called inside the migration's transaction. */
  setVersion(version: number): void;
  /** After the portal forgot something: whatever makes the forgotten bytes leave this home's files, where it can. */
  afterForget(): void;
  close(): void;
}
