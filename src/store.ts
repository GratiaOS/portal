import { randomUUID } from 'node:crypto';
import { ALIAS_PATTERN, CONVERSATION_ID_PATTERN, GAP_REASONS, MAX_TEXT_LENGTH, PARTICIPANT_KINDS, RoomError, VISIBILITIES, isSign, participantId } from './domain.js';
import type { Binding, RoomKind } from './authority.js';
import type { Conversation, ConversationStatus, GapReason, KnowledgeGap, Participant, ParticipantKind, Turn, Visibility } from './domain.js';
import { mayKnow } from './access.js';
import { extractMentions } from './mentions.js';
import type { Row, Sqlite } from './sqlite.js';

export type ParticipantInput = {
  kind: ParticipantKind;
  alias: string;
  locale?: string;
  capabilities?: string[];
  /** The sign a person is given by the config; the one they choose themselves, if any, is shown instead. */
  sign?: string;
  /** A person's earlier alias, when they have been renamed: what they said, and their place, move to the new one. Said once; when the old one is no longer there, it does nothing. */
  renamedFrom?: string;
};

export type ConversationInput = {
  id: string;
  title: string;
  /** `team` unless said; `guest` makes the one kind of room a guest may be in. */
  kind?: RoomKind;
  visibility?: Visibility;
  tags?: string[];
};

/** What a portal keeps: the last `days` and, of each room, the last `messages`, whichever ends first; or everything. */
export type Retention = { days: number; messages: number } | 'forever';

export const DEFAULT_RETENTION: Retention = { days: 14, messages: 999 };

export type StoreOptions = {
  /** For tests; the store never reads the clock any other way. */
  now?: () => Date;
};

const DEFAULT_PAGE = 50;
const MAX_PAGE = 200;
const DEFAULT_RESUME = 500;
const MAX_RESUME = 1000;

const TURNS_NO_UPDATE = "CREATE TRIGGER turns_no_update BEFORE UPDATE ON turns BEGIN SELECT RAISE(ABORT, 'turns are append-only'); END;";

const SCHEMA_V1 = `
CREATE TABLE participants (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  alias        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  locale       TEXT,
  capabilities TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL
);

CREATE TABLE conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  status     TEXT NOT NULL DEFAULT 'open',
  tags       TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE turns (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,
  id              TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  speaker_id      TEXT NOT NULL REFERENCES participants(id),
  text            TEXT NOT NULL,
  mentions        TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL
);
CREATE INDEX turns_by_conversation ON turns(conversation_id, seq);

-- A turn is written once and never changed. (V1 also refused its removal; V3 lets the portal forget, see forget().)
${TURNS_NO_UPDATE}
CREATE TRIGGER turns_no_delete BEFORE DELETE ON turns BEGIN SELECT RAISE(ABORT, 'turns are append-only'); END;
`;

// Questions the knowledge could not answer. There is no column for who asked, and the day, not the hour, is kept:
// this is a list of what the knowledge lacks, and it must not become a list of what people wondered.
const SCHEMA_V2 = `
CREATE TABLE knowledge_gaps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  day             TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  question        TEXT NOT NULL,
  key             TEXT NOT NULL, -- the question in one form, so the same question asked twice is counted once
  why             TEXT NOT NULL,
  sources         TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX knowledge_gaps_by_key ON knowledge_gaps(key);
`;

// A portal forgets by default: a turn is removed when it is older than what the portal keeps (decision 12), and only then. It is
// still never changed, and nothing else removes it.
const SCHEMA_V3 = `
DROP TRIGGER IF EXISTS turns_no_delete;
`;

// Turns by time: what was said lately is asked for when a portal begins again (its rate limit counts it), and forgetting asks
// for what is older than it keeps.
const SCHEMA_V4 = `
CREATE INDEX IF NOT EXISTS turns_by_time ON turns(created_at);
`;

