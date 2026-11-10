// The portal on Cloudflare: a Worker in front, and one Durable Object that is the whole portal, its store, its hub and its
// handler, the same `createApp` as in Node. Nothing here keeps what is said: the object does, through objectSqlite.

import { DurableObject } from 'cloudflare:workers';
import { createChatCompletionsProvider } from '@gratiaos/llm-provider';
import pkg from '../package.json';
// made by bundle-knowledge.mjs from the folder the config names, before each dev and deploy; kept out of git
import knowledge from './knowledge.json';
import { CALLER_HEADER, createApp } from '../src/app.ts';
import { ConfigError, createAuthenticator, parseConfig, putTokens } from '../src/config.ts';
import type { GuestsConfig, NovaConfig, RoomConfig } from '../src/config.ts';
import { guestFacts, roomFacts } from '../src/facts.ts';
import { Hub } from '../src/hub.ts';
import { fixedKnowledge } from '../src/knowledge-files.ts';
import { createNova } from '../src/nova.ts';
import { pageHeaders } from '../src/page-headers.ts';
import { objectSqlite } from '../src/sqlite-object.ts';
import { RoomStore } from '../src/store.ts';
import type { Retention } from '../src/store.ts';

type Env = {
  PORTAL: DurableObjectNamespace<Portal>;
  ASSETS: Fetcher;
  /** The config, as portal.example.json, without tokensFile, dbPath, staticDir or skinsDir: a secret. */
  PORTAL_CONFIG?: string;
  /** `{ "<alias>": "<token>" }`, as `pnpm tokens` writes it: a secret. */
  PORTAL_TOKENS?: string;
  /** How often the portal forgets; ten minutes unless said otherwise (the checks say a second). */
  PORTAL_FORGET_EVERY_MS?: string;
  /** The model's key, a secret, under the name the config gives in nova.llm.apiKeyEnv. */
  [apiKeyEnv: string]: unknown;
};

const json = (value: string | undefined, name: string): unknown => {
  if (value === undefined) throw new ConfigError(`the secret ${name} is not set; see INSTALL.md, "On Cloudflare"`);
  try {
    return JSON.parse(value);
  } catch {
    throw new ConfigError(`the secret ${name} is not valid JSON`);
  }
};

function configFrom(env: Env): RoomConfig {
  const raw = json(env.PORTAL_CONFIG as string | undefined, 'PORTAL_CONFIG');
  const tokens = json((env.PORTAL_TOKENS as string | undefined) ?? '{}', 'PORTAL_TOKENS') as Record<string, string>;
  return parseConfig(putTokens(raw, tokens, 'the secret PORTAL_TOKENS', (alias) => `add a token for ${alias} to it`), '/');
}

export class Portal extends DurableObject<Env> {
  private handler?: (request: Request) => Promise<Response>;
  private store?: RoomStore;
  private retention?: Retention;
  private guestsForgetAfterMs?: number;
  private guestsTrailMs?: number;

  /** Opened once each time the object wakes: who and where from the config, what is past keeping let go, and the handler. */
  private open(): (request: Request) => Promise<Response> {
    if (this.handler) return this.handler;
    const config = configFrom(this.env);
    const store = new RoomStore(objectSqlite(this.ctx.storage));
    store.syncParticipants(config.participants.map(({ kind, alias, locale, capabilities, sign }) => ({ kind, alias, locale, capabilities, sign })));
    store.syncConversations(config.rooms);
    this.store = store;
    this.retention = config.retention;
    this.guestsForgetAfterMs = config.guests ? config.guests.forgetAfterMinutes * 60_000 : undefined;
    this.guestsTrailMs = config.guests ? config.guests.trailMinutes * 60_000 : undefined;
    this.forget();
    if (config.retention !== 'forever' || this.guestsForgetAfterMs) void this.ctx.storage.getAlarm().then((at) => (at === null ? this.ctx.storage.setAlarm(Date.now() + this.every()) : undefined));

    const hub = new Hub(store, { trailMinutes: config.guests?.trailMinutes });
    if (config.nova) this.wakeNova(config, config.nova, store, hub);
    if (config.guests?.nova.enabled && config.guests.nova.nova) this.wakeGuestNova(config.guests, config.guests.nova.nova, store, hub);

    this.handler = createApp(store, hub, {
      version: pkg.version,
      authenticate: createAuthenticator(config),
      rateLimit: { messages: config.rateLimit.messages, windowMs: config.rateLimit.perSeconds * 1000 },
      maxStreamsPerParticipant: config.maxStreamsPerParticipant,
      callerFromHome: true,
      guests: config.guests,
      hints: config.nova ? { companion: config.nova.alias, examples: config.nova.examples } : undefined,
      // a guest is told of her companion, with her examples and never the team's, as in Node
      guestHints: config.guests?.nova.enabled && config.guests.nova.nova ? { companion: config.guests.nova.nova.alias, examples: config.guests.nova.nova.examples } : undefined,
    });
    return this.handler;
  }

