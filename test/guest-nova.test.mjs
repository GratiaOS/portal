import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';
import { Hub, RoomStore, admitGuest, createApp, createNova, fixedKnowledge, guestFacts, nodeSqlite, parseConfig, roomFacts } from '../dist/index.js';

const test = (name, fn) => nodeTest(name, { timeout: 8000 }, fn);

const T0 = Date.parse('2026-11-06T12:00:00Z');
const GUESTS = { room: 'guests', maxActive: 50, minutes: 30, perCaller: { count: 100, perMinutes: 10 } };
const PUBLIC = { 'about.md': 'El portal is a small team chat with a companion who answers from a folder. Anyone can run one: see INSTALL.md.' };
const SECRET = { 'team/salaries.md': 'The salary of Zeus is 9000 drachmas and the team keeps a secret garden.' };

function fakeLlm(answer = 'SAY: Hello, visitor.') {
  const calls = [];
  return {
    calls,
    async generate(request) {
      calls.push(request);
      const result = typeof answer === 'function' ? await answer(request, calls.length) : answer;
      if (result instanceof Error) throw result;
      return { content: result, reasoning: '', usage: {}, finishReason: 'stop' };
    },
    stream() {
      throw new Error('not used');
    },
  };
}

/** A portal with a team (Zeus, Hera, Nova), a team room and a guest room, and a Nova of each kind, each with her own engine and her own folder. */
function setup({ questions = 3, perHour = 100, minutes = 30, guestAnswer, teamAnswer } = {}) {
  let now = T0;
  const store = new RoomStore(nodeSqlite(':memory:'), { now: () => new Date(now) });
  store.syncParticipants([{ kind: 'human', alias: 'Zeus' }, { kind: 'human', alias: 'Hera' }, { kind: 'companion', alias: 'Nova' }]);
  store.syncConversations([{ id: 'general', title: 'General' }, { id: 'guests', title: 'Guests', kind: 'guest' }]);
  const hub = new Hub(store, { graceMs: 20, now: () => now });
  const teamLlm = fakeLlm(teamAnswer);
  const guestLlm = fakeLlm(guestAnswer);
  const teamKnowledge = fixedKnowledge(SECRET);
  const publicKnowledge = fixedKnowledge(PUBLIC);
  const base = { alias: 'Nova', contextTurns: 6, maxQueue: 5, now: () => now };
  const team = createNova({ hub, store, llm: teamLlm, knowledge: teamKnowledge }, base);
  const guests = createNova(
    { hub, store, llm: guestLlm, knowledge: publicKnowledge, facts: () => guestFacts({ questions, nova: { alias: 'Nova', contextTurns: 6, llm: { model: 'guest-engine' }, facts: [] } }, publicKnowledge.files.size) },
    { ...base, scope: 'guest', guestsPerHour: perHour },
  );
  const config = { ...GUESTS, minutes, nova: { enabled: true, questions, perHour } };
  const admit = () => admitGuest(store, config, now);
  const said = (room) => store.listTurns(room).map((t) => `${store.getParticipant(t.speakerId).alias}: ${t.text}`);
  const ask = (who, room, text = '@Nova what is this?') => hub.publish({ conversationId: room, speakerId: who.id, text });
  return { store, hub, teamLlm, guestLlm, team, guests, admit, said, ask, advance: (ms) => (now += ms), zeus: store.getParticipant('human:zeus'), config };
}

test('a guest asks her in the guest room and the guests\' Nova answers from the public folder, which holds nothing of the team', async () => {
  const s = setup();
  const { guest } = s.admit();
  s.ask(guest, 'guests');
  await s.guests.idle();
  assert.equal(s.guestLlm.calls.length, 1);
  assert.equal(s.teamLlm.calls.length, 0, 'the team\'s engine is not asked');
  assert.match(s.said('guests').at(-1), /^Nova: @\S+ Hello, visitor\./);

  // what went to the model: the public document, and no one and nothing of the team
  const system = s.guestLlm.calls[0].system;
  assert.match(system, /El portal is a small team chat/);
  for (const secret of ['salary', 'drachmas', 'secret garden', 'Zeus', 'Hera']) assert.ok(!system.includes(secret), `the model for guests was told "${secret}"`);
  assert.ok(!JSON.stringify(s.guestLlm.calls[0].messages).includes('Zeus'));
});

