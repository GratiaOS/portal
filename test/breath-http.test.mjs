import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BreathHub, createApp, createBreathHandler, parseConfig, CALLER_HEADER } from '../dist/index.js';
import { parseFrames, room, sleep } from './helpers.mjs';

/** Reads a stream in the background, and can be cut: what `Collector` does, with the way out the tests below need. */
function listener(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const self = {
    text: '',
    cut: () => reader.cancel().catch(() => {}),
    async waitFor(predicate, ms = 2000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (predicate(self.text)) return;
        await sleep(5);
      }
      assert.fail(`timed out; the stream ended with ${JSON.stringify(self.text.slice(-300))}`);
    },
  };
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        self.text += decoder.decode(value, { stream: true });
      }
    } catch {
      // cut
    }
  })();
  return self;
}

const url = (path) => `http://portal.test${path}`;
const breathBody = (rate = 12, phase = 'inhale') => JSON.stringify({ type: 'breath', rate, phase });

function setup(options = {}, hubOptions = {}) {
  const hub = new BreathHub(hubOptions);
  const handle = createBreathHandler(hub, { heartbeatMs: 20, sweepMs: 10, ...options });
  const open = async (headers = {}) => {
    const response = await handle(new Request(url('/api/breath'), { headers }));
    if (response.status !== 200) return { response };
    const collector = listener(response);
    await collector.waitFor((t) => t.includes('event: hello'));
    const id = parseFrames(collector.text).find((f) => f.event === 'hello').data.you;
    return { response, collector, id, close: () => collector.cut() };
  };
  const send = (id, body, headers = {}) => handle(new Request(url(`/api/breath/${id}`), { method: 'POST', body, headers }));
  const events = (listener, name) => parseFrames(listener.collector.text).filter((f) => f.event === name);
  return { hub, handle, open, send, events };
}

test('a stream opens with no key, says only the id by which it may send, and nothing else about itself', async () => {
  const { open, hub } = setup();
  const a = await open();
  assert.equal(a.response.status, 200);
  assert.match(a.response.headers.get('content-type'), /^text\/event-stream/);
  assert.match(a.collector.text, /^retry: 3000\n\n/);
  assert.deepEqual(parseFrames(a.collector.text).map((f) => f.event), ['hello']);
  assert.deepEqual(Object.keys(parseFrames(a.collector.text)[0].data), ['you']);
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  a.close();
  hub.close();
});

test('a breath sent by one is heard by the other as an event, and never by the one who sent it', async () => {
  const { open, send, events, hub } = setup();
  const a = await open();
  const b = await open();
  const answer = await send(a.id, breathBody(11.26, 'exhale'));
  assert.equal(answer.status, 204);

  await b.collector.waitFor((t) => t.includes('event: breath'));
  assert.deepEqual(events(b, 'breath')[0].data, { id: a.id, rate: 11.3, phase: 'exhale' });
  await sleep(30);
  assert.equal(events(a, 'breath').length, 0);
  a.close();
  b.close();
  hub.close();
});

test('a POST is always 204: heard or not, understood or not, from someone or no one', async () => {
  const { open, send, hub } = setup({}, { seats: 1 });
  const a = await open();
  const b = await open();
  await send(a.id, breathBody()); // a sits
  const statuses = [
    (await send(b.id, breathBody())).status, // no seat
    (await send(b.id, 'not json')).status,
    (await send(b.id, '{"type":"text","text":"hi"}')).status,
    (await send('00000000-0000-0000-0000-000000000000', breathBody())).status, // no one
    (await send(b.id, 'x'.repeat(5000))).status, // too big
  ];
  assert.deepEqual(statuses, [204, 204, 204, 204, 204]);
  a.close();
  b.close();
  hub.close();
});

test('a knock is an event with nothing in it', async () => {
  const { open, send, events, hub } = setup();
  const a = await open();
  const b = await open();
  await send(a.id, breathBody());
  await send(a.id, '{"type":"knock","who":"a"}');
  await b.collector.waitFor((t) => t.includes('event: knock'));
  assert.deepEqual(events(b, 'knock')[0].data, {});
  a.close();
  b.close();
  hub.close();
});

