import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ALIAS_PATTERN, CONVERSATION_ID_PATTERN, PARTICIPANT_KINDS, isSign, participantId } from './domain.js';
import { DEFAULT_RETENTION } from './store.js';
import type { ConversationInput, ParticipantInput, Retention } from './store.js';

export type ConfigParticipant = ParticipantInput & {
  /** Humans only: what they send as `Authorization: Bearer`. A companion speaks from inside the room and has none. */
  token?: string;
};

/** Nova, the companion who answers from a folder of knowledge. Without this section the room is a plain chat. */
export type NovaConfig = {
  /** One of the companions in `participants`. */
  alias: string;
  llm: {
    /** Any OpenAI-compatible chat-completions endpoint, up to and including the version: `https://host/v1`. */
    baseUrl: string;
    model: string;
    /** The NAME of the environment variable that holds the API key. The key itself never goes in this file. */
    apiKeyEnv?: string;
    maxTokens: number;
    timeoutMs: number;
    reasoningEffort?: 'low' | 'medium' | 'high';
    /** Extra fields for the request body, for servers that want them. */
    body?: Record<string, unknown>;
  };
  /**
   * A folder of markdown, outside this repo if it belongs to a company. Without it she talks with nothing written down for her
   * yet: about the portal from its facts, and about everything else she says she does not know yet.
   */
  knowledgeDir?: string;
  contextTurns: number;
  maxQueue: number;
  /**
   * Folders and files, as paths inside `knowledgeDir`, that she never reads (`"partners/interfaces"`). She reads everything else
   * under the folder, whether or not git tracks it, so what a company keeps out of git or out of the model goes here.
   */
  exclude: string[];
  /** Questions she is good at, in the company's own words. The page shows them, one at a time, in the box where people write. */
  examples: string[];
  /**
   * What only the company knows about the room, one line each, that she may say as fact ("The portal is run by the infrastructure team.").
   * What the room itself knows (who is in it, what is kept, which model) she is told from the config, not from here.
   */
  facts: string[];
};

/** The guest room: where a visitor may come in without a key of their own, and how many, and for how long. Absent: nobody does. */
export type GuestsConfig = {
  /** The id of a room of kind `guest`. */
  room: string;
  /** Guests the portal hosts at once; past it the door says the room is full. */
  maxActive: number;
  /** How long a guest's binding lasts, in minutes. */
  minutes: number;
  /** The room ends by absence: this many minutes after the last guest's time is over, what was said there and who was there are let go. */
  forgetAfterMinutes: number;
  /** A guest's words leave one by one: a turn in the guest room older than this many minutes is let go, and the page lets it fade before. */
  trailMinutes: number;
  /** How many guests one caller may bring in, per window. */
  perCaller: { count: number; perMinutes: number };
  /** The companion for guests: an engine of her own, off until it is chosen. */
  nova: GuestNovaConfig;
};

/**
 * Nova for guests. Apart from the team's in everything that matters: her own engine (`nova.llm`), her own public folder (`nova.knowledgeDir`,
 * never a filter on the team's), her own facts (made without the team's names), and a budget of questions that she keeps. `enabled` is false
 * until it is chosen to be true; then `nova` holds her.
 */
export type GuestNovaConfig = {
  enabled: boolean;
  nova?: NovaConfig;
  /** How many questions each guest may ask. */
  questions: number;
  /** How many questions guests may ask in an hour, all together: what bounds the cost whoever comes. */
  perHour: number;
};

