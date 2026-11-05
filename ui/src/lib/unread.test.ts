import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readUpTo, rewound, titleWith, unreadIn } from './unread.ts';
import type { Turn } from './types.ts';

const turn = (seq: number, speakerId = 'human:apollo', conversationId = 'general'): Turn => ({
  seq,
  id: `id-${seq}`,
  conversationId,
  speakerId,
  text: `m${seq}`,
  mentions: [],
  createdAt: '2026-10-29T10:00:00Z',
});

test('unread: only what others said after the last one seen', () => {
  const turns = { general: [turn(1), turn(2), turn(3, 'human:zeus'), turn(4), turn(5, 'companion:nova')] };
  assert.equal(unreadIn(turns, { general: 2 }, 0, 'human:zeus'), 2); // 4 and 5; 3 is mine
  assert.equal(unreadIn(turns, { general: 5 }, 0, 'human:zeus'), 0);
});

test('unread: what was there when the page opened is history, not news', () => {
  const turns = { general: [turn(1), turn(2), turn(3), turn(4)] };
  assert.equal(unreadIn(turns, {}, 3, 'human:zeus'), 1); // only 4 came after the page opened
});

test('unread: counts every channel, each from its own mark', () => {
  const turns = { general: [turn(5), turn(6)], ops: [turn(7, 'human:apollo', 'ops'), turn(8, 'human:apollo', 'ops')] };
  assert.equal(unreadIn(turns, { general: 6 }, 4, 'human:zeus'), 2); // ops has no mark: from where the page opened
});

test('readUpTo: moves forward only, and returns the same object when nothing changes', () => {
  const seen = { general: 5 };
  assert.deepEqual(readUpTo(seen, 'general', 8, 0), { general: 8 });
  assert.equal(readUpTo(seen, 'general', 5, 0), seen);
  assert.equal(readUpTo(seen, 'general', 3, 0), seen);
  assert.equal(readUpTo(seen, 'general', undefined, 0), seen);
  assert.equal(readUpTo({}, 'general', 4, 4).general, undefined); // nothing after where the page opened: no mark needed
  assert.deepEqual(readUpTo({}, 'ops', 6, 4), { ops: 6 });
});

test('rewound: only when the sequence goes back', () => {
  assert.equal(rewound(50, 20), true);
  assert.equal(rewound(20, 50), false);
  assert.equal(rewound(20, 20), false);
  assert.equal(rewound(undefined, 20), false); // the first hello is not a rewind
  assert.equal(rewound(20, undefined), false);
});

test('title: the count in front of the name, nothing when there is none', () => {
  assert.equal(titleWith(0, 'El portal'), 'El portal');
  assert.equal(titleWith(1, 'El portal'), '(1) El portal');
  assert.equal(titleWith(99, 'El portal'), '(99) El portal');
  assert.equal(titleWith(100, 'El portal'), '(99+) El portal');
});
