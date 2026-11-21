import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GROUND, enterFlow } from '../dist/index.js';

test('the ground is there from the start and has no start or stop', () => {
  assert.equal(GROUND.kind, 'ELEPHANT');
  assert.equal(GROUND.duration, 'unbounded');
  assert.equal(GROUND.challengeSkill, null);
  assert.equal(GROUND.feedbackLoop, null);
  assert.equal(GROUND.start, undefined);
  assert.equal(GROUND.stop, undefined);
});

test('a flow is bounded and defined, and the ground is the same after it closes', () => {
  const before = JSON.stringify(GROUND);
  const flow = enterFlow(GROUND, { activity: 'writing the page' });
  assert.equal(flow.kind, 'FLOW');
  assert.equal(flow.duration, 'bounded');
  assert.equal(flow.challengeSkill, 'matched');
  assert.equal(flow.feedbackLoop, 'active');
  assert.equal(flow.context, 'writing the page');
  assert.equal(flow.closed, false);
  assert.equal(flow.ground, GROUND);
  flow.close();
  assert.equal(flow.closed, true);
  assert.equal(flow.ground, GROUND);
  assert.equal(flow.context, 'writing the page'); // the label stays
  assert.equal(JSON.stringify(GROUND), before);
});

test('close lets go once: the release runs on the first close only', () => {
  let released = 0;
  const flow = enterFlow(GROUND, { activity: 'a list' }, () => released++);
  flow.close();
  flow.close();
  assert.equal(released, 1);
});

test('the ground cannot be written', () => {
  assert.throws(() => {
    'use strict';
    GROUND.duration = 'bounded';
  }, TypeError);
});

test('a flow cannot be rewritten, and a release that throws is not retried', () => {
  let tries = 0;
  const flow = enterFlow(GROUND, { activity: 'a list' }, () => {
    tries++;
    throw new Error('nope');
  });
  assert.throws(() => {
    'use strict';
    flow.duration = 'unbounded';
  }, TypeError);
  assert.throws(() => flow.close(), /nope/);
  assert.equal(flow.closed, true);
  flow.close();
  assert.equal(tries, 1);
});