export type RoomConfig = {
  port: number;
  /** `127.0.0.1` unless said otherwise: anything wider belongs behind TLS. */
  host: string;
  /** A file, or `:memory:`. */
  dbPath: string;
  /** What this portal is called where it is installed or named (`Firegate`); without it, `El portal`. */
  name?: string;
  participants: ConfigParticipant[];
  rooms: ConversationInput[];
  rateLimit: { messages: number; perSeconds: number };
  maxStreamsPerParticipant: number;
  /** What the portal keeps: by default the last 14 days and the last 999 messages of each room, whichever ends first. */
  retention: Retention;
  guests?: GuestsConfig;
  /**
   * A file that holds the tokens of the humans, `{ "Alias": "token" }`, apart from the config: the config says who and what, this says
   * who may come in. It can be kept out of version control and read by few (`chmod 600`); the room warns if others can read it.
   * Without it, each human has a `token` in `participants`.
   */
  tokensFile?: string;
  /**
   * Behind a proxy, the header in which it sets the caller's address (`x-forwarded-for`, `cf-connecting-ip`). Without it the caller is
   * the socket's address, which behind a proxy is the proxy: every wrong key would count against everyone. Name it only for a proxy
   * that sets it, since otherwise a caller could choose its own.
   */
  clientIpHeader?: string;
  /** A built UI to serve next to the API: the `dist` of `ui/`. Without it the room has only its API. */
  staticDir?: string;
  /**
   * A folder of skins, one folder to a skin (`<id>/skin.json`, `<id>/skin.css` and what it uses), offered next to the looks the page has
   * built in. The room serves them and checks that each keeps to its own scope. See `ui/src/skins/README.md`.
   */
  skinsDir?: string;
  nova?: NovaConfig;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const MIN_TOKEN_LENGTH = 24;

/** How the tokens are made, in the words the messages use: from a clone it is `pnpm`; in the image (which sets `PORTAL_IMAGE`) there is no pnpm and no clipboard. */
export const TOKENS_COMMAND = process.env.PORTAL_IMAGE ? 'node dist/tokens.js' : 'pnpm --filter portal tokens';
export const TO_CLIPBOARD = process.env.PORTAL_IMAGE ? '' : ' | pbcopy';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function whole(value: unknown, fallback: number, name: string, { min, max }: { min: number; max: number }): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function parseGuests(raw: unknown, rooms: ConversationInput[], participants: ConfigParticipant[], teamNova: NovaConfig | undefined, baseDir: string): GuestsConfig {
  if (!isRecord(raw)) throw new ConfigError('guests must be an object');
  const room = text(raw.room, 'guests.room');
  const found = rooms.find((r) => r.id === room);
  if (!found) throw new ConfigError(`guests.room: there is no room "${room}"`);
  if (found.kind !== 'guest') throw new ConfigError(`guests.room: "${room}" must be a room of kind "guest"`);
  const each = raw.perCaller === undefined ? {} : raw.perCaller;
  if (!isRecord(each)) throw new ConfigError('guests.perCaller must be an object');
  return {
    room,
    maxActive: whole(raw.maxActive, 20, 'guests.maxActive', { min: 1, max: 1000 }),
    minutes: whole(raw.minutes, 60, 'guests.minutes', { min: 1, max: 1440 }),
    forgetAfterMinutes: whole(raw.forgetAfterMinutes, 5, 'guests.forgetAfterMinutes', { min: 1, max: 1440 }),
    trailMinutes: whole(raw.trailMinutes, 15, 'guests.trailMinutes', { min: 1, max: 1440 }),
    perCaller: {
      count: whole(each.count, 5, 'guests.perCaller.count', { min: 1, max: 100 }),
      perMinutes: whole(each.perMinutes, 10, 'guests.perCaller.perMinutes', { min: 1, max: 1440 }),
    },
    nova: parseGuestNova(raw.nova, participants, teamNova, baseDir),
  };
}

function parseGuestNova(raw: unknown, participants: ConfigParticipant[], teamNova: NovaConfig | undefined, baseDir: string): GuestNovaConfig {
  if (raw === undefined) return { enabled: false, questions: 5, perHour: 60 };
  if (!isRecord(raw)) throw new ConfigError('guests.nova must be an object');
  const { enabled, questions, perHour, ...novaFields } = raw;
  if (enabled !== undefined && typeof enabled !== 'boolean') throw new ConfigError('guests.nova.enabled must be true or false');
  const limits = { questions: whole(questions, 5, 'guests.nova.questions', { min: 1, max: 100 }), perHour: whole(perHour, 60, 'guests.nova.perHour', { min: 1, max: 10_000 }) };
  if (enabled !== true) {
    // off: nothing of her is read, so nothing is half-checked; a typo in her fields waits until she is turned on
    return { enabled: false, ...limits };
  }
  if (novaFields.llm === undefined) throw new ConfigError('guests.nova.llm is needed to turn her on: the engine that answers guests is chosen, never inherited from the team\'s');
  try {
    const nova = parseNova({ alias: teamNova?.alias, contextTurns: 6, maxQueue: 3, ...novaFields }, participants, baseDir);
    return { enabled: true, nova, ...limits };
  } catch (err) {
    if (err instanceof ConfigError) throw new ConfigError(err.message.replace(/\bnova\./g, 'guests.nova.'));
    throw err;
  }
}

function roomKind(value: unknown, name: string): 'team' | 'guest' {
  if (value !== 'team' && value !== 'guest') throw new ConfigError(`${name} must be "team" or "guest"`);
  return value;
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ConfigError(`${name} must be a non-empty string`);
  return value;
}

/**
 * Checks what `portal.local.json` says. Messages name the participant or the room, never a token.
 * `baseDir` is what a relative `dbPath` is relative to: the folder of the config file.
 */
/**
 * A portal forgets by default (decision 12): `"retention": { "days": 14, "messages": 999 }` is what it keeps when nothing is said.
 * A portal that must keep more says so openly, up to `"forever"`, and its people are told so in what the companion knows.
 */
function parseRetention(raw: unknown): Retention {
  if (raw === undefined) return DEFAULT_RETENTION;
  if (raw === 'forever') return 'forever';
  if (!isRecord(raw)) throw new ConfigError('retention must be { "days", "messages" } or "forever"');
  const fallback = DEFAULT_RETENTION as { days: number; messages: number };
  return {
    days: whole(raw.days, fallback.days, 'retention.days', { min: 1, max: 3650 }),
    messages: whole(raw.messages, fallback.messages, 'retention.messages', { min: 50, max: 1_000_000 }),
  };
}

/** `renamedFrom`: the alias a person had before, for a person (a human) whose name has changed. */
function renamedFromOf(value: unknown, alias: string, kind: string, index: number): string {
  const from = text(value, `participants[${index}].renamedFrom`);
  if (kind !== 'human') throw new ConfigError(`participants[${index}]: only a person can be renamed`);
  if (!ALIAS_PATTERN.test(from)) throw new ConfigError(`participants[${index}]: "${from}" is not a valid alias`);
  if (from.toLowerCase() === alias.toLowerCase()) throw new ConfigError(`participants[${index}]: renamedFrom is the same as the alias`);
  return from;
}

/** The name of the portal: one line of words, up to 40 characters (it is a name on a home screen, not a sentence). */
function portalName(value: unknown): string {
  const name = text(value, 'name');
  if (name.length > 40 || /[\n\r<>]/.test(name)) throw new ConfigError('name must be one line of up to 40 characters, without < or >');
  return name;
}

export function parseConfig(raw: unknown, baseDir: string = process.cwd()): RoomConfig {
  if (!isRecord(raw)) throw new ConfigError('the config must be a JSON object');

  const participants = (Array.isArray(raw.participants) ? raw.participants : []).map((entry, index): ConfigParticipant => {
    if (!isRecord(entry)) throw new ConfigError(`participants[${index}] must be an object`);
    const kind = entry.kind;
    if (typeof kind !== 'string' || !PARTICIPANT_KINDS.includes(kind as never)) throw new ConfigError(`participants[${index}]: kind must be human, companion or service`);
    const alias = text(entry.alias, `participants[${index}].alias`);
    if (!ALIAS_PATTERN.test(alias)) throw new ConfigError(`participants[${index}]: "${alias}" is not a valid alias`);

    const who = `${kind}:${alias}`;
    if (kind === 'human') {
      if (typeof entry.token !== 'string' || entry.token.length < MIN_TOKEN_LENGTH) {
        throw new ConfigError(`${who} needs a token of at least ${MIN_TOKEN_LENGTH} characters`);
      }
    } else if (entry.token !== undefined) {
      throw new ConfigError(`${who} must not have a token: only humans sign in`);
    }
    if (entry.locale !== undefined && typeof entry.locale !== 'string') throw new ConfigError(`${who}: locale must be a string`);
    if (entry.sign !== undefined && kind !== 'human') throw new ConfigError(`${who} must not have a sign: a sign is for the people in the room`);
    if (entry.sign !== undefined && !isSign(entry.sign)) throw new ConfigError(`${who}: sign must be one emoji, such as "🦁"`);
    if (entry.capabilities !== undefined && !(Array.isArray(entry.capabilities) && entry.capabilities.every((c) => typeof c === 'string'))) {
      throw new ConfigError(`${who}: capabilities must be a list of strings`);
    }
    return {
      kind: kind as ParticipantInput['kind'],
      alias,
      ...(entry.locale === undefined ? {} : { locale: entry.locale as string }),
      ...(entry.capabilities === undefined ? {} : { capabilities: entry.capabilities as string[] }),
      ...(entry.sign === undefined ? {} : { sign: entry.sign as string }),
      ...(entry.renamedFrom === undefined ? {} : { renamedFrom: renamedFromOf(entry.renamedFrom, alias, kind, index) }),
      ...(typeof entry.token === 'string' ? { token: entry.token } : {}),
    };
  });

  if (!participants.some((p) => p.kind === 'human')) throw new ConfigError('there must be at least one human in participants');
  const aliases = new Set<string>();
  const tokens = new Set<string>();
  for (const p of participants) {
    if (aliases.has(p.alias.toLowerCase())) throw new ConfigError(`the alias "${p.alias}" is used twice`);
    aliases.add(p.alias.toLowerCase());
    if (p.renamedFrom !== undefined && participants.some((other) => other.alias.toLowerCase() === p.renamedFrom!.toLowerCase())) throw new ConfigError(`renamedFrom "${p.renamedFrom}" is still an alias of the config: a person cannot be renamed from one who is there`);
    if (p.token !== undefined) {
      if (tokens.has(p.token)) throw new ConfigError(`${participantId(p.kind, p.alias)} has the same token as another participant`);
      tokens.add(p.token);
    }
  }

  const rooms = (Array.isArray(raw.rooms) ? raw.rooms : []).map((entry, index): ConversationInput => {
    if (!isRecord(entry)) throw new ConfigError(`rooms[${index}] must be an object`);
    const id = text(entry.id, `rooms[${index}].id`);
    if (!CONVERSATION_ID_PATTERN.test(id)) throw new ConfigError(`rooms[${index}]: "${id}" is not a valid room id (lowercase letters, digits and dashes)`);
    return {
      id,
      title: text(entry.title, `rooms[${index}].title`),
      ...(entry.kind === undefined ? {} : { kind: roomKind(entry.kind, `rooms[${index}].kind`) }),
      ...(entry.visibility === undefined ? {} : { visibility: entry.visibility as ConversationInput['visibility'] }),
      ...(entry.tags === undefined ? {} : { tags: entry.tags as string[] }),
    };
  });
  if (!rooms.length) throw new ConfigError('there must be at least one room');
  if (new Set(rooms.map((c) => c.id)).size !== rooms.length) throw new ConfigError('a room id is used twice');

  const nova = raw.nova === undefined ? undefined : parseNova(raw.nova, participants, baseDir);

  const rate = raw.rateLimit === undefined ? {} : raw.rateLimit;
  if (!isRecord(rate)) throw new ConfigError('rateLimit must be an object');
  // named for the portal from 0.1.0 on: no portal outside ran with the earlier default, so no update has a file to lose
  const dbPath = raw.dbPath === undefined ? 'data/portal.db' : text(raw.dbPath, 'dbPath');

  return {
    port: whole(raw.port, 3100, 'port', { min: 0, max: 65535 }),
    host: raw.host === undefined ? '127.0.0.1' : text(raw.host, 'host'),
    dbPath: dbPath === ':memory:' ? dbPath : resolve(baseDir, dbPath),
    ...(raw.name === undefined ? {} : { name: portalName(raw.name) }),
    participants,
    rooms,
    rateLimit: {
      messages: whole(rate.messages, 10, 'rateLimit.messages', { min: 1, max: 1000 }),
      perSeconds: whole(rate.perSeconds, 10, 'rateLimit.perSeconds', { min: 1, max: 3600 }),
    },
    maxStreamsPerParticipant: whole(raw.maxStreamsPerParticipant, 10, 'maxStreamsPerParticipant', { min: 1, max: 100 }),
    retention: parseRetention(raw.retention),
    ...(raw.guests === undefined ? {} : { guests: parseGuests(raw.guests, rooms, participants, nova, baseDir) }),
    ...(raw.tokensFile === undefined ? {} : { tokensFile: resolve(baseDir, text(raw.tokensFile, 'tokensFile')) }),
    ...(raw.clientIpHeader === undefined ? {} : { clientIpHeader: text(raw.clientIpHeader, 'clientIpHeader') }),
    ...(raw.staticDir === undefined ? {} : { staticDir: resolve(baseDir, text(raw.staticDir, 'staticDir')) }),
    ...(raw.skinsDir === undefined ? {} : { skinsDir: resolve(baseDir, text(raw.skinsDir, 'skinsDir')) }),
    ...(nova ? { nova } : {}),
  };
}

const fail = (message: string): never => {
  throw new ConfigError(message);
};

function parseNova(raw: unknown, participants: ConfigParticipant[], baseDir: string): NovaConfig {
  if (!isRecord(raw)) throw new ConfigError('nova must be an object');
  const wanted = raw.alias === undefined ? 'Nova' : text(raw.alias, 'nova.alias');
  const companion = participants.find((p) => p.kind === 'companion' && p.alias.toLowerCase() === wanted.toLowerCase());
  if (!companion) throw new ConfigError(`nova.alias "${wanted}" must be a companion in participants`);

  const llm = raw.llm;
  if (!isRecord(llm)) throw new ConfigError('nova.llm must be an object');
  const baseUrl = text(llm.baseUrl, 'nova.llm.baseUrl');
  let protocol: string;
  try {
    protocol = new URL(baseUrl).protocol;
  } catch {
    throw new ConfigError('nova.llm.baseUrl must be a URL such as https://host/v1');
  }
  if (protocol !== 'http:' && protocol !== 'https:') throw new ConfigError('nova.llm.baseUrl must be an http or https URL');

  if (llm.apiKeyEnv !== undefined && !(typeof llm.apiKeyEnv === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(llm.apiKeyEnv))) {
    throw new ConfigError('nova.llm.apiKeyEnv is the NAME of an environment variable, not the key');
  }
  if (llm.reasoningEffort !== undefined && !['low', 'medium', 'high'].includes(llm.reasoningEffort as string)) {
    throw new ConfigError('nova.llm.reasoningEffort must be low, medium or high');
  }
  if (llm.body !== undefined && !isRecord(llm.body)) throw new ConfigError('nova.llm.body must be an object');

  return {
    alias: companion.alias,
    llm: {
      baseUrl,
      model: text(llm.model, 'nova.llm.model'),
      ...(llm.apiKeyEnv === undefined ? {} : { apiKeyEnv: llm.apiKeyEnv as string }),
      maxTokens: whole(llm.maxTokens, 4000, 'nova.llm.maxTokens', { min: 256, max: 32000 }),
      timeoutMs: whole(llm.timeoutMs, 300_000, 'nova.llm.timeoutMs', { min: 5000, max: 900_000 }),
      ...(llm.reasoningEffort === undefined ? {} : { reasoningEffort: llm.reasoningEffort as 'low' | 'medium' | 'high' }),
      ...(llm.body === undefined ? {} : { body: llm.body }),
    },
    ...(raw.knowledgeDir === undefined ? {} : { knowledgeDir: resolve(baseDir, text(raw.knowledgeDir, 'nova.knowledgeDir')) }),
    contextTurns: whole(raw.contextTurns, 12, 'nova.contextTurns', { min: 1, max: 50 }),
    maxQueue: whole(raw.maxQueue, 5, 'nova.maxQueue', { min: 1, max: 50 }),
    exclude: raw.knowledgeDir === undefined && raw.exclude !== undefined ? fail('nova.exclude names parts of knowledgeDir, and there is no knowledgeDir') : parseExclude(raw.exclude),
    examples: parseExamples(raw.examples),
    facts: parseFacts(raw.facts),
  };
}

const MAX_EXCLUDES = 50;

function parseExclude(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_EXCLUDES) throw new ConfigError(`nova.exclude must be a list of at most ${MAX_EXCLUDES} paths`);
  return raw.map((item, i) => {
    const tidy = typeof item === 'string' ? item.trim().replace(/\\/g, '/').replace(/\/+$/, '') : '';
    // a `.` part means the folder itself, so it is dropped (`private/./a.md` is `private/a.md`); an empty part or `..` is refused
    const parts = tidy.split('/').filter((part) => part !== '.');
    if (!tidy || tidy.length > 200 || tidy.startsWith('/') || /^[A-Za-z]:/.test(tidy) || !parts.length || parts.some((part) => part === '..' || part === '')) {
      throw new ConfigError(`nova.exclude[${i}] must be a path inside knowledgeDir, such as "partners/interfaces" (no leading /, no .., not the folder itself)`);
    }
    return parts.join('/');
  });
}

