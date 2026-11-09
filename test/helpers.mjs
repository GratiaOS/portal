import assert from 'node:assert/strict';
import { RoomStore, nodeSqlite } from '../dist/index.js';

export const PEOPLE = [
  { kind: 'human', alias: 'Zeus' },
  { kind: 'human', alias: 'Hera', locale: 'ro' },
  { kind: 'companion', alias: 'Nova' },
];
export const CHANNELS = [
  { id: 'general', title: 'General' },
  { id: 'olympus', title: 'Olympus' },
];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function room() {
  const store = new RoomStore(nodeSqlite(':memory:'));
  store.syncParticipants(PEOPLE);
  store.syncConversations(CHANNELS);
  return store;
}

/** The events in a piece of a stream; comments and `retry:` lines are not events. */
export function parseFrames(text) {
  return text
    .split('\n\n')
    .filter(Boolean)
    .flatMap((block) => {
      const lines = block.split('\n');
      const field = (name) => lines.find((l) => l.startsWith(`${name}: `))?.slice(name.length + 2);
      const data = field('data');
      if (data === undefined) return [];
      return [{ event: field('event'), id: field('id'), data: JSON.parse(data) }];
    });
}

/** A connection that only remembers what it was sent. */
export function fakeSink() {
  const chunks = [];
  const sink = {
    chunks,
    closed: false,
    write: (chunk) => chunks.push(chunk),
    close: () => {
      sink.closed = true;
    },
    frames: () => parseFrames(chunks.join('')),
    events: () => sink.frames().map((f) => f.event),
  };
  return sink;
}

/** Reads a stream in the background, so a test can wait for what it expects to arrive. */
export class Collector {
  text = '';

  constructor(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    this.finished = (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          this.text += decoder.decode(value, { stream: true });
        }
      } catch {
        // the test cut the connection
      }
    })();
  }

  async waitFor(predicate, ms = 2000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (predicate(this.text)) return;
      await sleep(5);
    }
    assert.fail(`timed out; the stream ended with ${JSON.stringify(this.text.slice(-300))}`);
  }
}
