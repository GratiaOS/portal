import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createChatCompletionsProvider } from '@gratiaos/llm-provider';
import type { LlmProvider } from '@gratiaos/llm-provider';
import { createApp } from './app.js';
import { toNodeListener } from './http-node.js';
import { VERSION } from './version.js';
import { createAuthenticator } from './config.js';
import { guestFacts, roomFacts } from './facts.js';
import type { NovaConfig, RoomConfig } from './config.js';
import { Hub } from './hub.js';
import { KnowledgeBase } from './knowledge.js';
import { fixedKnowledge } from './knowledge-files.js';
import { SkinFolder } from './skins.js';
import { createNova } from './nova.js';
import type { Nova } from './nova.js';
import { createStaticHandler } from './static.js';
import { nodeSqlite } from './sqlite-node.js';
import { RoomStore } from './store.js';

export type RunningRoom = {
  port: number;
  store: RoomStore;
  hub: Hub;
  /** What Nova answers from, when there is a Nova. */
  knowledge?: KnowledgeBase;
  nova?: Nova;
  /** Nova for guests, when she is turned on: her own engine and folder, in the guest room only. */
  guestNova?: Nova;
  /** The skins from a folder, when there is one. */
  skins?: SkinFolder;
  close(): Promise<void>;
};

export type StartOptions = {
  /** The hub's grace period, for demos and tests. */
  graceMs?: number;
  /** Stands in for the model, for tests. */
  llm?: LlmProvider;
  /** Stands in for the model that answers guests, for tests. */
  guestLlm?: LlmProvider;
};

function providerFor(config: NovaConfig): LlmProvider {
  const { apiKeyEnv, baseUrl, model, maxTokens, timeoutMs, reasoningEffort, body } = config.llm;
  let apiKey: string | undefined;
  if (apiKeyEnv) {
    apiKey = process.env[apiKeyEnv];
    if (!apiKey) throw new Error(`nova: the environment variable ${apiKeyEnv} is not set; it holds the API key`);
  }
  return createChatCompletionsProvider({ baseUrl, model, apiKey, maxTokens, timeoutMs, reasoningEffort, body });
}