const MAX_EXAMPLES = 8;
const MAX_EXAMPLE_LENGTH = 120;

function parseExamples(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_EXAMPLES) throw new ConfigError(`nova.examples must be a list of at most ${MAX_EXAMPLES} questions`);
  return raw.map((item, i) => {
    const example = typeof item === 'string' ? item.trim() : '';
    if (!example || example.length > MAX_EXAMPLE_LENGTH) throw new ConfigError(`nova.examples[${i}] must be a question of 1 to ${MAX_EXAMPLE_LENGTH} characters`);
    return example;
  });
}

const MAX_FACTS = 10;
const MAX_FACT_LENGTH = 300;

function parseFacts(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_FACTS) throw new ConfigError(`nova.facts must be a list of at most ${MAX_FACTS} lines`);
  return raw.map((item, i) => {
    const fact = typeof item === 'string' ? item.trim().replace(/\s+/g, ' ') : '';
    if (!fact || fact.length > MAX_FACT_LENGTH) throw new ConfigError(`nova.facts[${i}] must be a line of 1 to ${MAX_FACT_LENGTH} characters`);
    return fact;
  });
}

/** A config file as it is on disk: its JSON, and the folder it sits in. */
export function readConfigFile(path: string): { raw: unknown; baseDir: string } {
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    throw new ConfigError(`cannot read ${path}; copy portal.example.json to it and fill it in`);
  }
  try {
    return { raw: JSON.parse(source) as unknown, baseDir: dirname(resolve(path)) };
  } catch {
    throw new ConfigError(`${path} is not valid JSON`);
  }
}

