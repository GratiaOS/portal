import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { Hub, serveStream, toNodeListener } from '../dist/index.js';
import { Collector, fakeSink, parseFrames, room, sleep } from './helpers.mjs';

test('the stream over a real server: headers, hello, what was missed, heartbeat, live turns, and leaving', async () => {
  const store = room();
  const hub = new Hub(store, { graceMs: 25 });
  const zeus = store.getParticipant('human:zeus');
  const hera = store.getParticipant('human:hera');
  for (const text of ['one', 'two', 'three']) hub.publish({ conversationId: 'general', speakerId: hera.id, text });

  const server = createServer(toNodeListener(async (request) => serveStream(request, hub, zeus, { heartbeatMs: 20 })));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const watcher = fakeSink(); // Hera, watching from inside
  hub.subscribe(hera, watcher);

  const abort = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/stream`, {
      headers: { 'Last-Event-ID': '1' },
      signal: abort.signal,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/event-stream/);
    assert.match(response.headers.get('cache-control'), /no-cache/);

    const stream = new Collector(response);
    await stream.waitFor((t) => t.includes('id: 3') && t.includes(': ping'));
    assert.match(stream.text, /^retry: 3000\n\n/);
    const frames = parseFrames(stream.text);
    assert.deepEqual(frames.slice(0, 3).map((f) => f.event), ['hello', 'message', 'message']);
    assert.deepEqual(frames.slice(1, 3).map((f) => f.data.text), ['two', 'three']);

    // she hears that he arrived
    assert.deepEqual(watcher.frames().at(-1).data, { participantId: 'human:zeus', state: 'online' });

    // a live turn
    hub.publish({ conversationId: 'general', speakerId: hera.id, text: 'four' });
    await stream.waitFor((t) => t.includes('id: 4'));
    assert.equal(parseFrames(stream.text).at(-1).data.text, 'four');

    // he leaves; after the grace she hears it
    abort.abort();
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && watcher.frames().at(-1).data.state !== 'offline') await sleep(5);
    assert.equal(watcher.frames().at(-1).data.state, 'offline');
  } finally {
    hub.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

/** The hub as the stream sees it, counting what is written to each connection. */
function counting(hub) {
  const counter = { writes: 0 };
  counter.hub = {
    subscribe: (participant, sink, lastEventId) =>
      hub.subscribe(participant, { write: (chunk) => (counter.writes += 1, sink.write(chunk)), close: () => sink.close() }, lastEventId),
  };
  return counter;
}

const asked = (headers = {}) => new Request('http://portal.local/api/stream', { headers });

test('a client that reads nothing is cut off, and the rest of what it missed is not serialized for it', async () => {
  const store = room();
  const hub = new Hub(store, { graceMs: 25 });
  const zeus = store.getParticipant('human:zeus');
  for (let i = 0; i < 400; i += 1) store.appendTurn({ conversationId: 'general', speakerId: zeus.id, text: `mesaj ${i} `.repeat(4) });

  const counter = counting(hub);
  let ended = 0;
  const response = serveStream(asked({ 'Last-Event-ID': '0' }), counter.hub, zeus, { maxBufferBytes: 3000, heartbeatMs: 60_000 }, () => (ended += 1));

  assert.ok(counter.writes < 40, `${counter.writes} writes: it kept going after the connection was cut`);
  assert.equal(ended, 1);
  await assert.rejects(response.body.getReader().read(), /fell too far behind/);

  // and it is not written to again, by anything
  const before = counter.writes;
  hub.publish({ conversationId: 'general', speakerId: zeus.id, text: 'încă unul' });
  assert.equal(counter.writes, before);
  hub.close();
});

test('a stream that is already gone is not written to', async () => {
  const store = room();
  const hub = new Hub(store, { graceMs: 25 });
  const zeus = store.getParticipant('human:zeus');

  const counter = counting(hub);
  let ended = 0;
  const response = serveStream(asked(), counter.hub, zeus, { heartbeatMs: 60_000 }, () => (ended += 1));
  const before = counter.writes;
  await response.body.cancel(); // the client went away
  assert.equal(ended, 1);
  hub.publish({ conversationId: 'general', speakerId: zeus.id, text: 'nimeni nu mai ascultă' });
  assert.equal(counter.writes, before);
  hub.close();
});

test('a body sent to a slow client waits for the socket each time, and leaves no listener behind each time', async () => {
  const chunk = new Uint8Array(64 * 1024);
  let res;
  let closeListeners = 0;
  let sent = 0;
  const body = new ReadableStream({
    pull(controller) {
      sent += 1;
      if (sent === 150) closeListeners = res.listenerCount('close'); // well into the body, after many waits
      if (sent > 200) controller.close();
      else controller.enqueue(chunk);
    },
  });
  const listener = toNodeListener(async () => new Response(body));
  const server = createServer((req, r) => {
    res = r;
    listener(req, r);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    const reader = response.body.getReader();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      await sleep(1); // a client slower than the server, so the socket fills again and again
    }
    assert.equal(received, 200 * chunk.byteLength);
    assert.ok(closeListeners > 0 && closeListeners < 6, `${closeListeners} listeners for close: they piled up`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
