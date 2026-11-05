import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, connectStream, createApi } from './client.ts';
import type { Connection } from './client.ts';

const enc = new TextEncoder();
const frame = (event: string, data: unknown, id?: number) => `event: ${event}\n${id === undefined ? '' : `id: ${id}\n`}data: ${JSON.stringify(data)}\n\n`;

/** A response that sends these pieces and then ends, or stays open and silent when `hold` is set. */
function stream(pieces: string[], { hold = false, status = 200 }: { hold?: boolean; status?: number } = {}) {
  return (_url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(
      new Response(
        status === 200
          ? new ReadableStream({
              start(controller) {
                for (const piece of pieces) controller.enqueue(enc.encode(piece));
                if (!hold) controller.close();
                init?.signal?.addEventListener('abort', () => {
                  try {
                    controller.error(new DOMException('aborted', 'AbortError'));
                  } catch {
                    /* already closed */
                  }
                });
              },
            })
          : null,
        { status },
      ),
    );
}

function harness(responses: ReturnType<typeof stream>[], extra: Partial<Parameters<typeof connectStream>[0]> = {}) {
  const calls: { headers: Record<string, string> }[] = [];
  const frames: { event: string; data: unknown }[] = [];
  const states: Connection[] = [];
  const delays: number[] = [];
  let cursor: number | undefined;
  let i = 0;

  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ headers: { ...(init?.headers as Record<string, string>) } });
    const respond = responses[Math.min(i++, responses.length - 1)] as ReturnType<typeof stream>;
    return respond(url, init);
  }) as typeof fetch;

  const connection = connectStream({
    token: 'tok',
    fetchImpl,
    cursor: () => cursor,
    onFrame: (f) => {
      frames.push({ event: f.event, data: f.data });
      if (f.event === 'message' && f.id) cursor = Number(f.id);
    },
    onConnection: (c) => states.push(c),
    sleep: async (ms) => void delays.push(ms),
    random: () => 0.5, // jitter factor exactly 1
    ...extra,
  });
  return { calls, frames, states, delays, connection };
}

const until = async (condition: () => boolean, ms = 1000) => {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) assert.fail('timed out');
    await new Promise((r) => setTimeout(r, 2));
  }
};

test('it signs in with a header, starts from nowhere, and is live once the room has spoken', async () => {
  const h = harness([stream([frame('hello', { lastSeq: 0 }), frame('message', { text: 'salut' }, 1)], { hold: true })]);
  await until(() => h.frames.length === 2);

  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0]?.headers.Authorization, 'Bearer tok');
  assert.equal('Last-Event-ID' in (h.calls[0]?.headers ?? {}), false);
  assert.deepEqual(h.states, ['connecting', 'live']);
  assert.deepEqual(h.frames.map((f) => f.event), ['hello', 'message']);
  h.connection.close();
});

test('when the stream ends it starts again from the last event it saw', async () => {
  const h = harness([stream([frame('hello', {}), frame('message', { n: 1 }, 41), frame('message', { n: 2 }, 42)]), stream([frame('hello', {})], { hold: true })]);
  await until(() => h.calls.length === 2 && h.states.includes('live') && h.frames.filter((f) => f.event === 'hello').length === 2);

  assert.equal(h.calls[1]?.headers['Last-Event-ID'], '42');
  assert.deepEqual(h.states.slice(0, 4), ['connecting', 'live', 'reconnecting', 'reconnecting']);
  assert.equal(h.states.at(-1), 'live');
  assert.deepEqual(h.delays, [1000]); // a connection that worked and ended is one failure
  h.connection.close();
});

test('a room that cannot be reached is tried again, slower each time, up to a limit', async () => {
  const down = stream([], { status: 503 });
  const h = harness([down, down, down, down, down, down, down, stream([frame('hello', {})], { hold: true })]);
  await until(() => h.states.at(-1) === 'live');

  assert.deepEqual(h.delays, [1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  assert.equal(h.calls.length, 8);
  h.connection.close();
});

test('a token the room does not know ends it: no retry, and it says so', async () => {
  const h = harness([stream([], { status: 401 })]);
  await until(() => h.states.at(-1) === 'refused');
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.states, ['connecting', 'refused']);
  assert.deepEqual(h.delays, []);
});

test('a connection that goes quiet for too long is dropped and started again', async () => {
  const h = harness([stream([frame('hello', {}), frame('message', { n: 1 }, 5)], { hold: true }), stream([frame('hello', {})], { hold: true })], { staleMs: 30 });
  await until(() => h.calls.length === 2);

  assert.equal(h.calls[1]?.headers['Last-Event-ID'], '5');
  h.connection.close();
});

test('closing it stops everything, even the wait before the next try', async () => {
  const h = harness([stream([frame('hello', {})])], { sleep: (_ms, signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })) });
  await until(() => h.states.at(-1) === 'reconnecting');
  h.connection.close();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(h.calls.length, 1);
});

test('the API: a token on every call, the page asked for, and a refusal that says why and for how long', async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const answers = [
    () => new Response(JSON.stringify({ id: 'human:athena', kind: 'human', alias: 'Athena', capabilities: [] })),
    () => new Response(JSON.stringify({ turns: [] })),
    () => new Response(JSON.stringify({ turn: { seq: 3 } }), { status: 201 }),
    () => new Response(JSON.stringify({ error: 'too many messages, slow down' }), { status: 429, headers: { 'Retry-After': '7' } }),
    () => new Response('not json', { status: 502, statusText: 'Bad Gateway' }),
  ];
  let n = 0;
  const api = createApi('tok', ((url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return Promise.resolve((answers[n++] as () => Response)());
  }) as typeof fetch);

  assert.equal((await api.me()).alias, 'Athena');
  await api.history('olympus', { before: 12, limit: 20 });
  assert.equal((await api.say('general', 'salut')).seq, 3);
  assert.equal(seen[1]?.url, '/api/rooms/olympus/messages?before=12&limit=20');
  assert.equal(seen[2]?.url, '/api/rooms/general/messages');
  assert.equal(seen[2]?.init?.method, 'POST');
  assert.equal(seen[2]?.init?.body, '{"text":"salut"}');
  for (const call of seen) assert.equal((call.init?.headers as Record<string, string>).Authorization, 'Bearer tok');

  await assert.rejects(api.say('general', 'x'), (err: unknown) => err instanceof ApiError && err.status === 429 && err.retryAfter === 7 && /slow down/.test(err.message));
  await assert.rejects(api.me(), (err: unknown) => err instanceof ApiError && err.status === 502 && err.message === 'Bad Gateway');
});
