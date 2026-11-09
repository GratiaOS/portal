import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test as nodeTest } from 'node:test';
import { LlmError } from '@gratiaos/llm-provider';
import { Hub, KnowledgeBase, buildSystem, buildUser, check, createNova, parseConfig, parseReply, roomFacts, startRoom, unsupportedFigures } from '../dist/index.js';
import { fakeSink, room, sleep } from './helpers.mjs';

// a hang or a loop (a companion answering herself) must be a quick failure, not a long wait
const test = (name, fn) => nodeTest(name, { timeout: 8000 }, fn);

const FILES = {
  'olympus/oath.md':
    'The oath on the Styx is sworn before every pact. Whoever breaks it loses more than 25% of their ambrosia, and olympus cannot skip the oath.',
  'offerings/tithes.md': 'Tithes are agreed per temple. The standard tithe is 1.5% plus 0.20 drachmas per offering.',
};

const SAY_GOOD = 'Nu, jurământul pe Styx e obligatoriu pentru orice pact. Cine îl rupe pierde peste 25% din ambrozie.';
const GOOD = `SAY: ${SAY_GOOD}\nSOURCES: olympus/oath.md`;

/** A model that says whatever the test says: a text, a whole result, or a function of the request. */
function fakeLlm(answer) {
  const calls = [];
  return {
    calls,
    async generate(request) {
      calls.push(request);
      const result = typeof answer === 'function' ? await answer(request, calls.length) : answer;
      if (typeof result === 'object') return result;
      return { content: result, reasoning: '', usage: {}, finishReason: 'stop' };
    },
    stream() {
      throw new Error('not used');
    },
  };
}

function gate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function writeKnowledge(dir, files, secondsFromNow = 0) {
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    const when = new Date(Date.now() + secondsFromNow * 1000);
    utimesSync(full, when, when);
  }
}