// The sign after a name: the one given by the config (synced at each start) and the one the person chose (only by them). Only
// the current one is kept: no column says when it changed, and nothing keeps what it was.
// A column is added only where it is missing: SQLite has no ADD COLUMN IF NOT EXISTS.
const SCHEMA_V5 = (db: Sqlite) => {
  const have = new Set(db.all('PRAGMA table_info(participants)').map((column) => column.name));
  for (const column of ['given_sign', 'sign']) if (!have.has(column)) db.exec(`ALTER TABLE participants ADD COLUMN ${column} TEXT;`);
};

// What a guest may do, and where: a room is of a kind (`team` unless it is a guest room), and a binding is the temporary right of one
// participant to exercise one role in one room (authority.ts). A binding is never removed by the portal here: it simply ends, and
// what ended is no authority. Nothing in a binding says what the guest said or when they came.
const SCHEMA_V6 = (db: Sqlite) => {
  const have = new Set(db.all('PRAGMA table_info(conversations)').map((column) => column.name));
  if (!have.has('kind')) db.exec("ALTER TABLE conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'team';");
  db.exec(`CREATE TABLE IF NOT EXISTS bindings (
    id             TEXT PRIMARY KEY,
    room_id        TEXT NOT NULL REFERENCES conversations(id),
    participant_id TEXT NOT NULL REFERENCES participants(id),
    role_id        TEXT NOT NULL,
    active_from    INTEGER NOT NULL,
    expires_at     INTEGER NOT NULL,
    budget         INTEGER NOT NULL,
    ledger_id      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS bindings_by_participant ON bindings(participant_id);`);
};

// The key a guest was given: only its digest is kept, so a copy of the database holds no way in. It points at the guest and says nothing of
// when it was made or from where.
const SCHEMA_V7 = `
CREATE TABLE IF NOT EXISTS guest_keys (
  digest         TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id)
);
`;

// The ledger of questions to the companion: a line per question asked, counted before the model is called. It holds which ledger (the one
// of a binding) and when, in milliseconds, and nothing of what was asked or by whom beyond that. A day later it is forgotten.
const SCHEMA_V8 = `
CREATE TABLE IF NOT EXISTS ledger_entries (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id TEXT NOT NULL,
  at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_by_ledger ON ledger_entries(ledger_id);
CREATE INDEX IF NOT EXISTS ledger_by_time ON ledger_entries(at);
`;

/** One entry per version: a database at version n gets the entries from n on, and keeps what it has. */
const MIGRATIONS: (string | ((db: Sqlite) => void))[] = [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8];
const SCHEMA_VERSION = MIGRATIONS.length;

function clamp(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

/**
 * What makes two questions the same: case, accents and the closing punctuation do not count, because people type
 * "sări" and "sari" alike. Done here, not by SQLite, whose lower() leaves "Ă" and "Ș" as they are.
 */
function sameQuestion(question: string): string {
  return question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[?!.\s]+$/, '');
}

function toParticipant(row: Row): Participant {
  const sign = (row.sign ?? row.given_sign) as string | null | undefined;
  return {
    id: row.id as string,
    kind: row.kind as ParticipantKind,
    alias: row.alias as string,
    ...(row.locale ? { locale: row.locale as string } : {}),
    capabilities: JSON.parse(row.capabilities as string) as string[],
    ...(sign ? { sign } : {}),
  };
}

