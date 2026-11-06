import { canIn } from './access.js';
import { RoomError } from './domain.js';
import type { Participant } from './domain.js';
import type { Hub } from './hub.js';
import { SlidingWindowLimiter } from './limiter.js';
import { SKIN_CONTRACT } from './skins.js';
import type { RoomStore } from './store.js';
import { serveStream } from './stream.js';
import type { StreamOptions } from './stream.js';

/** The header in which a home tells the handler who is calling. Whatever the client sent under this name must be replaced. */
export const CALLER_HEADER = 'x-portal-caller';

export type AppOptions = {
  /** What `/api/health` says this portal is: the package's version, given by the home (read from disk in Node, bundled on a Worker). */
  version: string;
  /** A token in, the id of the participant it belongs to out. */
  authenticate: (token: string) => string | undefined;
  /** Messages one participant may send in a window. Defaults to 10 in 10 s. */
  rateLimit?: { messages: number; windowMs: number };
  /** Wrong keys one caller may try in a window, before the portal stops answering that caller. Defaults to 10 in 60 s. */
  authFailures?: { attempts: number; windowMs: number };
  /**
   * The home says who is calling (an address) in `CALLER_HEADER`, and the handler counts wrong keys per caller by it. Only a home
   * that overwrites whatever the client sent under that name may say so: `toNodeListener` does, and the Worker does. Without it
   * every caller is one caller.
   */
  callerFromHome?: boolean;
  /** Defaults to 10. */
  maxStreamsPerParticipant?: number;
  /** Defaults to 32 KB: room for the longest message, in JSON, with margin. */
  maxBodyBytes?: number;
  stream?: StreamOptions;
  /** Answers whatever is not under `/api`: the built UI. Without it, only `/api` exists. */
  pages?: (request: Request) => Response | Promise<Response>;
  /** Skins from a folder: the list of the good ones, and the files they hold. Without it, only the looks the page has built in. */
  skins?: { list(): { id: string; name: string; emoji?: string; extends?: string }[]; serve(request: Request): Response | Promise<Response> };
  /** What the page shows in the box where people write, to say who can be called and with what. Without it, nothing. */
  hints?: { companion: string; examples: string[] };
  /** For tests. */
  now?: () => number;
};

/** What the caller gets to know: a status and a sentence. Anything else that goes wrong is a 500 and stays in the log. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

const ROOM_ERROR_STATUS = { invalid: 400, not_found: 404, closed: 409 } as const;

function send(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function only(request: Request, ...methods: string[]): void {
  if (!methods.includes(request.method)) throw new HttpError(405, 'method not allowed', { Allow: methods.join(', ') });
}

async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('content-type') ?? '')) throw new HttpError(415, 'content-type must be application/json');
  const declared = Number(request.headers.get('content-length') ?? undefined);
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, 'body is too large', { Connection: 'close' });

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  while (reader) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > maxBytes) {
      void reader.cancel().catch(() => {});
      throw new HttpError(413, 'body is too large', { Connection: 'close' });
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'body is not valid JSON');
  }
}

function wholeParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null) return undefined;
  if (!/^\d{1,15}$/.test(raw)) throw new HttpError(400, `${name} must be a whole number`);
  return Number(raw);
}

/**
 * The portal's HTTP face, the same in every home: a `Request` in, a `Response` out (`toNodeListener` puts it on `node:http`).
 * Everything under `/api` except `health` needs a token.
 */