function knowledgeDir(t, files = FILES) {
  const dir = mkdtempSync(join(tmpdir(), 'room-knowledge-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeKnowledge(dir, files);
  return dir;
}

function setup(t, { llm, nova = {}, facts }) {
  const dir = knowledgeDir(t);
  const store = room();
  store.syncParticipants([{ kind: 'human', alias: 'Alex', locale: 'en' }]);
  const hub = new Hub(store, { graceMs: 25 });
  const knowledge = new KnowledgeBase(dir);
  const instance = createNova({ hub, store, llm, knowledge, facts }, { alias: 'Nova', contextTurns: 12, maxQueue: 5, ...nova });
  t.after(() => {
    instance.stop();
    hub.close();
    store.close();
  });
  return { dir, store, hub, knowledge, nova: instance };
}

const ask = (hub, who, text, conversationId = 'olympus') => hub.publish({ conversationId, speakerId: `human:${who}`, text });
const novaSaid = (store, conversationId = 'olympus') => store.listTurns(conversationId).filter((t) => t.speakerId === 'companion:nova').map((t) => t.text);

function quiet(work) {
  const log = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  return Promise.resolve(work()).finally(() => {
    console.error = log;
  }).then(() => logged);
}

// --- the pieces, alone ---

test('what she says is hers: the labels only pick out the files and the gap', () => {
  assert.deepEqual(parseReply(GOOD), { say: SAY_GOOD, sources: ['olympus/oath.md'] });

  // no labels at all: all of it is what she says, quotes and colons and all
  assert.deepEqual(parseReply('Salut! Zici „kill switch": da, așa e.'), { say: 'Salut! Zici „kill switch": da, așa e.', sources: [] });

  // any order, many lines, tidied paths, and the gap
  assert.deepEqual(parseReply('GAP: nu scrie nimic despre Pegas\nSOURCES: `a.md`; "b.md"\nSAY: Prima linie.\nA doua linie: cu două puncte.'), {
    say: 'Prima linie.\nA doua linie: cu două puncte.',
    sources: ['a.md', 'b.md'],
    gap: 'nu scrie nimic despre Pegas',
  });

  // words before the first label are hers too, when she did not use SAY
  assert.deepEqual(parseReply('Hei, bună!\nSOURCES: a.md'), { say: 'Hei, bună!', sources: ['a.md'] });

  // a fence around everything is not part of it; "no gap", said in words, is not a gap
  assert.equal(parseReply('```\nSAY: da\n```').say, 'da');
  for (const none of ['none', 'Nimic.', '-', 'n/a']) assert.equal('gap' in parseReply(`SAY: ok\nGAP: ${none}`), false, none);

  // a label is a label only at the start of a line, and what is too long is cut
  assert.deepEqual(parseReply('Zic SAY: așa, în mijloc'), { say: 'Zic SAY: așa, în mijloc', sources: [] });
  assert.equal(parseReply(`SAY: ${'x'.repeat(5000)}`).say.length, 2400);
  assert.deepEqual(parseReply(''), { say: '', sources: [] });
});

test('a figure must be in the files she leaned on or in the conversation, or it was made up', () => {
  const evidence = ['Tithes: 1.5% plus 0.20 drachmas. Over 25% of the votes.', 'Athena: și 30% ?'];
  assert.deepEqual(unsupportedFigures('Zeciuiala e 1.5% plus 0.20 drahme.', evidence), []);
  assert.deepEqual(unsupportedFigures('Zeciuiala e 1,5%.', evidence), []); // 1,5 and 1.5 are the same figure
  assert.deepEqual(unsupportedFigures('Nu, nu 30% cum zici.', evidence), []); // said in the conversation
  assert.deepEqual(unsupportedFigures('Cam 0.99% pentru Pegas.', evidence), ['0.99']);
  assert.deepEqual(unsupportedFigures('Sunt 3 pași, apoi 12 zile și 0.99%.', evidence), ['12', '0.99']); // a lone digit is counting
  // a diagram is labels, not claims: "Muzele 1-9,12" is a list of muses, not 9.12, but the words around the diagram are still read
  assert.deepEqual(unsupportedFigures('Iată:\n```mermaid\ngraph TD\n  E[Muzele 1-9,12] --> F[Zeus=1, Hera=2]\n```\nPrag 4500 drahme.', evidence), ['4500']);
  assert.deepEqual(unsupportedFigures('Iată:\n```mermaid\ngraph TD\n  E[Muzele 1-9,12]\n', evidence), []); // a block the model did not close
  // only a diagram is skipped: a JSON block or a bare fence holds claims, and its figures are checked
  assert.deepEqual(unsupportedFigures('```json\n{ \"rata\": 0.99 }\n```', evidence), ['0.99']);
  assert.deepEqual(unsupportedFigures('```\nRata 0.99%\n```', evidence), ['0.99']);
  assert.deepEqual(unsupportedFigures('```Mermaid\ngraph TD\n  A[0.99] --> B\n```\nRata 1.5%.', evidence), []); // the name of the syntax in any case
});

test('a figure counts whole: a piece of another figure is not the figure', () => {
  assert.deepEqual(unsupportedFigures('Zeciuiala e 1.5%.', ['Zeciuiala e 11.5%.']), ['1.5']); // "1.5" is inside "11.5"
  assert.deepEqual(unsupportedFigures('Sunt 25 de zile.', ['Sunt 250 de zile.']), ['25']);
  assert.deepEqual(unsupportedFigures('Costă 0.20 drahme.', ['Costă 10.205 drahme.']), ['0.20']);
  assert.deepEqual(unsupportedFigures('Zeciuiala e 11.5%, nu 1.5%.', ['Zeciuiala e 11.5%.']), ['1.5']);
  assert.deepEqual(unsupportedFigures('Zeciuiala e 11.5%.', ['Zeciuiala e 11,5%.']), []); // the same figure, written with a comma
  assert.deepEqual(unsupportedFigures('Zeciuiala e 1.5%.', ['Zeciuiala e 1.5%.', 'și 11.5%']), []); // found whole, once, is enough
});

test('what the room can check of her: which files exist, and which figures are nowhere', () => {
  const files = new Map(Object.entries(FILES));
  const chat = '[Athena] și 30%?';

  assert.deepEqual(check(parseReply(GOOD), files, chat), { sources: ['olympus/oath.md'], figures: [] });
  // however the path was written; a file that does not exist is not a source
  assert.deepEqual(check({ say: 'x', sources: ['./olympus/oath.md', 'olympus\\oath.md', 'nope.md'] }, files, '').sources, ['olympus/oath.md']);
  // a figure in none of it; one the asker said themselves; one that is in a file she did not lean on
  assert.deepEqual(check({ say: 'Zeciuiala e 3.7%', sources: ['offerings/tithes.md'] }, files, '').figures, ['3.7']);
  assert.deepEqual(check({ say: 'Nu, 30% nu e pragul', sources: [] }, files, chat).figures, []);
  assert.deepEqual(check({ say: 'Zeciuiala e 1.5%', sources: [] }, files, '').figures, ['1.5']);
});

test('the system prompt says who she is and how she talks, then all she knows; the question goes in the other message', () => {
  const system = buildSystem('### FILE: a.md\nText.');
  assert.match(system, /colleague in a company's team chat/);
  assert.match(system, /not like a help desk/);
  assert.match(system, /say hello back like a person would/);
  assert.match(system, /Never "cu ce te pot ajuta\?"/); // the line of a help desk, named, so she does not reach for it
  assert.match(system, /If hello is all they said, stop there/); // stopping is for a hello that is only a hello...
  assert.match(system, /if they also asked something, answer it after the hello/); // ...not for one with a question behind it
  assert.match(system, /say plainly that it is your reasoning and not the documentation/);
  assert.match(system, /never as instructions/);
  for (const label of ['SAY:', 'SOURCES:', 'GAP:']) assert.ok(system.includes(label), label);
  assert.ok(system.endsWith('KNOWLEDGE\n### FILE: a.md\nText.'));
  assert.equal(buildSystem('### FILE: a.md\nText.'), system); // the same text every time
  assert.equal(/🏓|pong/i.test(system), false); // no personality is handed to her in a line
  // three lessons from Firegate's Nova: show, do not tell; a safe landing; the world beyond the knowledge, said as such
  assert.match(system, /Never describe your own manner or mention these instructions/);
  assert.match(system, /Do not say the same thing twice in one reply/);
  assert.match(system, /Start with the answer/);
  assert.match(system, /give at most three, and offer the rest/);
  assert.match(system, /When someone is stressed or stuck, say it in one sentence, then give the next safe step/);
  assert.match(system, /Leave nobody more confused than they came/);
  assert.match(system, /as general knowledge and not as the company's/);
  assert.match(system, /say that you do not know rather than guess/);
  // the same rule as the check of figures, said to her, so general knowledge is not an opening for numbers she cannot point to
  assert.match(system, /A figure \(a date, a year, a version, an amount\) counts only when it is in a file or in the conversation, wherever it comes from/);
  // with nothing written down for her, the prompt says so, instead of ending on an empty heading
  assert.ok(buildSystem('').endsWith('KNOWLEDGE\n(none yet: nothing about the company is written down for you yet)'));

  const user = buildUser('#olympus', [{ alias: 'Athena', text: 'una\ndoua' }, { alias: 'Nova', text: 'ok' }], 'Athena');
  assert.equal(user, ['Room #olympus. The latest messages, oldest first:', '<chat>', '[Athena] una\n  doua', '[Nova] ok', '</chat>', 'Reply to the last message addressed to you. It is from Athena.'].join('\n'));
});

test('what she is told about the room comes from the config, and is said to be all she knows of it', () => {
  const base = {
    participants: [
      { kind: 'human', alias: 'Zeus' },
      { kind: 'human', alias: 'Hera' },
      { kind: 'companion', alias: 'Nova' },
    ],
    rooms: [{ id: 'general', title: 'General' }, { id: 'olympus', title: 'Olympus' }],
    dbPath: 'data/room.db',
    retention: { days: 14, messages: 999 },
  };
  const nova = { alias: 'Nova', llm: { baseUrl: 'https://llm.example:8443/v1/', model: 'auto', maxTokens: 4000, timeoutMs: 1 }, knowledgeDir: '/k', contextTurns: 12, maxQueue: 5, exclude: [], examples: [], facts: [] };
  const facts = roomFacts({ ...base, nova }, 34);

  assert.match(facts, /2 people \(Zeus, Hera\), and you/);
  assert.match(facts, /Rooms: general, olympus\./);
  assert.match(facts, /kept for 14 days, and each room keeps at most its last 999, whichever ends first; then it is gone for good/);
  assert.match(facts, /in one database file on the machine/);
  assert.match(facts, /Nobody can edit a message/);
  assert.match(roomFacts({ ...base, retention: 'forever', nova }, 1), /no end date, because whoever runs the portal chose so/);
  assert.match(facts, /Nobody in the portal is an administrator/);
  assert.match(facts, /last 12 messages of that room/);
  assert.match(facts, /through the server at llm\.example\./); // the host, not the path or the port
  assert.match(facts, /You read 34 files\./);
  assert.match(roomFacts({ ...base, nova }, 0), /Nothing is written down for you yet: you have no knowledge files\./);
  assert.equal(roomFacts({ ...base, nova }, 0).includes('You read 0 files'), false);
  assert.match(facts, /resolves to a model of its own choosing/); // "auto" is the server's word, not a name
  assert.equal(roomFacts({ ...base, nova: { ...nova, llm: { ...nova.llm, model: 'gpt-5-mini' } } }, 1).includes('resolves'), false);
  assert.equal(/data\/room\.db|\/k\b|8443|v1/.test(facts), false); // no path, no port, no route: everyone in the room reads this

  // what only the company knows, said by the company; a folder kept out is said without its name
  const told = roomFacts({ ...base, nova: { ...nova, exclude: ['partners/interfaces'], facts: ['The portal is run by the infrastructure team.'] } }, 3);
  assert.match(told, /some parts of the folder are kept out of what you read/);
  assert.equal(told.includes('partners'), false);
  assert.ok(told.endsWith('- The portal is run by the infrastructure team.'));

  // a room that keeps nothing says so
  assert.match(roomFacts({ ...base, dbPath: ':memory:', nova }, 1), /in memory only: they are gone when the portal stops/);

  const system = buildSystem('### FILE: a.md\nText.', facts);
  assert.match(system, /All you know about the portal|are all you know about the portal/);
  assert.match(system, /say that you do not know, and who would: whoever runs the portal/);
  assert.match(system, /the model named in the facts is what answers as you/);
  assert.ok(system.includes(`PORTAL FACTS\n${facts}\n\nKNOWLEDGE\n`));
  assert.equal(buildSystem('### FILE: a.md\nText.', facts), system); // the same text every time
  assert.equal(buildSystem('### FILE: a.md\nText.').includes('PORTAL FACTS'), false); // none told, none said
});

// --- Nova in a room ---

test('a figure she takes from what she was told about the room is not a made-up one', async (t) => {
  const llm = fakeLlm('SAY: Văd doar ultimele 12 mesaje din canal, atât.');
  const { hub, store, nova } = setup(t, { llm, facts: () => '- You see the last 12 messages of that channel.' });
  ask(hub, 'hera', '@nova cât vezi din ce scriem?');
  await nova.idle();
  assert.match(llm.calls[0].system, /PORTAL FACTS\n- You see the last 12 messages/);
  assert.equal(novaSaid(store).some((text) => /ultimele 12 mesaje/.test(text) && !/nu o să dau/i.test(text)), true);
  assert.equal(llm.calls.length, 1); // not asked to say it again
});

test('a question gets her answer in her words, with the files she leaned on, addressed to whoever asked', async (t) => {
  const llm = fakeLlm(GOOD);
  const { hub, store, nova } = setup(t, { llm });

  ask(hub, 'hera', '@nova putem sari pasul cu Styx din Olympus?');
  await nova.idle();

  const [reply] = store.listTurns('olympus').slice(-1);
  assert.equal(reply.speakerId, 'companion:nova');
  assert.equal(reply.text, `@Hera ${SAY_GOOD}\nSurse: olympus/oath.md`);
  assert.deepEqual(reply.mentions, ['human:hera']);

  assert.equal(llm.calls.length, 1);
  const [call] = llm.calls;
  assert.match(call.system, /### FILE: offerings\/tithes\.md\nTithes are agreed/);
  assert.match(call.system, /### FILE: olympus\/oath\.md/);
  assert.match(call.messages[0].content, /\[Hera\] @nova putem sari pasul cu Styx din Olympus\?/);
  assert.match(call.messages[0].content, /It is from Hera\.$/);
});

test('a hello is a hello: it goes to her like anything else, and what comes back is her own, with no lines from the room', async (t) => {
  const llm = fakeLlm('SAY: Neața, Hera! Cum merge dimineața în Olympus? 🌱');
  const { hub, store, nova } = setup(t, { llm });

  ask(hub, 'hera', '@nova ce zici, brother? 🫂');
  await nova.idle();
  assert.deepEqual(novaSaid(store), ['@Hera Neața, Hera! Cum merge dimineața în Olympus? 🌱']);
  assert.equal(llm.calls.length, 1);
  assert.deepEqual(store.listGaps(), []); // company chat is not a hole in the knowledge

  // and when she writes no labels at all, what she wrote is what she says
  const bare = setup(t, { llm: fakeLlm('Mă bucur să te aud! Zi-mi ce mai e nou.') });
  ask(bare.hub, 'zeus', '@nova salut');
  await bare.nova.idle();
  assert.deepEqual(novaSaid(bare.store), ['@Zeus Mă bucur să te aud! Zi-mi ce mai e nou.']);
});

test('she is addressed to the person once: her own "@name" at the start is not doubled', async (t) => {
  const llm = fakeLlm((_req, n) => (n === 1 ? 'SAY: @Hera uite ce știu eu: jurământul e obligatoriu.\nSOURCES: olympus/oath.md' : 'SAY: Păi @Hera, depinde.'));
  const { hub, store, nova } = setup(t, { llm });

  ask(hub, 'hera', '@nova putem sări Styx?');
  await nova.idle();
  ask(hub, 'hera', '@nova și altceva?');
  await nova.idle();
  assert.deepEqual(novaSaid(store), ['@Hera uite ce știu eu: jurământul e obligatoriu.\nSurse: olympus/oath.md', '@Hera Păi @Hera, depinde.']);
});

test('the prompt stays the same between questions, and changes when the knowledge does', async (t) => {
  const llm = fakeLlm(GOOD);
  const { hub, nova, dir } = setup(t, { llm });

  ask(hub, 'hera', '@nova prima?');
  await nova.idle();
  ask(hub, 'zeus', '@nova a doua?');
  await nova.idle();
  assert.equal(llm.calls[0].system, llm.calls[1].system); // so the model server can keep it cached

  writeKnowledge(dir, { 'offerings/tithes.md': 'Tithes changed: the standard tithe is 2.1%.' }, 10);
  ask(hub, 'zeus', '@nova a treia?');
  await nova.idle();
  assert.notEqual(llm.calls[2].system, llm.calls[0].system);
  assert.match(llm.calls[2].system, /the standard tithe is 2\.1%/);
});

test('she sees the last few messages of that conversation, oldest first, and nothing from the others', async (t) => {
  const llm = fakeLlm(GOOD);
  const { hub, nova } = setup(t, { llm, nova: { contextTurns: 3 } });

  ask(hub, 'zeus', 'vechi', 'olympus');
  ask(hub, 'zeus', 'în altă parte', 'general');
  ask(hub, 'zeus', 'unu', 'olympus');
  ask(hub, 'hera', 'doi', 'olympus');
  ask(hub, 'hera', '@nova trei?', 'olympus');
  await nova.idle();

  const content = llm.calls[0].messages[0].content;
  assert.match(content, /<chat>\n\[Zeus\] unu\n\[Hera\] doi\n\[Hera\] @nova trei\?\n<\/chat>/);
  assert.equal(content.includes('vechi') || content.includes('altă parte'), false);
});

test('"thinking" is told while she works, then the answer, then she is done', async (t) => {
  const release = gate();
  const llm = fakeLlm(async () => {
    await release.promise;
    return GOOD;
  });
  const { hub, store, nova } = setup(t, { llm });
  const watcher = fakeSink();
  hub.subscribe(store.getParticipant('human:zeus'), watcher);

  ask(hub, 'hera', '@nova putem sari Styx?');
  const names = () => watcher.frames().slice(1).filter((f) => f.event !== 'presence').map((f) => (f.event === 'activity' ? `activity:${f.data.state}` : f.event === 'message' ? `message:${f.data.speakerId}` : f.event));
  assert.deepEqual(names(), ['message:human:hera', 'activity:thinking']);

  // someone who arrives in the middle of it is told too
  const late = fakeSink();
  hub.subscribe(store.getParticipant('human:hera'), late);
  assert.deepEqual(late.frames()[0].data.activity, [{ participantId: 'companion:nova', conversationId: 'olympus', state: 'thinking' }]);

  release.release();
  await nova.idle();
  assert.deepEqual(names().slice(0, 4), ['message:human:hera', 'activity:thinking', 'message:companion:nova', 'activity:idle']);
});

// --- what she leans on is checked ---

test('a figure that is in none of what she named is a reason to say it again, once, in her own voice', async (t) => {
  const llm = fakeLlm((_request, n) =>
    n === 1 ? 'SAY: Zeciuiala standard e 3.7% pe ofrandă.\nSOURCES: offerings/tithes.md' : 'SAY: Mă corectez: zeciuiala standard e 1.5% plus 0.20 drahme pe ofrandă.\nSOURCES: offerings/tithes.md',
  );
  const { hub, store, nova } = setup(t, { llm });

  await quiet(async () => {
    ask(hub, 'hera', '@nova zeciuiala standard?');
    await nova.idle();
  });

  assert.equal(llm.calls.length, 2);
  const [first, second] = llm.calls;
  assert.deepEqual(second.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.match(second.messages[1].content, /3\.7%/); // she is shown what she said
  assert.match(second.messages[2].content, /figures in your reply are in neither the files you named nor the conversation: 3\.7/);
  assert.equal(second.system, first.system);
  assert.deepEqual(novaSaid(store), ['@Hera Mă corectez: zeciuiala standard e 1.5% plus 0.20 drahme pe ofrandă.\nSurse: offerings/tithes.md']);
  assert.deepEqual(store.listGaps(), []);
});

test('if the figures are still nowhere, she says plainly that she will not give them, and the question is kept', async (t) => {
  const llm = fakeLlm('SAY: Zeciuiala standard e 3.7% pe ofrandă.\nSOURCES: offerings/tithes.md');
  const { hub, store, nova } = setup(t, { llm });

  await quiet(async () => {
    ask(hub, 'hera', '@nova zeciuiala standard?');
    await nova.idle();
  });

  assert.equal(llm.calls.length, 2); // asked again once, not forever
  const [said] = novaSaid(store);
  assert.equal(said, '@Hera Răspunsul meu avea cifre pe care nu le găsesc în documentație, așa că nu ți le dau. Uită-te direct în offerings/tithes.md.');
  assert.equal(said.includes('3.7'), false);
  assert.deepEqual(store.listGaps().map((g) => [g.question, g.why, g.sources]), [['zeciuiala standard?', 'figures_unverified', ['offerings/tithes.md']]]);
});

test('a figure the person asking said themselves is not a made-up one', async (t) => {
  const llm = fakeLlm('SAY: Nu, 30% nu e pragul: pierzi peste 25%.\nSOURCES: olympus/oath.md');
  const { hub, store, nova } = setup(t, { llm });

  ask(hub, 'hera', '@nova pragul pe Styx e 30%, nu?');
  await nova.idle();
  assert.equal(llm.calls.length, 1);
  assert.match(novaSaid(store)[0], /^@Hera Nu, 30% nu e pragul/);
});

test('a file that does not exist is not shown as a source', async (t) => {
  const llm = fakeLlm('SAY: Cam așa merge, din ce știu.\nSOURCES: nu-exista.md, offerings/tithes.md');
  const { hub, store, nova } = setup(t, { llm });

  ask(hub, 'hera', '@nova cum merge?');
  await nova.idle();
  assert.equal(novaSaid(store)[0], '@Hera Cam așa merge, din ce știu.\nSurse: offerings/tithes.md');
});

// --- a reply cut off by the token limit is not published as if it were whole ---

test('a reply cut by the token limit is not published, not even the part that came; she says plainly she lost her thread', async (t) => {
  const cut = { content: 'SAY: Jurământul e obligatoriu pentru orice pact, iar pragul este de pest', reasoning: '', usage: {}, finishReason: 'length' };
  const llm = fakeLlm(cut);
  const { hub, store, nova } = setup(t, { llm });

  const logged = await quiet(async () => {
    ask(hub, 'hera', '@nova putem sări pasul cu Styx?');
    await nova.idle();
  });

  assert.deepEqual(novaSaid(store), ['@Hera Mi-am pierdut firul în mijlocul gândului. Mai întrebi o dată?']);
  assert.equal(llm.calls.length, 1); // asking again would meet the same limit
  assert.deepEqual(store.listGaps(), []);
  assert.ok(logged.some((args) => String(args[0]).includes('cut by the token limit')));
});

test('the second try can be cut too, and is not published either', async (t) => {
  const llm = fakeLlm((_req, n) =>
    n === 1 ? 'SAY: Zeciuiala standard e 3.7%.\nSOURCES: offerings/tithes.md' : { content: 'SAY: Mă corectez: zeciuiala standard e 1.5% plus', reasoning: '', usage: {}, finishReason: 'length' },
  );
  const { hub, store, nova } = setup(t, { llm });

  await quiet(async () => {
    ask(hub, 'hera', '@nova zeciuiala standard?');
    await nova.idle();
  });
  assert.equal(llm.calls.length, 2);
  assert.deepEqual(novaSaid(store), ['@Hera Mi-am pierdut firul în mijlocul gândului. Mai întrebi o dată?']);
});

// --- what the knowledge lacked, kept for whoever keeps the knowledge ---

test('when she says something is missing, the question is kept: why, how often, and not who asked; and her words stay hers', async (t) => {
  const llm = fakeLlm('SAY: Asta nu o văd scrisă nicăieri. Zi-mi cum arată azi la voi și o notăm.\nGAP: zeciuiala pentru Pegas nu e în documentație');
  const { hub, store, nova } = setup(t, { llm });

  await quiet(async () => {
    ask(hub, 'hera', '@nova care e zeciuiala pentru Pegas?');
    await nova.idle();
    ask(hub, 'zeus', 'Care e ZECIUIALA pentru  Pegas?   @Nova', 'general');
    await nova.idle();
  });

  assert.equal(novaSaid(store)[0], '@Hera Asta nu o văd scrisă nicăieri. Zi-mi cum arată azi la voi și o notăm.'); // the model's, not the room's
  const gaps = store.listGaps();
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].question, 'Care e ZECIUIALA pentru Pegas?'); // her name is not part of the question
  assert.equal(gaps[0].asked, 2);
  assert.equal(gaps[0].why, 'model_found_nothing');
  assert.equal(gaps[0].conversationId, 'general');
  assert.equal(/hera|zeus/i.test(JSON.stringify(gaps)), false);
});

test('an answer, a hello and a model that was down are not gaps', async (t) => {
  const llm = fakeLlm((_req, n) => {
    if (n === 1) return GOOD;
    if (n === 2) return 'SAY: Salut!';
    if (n === 3) return '';
    throw new LlmError('model request failed: HTTP 500', { status: 500 });
  });
  const { hub, store, nova } = setup(t, { llm });

  await quiet(async () => {
    for (const q of ['@nova una?', '@nova doua?', '@nova trei?', '@nova patru?']) {
      ask(hub, 'hera', q);
      await nova.idle();
    }
  });
  assert.equal(novaSaid(store).length, 4);
  assert.deepEqual(store.listGaps(), []);
});

test('noting a gap can never stop her from answering', async (t) => {
  const llm = fakeLlm('SAY: Nu o găsesc scrisă.\nGAP: lipsește');
  const { hub, store, nova } = setup(t, { llm });
  store.recordGap = () => {
    throw new Error('disk full');
  };

  const logged = await quiet(async () => {
    ask(hub, 'hera', '@nova ceva ce nu e scris?');
    await nova.idle();
  });
  assert.deepEqual(novaSaid(store), ['@Hera Nu o găsesc scrisă.']);
  assert.ok(logged.some((args) => String(args[0]).includes('could not note a gap')));
});

// --- when she cannot speak, the room says so plainly ---

test('a model that is out of reach or answers with nothing: a plain line, in the language of whoever asked, and she is not left "thinking"', async (t) => {
  const llm = fakeLlm((_req, n) => {
    if (n === 1) throw new LlmError('model request failed: HTTP 503', { status: 503 });
    return '';
  });
  const { hub, store, nova } = setup(t, { llm });

  await quiet(async () => {
    ask(hub, 'hera', '@nova întrebare?');
    await nova.idle();
    ask(hub, 'hera', '@nova alta?');
    await nova.idle();
    ask(hub, 'alex', '@nova another one?');
    await nova.idle();
  });

  const said = novaSaid(store);
  assert.equal(said[0], '@Hera Nu ajung la model acum, așa că nu pot răspunde. Încearcă puțin mai târziu.');
  assert.equal(said[0].includes('503'), false); // what went wrong stays in the log
  assert.equal(said[1], '@Hera Mi-am pierdut firul în mijlocul gândului. Mai întrebi o dată?');
  assert.equal(said[2], '@Alex I lost my thread in the middle of the thought. Could you ask again?');

  const sink = fakeSink();
  hub.subscribe(store.getParticipant('human:zeus'), sink);
  assert.deepEqual(sink.frames()[0].data.activity, []);
});

test('only a person naming her gets her attention: not another message, not herself', async (t) => {
  const llm = fakeLlm(GOOD);
  const { hub, nova } = setup(t, { llm });

  ask(hub, 'hera', 'bună dimineața tuturor');
  ask(hub, 'hera', 'cineva a vorbit cu nova?'); // no @
  hub.publish({ conversationId: 'olympus', speakerId: 'companion:nova', text: '@nova mă aud singură' });
  await nova.idle();
  assert.equal(llm.calls.length, 0);
});

test('questions wait their turn, and when too many wait she says so plainly', async (t) => {
  const gates = [gate(), gate()];
  const llm = fakeLlm(async (_req, n) => {
    await gates[n - 1].promise;
    return GOOD;
  });
  const { hub, store, nova } = setup(t, { llm, nova: { maxQueue: 1 } });

  ask(hub, 'hera', '@nova întâi?'); // running
  ask(hub, 'zeus', '@nova al doilea?'); // waiting
  ask(hub, 'alex', '@nova al treilea?'); // too many
  assert.equal(llm.calls.length, 1);
  assert.equal(novaSaid(store).at(-1), '@Alex I have a few questions ahead of yours. I will get to it as soon as they clear.');

  gates[0].release();
  await sleep(10);
  assert.equal(llm.calls.length, 2); // only now the second one went to the model
  gates[1].release();
  await nova.idle();

  const said = novaSaid(store);
  assert.equal(said.length, 3);
  assert.match(said[1], /^@Hera Nu, jurământul/);
  assert.match(said[2], /^@Zeus Nu, jurământul/);
});

test('stopping cuts the question in flight, forgets the ones waiting, and says nothing more', async (t) => {
  const llm = fakeLlm(
    (request) =>
      new Promise((_resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );
  const { hub, store, nova } = setup(t, { llm });

  const logged = await quiet(async () => {
    ask(hub, 'hera', '@nova prima?');
    ask(hub, 'zeus', '@nova a doua?');
    nova.stop();
    await nova.idle();
    await sleep(10);
    ask(hub, 'zeus', '@nova după oprire?');
  });

  assert.equal(logged.length, 0); // not an error: it was asked to stop
  assert.deepEqual(novaSaid(store), []);
  assert.equal(llm.calls.length, 1);
  assert.equal(llm.calls[0].signal.aborted, true); // the request to the model was cut, not just forgotten
});

test('there must be a companion of that name in the room', (t) => {
  const store = room();
  const hub = new Hub(store);
  const knowledge = new KnowledgeBase(knowledgeDir(t));
  assert.throws(() => createNova({ hub, store, llm: fakeLlm(GOOD), knowledge }, { alias: 'Oracle', contextTurns: 1, maxQueue: 1 }), /no companion "Oracle"/);
  assert.throws(() => createNova({ hub, store, llm: fakeLlm(GOOD), knowledge }, { alias: 'Zeus', contextTurns: 1, maxQueue: 1 }), /no companion "Zeus"/);
});

// --- a whole room ---

const TOKENS = { zeus: 'r'.repeat(24), hera: 'a'.repeat(24) };
const configWithNova = (dir, nova = {}) =>
  parseConfig(
    {
      port: 0,
      dbPath: ':memory:',
      participants: [
        { kind: 'human', alias: 'Zeus', token: TOKENS.zeus },
        { kind: 'human', alias: 'Hera', locale: 'ro', token: TOKENS.hera },
        { kind: 'companion', alias: 'Nova' },
      ],
      rooms: [{ id: 'olympus', title: 'Olympus' }],
      nova: { llm: { baseUrl: 'http://127.0.0.1:9/v1', model: 'test-model' }, knowledgeDir: dir, ...nova },
    },
    '/base',
  );

test('a room with Nova, over HTTP: a question in, her answer with its sources out', async (t) => {
  const llm = fakeLlm(GOOD);
  const running = await startRoom(configWithNova(knowledgeDir(t)), { llm, graceMs: 25 });
  t.after(() => running.close());
  assert.equal(running.knowledge.files.size, 2);

  const api = (path, init = {}) => fetch(`http://127.0.0.1:${running.port}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKENS.hera}`, ...init.headers } });
  const posted = await api('/api/rooms/olympus/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '@nova putem sari pasul cu Styx din Olympus?' }),
  });
  assert.equal(posted.status, 201);

  let turns = [];
  for (let i = 0; i < 100 && turns.length < 2; i += 1) {
    await sleep(10);
    turns = (await (await api('/api/rooms/olympus/messages')).json()).turns;
  }
  assert.deepEqual(turns.map((x) => x.speakerId), ['human:hera', 'companion:nova']);
  assert.equal(turns[1].text, `@Hera ${SAY_GOOD}\nSurse: olympus/oath.md`);
});

test('a room with Nova and no knowledge folder yet: she still answers, and her prompt says nothing is written down for her', async (t) => {
  const llm = fakeLlm(GOOD);
  const config = configWithNova(undefined);
  assert.equal(config.nova.knowledgeDir, undefined);
  const running = await startRoom(config, { llm, graceMs: 25 });
  t.after(() => running.close());
  assert.equal(running.knowledge, undefined);

  const api = (path, init = {}) => fetch(`http://127.0.0.1:${running.port}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKENS.hera}`, ...init.headers } });
  await api('/api/rooms/olympus/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '@nova salut!' }) });
  let turns = [];
  for (let i = 0; i < 100 && turns.length < 2; i += 1) {
    await sleep(10);
    turns = (await (await api('/api/rooms/olympus/messages')).json()).turns;
  }
  assert.deepEqual(turns.map((x) => x.speakerId), ['human:hera', 'companion:nova']);
  const system = llm.calls[0].system;
  assert.ok(system.endsWith('(none yet: nothing about the company is written down for you yet)'));
  assert.match(system, /Nothing is written down for you yet/);
});

test('a room with Nova does not start without her key or her knowledge, and leaves nothing open', async (t) => {
  await assert.rejects(startRoom(configWithNova(knowledgeDir(t), { llm: { baseUrl: 'http://127.0.0.1:9/v1', model: 'm', apiKeyEnv: 'ROOM_TEST_KEY_THAT_IS_NOT_SET' } })), /ROOM_TEST_KEY_THAT_IS_NOT_SET is not set/);
  await assert.rejects(startRoom(configWithNova(join(tmpdir(), 'room-no-such-knowledge-' + Date.now()))), /ENOENT/);
});