function toConversation(row: Row): Conversation {
  return {
    id: row.id as string,
    title: row.title as string,
    kind: (row.kind ?? 'team') as RoomKind,
    visibility: row.visibility as Visibility,
    status: row.status as ConversationStatus,
    tags: JSON.parse(row.tags as string) as string[],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toTurn(row: Row): Turn {
  return {
    seq: row.seq as number,
    id: row.id as string,
    conversationId: row.conversation_id as string,
    speakerId: row.speaker_id as string,
    text: row.text as string,
    mentions: JSON.parse(row.mentions as string) as string[],
    createdAt: row.created_at as string,
  };
}

export class RoomStore {
  private readonly db: Sqlite;
  private readonly now: () => Date;

  /** `db` is the portal's database in one of its homes: `nodeSqlite(path)` for a file (`:memory:` for tests), `objectSqlite(storage)` on a Durable Object. */
  constructor(db: Sqlite, options: StoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.db = db;

    const version = this.db.version();
    if (version > SCHEMA_VERSION) throw new Error(`portal database is version ${version}, this portal understands up to ${SCHEMA_VERSION}`);
    for (let at = version; at < SCHEMA_VERSION; at += 1)
      this.transaction(() => {
        const step = MIGRATIONS[at]!;
        if (typeof step === 'string') this.db.exec(step);
        else step(this.db);
        this.db.setVersion(at + 1);
      });
  }

  close(): void {
    this.db.close();
  }

  private transaction<T>(work: () => T): T {
    return this.db.transaction(work);
  }

  private one(sql: string, ...params: (string | number | null)[]): Row | undefined {
    return this.db.all(sql, ...params)[0];
  }

  // --- who and where: written from the config at start, never from a request ---

  /** Adds new participants and updates the known ones. Nobody is removed: history points at them. */
  syncParticipants(inputs: ParticipantInput[]): void {
    const at = this.now().toISOString();
    // the given sign follows the config; the one a person chose is theirs, and a start does not touch it
    const upsert = `INSERT INTO participants (id, kind, alias, locale, capabilities, given_sign, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET alias = excluded.alias, locale = excluded.locale, capabilities = excluded.capabilities, given_sign = excluded.given_sign`;
    this.transaction(() => {
      for (const input of inputs) if (input.renamedFrom !== undefined) this.renameParticipant(input);
      for (const input of inputs) {
        if (!PARTICIPANT_KINDS.includes(input.kind)) throw new RoomError('invalid', `unknown participant kind "${input.kind}"`);
        if (!ALIAS_PATTERN.test(input.alias)) throw new RoomError('invalid', `"${input.alias}" is not a valid alias`);
        const id = participantId(input.kind, input.alias);
        // an alias is what people type after `@`, so it names one participant only
        const taken = this.one('SELECT id FROM participants WHERE alias = ?', input.alias) as { id: string } | undefined;
        if (taken && taken.id !== id) throw new RoomError('invalid', `alias "${input.alias}" already belongs to ${taken.id}`);
        if (input.sign !== undefined && input.kind !== 'human') throw new RoomError('invalid', `"${input.alias}" is not a person: a sign is for the people in the room`);
        if (input.sign !== undefined && !isSign(input.sign)) throw new RoomError('invalid', `the sign of "${input.alias}" must be one emoji`);
        this.db.run(upsert, id, input.kind, input.alias, input.locale ?? null, JSON.stringify(input.capabilities ?? []), input.sign ?? null, at);
      }
    });
  }

  /**
   * A person who has been renamed keeps what they said and who they are: the row, the sign they chose, their bindings, and every turn of
   * theirs (and every mention of them) move to the new name. A turn is still never changed in what it says, only in whose it is, and the
   * trigger that refuses an update is put back at once. It runs inside `syncParticipants`' transaction, and only when the old one is there
   * and the new one is not, so a config that still says `renamedFrom` changes nothing the second time.
   */
  private renameParticipant(input: ParticipantInput): void {
    const from = input.renamedFrom as string;
    if (input.kind !== 'human') throw new RoomError('invalid', `"${input.alias}" is not a person: only people are renamed`);
    if (!ALIAS_PATTERN.test(from)) throw new RoomError('invalid', `"${from}" is not a valid alias`);
    const oldId = participantId(input.kind, from);
    const newId = participantId(input.kind, input.alias);
    if (oldId === newId) return;
    if (!this.one('SELECT id FROM participants WHERE id = ?', oldId) || this.one('SELECT id FROM participants WHERE id = ?', newId)) return;
    const taken = this.one('SELECT id FROM participants WHERE alias = ?', input.alias) as { id: string } | undefined;
    if (taken) throw new RoomError('invalid', `alias "${input.alias}" already belongs to ${taken.id}`);
    this.db.run(
      'INSERT INTO participants (id, kind, alias, locale, capabilities, given_sign, sign, created_at) SELECT ?, kind, ?, locale, capabilities, given_sign, sign, created_at FROM participants WHERE id = ?',
      newId, input.alias, oldId,
    );
    this.db.run('UPDATE bindings SET participant_id = ? WHERE participant_id = ?', newId, oldId);
    this.db.run('UPDATE guest_keys SET participant_id = ? WHERE participant_id = ?', newId, oldId);
    this.db.exec('DROP TRIGGER turns_no_update');
    this.db.run('UPDATE turns SET speaker_id = ? WHERE speaker_id = ?', newId, oldId);
    this.db.run('UPDATE turns SET mentions = REPLACE(mentions, ?, ?) WHERE mentions LIKE ?', `"${oldId}"`, `"${newId}"`, `%"${oldId}"%`);
    this.db.exec(TURNS_NO_UPDATE);
    this.db.run('DELETE FROM participants WHERE id = ?', oldId);
  }

  /** Adds new conversations and updates title, visibility and tags. A closed conversation stays closed. */
  syncConversations(inputs: ConversationInput[]): void {
    const at = this.now().toISOString();
    const upsert = `INSERT INTO conversations (id, title, kind, visibility, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, kind = excluded.kind, visibility = excluded.visibility, tags = excluded.tags`;
    this.transaction(() => {
      for (const input of inputs) {
        if (!CONVERSATION_ID_PATTERN.test(input.id)) throw new RoomError('invalid', `"${input.id}" is not a valid conversation id`);
        const visibility = input.visibility ?? 'private';
        if (!VISIBILITIES.includes(visibility)) throw new RoomError('invalid', `unknown visibility "${visibility}"`);
        const kind = input.kind ?? 'team';
        if (kind !== 'team' && kind !== 'guest') throw new RoomError('invalid', `unknown room kind "${kind}"`);
        this.db.run(upsert, input.id, input.title, kind, visibility, JSON.stringify(input.tags ?? []), at, at);
      }
    });
  }

  listParticipants(): Participant[] {
    return (this.db.all('SELECT * FROM participants ORDER BY alias') as Row[]).map(toParticipant);
  }

  getParticipant(id: string): Participant | undefined {
    const row = this.one('SELECT * FROM participants WHERE id = ?', id) as Row | undefined;
    return row && toParticipant(row);
  }

  // --- guests: made while the portal runs, bound to one room, never written by the config ---

  /** Makes a guest, who can do nothing until a binding gives them something. The alias is the name of the hour (`owl`). */
  addGuest(alias: string, locale?: string): Participant {
    if (!ALIAS_PATTERN.test(alias)) throw new RoomError('invalid', `"${alias}" is not a valid alias`);
    const id = participantId('guest', alias);
    if (this.one('SELECT id FROM participants WHERE alias = ?', alias)) throw new RoomError('invalid', `alias "${alias}" is taken`);
    this.db.run('INSERT INTO participants (id, kind, alias, locale, capabilities, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, 'guest', alias, locale ?? null, '[]', this.now().toISOString());
    return this.getParticipant(id) as Participant;
  }

  /** Gives a participant the temporary right to exercise a role in a room. Only a guest room takes a guest. */
  addBinding(binding: Binding): void {
    const room = this.getConversation(binding.roomId);
    if (!room) throw new RoomError('not_found', `no conversation "${binding.roomId}"`);
    const who = this.getParticipant(binding.participantId);
    if (!who) throw new RoomError('not_found', `no participant "${binding.participantId}"`);
    if (who.kind === 'guest' && room.kind !== 'guest') throw new RoomError('invalid', `"${room.id}" is not a guest room`);
    // a guest is kept to one room: a second binding for the same room is a renewal, for another room it is refused
    if (who.kind === 'guest' && this.bindingsOf(who.id).some((other) => other.roomId !== binding.roomId)) {
      throw new RoomError('invalid', `"${who.alias}" is a guest of another room`);
    }
    this.db.run(
      'INSERT INTO bindings (id, room_id, participant_id, role_id, active_from, expires_at, budget, ledger_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      binding.id, binding.roomId, binding.participantId, binding.roleId, binding.activeFrom, binding.expiresAt, binding.budget, binding.ledgerId,
    );
  }

  /**
   * Makes a guest, binds them to a room, and keeps the digest of their key, all or nothing. The key itself is the caller's to hand over
   * once; it is not kept. Only a guest room takes a guest.
   */
  createGuest(input: { alias: string; room: string; activeFrom: number; expiresAt: number; budget: number; keyDigest: string; locale?: string }): Participant {
    return this.transaction(() => {
      const guest = this.addGuest(input.alias, input.locale);
      this.addBinding({
        id: randomUUID(),
        roomId: input.room,
        participantId: guest.id,
        roleId: 'guest',
        activeFrom: input.activeFrom,
        expiresAt: input.expiresAt,
        budget: input.budget,
        ledgerId: randomUUID(),
      });
      this.db.run('INSERT INTO guest_keys (digest, participant_id) VALUES (?, ?)', input.keyDigest, guest.id);
      return guest;
    });
  }

  /**
   * Ends a guest's time now: every binding of theirs that is still running ends at `now`, so their key opens nothing and the room has one
   * guest fewer. What they said stays, and so does the guest, until the room ends by absence. Returns how many bindings ended.
   */
  endGuestBindings(participantId: string, now: number): number {
    return this.db.run(
      "UPDATE bindings SET expires_at = ? WHERE participant_id = ? AND expires_at > ? AND participant_id IN (SELECT id FROM participants WHERE kind = 'guest')",
      now,
      participantId,
      now,
    ).changes;
  }

  /** The guest a key (by its digest) belongs to, if any. */
  participantByGuestKey(keyDigest: string): string | undefined {
    return (this.one('SELECT participant_id FROM guest_keys WHERE digest = ?', keyDigest) as { participant_id: string } | undefined)?.participant_id;
  }

  /**
   * Counts one question to the companion against a binding's ledger, or says why not: `spent` when that ledger has had its budget,
   * `hour` when all the questions of the last hour are at what the portal allows. Counted here, before the model is called, so that a
   * model that fails, or a question asked again at once, still costs: the bound is on asking, not on answering.
   */
  spendQuestion(input: { ledgerId: string; budget: number; now: number; perHour: number }): 'ok' | 'spent' | 'hour' {
    return this.transaction(() => {
      const own = (this.one('SELECT COUNT(*) AS n FROM ledger_entries WHERE ledger_id = ?', input.ledgerId) as { n: number }).n;
      if (own >= input.budget) return 'spent';
      const lately = (this.one('SELECT COUNT(*) AS n FROM ledger_entries WHERE at > ?', input.now - 3_600_000) as { n: number }).n;
      if (lately >= input.perHour) return 'hour';
      this.db.run('INSERT INTO ledger_entries (ledger_id, at) VALUES (?, ?)', input.ledgerId, input.now);
      return 'ok';
    });
  }

  /** How many questions a ledger has had, for whoever shows it. */
  questionsAsked(ledgerId: string): number {
    return (this.one('SELECT COUNT(*) AS n FROM ledger_entries WHERE ledger_id = ?', ledgerId) as { n: number }).n;
  }

  /** How many guests have a binding that is in its time now: the ones the portal is hosting. */
  countActiveGuests(now: number): number {
    const row = this.one(
      `SELECT COUNT(DISTINCT b.participant_id) AS n FROM bindings b JOIN participants p ON p.id = b.participant_id
        WHERE p.kind = 'guest' AND b.active_from <= ? AND b.expires_at > ?`,
      now,
      now,
    ) as { n: number };
    return row.n;
  }

  bindingsOf(participantId: string): Binding[] {
    return (this.db.all('SELECT * FROM bindings WHERE participant_id = ? ORDER BY active_from', participantId) as Row[]).map((row) => ({
      id: row.id as string,
      roomId: row.room_id as string,
      participantId: row.participant_id as string,
      roleId: row.role_id as string,
      activeFrom: row.active_from as number,
      expiresAt: row.expires_at as number,
      budget: row.budget as number,
      ledgerId: row.ledger_id as string,
    }));
  }

  listConversations(): Conversation[] {
    return (this.db.all('SELECT * FROM conversations ORDER BY id') as Row[]).map(toConversation);
  }

  getConversation(id: string): Conversation | undefined {
    const row = this.one('SELECT * FROM conversations WHERE id = ?', id) as Row | undefined;
    return row && toConversation(row);
  }

  /** A person's own sign, one emoji; `null` lets it go, and the given one shows again. Only the new one is kept. */
  setSign(participantId: string, sign: string | null): Participant {
    if (sign !== null && !isSign(sign)) throw new RoomError('invalid', 'a sign is one emoji');
    const { changes } = this.db.run("UPDATE participants SET sign = ? WHERE id = ? AND kind = 'human'", sign, participantId);
    if (!changes) throw new RoomError('not_found', `no person "${participantId}"`);
    return this.getParticipant(participantId) as Participant;
  }

  setConversationStatus(id: string, status: ConversationStatus): void {
    const { changes } = this.db.run('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?', status, this.now().toISOString(), id);
    if (!changes) throw new RoomError('not_found', `no conversation "${id}"`);
  }

  // --- turns ---

  appendTurn(input: { conversationId: string; speakerId: string; text: string }): Turn {
    const text = input.text.normalize('NFC').trim();
    if (!text) throw new RoomError('invalid', 'text is empty');
    if (text.length > MAX_TEXT_LENGTH) throw new RoomError('invalid', `text is longer than ${MAX_TEXT_LENGTH} characters`);

    return this.transaction(() => {
      const conversation = this.getConversation(input.conversationId);
      if (!conversation) throw new RoomError('not_found', `no conversation "${input.conversationId}"`);
      if (conversation.status === 'closed') throw new RoomError('closed', `conversation "${conversation.id}" is closed`);
      const speaker = this.getParticipant(input.speakerId);
      if (!speaker) throw new RoomError('not_found', `no participant "${input.speakerId}"`);

      const id = randomUUID();
      const createdAt = this.now().toISOString();
      // a name is resolved only among those the speaker may know of: a guest who types @zeus must not learn, from what comes back, that there is one
      const mentions = extractMentions(text, this.listParticipants().filter((other) => mayKnow(speaker, other)));

      const { lastInsertRowid } = this.db.run('INSERT INTO turns (id, conversation_id, speaker_id, text, mentions, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, conversation.id, input.speakerId, text, JSON.stringify(mentions), createdAt);
      this.db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', createdAt, conversation.id);

      return { seq: lastInsertRowid, id, conversationId: conversation.id, speakerId: input.speakerId, text, mentions, createdAt };
    });
  }

  /** The last `limit` turns of a conversation, oldest first. Pass the first turn's `seq` as `before` for the page behind it. */
  listTurns(conversationId: string, options: { before?: number; limit?: number } = {}): Turn[] {
    if (!this.getConversation(conversationId)) throw new RoomError('not_found', `no conversation "${conversationId}"`);
    const before = options.before ?? null;
    const rows = this.db.all('SELECT * FROM turns WHERE conversation_id = ? AND (? IS NULL OR seq < ?) ORDER BY seq DESC LIMIT ?', conversationId, before, before, clamp(options.limit, DEFAULT_PAGE, MAX_PAGE)) as Row[];
    return rows.map(toTurn).reverse();
  }

  /** Every turn after `seq`, across all conversations, oldest first: what a client missed while it was away. */
  turnsAfter(seq: number, limit?: number): Turn[] {
    const rows = this.db.all('SELECT * FROM turns WHERE seq > ? ORDER BY seq LIMIT ?', seq, clamp(limit, DEFAULT_RESUME, MAX_RESUME)) as Row[];
    return rows.map(toTurn);
  }

  /** Who spoke since `since` (an ISO time), and when, oldest first: nothing of what they said. */
  spokenSince(since: string): { speakerId: string; createdAt: string }[] {
    return (this.db.all('SELECT speaker_id, created_at FROM turns WHERE created_at > ? ORDER BY seq', since) as Row[]).map((row) => ({
      speakerId: row.speaker_id as string,
      createdAt: row.created_at as string,
    }));
  }

  // --- what the knowledge lacked ---

  /** Notes a question that could not be answered. Only the question and why: not who asked. */
  recordGap(input: { conversationId: string; question: string; why: GapReason; sources?: string[] }): void {
    const question = input.question.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
    if (!question) throw new RoomError('invalid', 'the question is empty');
    if (!GAP_REASONS.includes(input.why)) throw new RoomError('invalid', `unknown reason "${input.why}"`);
    if (!this.getConversation(input.conversationId)) throw new RoomError('not_found', `no conversation "${input.conversationId}"`);
    this.db.run('INSERT INTO knowledge_gaps (day, conversation_id, question, key, why, sources) VALUES (?, ?, ?, ?, ?, ?)', this.now().toISOString().slice(0, 10), input.conversationId, question, sameQuestion(question), input.why, JSON.stringify(input.sources ?? []));
  }

  /** The questions that went unanswered, the most asked first. The same question asked again (in any case) counts once, with how often. */
  listGaps(limit?: number): KnowledgeGap[] {
    const rows = this.db.all(`SELECT g.question, g.why, g.sources, g.conversation_id, a.asked, a.first_day, a.last_day
           FROM knowledge_gaps g
           JOIN (SELECT MAX(id) AS id, COUNT(*) AS asked, MIN(day) AS first_day, MAX(day) AS last_day
                   FROM knowledge_gaps GROUP BY key) a ON a.id = g.id
          ORDER BY a.asked DESC, g.id DESC
          LIMIT ?`, clamp(limit, DEFAULT_PAGE, MAX_PAGE)) as Row[];
    return rows.map((row) => ({
      question: row.question as string,
      why: row.why as GapReason,
      sources: JSON.parse(row.sources as string) as string[],
      asked: row.asked as number,
      firstDay: row.first_day as string,
      lastDay: row.last_day as string,
      conversationId: row.conversation_id as string,
    }));
  }

  /**
   * Lets go of what the portal no longer keeps: the turns older than `retention.days`, and in each room the turns beyond its last
   * `retention.messages`, whichever ends first; and the knowledge gaps asked on a day older than that. The numbers say how many.
   * `seq` is never given again (AUTOINCREMENT), so a client resuming after a forgotten turn misses nothing it could still read.
   */
  forget(retention: Retention): { turns: number; gaps: number } {
    // a ledger line has done its work after a day (a binding is never longer): this is not what a person said, so no retention asks for it
    this.db.run('DELETE FROM ledger_entries WHERE at < ?', this.now().getTime() - 25 * 3_600_000);
    if (retention === 'forever') return { turns: 0, gaps: 0 };
    const cutoff = new Date(this.now().getTime() - retention.days * 86_400_000).toISOString();
    const forgotten = this.transaction(() => {
      const old = this.db.run('DELETE FROM turns WHERE created_at < ?', cutoff).changes;
      const many = this.db.run(
        `DELETE FROM turns WHERE seq IN (
           SELECT seq FROM (SELECT seq, ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY seq DESC) AS place FROM turns)
            WHERE place > ?)`,
        retention.messages,
      ).changes;
      const gaps = this.db.run('DELETE FROM knowledge_gaps WHERE day < ?', cutoff.slice(0, 10)).changes;
      return { turns: old + many, gaps };
    });
    // what the home does after forgetting: on a file, the write-ahead log is emptied into it (see sqlite-node.ts)
    if (forgotten.turns || forgotten.gaps) this.db.afterForget();
    return forgotten;
  }

  /**
   * A guest room ends by absence: when no guest of it has a binding in its time, and the last binding ended `afterMs` ago or more, what was
   * said there is let go, and so are the guests of it, their keys and their bindings, so the next visitors find an empty room and no one of
   * the last ones on the roster. A room with someone in it is never touched, and neither is a team room. The ledger of questions stays (it
   * is the portal's ceiling per hour, and it holds no one's name): it is forgotten by its own clock. Returns how many turns and guests.
   */
  forgetEmptyGuestRooms(afterMs: number): { turns: number; guests: number } {
    const now = this.now().getTime();
    const total = { turns: 0, guests: 0 };
    for (const room of this.listConversations().filter((r) => r.kind === 'guest')) {
      const span = this.one('SELECT MAX(expires_at) AS last, MAX(CASE WHEN expires_at > ? THEN 1 ELSE 0 END) AS live FROM bindings WHERE room_id = ?', now, room.id) as {
        last: number | null;
        live: number | null;
      };
      if (span.last === null || span.live || now - span.last < afterMs) continue;
      const gone = this.transaction(() => {
        const guests = (this.db.all("SELECT DISTINCT participant_id AS id FROM bindings WHERE room_id = ?", room.id) as { id: string }[]).map((g) => g.id);
        const turns = this.db.run('DELETE FROM turns WHERE conversation_id = ?', room.id).changes;
        for (const id of guests) {
          this.db.run('DELETE FROM guest_keys WHERE participant_id = ?', id);
          this.db.run('DELETE FROM bindings WHERE participant_id = ?', id);
          this.db.run("DELETE FROM turns WHERE speaker_id = ?", id);
          this.db.run("DELETE FROM participants WHERE id = ? AND kind = 'guest'", id);
        }
        return { turns, guests: guests.length };
      });
      total.turns += gone.turns;
      total.guests += gone.guests;
    }
    if (total.turns || total.guests) this.db.afterForget();
    return total;
  }

  /**
   * The trail of a guest room: what was said there more than `trailMs` ago is let go, in one statement for the whole room (never a timer per
   * turn). It is time and not distance, so a room where no one writes any more empties itself. The key and the roster are another clock
   * (`forgetEmptyGuestRooms`). Returns how many turns. Team rooms are never touched.
   */
  forgetGuestTrail(trailMs: number): number {
    const cutoff = new Date(this.now().getTime() - trailMs).toISOString();
    const gone = this.db.run("DELETE FROM turns WHERE created_at <= ? AND conversation_id IN (SELECT id FROM conversations WHERE kind = 'guest')", cutoff).changes;
    if (gone) this.db.afterForget();
    return gone;
  }

  /** Whether a turn is still kept: `seq` is never given again, so a turn that is gone stays gone. */
  hasTurn(seq: number): boolean {
    return this.one('SELECT 1 AS yes FROM turns WHERE seq = ?', seq) !== undefined;
  }

  /** The last `seq` given, even when that turn has since been forgotten: the order goes on, it does not start again. */
  lastSeq(): number {
    const row = this.one("SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'turns'), 0) AS seq") as { seq: number };
    return row.seq;
  }
}