export function createApp(store: RoomStore, hub: Hub, options: AppOptions): (request: Request) => Promise<Response> {
  const maxBodyBytes = options.maxBodyBytes ?? 32_768;
  const maxStreams = options.maxStreamsPerParticipant ?? 10;
  const messageLimit = options.rateLimit ?? { messages: 10, windowMs: 10_000 };
  const limiter = new SlidingWindowLimiter(messageLimit.messages, messageLimit.windowMs, options.now);
  // a sign is told to everyone at once: a few changes a minute is a mood, more is noise
  const signs = new SlidingWindowLimiter(6, 60_000, options.now);
  const clock = options.now ?? Date.now;
  // what was sent within the window before this handler began still counts: a restart in Node, or, on Cloudflare, an object
  // that slept and woke, must not give anyone a second full window
  const since = new Date((options.now ?? Date.now)() - messageLimit.windowMs).toISOString();
  for (const { speakerId, createdAt } of store.spokenSince(since)) limiter.remember(speakerId, Date.parse(createdAt));
  const openStreams = new Map<string, number>();

  // wrong keys are counted per caller (the home says it in `CALLER_HEADER`); a caller over the limit is turned away
  // before the key is even looked at, the right one included, so guessing gains nothing from going faster
  const authFailureLimit = options.authFailures ?? { attempts: 10, windowMs: 60_000 };
  const failures = new SlidingWindowLimiter(authFailureLimit.attempts, authFailureLimit.windowMs, options.now);

  function authenticate(request: Request): Participant {
    const caller = (options.callerFromHome && request.headers.get(CALLER_HEADER)) || 'unknown';
    const locked = failures.wait(caller);
    if (locked > 0) throw new HttpError(429, 'too many wrong keys, wait a little', { 'Retry-After': String(Math.ceil(locked / 1000)) });
    const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
    const id = token === undefined ? undefined : options.authenticate(token);
    const participant = id === undefined ? undefined : store.getParticipant(id);
    if (!participant) {
      failures.take(caller);
      throw new HttpError(401, 'unauthorized', { 'WWW-Authenticate': 'Bearer realm="portal"' });
    }
    return participant;
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/health') {
      only(request, 'GET');
      // which room this is, and the contracts it keeps, so that a module or a person can tell before relying on one
      return send(200, { ok: true, version: options.version, contracts: { skins: SKIN_CONTRACT } });
    }
    if (path.startsWith('/skins/')) {
      // no token: the sign-in page wears a skin too, and a skin holds a look, nothing of what is said in the room
      if (options.skins) return options.skins.serve(request);
      throw new HttpError(404, 'not found');
    }
    if (!path.startsWith('/api/')) {
      if (options.pages) return options.pages(request);
      throw new HttpError(404, 'not found');
    }

    const me = authenticate(request);

    if (path === '/api/me') {
      only(request, 'GET');
      return send(200, me);
    }

    if (path === '/api/me/sign') {
      only(request, 'PUT');
      const wait = signs.take(me.id);
      if (wait > 0) throw new HttpError(429, 'the sign changed many times just now, wait a little', { 'Retry-After': String(Math.ceil(wait / 1000)) });
      const body = await readJson(request, 1024);
      const sign = typeof body === 'object' && body !== null ? (body as { sign?: unknown }).sign : undefined;
      if (sign !== null && typeof sign !== 'string') throw new HttpError(400, 'body must be { "sign": "🦁" }, or { "sign": null } to let it go');
      // only your own: who you are is the token, never the body
      const participant = store.setSign(me.id, sign);
      hub.participantChanged(participant);
      return send(200, { participant });
    }

    if (path === '/api/skins') {
      only(request, 'GET');
      return send(200, { skins: options.skins?.list() ?? [] });
    }

    if (path === '/api/hints') {
      only(request, 'GET');
      return send(200, { companion: options.hints?.companion ?? null, examples: options.hints?.examples ?? [] });
    }

    if (path === '/api/rooms') {
      only(request, 'GET');
      // a guest is told of the rooms they may read, and of no other
      return send(200, { rooms: store.listConversations().filter((c) => canIn(store, me, c.id, 'read', clock())) });
    }

    if (path === '/api/gaps') {
      only(request, 'GET');
      // what the knowledge lacked is what the team's people wondered: not for a guest
      if (me.kind === 'guest') throw new HttpError(403, 'not for guests');
      return send(200, { gaps: store.listGaps(wholeParam(url, 'limit')) });
    }

    const room = /^\/api\/rooms\/([^/]+)\/messages$/.exec(path)?.[1];
    if (room !== undefined) {
      only(request, 'GET', 'POST');
      let id: string;
      try {
        id = decodeURIComponent(room);
      } catch {
        throw new HttpError(400, 'bad room id');
      }

      // a room a guest may not read is, to them, a room that does not exist
      if (!canIn(store, me, id, 'read', clock())) throw new RoomError('not_found', `no conversation "${id}"`);

      if (request.method === 'GET') {
        const turns = store.listTurns(id, { before: wholeParam(url, 'before'), limit: wholeParam(url, 'limit') });
        return send(200, { turns });
      }

      if (!canIn(store, me, id, 'write', clock())) throw new HttpError(403, 'you may read this room, not write in it');
      const wait = limiter.take(me.id);
      if (wait > 0) throw new HttpError(429, 'too many messages, slow down', { 'Retry-After': String(Math.ceil(wait / 1000)) });
      const body = await readJson(request, maxBodyBytes);
      if (typeof body !== 'object' || body === null || typeof (body as { text?: unknown }).text !== 'string') {
        throw new HttpError(400, 'body must be { "text": "…" }');
      }
      // the speaker is whoever the token says, never what the body says
      const turn = hub.publish({ conversationId: id, speakerId: me.id, text: (body as { text: string }).text });
      return send(201, { turn });
    }

    if (path === '/api/stream') {
      only(request, 'GET');
      const open = openStreams.get(me.id) ?? 0;
      if (open >= maxStreams) throw new HttpError(429, 'too many open streams');
      openStreams.set(me.id, open + 1);
      return serveStream(request, hub, me, options.stream, () => openStreams.set(me.id, (openStreams.get(me.id) ?? 1) - 1));
    }

    throw new HttpError(404, 'not found');
  }

  return async (request) => {
    let response: Response;
    try {
      response = await handle(request);
    } catch (err: unknown) {
      if (err instanceof HttpError) response = send(err.status, { error: err.message }, err.headers);
      else if (err instanceof RoomError) response = send(ROOM_ERROR_STATUS[err.code], { error: err.message });
      else {
        console.error('portal: a request failed', err);
        response = send(500, { error: 'internal error' });
      }
    }
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  };
}