test('each of her answers only in the rooms of her own kind', async () => {
  const s = setup();
  s.ask(s.zeus, 'general'); // a person of the team, in the team room
  await Promise.all([s.team.idle(), s.guests.idle()]);
  assert.equal(s.teamLlm.calls.length, 1);
  assert.equal(s.guestLlm.calls.length, 0);

  s.ask(s.zeus, 'guests'); // the same person, in the guest room: the guests' Nova, with her folder
  await Promise.all([s.team.idle(), s.guests.idle()]);
  assert.equal(s.teamLlm.calls.length, 1, 'the team\'s Nova stays out of the guest room');
  assert.equal(s.guestLlm.calls.length, 1);
});

test('a guest has as many questions as their visit has, then the portal says so, and the model is not asked', async () => {
  const s = setup({ questions: 2 });
  const { guest } = s.admit();
  for (let i = 0; i < 4; i += 1) {
    s.ask(guest, 'guests');
    await s.guests.idle();
  }
  assert.equal(s.guestLlm.calls.length, 2, 'two questions reached the model, the other two did not');
  const lines = s.said('guests').filter((l) => l.startsWith('Nova:'));
  assert.equal(lines.length, 4); // two answers and two plain lines
  assert.match(lines[2], /limit of questions/i.test(lines[2]) || /limita de întrebări/.test(lines[2]) ? /./ : /limit/);
  assert.equal(s.store.questionsAsked(s.store.bindingsOf(guest.id)[0].ledgerId), 2);
});

test('all the guests together may ask only so many in an hour, and an hour later they may again', async () => {
  const s = setup({ questions: 5, perHour: 2, minutes: 180 }); // their time is longer than the hour that is being counted
  const [a, b] = [s.admit().guest, s.admit().guest];
  s.ask(a, 'guests');
  s.ask(b, 'guests');
  await s.guests.idle();
  assert.equal(s.guestLlm.calls.length, 2);
  s.ask(a, 'guests'); // a has questions left, but the portal has no more for this hour
  await s.guests.idle();
  assert.equal(s.guestLlm.calls.length, 2);
  assert.match(s.said('guests').at(-1), /întrebări acum|many questions at the moment/);

  s.advance(3_600_001);
  s.ask(a, 'guests');
  await s.guests.idle();
  assert.equal(s.guestLlm.calls.length, 3);
});

test('a question is counted before the model is called: a model that fails still costs', async () => {
  const s = setup({ questions: 2, guestAnswer: () => new Error('the engine is away') });
  const { guest } = s.admit();
  s.ask(guest, 'guests');
  await s.guests.idle();
  s.ask(guest, 'guests');
  await s.guests.idle();
  assert.equal(s.store.questionsAsked(s.store.bindingsOf(guest.id)[0].ledgerId), 2);
  s.ask(guest, 'guests');
  await s.guests.idle();
  assert.equal(s.guestLlm.calls.length, 2, 'the third was refused before the engine');
});

test('what a visitor asks does not go to the list of what the knowledge lacked', async () => {
  const s = setup({ guestAnswer: 'SAY: I do not have that.\nGAP: the price of everything', teamAnswer: 'SAY: I do not have that.\nGAP: the team\'s holidays' });
  const { guest } = s.admit();
  s.ask(guest, 'guests', '@Nova what is the price?');
  await s.guests.idle();
  assert.deepEqual(s.store.listGaps(), []); // nothing from a guest

  s.ask(s.zeus, 'general', '@Nova what about holidays?');
  await s.team.idle();
  assert.equal(s.store.listGaps().length, 1); // the team's own, as before
});

