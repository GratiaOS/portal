import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialState, mergeTurns, roomReducer } from './state.ts';
import type { RoomState } from './state.ts';
import type { Hello, Turn } from './types.ts';

const turn = (seq: number, conversationId = 'general', text = `m${seq}`): Turn => ({
  seq,
  id: `id-${seq}`,
  conversationId,
  speakerId: 'human:relay',
  text,
  mentions: [],
  createdAt: '2026-10-29T10:00:00Z',
});

const hello = (lastSeq: number): Hello => ({
  you: { id: 'human:relay', kind: 'human', alias: 'Relay', capabilities: [] },
  participants: [{ id: 'human:relay', kind: 'human', alias: 'Relay', capabilities: [] }],
  presence: [{ participantId: 'human:relay', state: 'online' }],
  activity: [{ participantId: 'companion:nova', conversationId: 'general', state: 'thinking' }],
  conversations: [{ id: 'general', title: 'General', visibility: 'private', status: 'open', tags: [], createdAt: '', updatedAt: '' }],
  lastSeq,
});

const run = (actions: Parameters<typeof roomReducer>[1][], from: RoomState = initialState) => actions.reduce(roomReducer, from);

test('turns are kept in order and once, whichever way they arrived', () => {
  assert.deepEqual(mergeTurns([turn(2), turn(4)], [turn(3), turn(4, 'general', 'again'), turn(1)]).map((t) => [t.seq, t.text]), [[1, 'm1'], [2, 'm2'], [3, 'm3'], [4, 'again']]);
});

test('hello says who we are and where things stand, and the stream starts from where the room is', () => {
  const state = run([{ type: 'hello', hello: hello(40) }]);
  assert.equal(state.you?.alias, 'Relay');
  assert.equal(state.cursor, 40);
  assert.equal(state.presence['human:relay']?.state, 'online');
  assert.deepEqual(state.thinking, [{ participantId: 'companion:nova', conversationId: 'general', state: 'thinking' }]);
  assert.equal(state.conversations[0]?.id, 'general');
});

test('only the live stream moves the cursor; history and our own message do not, or a gap could hide behind them', () => {
  let state = run([{ type: 'hello', hello: hello(10) }]);
  state = run([{ type: 'history', conversationId: 'general', turns: [turn(90), turn(91)], limit: 50 }, { type: 'message', turn: turn(95), live: false }], state);
  assert.equal(state.cursor, 10);
  state = run([{ type: 'message', turn: turn(11), live: true }, { type: 'message', turn: turn(12, 'infra'), live: true }], state);
  assert.equal(state.cursor, 12);
  state = run([{ type: 'message', turn: turn(11), live: true }], state); // a replay does not move it back
  assert.equal(state.cursor, 12);
  assert.deepEqual(state.turns['general']?.map((t) => t.seq), [11, 90, 91, 95]);
});

test('a reconnect keeps what we have and the cursor; a room that started anew does not', () => {
  const have = run([{ type: 'hello', hello: hello(40) }, { type: 'message', turn: turn(41), live: true }]);
  const again = run([{ type: 'hello', hello: hello(45) }], have);
  assert.equal(again.cursor, 41);
  assert.equal(again.turns['general']?.length, 1);

  const reset = run([{ type: 'hello', hello: hello(3) }], have); // the room says it is at 3, we saw 41
  assert.equal(reset.cursor, 3);
  assert.deepEqual(reset.turns, {});
});

test('history says whether there may be more behind it', () => {
  let state = run([{ type: 'history', conversationId: 'general', turns: [turn(5), turn(6)], limit: 2 }]);
  assert.equal(state.more['general'], true);
  state = run([{ type: 'history', conversationId: 'general', turns: [turn(4)], limit: 2 }], state);
  assert.equal(state.more['general'], false);
  assert.deepEqual(state.turns['general']?.map((t) => t.seq), [4, 5, 6]);
});

test('presence and thinking come and go', () => {
  let state = run([{ type: 'hello', hello: hello(1) }]);
  state = run([{ type: 'presence', presence: { participantId: 'human:relay', state: 'offline' } }], state);
  assert.equal(state.presence['human:relay']?.state, 'offline');

  state = run([{ type: 'activity', activity: { participantId: 'companion:nova', conversationId: 'infra', state: 'thinking' } }], state);
  assert.equal(state.thinking.length, 2);
  state = run([{ type: 'activity', activity: { participantId: 'companion:nova', conversationId: 'general', state: 'idle' } }], state);
  assert.deepEqual(state.thinking.map((a) => a.conversationId), ['infra']);
});

test('the state of the connection', () => {
  assert.equal(run([{ type: 'connection', connection: 'reconnecting' }]).connection, 'reconnecting');
});

