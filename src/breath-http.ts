// 🌬️ The tree's door over HTTP, the same in every home: `GET /api/breath` to listen (server-sent events) and `POST /api/breath/<id>` to
// send. No key, because the hub behind it knows no one; and no answer to say whether a signal was heard: a POST is always `204`, a
// stream that cannot be had (the room's listeners are many, or this caller has been opening many) is a `204` as well, so a page
// has nothing to show but a tree that stands still. See docs/rfc-001-presence-physics.md §17.
import { CALLER_HEADER } from './app.js';
import { BreathHub } from './breath.js';
import { SlidingWindowLimiter } from './limiter.js';
import { PING, frame } from './sse.js';

export type BreathHttpOptions = {
  /** Streams open at once, all callers together. Defaults to 200: past it, the next one is let wait, with nothing said. */
  maxListeners?: number;
  /** Streams one caller may open in a minute. Defaults to 12. */
  streamsPerMinute?: number;
  /** Signals one caller may send in a minute. Defaults to 90 (a breath every two seconds is thirty). */
  signalsPerMinute?: number;
  /** The home says who is calling in `CALLER_HEADER` (see `AppOptions.callerFromHome`). Without it, every caller is one. */
  callerFromHome?: boolean;
  /** Defaults to 25 000 ms. */
  heartbeatMs?: number;
  /** How often the hub looks for silence. Defaults to 1 000 ms. */
  sweepMs?: number;
  /** For tests. */
  now?: () => number;
};

const MAX_SIGNAL_BYTES = 256;

const quiet = (): Response => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export function createBreathHandler(hub: BreathHub, options: BreathHttpOptions = {}): (request: Request) => Promise<Response> {
  const maxListeners = options.maxListeners ?? 200;
  const opens = new SlidingWindowLimiter(options.streamsPerMinute ?? 12, 60_000, options.now);
  const signals = new SlidingWindowLimiter(options.signalsPerMinute ?? 90, 60_000, options.now);
  const encoder = new TextEncoder();
  let streams = 0;
  let sweeping: ReturnType<typeof setInterval> | undefined;

  const callerOf = (request: Request): string => (options.callerFromHome && request.headers.get(CALLER_HEADER)) || 'unknown';

  // the hub has no clock: it is looked at while someone listens, and left alone when no one does
  const startSweeping = () => {
    if (sweeping) return;
    sweeping = setInterval(() => hub.sweep(), options.sweepMs ?? 1_000);
    (sweeping as { unref?: () => void }).unref?.();
  };
  const stopSweeping = () => {
    if (hub.open || !sweeping) return;
    clearInterval(sweeping);
    sweeping = undefined;
  };

  function listen(request: Request): Response {
    if (streams >= maxListeners || opens.take(callerOf(request)) > 0) return quiet();

    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let leave: (() => void) | undefined;
    let ended = false;

    const end = () => {
      if (ended) return;
      ended = true;
      streams -= 1;
      clearInterval(heartbeat);
      leave?.();
      stopSweeping();
    };
    const write = (chunk: string) => {
      if (ended) throw new Error('the connection is closed');
      controller.enqueue(encoder.encode(chunk));
      // a stream that falls behind is a stream that is gone: nothing is kept for it
      if ((controller.desiredSize ?? 0) < 0) {
        controller.error(new Error('the connection fell too far behind'));
        end();
        throw new Error('the connection fell too far behind');
      }
    };

    const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c), cancel: end }, new ByteLengthQueuingStrategy({ highWaterMark: 16_384 }));
    streams += 1;
    write('retry: 3000\n\n');
    const listener = hub.listen((f) => write(f.type === 'knock' ? frame('knock', {}) : frame('breath', { id: f.id, rate: f.rate, phase: f.phase })));
    leave = listener.leave;
    // the only thing a stream is told about itself: the id by which it may send
    write(frame('hello', { you: listener.id }));
    startSweeping();
    heartbeat = setInterval(() => {
      try {
        write(PING);
      } catch {
        // already ended
      }
    }, options.heartbeatMs ?? 25_000);
    (heartbeat as { unref?: () => void }).unref?.();

    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
    });
  }

  async function send(request: Request, id: string): Promise<Response> {
    if (signals.take(callerOf(request)) > 0) return quiet();
    const declared = Number(request.headers.get('content-length') ?? undefined);
    if (Number.isFinite(declared) && declared > MAX_SIGNAL_BYTES) return quiet();
    try {
      const text = await request.text();
      if (text.length <= MAX_SIGNAL_BYTES) hub.signal(id, JSON.parse(text));
    } catch {
      // not a signal: let drop, with nothing said
    }
    return quiet();
  }

  return async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/breath') {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
      return listen(request);
    }
    const id = /^\/api\/breath\/([0-9a-f-]{36})$/.exec(pathname)?.[1];
    if (id) {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
      return send(request, id);
    }
    return new Response(null, { status: 404 });
  };
}
