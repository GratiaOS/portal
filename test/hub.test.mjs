import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hub, RoomError } from '../dist/index.js';
import { fakeSink, room, sleep } from './helpers.mjs';

const GRACE = 25;
const AFTER_GRACE = 90;

function setup() {
  const store = room();
  const hub = new Hub(store, { graceMs: GRACE });
  const who = (id) => store.getParticipant(id);
  return { store, hub, zeus: who('human:zeus'), hera: who('human:hera'), nova: who('companion:nova') };
}

test('a connection starts with hello: who it is, who is here, where to talk, where the room is', () => {
  const { hub, store, zeus } = setup();
  store.appendTurn({ conversationId: 'general', speakerId: zeus.id, text: 'salut' });

  const sink = fakeSink();
  hub.subscribe(zeus, sink);
  const [hello] = sink.frames();

  assert.equal(hello.event, 'hello');
  assert.equal(hello.id, undefined); // not part of the resume cursor
  assert.equal(hello.data.you.id, 'human:zeus');
  assert.equal(hello.data.participants.length, 3);
  assert.deepEqual(hello.data.conversations.map((c) => c.id), ['general', 'olympus']);
  assert.equal(hello.data.lastSeq, 1);

  const presence = Object.fromEntries(hello.data.presence.map((p) => [p.participantId, p]));
  assert.equal(presence['human:zeus'].state, 'online'); // they are here now
  assert.equal(presence['human:hera'].state, 'offline');
  assert.equal(presence['companion:nova'].state, 'online'); // a companion is there while the room runs
  hub.close();
});

test('a turn reaches everyone, with its seq as the event id, and the listeners', () => {
  const { hub, zeus, hera } = setup();
  const a = fakeSink();
  const b = fakeSink();
  hub.subscribe(zeus, a);
  hub.subscribe(hera, b);
  const heard = [];
  hub.on('turn', (turn) => heard.push(turn));

  const turn = hub.publish({ conversationId: 'olympus', speakerId: hera.id, text: '@nova putem sari pasul cu Styx?' });

  assert.equal(turn.seq, 1);
  assert.deepEqual(turn.mentions, ['companion:nova']);
  for (const sink of [a, b]) {
    const message = sink.frames().find((f) => f.event === 'message');
    assert.equal(message.id, '1');
    assert.deepEqual(message.data, turn);
  }
  assert.deepEqual(heard, [turn]);
  hub.close();
});

test('a refused turn is told to nobody', () => {
  const { hub, zeus } = setup();
  const sink = fakeSink();
  hub.subscribe(zeus, sink);
  const heard = [];
  hub.on('turn', (turn) => heard.push(turn));
  const before = sink.chunks.length;

  assert.throws(() => hub.publish({ conversationId: 'general', speakerId: zeus.id, text: '  ' }), RoomError);
  assert.throws(() => hub.publish({ conversationId: 'nowhere', speakerId: zeus.id, text: 'salut' }), RoomError);

  assert.equal(sink.chunks.length, before);
  assert.deepEqual(heard, []);
  hub.close();
});

test('a listener that fails does not stop the others or the room', () => {
  const { hub, zeus } = setup();
  const sink = fakeSink();
  hub.subscribe(zeus, sink);
  const heard = [];
  hub.on('turn', () => {
    throw new Error('boom');
  });
  hub.on('turn', (turn) => heard.push(turn.text));

  const log = console.error;
  console.error = () => undefined;
  try {
    hub.publish({ conversationId: 'general', speakerId: zeus.id, text: 'salut' });
  } finally {
    console.error = log;
  }
  assert.deepEqual(heard, ['salut']);
  assert.equal(sink.events().at(-1), 'message');
  hub.close();
});

test('a client that was away gets what it missed after hello, in order', () => {
  const { hub, zeus } = setup();
  for (const text of ['one', 'two', 'three']) hub.publish({ conversationId: 'general', speakerId: zeus.id, text });

  for (const lastEventId of ['1', 1]) {
    const sink = fakeSink();
    hub.subscribe(zeus, sink, lastEventId);
    assert.deepEqual(sink.events(), ['hello', 'message', 'message']);
    assert.deepEqual(sink.frames().slice(1).map((f) => f.id), ['2', '3']);
  }
  // nothing asked for, nothing sent: history comes from the REST side
  for (const lastEventId of [undefined, 'abc', '-5', '', '3']) {
    const sink = fakeSink();
    hub.subscribe(zeus, sink, lastEventId);
    assert.deepEqual(sink.events(), ['hello'], `Last-Event-ID ${JSON.stringify(lastEventId)}`);
  }
  hub.close();
});