test('a participant that changed (a sign) takes the place of the one we had, and is you when it is you', () => {
  const relay = { id: 'human:relay', kind: 'human' as const, alias: 'Relay', capabilities: [] };
  const courier = { id: 'human:courier', kind: 'human' as const, alias: 'Courier', capabilities: [] };
  const hello: Hello = { you: relay, participants: [relay, courier], presence: [], activity: [], conversations: [], lastSeq: 0 };
  let state = roomReducer(initialState, { type: 'hello', hello });

  state = roomReducer(state, { type: 'participant', participant: { ...courier, sign: '🧭' } });
  assert.equal(state.participants.find((p) => p.id === 'human:courier')?.sign, '🧭');
  assert.equal(state.you?.sign, undefined);

  state = roomReducer(state, { type: 'participant', participant: { ...relay, sign: '🫁' } });
  assert.equal(state.you?.sign, '🫁');
  assert.equal(state.participants.length, 2); // a change, not a newcomer
});

test('a participant the page has not heard of is added, and one it knows is replaced', () => {
  let state = run([{ type: 'hello', hello: hello(1) }]);
  const visitor = { id: 'guest:owl', kind: 'guest' as const, alias: 'owl', capabilities: [] };
  state = run([{ type: 'participant', participant: visitor }], state);
  assert.deepEqual(state.participants.map((p) => p.id), ['human:relay', 'guest:owl']);
  state = run([{ type: 'participant', participant: { ...visitor, sign: '🦉' } }], state);
  assert.equal(state.participants.length, 2);
  assert.equal(state.participants[1]?.sign, '🦉');
});

test('a visitor\'s page lets go of turns older than the trail, and of none else', () => {
  const turn = (seq: number, createdAt: string) => ({ seq, id: `t${seq}`, conversationId: 'guests', speakerId: 'a', text: 'x', mentions: [], createdAt });
  const before = { ...initialState, turns: { guests: [turn(1, '2026-11-10T10:00:00Z'), turn(2, '2026-11-10T10:20:00Z')] } };
  const after = roomReducer(before, { type: 'forget', before: Date.parse('2026-11-10T10:10:00Z') });
  assert.deepEqual(after.turns.guests?.map((t) => t.seq), [2]);
  assert.equal(roomReducer(after, { type: 'forget', before: Date.parse('2026-11-10T10:10:00Z') }), after, 'nothing more to let go: the state is the same one');
});

test('hello says which frequency a person holds, or that they hold none, or nothing when the portal has no drops', () => {
  assert.equal(run([{ type: 'hello', hello: hello(1) }]).held, undefined); // the portal says nothing of drops
  assert.deepEqual(run([{ type: 'hello', hello: { ...hello(1), heldFrequency: { freq: '99.6', title: '🎁 CTT' } } }]).held, { freq: '99.6', title: '🎁 CTT' });
  assert.equal(run([{ type: 'hello', hello: { ...hello(1), heldFrequency: null } }]).held, null); // none held: not the same as no drops
  // a portal that stopped having them, seen again after a break
  const had = run([{ type: 'hello', hello: { ...hello(1), heldFrequency: { freq: '99.6', title: '99.6' } } }]);
  assert.equal(run([{ type: 'hello', hello: hello(1) }], had).held, undefined);
});

test('the pulse of a drop is counted for the frequency held, and for no other', () => {
  const held = run([{ type: 'hello', hello: { ...hello(1), heldFrequency: { freq: '99.6', title: '99.6' } } }]);
  assert.equal(held.dropPulse, 0);
  const once = run([{ type: 'drop', freq: '99.6' }], held);
  assert.equal(once.dropPulse, 1);
  assert.equal(run([{ type: 'drop', freq: '99.6' }], once).dropPulse, 2);
  assert.equal(run([{ type: 'drop', freq: '36.9' }], held).dropPulse, 0); // not the frequency this person holds
  assert.equal(run([{ type: 'drop', freq: '99.6' }]).dropPulse, 0); // nothing held yet
  assert.equal(run([{ type: 'drop', freq: '99.6' }], run([{ type: 'hello', hello: { ...hello(1), heldFrequency: null } }])).dropPulse, 0);
});

test('a pulse is not a turn: it moves no cursor and adds nothing to what is said', () => {
  const held = run([{ type: 'hello', hello: { ...hello(7), heldFrequency: { freq: '99.6', title: '99.6' } } }]);
  const after = run([{ type: 'drop', freq: '99.6' }], held);
  assert.equal(after.cursor, held.cursor);
  assert.deepEqual(after.turns, held.turns);
});

test('a burn is told for the frequency held, once for each packet, and it is not a pulse: nothing lights and nothing is counted as new', () => {
  const held = run([{ type: 'hello', hello: { ...hello(1), heldFrequency: { freq: '99.6', title: '99.6' } } }]);
  const once = run([{ type: 'drop-gone', freq: '99.6', id: '12' }], held);
  assert.deepEqual(once.dropsGone, ['12']);
  assert.equal(once.dropPulse, 0);
  assert.equal(run([{ type: 'drop-gone', freq: '99.6', id: '12' }], once), once, 'the same burn heard twice is the same state');
  assert.deepEqual(run([{ type: 'drop-gone', freq: '99.6', id: '13' }], once).dropsGone, ['12', '13']);
  assert.equal(run([{ type: 'drop-gone', freq: '36.9', id: '12' }], held), held); // not the frequency this person holds
  assert.equal(run([{ type: 'drop-gone', freq: '99.6', id: '12' }]).dropsGone.length, 0); // nothing held yet
});
