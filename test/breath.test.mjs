import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BreathHub } from '../dist/index.js';

function setup(options = {}) {
  let t = 1_000_000;
  const hub = new BreathHub({ now: () => t, ...options });
  const ear = () => {
    const heard = [];
    const { id, leave } = hub.listen((frame) => heard.push(frame));
    return { id, leave, heard };
  };
  return { hub, ear, tick: (ms) => (t += ms) };
}

const breath = (rate = 12, phase = 'inhale') => ({ type: 'breath', rate, phase });

test('a breath goes to the others, never back to whoever sent it', () => {
  const { hub, ear } = setup();
  const a = ear();
  const b = ear();
  hub.signal(a.id, breath(12.44, 'exhale'));

  assert.deepEqual(a.heard, []);
  assert.deepEqual(b.heard, [{ type: 'breath', id: a.id, rate: 12.4, phase: 'exhale' }]);
  hub.close();
});

test('a frame has no timestamp and no sequence: only the source, a rate and a phase', () => {
  const { hub, ear } = setup();
  const a = ear();
  const b = ear();
  hub.signal(a.id, breath());
  assert.deepEqual(Object.keys(b.heard[0]).sort(), ['id', 'phase', 'rate', 'type']);
});

test('sending returns nothing: a signal gets no answer, heard or not', () => {
  const { hub, ear } = setup({ seats: 1 });
  const a = ear();
  const b = ear();
  assert.equal(hub.signal(a.id, breath()), undefined);
  assert.equal(hub.signal(b.id, breath()), undefined); // no seat, and no word of it
  assert.equal(hub.signal('no one', breath()), undefined);
});

test('what is not a signal is let drop: a bad rate, a bad phase, a bad shape', () => {
  const { hub, ear } = setup();
  const a = ear();
  const b = ear();
  for (const bad of [null, 'breath', 7, {}, { type: 'text', text: 'hi' }, breath(0.9), breath(31), breath(Number.NaN), breath(Infinity), breath('12'), breath(12, 'sigh'), { type: 'breath' }]) {
    hub.signal(a.id, bad);
  }
  assert.deepEqual(b.heard, []);
});

test('only four sit: the fifth is not heard, and hears the others all the same', () => {
  const { hub, ear } = setup();
  const sitters = [ear(), ear(), ear(), ear()];
  const fifth = ear();
  for (const s of sitters) hub.signal(s.id, breath());
  hub.signal(fifth.id, breath(20));

  assert.equal(sitters[0].heard.length, 3); // the other three, not the fifth, not itself
  assert.ok(sitters.every((s) => s.heard.every((f) => f.id !== fifth.id)));
  assert.equal(fifth.heard.length, 4); // it listens: it hears all four
});

test('listening takes no seat', () => {
  const { hub, ear } = setup();
  for (let i = 0; i < 20; i += 1) ear();
  const a = ear();
  const b = ear();
  hub.signal(a.id, breath());
  assert.equal(b.heard.length, 1);
});

test('a seat is let go after ten seconds of silence, and the next may take it', () => {
  const { hub, ear, tick } = setup({ seats: 1 });
  const a = ear();
  const b = ear();
  hub.signal(a.id, breath());
  hub.signal(b.id, breath(15)); // no seat
  assert.equal(a.heard.length, 0);

  tick(9_999);
  hub.sweep();
  hub.signal(b.id, breath(15));
  assert.equal(a.heard.length, 0); // not yet: the seat is still a's

  tick(1);
  hub.sweep();
  hub.signal(b.id, breath(15));
  assert.equal(a.heard.length, 1); // now it is b's
});

test('a signal keeps the seat: silence is counted from the last one', () => {
  const { hub, ear, tick } = setup({ seats: 1 });
  const a = ear();
  const b = ear();
  hub.signal(a.id, breath());
  tick(8_000);
  hub.signal(a.id, breath(12, 'exhale'));
  tick(8_000);
  hub.sweep();
  hub.signal(b.id, breath());
  assert.equal(a.heard.length, 0); // a still sits
});

test('whoever was let go for silence is still listening, and may sit again', () => {
  const { hub, ear, tick } = setup({ seats: 1 });
  const a = ear();
  const b = ear();
  hub.signal(a.id, breath());
  tick(10_000);
  hub.sweep();
  hub.signal(a.id, breath(10));
  assert.equal(b.heard.length, 2);
});

test('leaving frees the seat at once, and tells no one', () => {
  const { hub, ear } = setup({ seats: 1 });
  const a = ear();
  const b = ear();
  const c = ear();
  hub.signal(a.id, breath());
  const before = b.heard.length;
  a.leave();
  a.leave(); // twice is fine
  assert.equal(b.heard.length, before); // nothing was said about it
  hub.signal(b.id, breath(14));
  assert.equal(c.heard.at(-1).id, b.id);
});

test('a knock goes to the others, with nothing in it; it needs a seat', () => {
  const { hub, ear } = setup();
  const a = ear();
  const b = ear();
  hub.signal(a.id, { type: 'knock' }); // not sitting: nothing
  assert.deepEqual(b.heard, []);

  hub.signal(a.id, breath());
  hub.signal(a.id, { type: 'knock', who: 'a', text: 'hi' });
  assert.deepEqual(b.heard.at(-1), { type: 'knock' });
});

test('a knock may come once in thirty seconds from one person, and no one is told it was held back', () => {
  const { hub, ear, tick } = setup();
  const a = ear();
  const b = ear();
  hub.signal(a.id, breath());
  hub.signal(a.id, { type: 'knock' });
  hub.signal(a.id, { type: 'knock' });
  assert.equal(b.heard.filter((f) => f.type === 'knock').length, 1);

  tick(30_000);
  hub.signal(a.id, { type: 'knock' });
  assert.equal(b.heard.filter((f) => f.type === 'knock').length, 2);
});

test('a room with no one in it is not open; and a stream that breaks does not trouble the others', () => {
  const { hub, ear } = setup();
  assert.equal(hub.open, false);
  const a = ear();
  const heard = [];
  const broken = hub.listen(() => {
    throw new Error('the stream is gone');
  });
  const c = hub.listen((f) => heard.push(f));
  assert.equal(hub.open, true);

  hub.signal(a.id, breath());
  assert.equal(heard.length, 1); // c was told, though the one before it threw
  broken.leave();
  a.leave();
  c.leave();
  assert.equal(hub.open, false);
});

test('it keeps nothing it could be asked: no count, no list, no history on the object', () => {
  const { hub, ear } = setup();
  ear();
  const own = Object.getOwnPropertyNames(Object.getPrototypeOf(hub)).concat(Object.keys(hub));
  for (const word of ['count', 'size', 'length', 'who', 'list', 'history', 'log', 'seatsTaken', 'participants']) {
    assert.ok(!own.includes(word), `${word} should not exist`);
  }
});