test('a connection that goes away in the middle of what it missed is not sent the rest', () => {
  const { hub, store, zeus } = setup();
  for (let i = 0; i < 1500; i += 1) store.appendTurn({ conversationId: 'general', speakerId: zeus.id, text: `m${i}` });

  let writes = 0;
  hub.subscribe(zeus, {
    write() {
      writes += 1;
      if (writes === 3) throw new Error('gone'); // hello and two turns went, then it was gone
    },
  }, '0');
  assert.equal(writes, 3); // not 1501
  hub.close();
});

test('what was missed can be more than one page', () => {
  const { hub, store, zeus } = setup();
  for (let i = 0; i < 1100; i += 1) store.appendTurn({ conversationId: 'general', speakerId: zeus.id, text: `m${i}` });

  const sink = fakeSink();
  hub.subscribe(zeus, sink, '0');
  const ids = sink.frames().filter((f) => f.event === 'message').map((f) => Number(f.id));
  assert.equal(ids.length, 1100);
  assert.deepEqual(ids, Array.from({ length: 1100 }, (_, i) => i + 1));
  hub.close();
});

test('presence: others hear when someone arrives, and when they have really left', async () => {
  const { hub, zeus, hera } = setup();
  const a = fakeSink();
  const b = fakeSink();
  const seen = [];
  hub.on('presence', (p) => seen.push(`${p.participantId} ${p.state}`));

  hub.subscribe(zeus, a);
  const leave = hub.subscribe(hera, b);
  assert.deepEqual(a.events(), ['hello', 'presence']);
  assert.equal(a.frames()[1].data.participantId, 'human:hera');
  assert.equal(a.frames()[1].data.state, 'online');
  assert.deepEqual(b.events(), ['hello']); // the newcomer is told who is here, not about themselves

  leave();
  await sleep(5);
  assert.deepEqual(a.events(), ['hello', 'presence']); // gone a moment ago, not yet "offline"
  await sleep(AFTER_GRACE);
  assert.deepEqual(a.events(), ['hello', 'presence', 'presence']);
  assert.equal(a.frames()[2].data.state, 'offline');
  assert.deepEqual(seen, ['human:zeus online', 'human:hera online', 'human:hera offline']);
  hub.close();
});

test('presence: a refresh does not blink, and many tabs count as one person', async () => {
  const { hub, zeus, hera } = setup();
  const watcher = fakeSink();
  hub.subscribe(zeus, watcher);

  const first = hub.subscribe(hera, fakeSink());
  const again = fakeSink();
  first();
  const back = hub.subscribe(hera, again); // back before the grace ran out
  assert.equal(again.frames()[0].data.presence.find((p) => p.participantId === 'human:hera').state, 'online');
  await sleep(AFTER_GRACE);
  assert.deepEqual(watcher.events(), ['hello', 'presence']); // only the arrival, no offline-online blink

  const secondTab = hub.subscribe(hera, fakeSink());
  back();
  await sleep(AFTER_GRACE);
  assert.equal(watcher.events().length, 2); // one tab is still open, so she is still here
  secondTab();
  await sleep(AFTER_GRACE);
  assert.equal(watcher.frames().at(-1).data.state, 'offline');
  hub.close();
});

test('presence: a companion is always there and never announced', async () => {
  const { hub, zeus, nova } = setup();
  const watcher = fakeSink();
  hub.subscribe(zeus, watcher);

  const leave = hub.subscribe(nova, fakeSink());
  leave();
  await sleep(AFTER_GRACE);
  assert.deepEqual(watcher.events(), ['hello']);
  assert.equal(hub.snapshot().find((p) => p.participantId === 'companion:nova').state, 'online');
  hub.close();
});