/** Opens the database, puts who and where from the config into it, wakes Nova if there is one, and listens. */
export async function startRoom(config: RoomConfig, options: StartOptions = {}): Promise<RunningRoom> {
  if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });
  const store = new RoomStore(nodeSqlite(config.dbPath));
  let hub: Hub | undefined;
  let nova: Nova | undefined;
  let guestNova: Nova | undefined;
  let forgetting: NodeJS.Timeout | undefined;
  try {
    store.syncParticipants(config.participants.map(({ kind, alias, locale, capabilities, sign }) => ({ kind, alias, locale, capabilities, sign })));
    store.syncConversations(config.rooms);

    // what the portal no longer keeps goes now, and then every ten minutes; a number in the log, never a message
    const forget = () => {
      const { turns, gaps } = store.forget(config.retention);
      if (turns || gaps) console.log(`portal: let go of ${turns} message(s) and ${gaps} question(s) past what it keeps`);
      // the guest room ends by absence, whatever the retention of the team says
      if (config.guests) {
        const faded = store.forgetGuestTrail(config.guests.trailMinutes * 60_000);
        if (faded) console.log(`portal: the guest trail let go of ${faded} message(s)`);
        const ended = store.forgetEmptyGuestRooms(config.guests.forgetAfterMinutes * 60_000);
        if (ended.turns || ended.guests) console.log(`portal: the guest room ended: let go of ${ended.turns} message(s) and ${ended.guests} guest(s)`);
      }
    };
    forget();
    forgetting = setInterval(forget, config.guests ? Math.min(10, config.guests.forgetAfterMinutes, config.guests.trailMinutes) * 60_000 : 10 * 60_000);
    forgetting.unref();

    const live = new Hub(store, { graceMs: options.graceMs, trailMinutes: config.guests?.trailMinutes });
    hub = live;

    let knowledge: KnowledgeBase | undefined;
    if (config.nova) {
      const novaConfig = config.nova;
      const folder = config.nova.knowledgeDir;
      const base = folder
        ? new KnowledgeBase(folder, undefined, {
            exclude: config.nova.exclude,
            onNewFolder: (name, files) => console.log(`portal: ${config.nova?.alias} now also reads a new folder in the knowledge: ${name} (${files} files); add it to nova.exclude if she should not`),
          })
        : fixedKnowledge({});
      if (base instanceof KnowledgeBase) knowledge = base;
      else console.log(`portal: ${config.nova.alias} has no knowledge folder yet; she talks, and says what she does not know`);
      const llm = options.llm ?? providerFor(config.nova);
      nova = createNova(
        { hub: live, store, llm, knowledge: base, facts: () => roomFacts({ ...config, nova: novaConfig }, base.files.size) },
        { alias: config.nova.alias, contextTurns: config.nova.contextTurns, maxQueue: config.nova.maxQueue },
      );
    }

    // Nova for guests: another of her, with her own engine and her own folder (never a filter on the team's), answering only in the guest room
    const guests = config.guests;
    if (guests?.nova.enabled && guests.nova.nova) {
      const guestConfig = guests.nova;
      const novaForGuests = guests.nova.nova;
      const base = novaForGuests.knowledgeDir ? new KnowledgeBase(novaForGuests.knowledgeDir, undefined, { exclude: novaForGuests.exclude }) : fixedKnowledge({});
      if (!novaForGuests.knowledgeDir) console.log(`portal: ${novaForGuests.alias} for guests has no folder of public documents yet; she talks, and says what she does not know`);
      guestNova = createNova(
        { hub: live, store, llm: options.guestLlm ?? providerFor(novaForGuests), knowledge: base, facts: () => guestFacts({ questions: guestConfig.questions, nova: novaForGuests }, base.files.size) },
        { alias: novaForGuests.alias, contextTurns: novaForGuests.contextTurns, maxQueue: novaForGuests.maxQueue, scope: 'guest', guestsPerHour: guestConfig.perHour },
      );
    }

    if (config.staticDir && !existsSync(join(config.staticDir, 'index.html'))) {
      console.warn(`portal: ${config.staticDir} has no index.html; build the UI with "pnpm --filter portal-ui build"`);
    }

    const skins = config.skinsDir ? new SkinFolder(config.skinsDir) : undefined;
    if (config.skinsDir && !existsSync(config.skinsDir)) console.warn(`portal: ${config.skinsDir} does not exist; no skins from a folder until it does`);

    const server = createServer(
      toNodeListener(createApp(store, live, {
        version: VERSION,
        authenticate: createAuthenticator(config),
        rateLimit: { messages: config.rateLimit.messages, windowMs: config.rateLimit.perSeconds * 1000 },
        maxStreamsPerParticipant: config.maxStreamsPerParticipant,
        callerFromHome: true,
        guests: config.guests,
        guestHints: config.guests?.nova.enabled && config.guests.nova.nova ? { companion: config.guests.nova.nova.alias, examples: config.guests.nova.nova.examples } : undefined,
        pages: config.staticDir ? createStaticHandler(config.staticDir) : undefined,
        skins,
        hints: config.nova ? { companion: config.nova.alias, examples: config.nova.examples } : undefined,
      }), { clientIpHeader: config.clientIpHeader }),
    );
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, resolve);
    });

    return {
      port: (server.address() as AddressInfo).port,
      store,
      hub: live,
      knowledge,
      nova,
      guestNova,
      skins,
      async close() {
        clearInterval(forgetting);
        nova?.stop();
    guestNova?.stop();
        guestNova?.stop();
        live.close();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        store.close();
      },
    };
  } catch (err) {
    clearInterval(forgetting);
    nova?.stop();
    hub?.close();
    store.close();
    throw err;
  }
}
