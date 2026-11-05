// A small team chat, played out in a real portal: four people, a stand-in Nova, two rooms.
// Run: pnpm --filter portal demo   (builds first). Nothing here is kept: the room lives in memory.
//
// Nova is a script in this demo, not a model. She listens to `hub.on('turn')` and answers with
// `hub.publish`: the same two calls a companion backed by a real model will use.

import { randomBytes } from 'node:crypto';
import { parseConfig, startRoom } from '../dist/index.js';

const PAUSE_MS = Number(process.env.PORTAL_DEMO_PAUSE_MS ?? 350);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const humans = ['Zeus', 'Athena', 'Poseidon', 'Eirene'];
const tokens = Object.fromEntries(humans.map((name) => [name, randomBytes(24).toString('base64url')]));

const config = parseConfig({
  port: 0,
  dbPath: ':memory:',
  participants: [...humans.map((alias) => ({ kind: 'human', alias, token: tokens[alias] })), { kind: 'companion', alias: 'Nova' }],
  rooms: [
    { id: 'general', title: 'General' },
    { id: 'olympus', title: 'Olympus' },
  ],
});
const room = await startRoom(config, { graceMs: 500 });
const base = `http://127.0.0.1:${room.port}`;

const hhmm = (iso) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** One person's connection: a stream they listen on, and a way to speak. */
class Client {
  events = [];
  hello = null;
  onEvent = () => undefined;

  constructor(name) {
    this.name = name;
    this.abort = new AbortController();
  }

  async open(lastEventId) {
    const headers = { Authorization: `Bearer ${tokens[this.name]}` };
    if (lastEventId !== undefined) headers['Last-Event-ID'] = String(lastEventId);
    const res = await fetch(`${base}/api/stream`, { headers, signal: this.abort.signal });
    if (!res.ok) throw new Error(`${this.name}: stream refused with ${res.status}`);
    void this.pump(res);
    await this.until(() => this.hello);
  }

  async pump(res) {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end = buffer.indexOf('\n\n');
        while (end >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const field = (name) => block.split('\n').find((l) => l.startsWith(`${name}: `))?.slice(name.length + 2);
          const data = field('data');
          if (data !== undefined) {
            const event = { event: field('event'), id: field('id'), data: JSON.parse(data) };
            if (event.event === 'hello') this.hello = event.data;
            this.events.push(event);
            this.onEvent(event);
          }
          end = buffer.indexOf('\n\n');
        }
      }
    } catch {
      // we closed it
    }
  }

  turns() {
    return this.events.filter((e) => e.event === 'message').map((e) => e.data);
  }

  async say(channel, text) {
    const res = await fetch(`${base}/api/rooms/${channel}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens[this.name]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.status !== 201) throw new Error(`${this.name}: the portal said ${res.status}: ${await res.text()}`);
    return (await res.json()).turn;
  }

  async until(condition, ms = 3000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (condition()) return;
      await sleep(5);
    }
    throw new Error(`${this.name}: gave up waiting`);
  }

  close() {
    this.abort.abort();
  }
}

// --- the wall: what Zeus's screen shows, in the manner of a LAN chat ---

const alias = (id) => room.store.getParticipant(id)?.alias ?? id;
const zeus = new Client('Zeus');
zeus.onEvent = ({ event, data }) => {
  if (event === 'message') console.log(`[${hhmm(data.createdAt)}] #${data.conversationId} <${alias(data.speakerId)}> ${data.text}`);
  // presence has no time: the room does not know when anyone came or went, and the wall does not pretend to
  if (event === 'presence') console.log(`        * ${alias(data.participantId)} is ${data.state}`);
};

// --- Nova, the stand-in: hears an @mention, answers as herself ---

let novaAnswers = 0;
room.hub.on('turn', (turn) => {
  if (!turn.mentions.includes('companion:nova') || !/Styx/.test(turn.text)) return;
  novaAnswers += 1;
  setTimeout(() => {
    room.hub.publish({
      conversationId: turn.conversationId,
      speakerId: 'companion:nova',
      text: `@${alias(turn.speakerId).toLowerCase()} nu merge, e parte din jurământ, mai exact cel pe Styx 🧭`,
    });
  }, PAUSE_MS / 2);
});

console.log(`portal demo: ${humans.length} people and a stand-in Nova, in memory, on port ${room.port}\n`);

const athena = new Client('Athena');
const poseidon = new Client('Poseidon');
const eirene = new Client('Eirene');
const everyone = [zeus, athena, poseidon, eirene];
const seen = (turns) => turns.map((t) => [t.seq, alias(t.speakerId), t.text]);

try {
  await zeus.open();
  await zeus.say('general', 'Neața tuturor 🌱☀️');
  await sleep(PAUSE_MS);

  // Poseidon arrives late: with Last-Event-ID 0 he is handed what he missed
  await poseidon.open(0);
  await poseidon.say('general', 'Salut @zeus');
  await sleep(PAUSE_MS);

  await athena.open(0);
  await athena.say('olympus', '@nova putem sari pasul cu Styx din Olympus?');
  await zeus.until(() => zeus.turns().length >= 4); // Nova's answer
  await sleep(PAUSE_MS);

  await eirene.open(0);
  await eirene.say('general', 'Mă duc la cafea 🗝️');
  await zeus.until(() => zeus.turns().length >= 5);
  eirene.close();
  await zeus.until(() => zeus.events.some((e) => e.event === 'presence' && e.data.participantId === 'human:eirene' && e.data.state === 'offline'));

  // --- what we claim, checked ---
  const reference = JSON.stringify(seen(zeus.turns()));
  const checks = [
    [`all ${everyone.length} connections saw the same ${zeus.turns().length} turns, in the same order`, everyone.every((c) => JSON.stringify(seen(c.turns())) === reference) && zeus.turns().length === 5],
    ['Poseidon, who came late, was handed the greeting he missed', poseidon.turns()[0]?.text === 'Neața tuturor 🌱☀️'],
    ['Nova answered the one @mention of her, and only that', novaAnswers === 1 && zeus.turns().filter((t) => t.speakerId === 'companion:nova').length === 1],
    ['Eirene was seen leaving, a moment after she went', zeus.events.at(-1).data.state === 'offline'],
  ];
  console.log('');
  for (const [claim, ok] of checks) console.log(`${ok ? '✔' : '✖'} ${claim}`);
  process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
} catch (err) {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  for (const client of everyone) client.close();
  await room.close();
}