test('a connection that cannot be written to is dropped; the others carry on', async () => {
  const { hub, zeus, hera } = setup();
  const watcher = fakeSink();
  hub.subscribe(zeus, watcher);

  let writes = 0;
  hub.subscribe(hera, {
    write() {
      writes += 1;
      if (writes > 1) throw new Error('socket is gone'); // hello goes through, the next thing does not
    },
  });

  assert.doesNotThrow(() => hub.publish({ conversationId: 'general', speakerId: zeus.id, text: 'salut' }));
  assert.equal(watcher.events().at(-1), 'message');
  await sleep(AFTER_GRACE);
  assert.equal(watcher.frames().at(-1).data.state, 'offline'); // and she shows as gone
  hub.publish({ conversationId: 'general', speakerId: zeus.id, text: 'încă o dată' });
  assert.equal(writes, 2); // not written to again
  hub.close();
});

test('after unsubscribing nothing arrives, and unsubscribing twice is fine', () => {
  const { hub, zeus, hera } = setup();
  const sink = fakeSink();
  const leave = hub.subscribe(zeus, sink);
  const count = sink.chunks.length;

  leave();
  leave();
  hub.publish({ conversationId: 'general', speakerId: hera.id, text: 'salut' });
  assert.equal(sink.chunks.length, count);
  hub.close();
});

test('closing the hub ends every connection and leaves no timer behind', async () => {
  const { hub, zeus, hera } = setup();
  const a = fakeSink();
  const b = fakeSink();
  const watcher = fakeSink();
  hub.subscribe(zeus, a);
  hub.subscribe(hera, b);
  hub.subscribe(zeus, watcher);

  hub.close();
  assert.equal(a.closed && b.closed && watcher.closed, true);
  hub.publish({ conversationId: 'general', speakerId: zeus.id, text: 'nimeni nu aude' });
  await sleep(AFTER_GRACE);
  assert.equal(a.events().includes('message'), false);
});

test('activity: "thinking" is told once, to everyone, and to whoever arrives in the middle of it', () => {
  const { hub, zeus, hera } = setup();
  const watcher = fakeSink();
  hub.subscribe(zeus, watcher);
  const seen = [];
  hub.on('activity', (a) => seen.push(`${a.participantId} ${a.conversationId} ${a.state}`));

  hub.setActivity('companion:nova', 'olympus', 'thinking');
  hub.setActivity('companion:nova', 'olympus', 'thinking'); // saying it again changes nothing
  assert.deepEqual(watcher.events(), ['hello', 'activity']);
  assert.deepEqual(watcher.frames()[1].data, { participantId: 'companion:nova', conversationId: 'olympus', state: 'thinking' });
  assert.equal(watcher.frames()[1].id, undefined); // not part of the resume cursor, and never stored

  const late = fakeSink();
  hub.subscribe(hera, late);
  assert.deepEqual(late.frames()[0].data.activity, [{ participantId: 'companion:nova', conversationId: 'olympus', state: 'thinking' }]);

  hub.setActivity('companion:nova', 'general', 'idle'); // was never thinking there: nothing to tell
  hub.setActivity('companion:nova', 'olympus', 'idle');
  hub.setActivity('companion:nova', 'olympus', 'idle');
  assert.deepEqual(watcher.frames().filter((f) => f.event === 'activity').map((f) => f.data.state), ['thinking', 'idle']);
  assert.deepEqual(seen, ['companion:nova olympus thinking', 'companion:nova olympus idle']);

  const after = fakeSink();
  hub.subscribe(zeus, after);
  assert.deepEqual(after.frames()[0].data.activity, []);
  hub.close();
});

test('presence says who is here and never when: nothing on the wire could be made into a timecard', async () => {
  const { hub, zeus, hera } = setup();
  const watcher = fakeSink();
  hub.subscribe(zeus, watcher);
  const leave = hub.subscribe(hera, fakeSink());
  leave();
  await sleep(AFTER_GRACE); // she came, and she went: both were told

  const frames = watcher.frames();
  const told = frames.filter((f) => f.event === 'presence').map((f) => f.data);
  assert.equal(told.length, 2);
  for (const presence of [...told, ...frames[0].data.presence]) {
    assert.deepEqual(Object.keys(presence).sort(), ['participantId', 'state']);
  }
  assert.equal(/lastSeen|\d{4}-\d\d-\d\dT\d\d:/.test(JSON.stringify([told, frames[0].data.presence])), false);

  const seen = [];
  hub.on('presence', (p) => seen.push(p));
  hub.subscribe(hera, fakeSink());
  assert.deepEqual(Object.keys(seen[0]).sort(), ['participantId', 'state']); // the listeners are told no time either
  hub.close();
});