  /** Nova, as in Node, reading the bundle made from her folder, on the model the config names, with its key from a secret. */
  private wakeNova(config: RoomConfig, nova: NovaConfig, store: RoomStore, hub: Hub): void {
    const files = (knowledge as { files?: Record<string, string> }).files ?? {};
    if (!Object.keys(files).length) {
      // with nothing written down for her she still talks: about the portal from its facts, and says what she does not know yet
      if (nova.knowledgeDir) console.warn(`portal: the config names a knowledge folder for ${nova.alias}, and nothing was bundled; she talks without it until the next deploy bundles it`);
      else console.log(`portal: ${nova.alias} has no knowledge folder yet; she talks, and says what she does not know`);
    }
    const { apiKeyEnv, baseUrl, model, maxTokens, timeoutMs, reasoningEffort, body } = nova.llm;
    const apiKey = apiKeyEnv ? (this.env[apiKeyEnv] as string | undefined) : undefined;
    if (apiKeyEnv && !apiKey) {
      console.warn(`portal: the secret ${apiKeyEnv} is not set; it holds the model's key, so ${nova.alias} does not answer`);
      return;
    }
    const known = fixedKnowledge(files);
    createNova(
      { hub, store, llm: createChatCompletionsProvider({ baseUrl, model, apiKey, maxTokens, timeoutMs, reasoningEffort, body }), knowledge: known, facts: () => roomFacts({ ...config, nova }, known.files.size, 'cloudflare') },
      { alias: nova.alias, contextTurns: nova.contextTurns, maxQueue: nova.maxQueue },
    );
  }

  /**
   * Nova for guests, as in Node: another of her, on her own engine (its key a secret under the name `guests.nova.llm.apiKeyEnv`), reading
   * her own bundle (the folder of public documents, never the team's), answering only in the guest room, with a budget she keeps.
   */
  private wakeGuestNova(guests: GuestsConfig, nova: NovaConfig, store: RoomStore, hub: Hub): void {
    const files = (knowledge as { guestFiles?: Record<string, string> }).guestFiles ?? {};
    if (!Object.keys(files).length) {
      if (nova.knowledgeDir) console.warn(`portal: the config names a folder of public documents for ${nova.alias} for guests, and nothing was bundled; she talks without it until the next deploy bundles it`);
      else console.log(`portal: ${nova.alias} for guests has no folder of public documents yet; she talks, and says what she does not know`);
    }
    const { apiKeyEnv, baseUrl, model, maxTokens, timeoutMs, reasoningEffort, body } = nova.llm;
    const apiKey = apiKeyEnv ? (this.env[apiKeyEnv] as string | undefined) : undefined;
    if (apiKeyEnv && !apiKey) {
      console.warn(`portal: the secret ${apiKeyEnv} is not set; it holds the model's key for guests, so ${nova.alias} does not answer them`);
      return;
    }
    const known = fixedKnowledge(files);
    createNova(
      { hub, store, llm: createChatCompletionsProvider({ baseUrl, model, apiKey, maxTokens, timeoutMs, reasoningEffort, body }), knowledge: known, facts: () => guestFacts({ questions: guests.nova.questions, nova }, known.files.size) },
      { alias: nova.alias, contextTurns: nova.contextTurns, maxQueue: nova.maxQueue, scope: 'guest', guestsPerHour: guests.nova.perHour },
    );
  }

  private every(): number {
    const ms = Number(this.env.PORTAL_FORGET_EVERY_MS);
    return Number.isFinite(ms) && ms >= 1000 ? ms : 10 * 60_000;
  }

  // what the portal no longer keeps goes now, and then at every alarm; a number in the log, never a message
  private forget(): void {
    if (!this.store || !this.retention) return;
    const { turns, gaps } = this.store.forget(this.retention);
    if (turns || gaps) console.log(`portal: let go of ${turns} message(s) and ${gaps} question(s) past what it keeps`);
    // the guest room ends by absence, whatever the retention of the team says
    if (this.guestsForgetAfterMs) {
      const faded = this.store.forgetGuestTrail(this.guestsTrailMs ?? 0);
      if (faded) console.log(`portal: the guest trail let go of ${faded} message(s)`);
      const ended = this.store.forgetEmptyGuestRooms(this.guestsForgetAfterMs);
      if (ended.turns || ended.guests) console.log(`portal: the guest room ended: let go of ${ended.turns} message(s) and ${ended.guests} guest(s)`);
    }
  }

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.open()(request);
    } catch (err) {
      // a config that cannot be read says why in the log, and the caller gets a calm 503
      console.error('portal: cannot open', err instanceof ConfigError ? err.message : err);
      return Response.json({ error: 'the portal cannot open; whoever runs it can see why in its log' }, { status: 503 });
    }
  }

  async alarm(): Promise<void> {
    this.open();
    this.forget();
    if (this.retention !== 'forever' || this.guestsForgetAfterMs) await this.ctx.storage.setAlarm(Date.now() + this.every());
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // one portal, one object: everything it answers goes there, skins included (none from a folder here, so a calm 404)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/skins/')) {
      // who is calling, from Cloudflare, under the name the handler counts wrong keys by; whatever the client sent there is replaced
      const forwarded = new Request(request);
      forwarded.headers.set(CALLER_HEADER, request.headers.get('cf-connecting-ip') ?? 'unknown');
      return env.PORTAL.getByName('portal').fetch(forwarded);
    }

    // the page, from the Worker's assets, with the same headers as in Node
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    const asset = await env.ASSETS.fetch(request);
    // as in Node: a path with no extension lands on the page, a file that is not there is a 404 (the assets would give the page)
    const last = url.pathname.split('/').pop() ?? '';
    if (/\.[^.]+$/.test(last) && !/\.html?$/i.test(last) && /^text\/html/.test(asset.headers.get('content-type') ?? '')) {
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
    }
    const response = new Response(asset.body, asset);
    if (asset.ok) for (const [name, value] of Object.entries(pageHeaders(url.pathname, asset.headers.get('content-type') ?? ''))) response.headers.set(name, value);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  },
};
