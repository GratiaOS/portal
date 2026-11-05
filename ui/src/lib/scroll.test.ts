import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearBottom } from './scroll.ts';

test('scroll: at the end, or within a short way of it, is still reading the end', () => {
  assert.equal(nearBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 }), true); // exactly at the end
  assert.equal(nearBottom({ scrollHeight: 1000, scrollTop: 520, clientHeight: 400 }), true); // 80 px short
  assert.equal(nearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 400 }), false); // 100 px short: reading above
  assert.equal(nearBottom({ scrollHeight: 300, scrollTop: 0, clientHeight: 400 }), true); // a log shorter than its window
});