test('a stream that cannot be had is a 204 with nothing in it: too many listening, or too many from one caller', async () => {
  const full = setup({ maxListeners: 1 });
  const first = await full.open();
  const second = await full.open();
  assert.equal(second.response.status, 204);
  assert.equal(second.response.body, null);
  first.close();
  full.hub.close();

  const many = setup({ streamsPerMinute: 2, callerFromHome: true });
  const caller = { [CALLER_HEADER]: '203.0.113.7' };
  const one = await many.open(caller);
  const two = await many.open(caller);
  const three = await many.open(caller);
  assert.equal(three.response.status, 204);
  assert.equal((await many.open({ [CALLER_HEADER]: '203.0.113.8' })).response.status, 200); // another caller is not counted with them
  one.close();
  two.close();
  many.hub.close();
});

test('a caller that sends too much is let drop, quietly', async () => {
  const { open, send, events, hub } = setup({ signalsPerMinute: 2 });
  const a = await open();
  const b = await open();
  for (let i = 0; i < 5; i += 1) assert.equal((await send(a.id, breathBody())).status, 204);
  await sleep(40);
  assert.equal(events(b, 'breath').length, 2);
  a.close();
  b.close();
  hub.close();
});

test('the wrong method, and a path that is not the tree, get plain answers', async () => {
  const { handle, hub } = setup();
  assert.equal((await handle(new Request(url('/api/breath'), { method: 'POST' }))).status, 405);
  assert.equal((await handle(new Request(url('/api/breath/00000000-0000-0000-0000-000000000000')))).status, 405);
  assert.equal((await handle(new Request(url('/api/breath/not-an-id'), { method: 'POST' }))).status, 404);
  hub.close();
});

test('a stream that is cut gives its place up, and the hub is not open with no one in it', async () => {
  const { open, hub } = setup();
  assert.equal(hub.open, false);
  const a = await open();
  assert.equal(hub.open, true);
  await a.close();
  assert.equal(hub.open, false);
});

test('silence is let go while someone listens: a seat taken is free again after the time', async () => {
  const { open, send, events, hub } = setup({}, { seats: 1, silenceMs: 40 });
  const a = await open();
  const b = await open();
  await send(a.id, breathBody());
  await sleep(120); // the sweep has let a's seat go
  await send(b.id, breathBody(15));
  await a.collector.waitFor((t) => t.includes('event: breath'));
  assert.equal(events(a, 'breath')[0].data.id, b.id);
  a.close();
  b.close();
  hub.close();
});

test('in the app: the tree answers with no key and is said in the health; without it the paths are not there', async () => {
  const hub = new BreathHub();
  const handler = createBreathHandler(hub, { heartbeatMs: 20 });
  const app = createApp(room(), new (await import('../dist/index.js')).Hub(room(), { graceMs: 5 }), { version: 'test', authenticate: () => undefined, breath: handler });
  const health = await (await app(new Request(url('/api/health')))).json();
  assert.equal(health.breath, true);
  const stream = await app(new Request(url('/api/breath')));
  assert.equal(stream.status, 200); // no Authorization header
  await stream.body.cancel();

  const without = createApp(room(), new (await import('../dist/index.js')).Hub(room(), { graceMs: 5 }), { version: 'test', authenticate: () => undefined });
  assert.equal((await (await without(new Request(url('/api/health')))).json()).breath, undefined);
  assert.equal((await without(new Request(url('/api/breath')))).status, 401); // as any path under /api with no key
  hub.close();
});

test('the config: a breath block asks for the tree, with its seats; none, and there is no tree', () => {
  const base = { participants: [{ kind: 'human', alias: 'Zeus', token: 'z'.repeat(24) }], rooms: [{ id: 'general', title: 'General', kind: 'team' }] };
  assert.equal(parseConfig(base, '/').breath, undefined);
  assert.deepEqual(parseConfig({ ...base, breath: {} }, '/').breath, { seats: 4 });
  assert.deepEqual(parseConfig({ ...base, breath: { seats: 6 } }, '/').breath, { seats: 6 });
  assert.throws(() => parseConfig({ ...base, breath: { seats: 0 } }, '/'), /breath\.seats/);
  assert.throws(() => parseConfig({ ...base, breath: 'on' }, '/'), /breath must be an object/);
});