/**
 * The tokens kept in a file of their own: `{ "Alias": "token" }`. A file that others can read is said so (not refused: the person
 * who runs the room decides), and the message names the file, never a token. `missingOk` is for the one who is about to make it.
 */
export function readTokensFile(file: string, options: { missingOk?: boolean } = {}): Record<string, string> {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    if (options.missingOk) return {};
    throw new ConfigError(`cannot read the tokens file ${file}; make a token with: ${TOKENS_COMMAND} <config> new <alias>`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new ConfigError(`the tokens file ${file} is not valid JSON`);
  }
  if (!isRecord(parsed)) throw new ConfigError(`the tokens file ${file} must be an object: { "Alias": "token" }`);
  const seen = new Map<string, string>();
  for (const [alias, token] of Object.entries(parsed)) {
    if (typeof token !== 'string') throw new ConfigError(`the tokens file ${file}: the token of ${alias} must be a string`);
    // a person is found by their alias whatever the letters, so two entries that differ only in them would be two tokens for one person
    const other = seen.get(alias.toLowerCase());
    if (other !== undefined) throw new ConfigError(`the tokens file ${file} has both "${other}" and "${alias}": one token for each person`);
    seen.set(alias.toLowerCase(), alias);
  }
  try {
    if (process.platform !== 'win32' && (statSync(file).mode & 0o077) !== 0) console.warn(`portal: ${file} can be read by others; run: chmod 600 ${file}`);
  } catch {
    // the file was read a moment ago; if it cannot be looked at now, there is nothing to say
  }
  return parsed as Record<string, string>;
}

