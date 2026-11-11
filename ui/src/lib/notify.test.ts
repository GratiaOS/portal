import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advance, mayNotify, newsAfter, noticesFor, topSeq } from './notify.ts';
import type { Turn } from './types.ts';

const ME = 'human:zeus';

// a turn from `speakerId`; it names the person (`ME`) unless `mentions` says otherwise
const turn = (seq: number, speakerId = 'human:apollo', conversationId = 'general', mentions: string[] = [ME]): Turn => ({
  seq,
  id: `id-${seq}`,
  conversationId,
  speakerId,
  text: `secret words ${seq}`,
  mentions,
  createdAt: '2026-10-29T10:00:00Z',
});

const channels = { general: 'General', ops: 'Ops' };
const say = { one: (c: string) => `mentioned in ${c}`, many: (n: number, c: string) => `${n} mentions in ${c}` };

test('news: only what names the person, oldest first, never what I said', () => {
  const turns = {
    general: [turn(3), turn(5, ME), turn(6, 'companion:nova'), turn(7, 'human:apollo', 'general', [])],
    ops: [turn(4, 'human:apollo', 'ops')],
  };
  assert.deepEqual(newsAfter(turns, 3, ME).map((t) => t.seq), [4, 6]);
  assert.deepEqual(newsAfter(turns, 6, ME), []);
});

test('news: a turn that names someone else, or no one, is not news; nor is anything for a person not yet known', () => {
  const turns = { general: [turn(4, 'human:apollo', 'general', ['human:hera']), turn(5, 'human:apollo', 'general', [])] };
  assert.deepEqual(newsAfter(turns, 0, ME), []);
  assert.deepEqual(newsAfter({ general: [turn(4)] }, 0, undefined), []);
});

test('topSeq: the highest turn held, mine included, mention or not', () => {
  assert.equal(topSeq({ general: [turn(3), turn(9, ME)], ops: [turn(4, 'human:apollo', 'ops', [])] }), 9);
  assert.equal(topSeq({}), 0);
});

test('advance: while away, each arrival counts every mention since the page was last looked at', () => {
  let mark = { seen: 4, notified: 4 };
  let turns = { general: [turn(4), turn(5)] };
  let step = advance(mark, turns, ME, false);
  assert.deepEqual(step.news.map((t) => t.seq), [5]);
  assert.equal(step.waiting, 1);
  mark = step.mark;
  turns = { general: [...turns.general, turn(6)] }; // a second one, in a later commit
  step = advance(mark, turns, ME, false);
  assert.deepEqual(step.news.map((t) => t.seq), [5, 6]); // the notice can say two
  assert.equal(step.waiting, 2);
  mark = step.mark;
  step = advance(mark, turns, ME, false); // nothing new since: no second notice, and the badge still says two
  assert.deepEqual(step.news, []);
  assert.equal(step.waiting, 2);
});

test('advance: a turn that does not name the person is no news and does not count on the badge', () => {
  const turns = { general: [turn(5, 'human:apollo', 'general', []), turn(6, 'human:apollo', 'general', ['human:hera'])] };
  const step = advance({ seen: 4, notified: 4 }, turns, ME, false);
  assert.deepEqual(step.news, []);
  assert.equal(step.waiting, 0);
  assert.deepEqual(step.mark, { seen: 4, notified: 6 }); // told of nothing, but counted past
});

test('advance: looking resets, what was said meanwhile is not news later, and my own words are not news', () => {
  const turns = { general: [turn(5), turn(6, ME)] };
  let step = advance({ seen: 4, notified: 4 }, turns, ME, false);
  assert.deepEqual(step.news.map((t) => t.seq), [5]);
  step = advance(step.mark, turns, ME, true);
  assert.deepEqual(step.news, []);
  assert.equal(step.waiting, 0); // the badge is cleared by looking
  assert.deepEqual(step.mark, { seen: 6, notified: 6 });
  step = advance(step.mark, { general: [...turns.general, turn(7)] }, ME, false);
  assert.deepEqual(step.news.map((t) => t.seq), [7]); // only what came after looking
  const mine = advance({ seen: 6, notified: 6 }, { general: [...turns.general, turn(7, ME)] }, ME, false);
  assert.deepEqual(mine.news, []);
});

test('notices: one mention says where, in the app\'s name, and never what', () => {
  const [one, ...rest] = noticesFor([turn(7, 'companion:nova')], channels, 'El portal', say);
  assert.deepEqual(one, { title: 'El portal', body: 'mentioned in General', tag: 'general' });
  assert.equal(rest.length, 0);
});

test('notices: several in one channel give one notice with the count', () => {
  const [one, ...rest] = noticesFor([turn(7), turn(8, 'companion:nova')], channels, 'El portal', say);
  assert.deepEqual(one, { title: 'El portal', body: '2 mentions in General', tag: 'general' });
  assert.equal(rest.length, 0);
});

test('notices: a notice per channel, each tagged by its channel; an unknown channel is named by its id', () => {
  const list = noticesFor([turn(7), turn(8, 'human:apollo', 'ops'), turn(9, 'human:apollo', 'lost')], channels, 'El portal', say);
  assert.deepEqual(list.map((n) => n.tag), ['general', 'ops', 'lost']);
  assert.equal(list[2]!.body, 'mentioned in lost');
});

test('notices: nothing of what was written reaches the notice, neither the words nor the speaker', () => {
  for (const notice of noticesFor([turn(7, 'human:apollo'), turn(8, 'human:apollo')], channels, 'El portal', say)) {
    assert.equal(JSON.stringify(notice).includes('secret'), false);
    assert.equal(JSON.stringify(notice).includes('apollo'), false);
  }
});

test('a visitor\'s session never shows notifications, even where the computer has the permission of a team session', () => {
  assert.equal(mayNotify(true, 2, true), true);
  assert.equal(mayNotify(false, 2, true), false); // a visitor: whatever the permission, whatever the news
  assert.equal(mayNotify(true, 0, true), false);
  assert.equal(mayNotify(true, 2, false), false);
});
