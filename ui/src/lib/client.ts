import { createSseParser } from './sse.ts';
import type { SseFrame } from './sse.ts';
import type { Conversation, Hints, Participant, SkinInfo, Turn } from './types.ts';

export type Connection = 'connecting' | 'live' | 'reconnecting' | 'refused';

/** What the room answered when it said no: the status, its reason in words, and how long to wait if it said so. */
export class ApiError extends Error {
  readonly status: number;
  readonly retryAfter?: number;

  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function createApi(token: string, fetchImpl: typeof fetch = fetch) {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const wait = Number(res.headers.get('retry-after'));
      throw new ApiError(res.status, body.error ?? res.statusText, wait > 0 ? wait : undefined);
    }
    return (await res.json()) as T;
  }

  return {
    me: () => call<Participant>('/api/me'),
    hints: () => call<Hints>('/api/hints'),
    skins: () => call<{ skins: SkinInfo[] }>('/api/skins').then((r) => r.skins),
    rooms: () => call<{ rooms: Conversation[] }>('/api/rooms').then((r) => r.rooms),
    history: (channel: string, page: { before?: number; limit?: number } = {}) => {
      const query = new URLSearchParams();
      if (page.before !== undefined) query.set('before', String(page.before));
      if (page.limit !== undefined) query.set('limit', String(page.limit));
      const suffix = query.size ? `?${query}` : '';
      return call<{ turns: Turn[] }>(`/api/rooms/${encodeURIComponent(channel)}/messages${suffix}`).then((r) => r.turns);
    },
    /** Your own sign; `null` lets it go. */
    setSign: (sign: string | null) =>
      call<{ participant: Participant }>('/api/me/sign', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sign }),
      }).then((r) => r.participant),
    say: (channel: string, text: string) =>
      call<{ turn: Turn }>(`/api/rooms/${encodeURIComponent(channel)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).then((r) => r.turn),
  };
}

export type StreamOptions = {
  token: string;
  onFrame: (frame: SseFrame) => void;
  onConnection: (connection: Connection) => void;
  /** Where the stream left off: sent as `Last-Event-ID` when it has to start again. */
  cursor: () => number | undefined;
  /** For tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  /** How long a silent connection is trusted. The room sends a ping every 25 s. Defaults to 70 s. */
  staleMs?: number;
};

const sleepFor = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

/**
 * Keeps one connection to the room's stream, for as long as it is wanted: when it ends, or goes quiet, it starts again
 * from where it left off, slower each time it fails, a little different for each client (so a restarted room is not
 * met by everyone at once). `fetch`, not `EventSource`, so the token travels in a header and not in the address.
 */
export function connectStream(options: StreamOptions): { close(): void } {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? sleepFor;
  const random = options.random ?? Math.random;
  const staleMs = options.staleMs ?? 70_000;
  const lifetime = new AbortController();
  let progressed = false; // did this attempt get as far as hearing from the room

  async function once(): Promise<'ended' | 'refused'> {
    const attempt = new AbortController();
    const stop = () => attempt.abort();
    lifetime.signal.addEventListener('abort', stop, { once: true });
    let silence: ReturnType<typeof setTimeout> | undefined;
    const listen = () => {
      clearTimeout(silence);
      silence = setTimeout(stop, staleMs); // half-open connections do not announce themselves
    };

    try {
      const cursor = options.cursor();
      listen();
      const res = await fetchImpl('/api/stream', {
        headers: { Authorization: `Bearer ${options.token}`, ...(cursor === undefined ? {} : { 'Last-Event-ID': String(cursor) }) },
        signal: attempt.signal,
      });
      if (res.status === 401) return 'refused';
      if (!res.ok || !res.body) throw new Error(`the room answered ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parse = createSseParser();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return 'ended';
        listen();
        for (const frame of parse(decoder.decode(value, { stream: true }))) {
          if (!progressed) {
            progressed = true;
            options.onConnection('live');
          }
          options.onFrame(frame);
        }
      }
    } catch {
      return 'ended'; // cut, quiet for too long, or the room is away: either way, try again
    } finally {
      clearTimeout(silence);
      lifetime.signal.removeEventListener('abort', stop);
    }
  }

  void (async () => {
    let failures = 0;
    while (!lifetime.signal.aborted) {
      options.onConnection(failures === 0 ? 'connecting' : 'reconnecting');
      progressed = false;
      const result = await once();
      if (result === 'refused') return options.onConnection('refused');
      if (lifetime.signal.aborted) return;

      failures = progressed ? 1 : failures + 1; // a connection that worked and then ended is one failure, not a streak
      options.onConnection('reconnecting');
      const delay = Math.min(15_000, 1000 * 2 ** Math.min(failures - 1, 4)) * (0.75 + random() * 0.5);
      await sleep(delay, lifetime.signal);
    }
  })();

  return { close: () => lifetime.abort() };
}
