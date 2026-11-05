import type { Participant } from './domain.js';
import type { Hub, Sink } from './hub.js';
import { PING } from './sse.js';

export type StreamOptions = {
  /** Defaults to 25 000 ms. */
  heartbeatMs?: number;
  /** A client that falls this far behind is cut off; it reconnects and resumes from its last event. Defaults to 1 MB. */
  maxBufferBytes?: number;
};

/**
 * Serves the live stream to one already-authenticated participant: `GET /api/stream`. The answer is a stream of server-sent
 * events, the same in every home; `onEnd` is told once, when it ends for any reason.
 */
export function serveStream(request: Request, hub: Pick<Hub, 'subscribe'>, participant: Participant, options: StreamOptions = {}, onEnd?: () => void): Response {
  const maxBuffer = options.maxBufferBytes ?? 1_000_000;
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let ended = false;

  const end = () => {
    if (ended) return;
    ended = true;
    clearInterval(heartbeat);
    unsubscribe?.();
    onEnd?.();
  };

  // What waits to go out is counted in bytes. Writing to a stream that is gone, or that has fallen too far behind, throws: the
  // hub then drops it and stops whatever it was sending, instead of serializing a whole backlog for someone no longer there.
  const write = (chunk: string) => {
    if (ended) throw new Error('the connection is closed');
    controller.enqueue(encoder.encode(chunk));
    if ((controller.desiredSize ?? 0) < 0) {
      controller.error(new Error('the connection fell too far behind'));
      end();
      throw new Error('the connection fell too far behind');
    }
  };

  const body = new ReadableStream<Uint8Array>(
    {
      start(c) {
        controller = c;
      },
      // the client went away: in Node, the adapter cancels when the socket closes; on Cloudflare, the runtime does
      cancel: end,
    },
    new ByteLengthQueuingStrategy({ highWaterMark: maxBuffer }),
  );

  write('retry: 3000\n\n');
  const sink: Sink = {
    write,
    close() {
      if (ended) return;
      controller.close();
      end();
    },
  };
  unsubscribe = hub.subscribe(participant, sink, request.headers.get('last-event-id') ?? undefined);
  if (ended) unsubscribe(); // cut off while what was missed was being sent

  if (!ended) {
    heartbeat = setInterval(() => {
      try {
        write(PING);
      } catch {
        // already ended
      }
    }, options.heartbeatMs ?? 25_000);
    (heartbeat as { unref?: () => void }).unref?.();
  }

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no', // a proxy in front must not hold the stream back
    },
  });
}
