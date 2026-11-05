import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forgetDrafts, keepDraft, readDraft } from './drafts.ts';

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  } as Storage;
}

const withStorage = (storage: Storage | undefined, run: () => void) => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });
  try {
    run();
  } finally {
    if (had) Object.defineProperty(globalThis, 'sessionStorage', had);
    else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  }
};

test('drafts: one for each channel, and what is written in one is not in the other', () => {
  withStorage(fakeStorage(), () => {
    keepDraft('general', 'salut');
    keepDraft('olympus', 'ambrozia?');
    assert.equal(readDraft('general'), 'salut');
    assert.equal(readDraft('olympus'), 'ambrozia?');
    assert.equal(readDraft('other'), '');
  });
});

test('drafts: an empty text is no draft, so a sent message leaves nothing behind', () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    keepDraft('general', 'salut');
    keepDraft('general', '');
    assert.equal(readDraft('general'), '');
    assert.equal(storage.length, 0);
  });
});

test('drafts: signing out lets go of all of them, and of nothing else', () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    storage.setItem('portal.token', 'x');
    keepDraft('general', 'a');
    keepDraft('olympus', 'b');
    forgetDrafts();
    assert.equal(readDraft('general'), '');
    assert.equal(readDraft('olympus'), '');
    assert.equal(storage.getItem('portal.token'), 'x');
  });
});

test('drafts: with storage blocked nothing throws, and nothing is kept', () => {
  withStorage(undefined, () => {
    assert.doesNotThrow(() => keepDraft('general', 'a'));
    assert.equal(readDraft('general'), '');
    assert.doesNotThrow(() => forgetDrafts());
  });
});