test('a guest whose binding has no questions in it cannot ask her, which is every guest while she is off for them', async () => {
  const s = setup();
  const off = admitGuest(s.store, { ...s.config, nova: { enabled: false, questions: 5, perHour: 60 } }, T0);
  assert.equal(s.store.bindingsOf(off.guest.id)[0].budget, 0);
  s.ask(off.guest, 'guests');
  await s.guests.idle();
  assert.equal(s.guestLlm.calls.length, 0);
  assert.deepEqual(s.said('guests').filter((l) => l.startsWith('Nova:')), []);
});

test('what she may say about the portal, to guests, names no one of the team and no server', () => {
  const facts = guestFacts({ questions: 5, nova: { alias: 'Nova', contextTurns: 6, llm: { model: 'm' }, facts: ['Anyone can run a portal of their own.'] } }, 2);
  for (const word of ['Zeus', 'Hera', 'http', 'localhost', 'database', 'retention']) assert.ok(!facts.includes(word), `the facts for guests say "${word}"`);
  assert.match(facts, /5 questions/);
  assert.match(facts, /every visitor who is in it/);
  assert.match(facts, /Anyone can run a portal of their own\./);
  // and the team's facts do name the team, so the difference is the point
  const team = roomFacts({ participants: [{ kind: 'human', alias: 'Zeus' }], rooms: [{ id: 'general' }], dbPath: ':memory:', retention: { days: 14, messages: 999 }, nova: { alias: 'Nova', contextTurns: 12, llm: { model: 'm', baseUrl: 'http://x.local/v1' }, exclude: [], facts: [] } }, 1);
  assert.match(team, /Zeus/);
});

test('guests.nova is off unless it is turned on, and turned on it needs an engine of its own', () => {
  const people = [{ kind: 'human', alias: 'Zeus', token: 'z'.repeat(24) }, { kind: 'companion', alias: 'Nova' }];
  const rooms = [{ id: 'general', title: 'General' }, { id: 'guests', title: 'Guests', kind: 'guest' }];
  const config = (nova) => parseConfig({ participants: people, rooms, guests: { room: 'guests', ...(nova === undefined ? {} : { nova }) }, dbPath: ':memory:' }, '/base');

  assert.deepEqual(config(undefined).guests.nova, { enabled: false, questions: 5, perHour: 60 });
  assert.equal(config({ llm: { baseUrl: 'https://x.test/v1', model: 'm' } }).guests.nova.enabled, false, 'an engine named is not a switch');
  assert.throws(() => config({ enabled: true }), /guests\.nova\.llm is needed/);
  assert.throws(() => config({ enabled: 'yes' }), /true or false/);
  assert.throws(() => config({ enabled: true, questions: 0, llm: { baseUrl: 'https://x.test/v1', model: 'm' } }), /questions/);

  const on = config({ enabled: true, questions: 4, perHour: 30, knowledgeDir: 'public', llm: { baseUrl: 'https://x.test/v1', model: 'guest-m' } }).guests.nova;
  assert.equal(on.enabled, true);
  assert.equal(on.questions, 4);
  assert.equal(on.perHour, 30);
  assert.equal(on.nova.alias, 'Nova');
  assert.equal(on.nova.llm.model, 'guest-m');
  assert.equal(on.nova.contextTurns, 6); // guests see less of the room by default
  assert.ok(on.nova.knowledgeDir.endsWith('/base/public'));
  assert.throws(() => config({ enabled: true, llm: { baseUrl: 'ftp://x/v1', model: 'm' } }), /guests\.nova\.llm\.baseUrl/); // the error names her, not the team's

  const ask = (c) => parseConfig({ participants: people, rooms, guests: { room: 'guests', nova: c }, dbPath: ':memory:' }, '/base');
  assert.ok(ask(undefined));
});

test('a guest let in by the door has a budget only when she is on for guests', async () => {
  const s = setup({ questions: 4 });
  assert.equal(s.store.bindingsOf(s.admit().guest.id)[0].budget, 4);
  const entered = admitGuest(s.store, { ...s.config, nova: { enabled: false, questions: 4, perHour: 60 } }, T0);
  assert.equal(s.store.bindingsOf(entered.guest.id)[0].budget, 0);
  assert.ok(createApp);
});
