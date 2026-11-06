import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advance, mayNotify, newsAfter, noticesFor, topSeq } from './notify.ts';
import type { Turn } from './types.ts';

const turn = (seq: number, speakerId = 'human:apollo', conversationId = 'general', text = `m${seq}`): Turn => ({
  seq,
  id: `id-${seq}`,
  conversationId,
  speakerId,
  text,
  mentions: [],
  createdAt: '2026-10-29T10:00:00Z',
});

const names = { 'human:apollo': 'Apollo', 'companion:nova': 'Nova', 'human:zeus': 'Zeus' };
const channels = { general: 'General', ops: 'Ops' };
const many = (n: number) => `${n} mesaje noi`;

test('news: what others said after the mark, oldest first, never what I said', () => {
  const turns = { general: [turn(3), turn(5, 'human:zeus'), turn(6, 'companion:nova')], ops: [turn(4, 'human:apollo', 'ops')] };
  assert.deepEqual(newsAfter(turns, 3, 'human:zeus').map((t) => t.seq), [4, 6]);
  assert.deepEqual(newsAfter(turns, 6, 'human:zeus'), []);
});

test('topSeq: the highest turn held, mine included', () => {
  assert.equal(topSeq({ general: [turn(3), turn(9, 'human:zeus')], ops: [turn(4, 'human:apollo', 'ops')] }), 9);
  assert.equal(topSeq({}), 0);
});

test('advance: while away, each arrival counts everything since the page was last looked at', () => {
  const me = 'human:zeus';
  let mark = { seen: 4, notified: 4 };
  let turns = { general: [turn(4), turn(5)] };
  let step = advance(mark, turns, me, false);
  assert.deepEqual(step.news.map((t) => t.seq), [5]);
  mark = step.mark;
  turns = { general: [...turns.general, turn(6)] }; // a second one, in a later commit
  step = advance(mark, turns, me, false);
  assert.deepEqual(step.news.map((t) => t.seq), [5, 6]); // the notice can say two
  mark = step.mark;
  step = advance(mark, turns, me, false); // nothing new since: no second notice
  assert.deepEqual(step.news, []);
});

test('advance: looking resets, what was said meanwhile is not news later, and my own words are not news', () => {
  const me = 'human:zeus';
  const turns = { general: [turn(5), turn(6, me)] };
  let step = advance({ seen: 4, notified: 4 }, turns, me, false);
  assert.deepEqual(step.news.map((t) => t.seq), [5]);
  step = advance(step.mark, turns, me, true);
  assert.deepEqual(step.news, []);
  assert.deepEqual(step.mark, { seen: 6, notified: 6 });
  step = advance(step.mark, { general: [...turns.general, turn(7)] }, me, false);
  assert.deepEqual(step.news.map((t) => t.seq), [7]); // only what came after looking
  const mine = advance({ seen: 6, notified: 6 }, { general: [...turns.general, turn(7, me)] }, me, false);
  assert.deepEqual(mine.news, []);
});

test('notices: one turn gives the person and the words', () => {
  const [one, ...rest] = noticesFor([turn(7, 'companion:nova', 'general', 'Salut!')], names, channels, many);
  assert.deepEqual(one, { title: 'Nova', body: 'Salut!', tag: 'general' });
  assert.equal(rest.length, 0);
});

test('notices: several turns in one channel give one notice, with the count and the last words', () => {
  const [one, ...rest] = noticesFor([turn(7), turn(8, 'companion:nova', 'general', 'gata')], names, channels, many);
  assert.deepEqual(one, { title: 'General', body: '2 mesaje noi · Nova: gata', tag: 'general' });
  assert.equal(rest.length, 0);
});

test('notices: a notice per channel, each tagged by its channel', () => {
  const list = noticesFor([turn(7), turn(8, 'human:apollo', 'ops')], names, channels, many);
  assert.deepEqual(list.map((n) => n.tag), ['general', 'ops']);
});

test('notices: long words are cut and lines are flattened; an unknown speaker is named by the id', () => {
  const [long] = noticesFor([turn(7, 'human:apollo', 'general', `a\n\n${'x'.repeat(300)}`)], names, channels, many);
  assert.equal(long!.body.length, 140);
  assert.equal(long!.body.endsWith('…'), true);
  assert.equal(long!.body.includes('\n'), false);
  assert.equal(noticesFor([turn(7, 'human:alex')], names, channels, many)[0]!.title, 'alex');
});

test('a visitor\'s session never shows notifications, even where the computer has the permission of a team session', () => {
  assert.equal(mayNotify(true, 2, true), true);
  assert.equal(mayNotify(false, 2, true), false); // a visitor: whatever the permission, whatever the news
  assert.equal(mayNotify(true, 0, true), false);
  assert.equal(mayNotify(true, 2, false), false);
});