/** The config with the tokens of its `tokensFile` put into `participants`, as if they had been written there. */
function withTokens(raw: unknown, baseDir: string, configPath: string): unknown {
  if (!isRecord(raw) || raw.tokensFile === undefined) return raw;
  const file = resolve(baseDir, text(raw.tokensFile, 'tokensFile'));
  return putTokens(raw, readTokensFile(file), `the tokens file ${file}`, (alias) => `make one with: ${TOKENS_COMMAND} ${configPath} new ${alias}`);
}

/**
 * Tokens kept apart from the config (a file in Node, a secret on Cloudflare) put into `participants`, as if they had been
 * written there. `where` names that place in what is said when something is wrong, and `howToMake` how to make a missing one.
 */
export function putTokens(raw: unknown, tokens: Record<string, string>, where: string, howToMake: (alias: string) => string): unknown {
  if (!isRecord(raw)) return raw;
  const people = Array.isArray(raw.participants) ? raw.participants : [];
  const humans = people.filter((p): p is Record<string, unknown> => isRecord(p) && p.kind === 'human' && typeof p.alias === 'string').map((p) => (p.alias as string).toLowerCase());
  const byAlias = new Map(Object.entries(tokens).map(([alias, token]) => [alias.toLowerCase(), token] as const));
  for (const alias of Object.keys(tokens)) {
    if (!humans.includes(alias.toLowerCase())) throw new ConfigError(`${where} has a token for "${alias}", who is not a human in participants`);
  }
  const participants = people.map((p) => {
    if (!isRecord(p) || p.kind !== 'human' || typeof p.alias !== 'string') return p;
    const token = byAlias.get(p.alias.toLowerCase());
    if (token !== undefined && p.token !== undefined) throw new ConfigError(`human:${p.alias} has a token in the config and in ${where}: keep it in one place`);
    if (token === undefined && p.token === undefined) throw new ConfigError(`human:${p.alias} has no token in ${where}; ${howToMake(p.alias)}`);
    return token === undefined ? p : { ...p, token };
  });
  return { ...raw, participants };
}

export function loadConfig(path: string): RoomConfig {
  const { raw, baseDir } = readConfigFile(path);
  return parseConfig(withTokens(raw, baseDir, path), baseDir);
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
/** What of a token is kept and compared: its digest, never the token. */
export const tokenDigest = digest;

/** Turns a token into the id of the participant it belongs to, or `undefined`. Only digests are kept in memory. */
export function createAuthenticator(config: RoomConfig): (token: string) => string | undefined {
  const byDigest = new Map<string, string>();
  for (const p of config.participants) if (p.token !== undefined) byDigest.set(digest(p.token), participantId(p.kind, p.alias));
  return (token) => byDigest.get(digest(token));
}
