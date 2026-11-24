import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseConfig, startRoom } from '../dist/index.js';
import { sleep } from './helpers.mjs';

// RFC 002: a fade means gone, from the file too, whether or not anyone reads or writes again. On a Node home it is the timer that does it.

const until = async (check, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(20);
  }
  return false;
};

test('a drop that has faded is let go by the timer, with no read and no other drop; one that has not is kept', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'drops-run-'));
  try {
    const config = parseConfig(
      {
        participants: [{ kind: 'human', alias: 'Quartz', token: 'z'.repeat(24) }],
        rooms: [{ id: 'general', title: 'General' }],
        port: 0,
        dbPath: 'data/room.db',
        retention: 'forever', // nothing else is let go on a pace: only the fade wakes it
        drops: { frequencies: [{ freq: '99.6', holder: 'Quartz' }] },
      },
      dir,
    );
    const room = await startRoom(config, { forgetEveryMs: 40 });
    try {
      // the one that fades is the last written, so no later write lets it go: only the timer can
      room.store.addDrop({ freq: '99.6', body: 'long', fadeMs: 30 * 86_400_000 }, 50);
      room.store.addDrop({ freq: '99.6', body: 'brief', fadeMs: 1 }, 50);
      assert.ok(await until(() => room.store.countDrops('99.6') === 1), 'the faded drop is still a row: the timer has not let it go');
      await sleep(200);
      assert.equal(room.store.countDrops('99.6'), 1); // and the one that has not faded stays
      assert.deepEqual(room.store.listDrops('99.6').map((d) => d.body), ['long']);
    } finally {
      await room.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a portal that begins again lets go of what faded while it was off', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'drops-run-'));
  try {
    const config = parseConfig(
      {
        participants: [{ kind: 'human', alias: 'Quartz', token: 'z'.repeat(24) }],
        rooms: [{ id: 'general', title: 'General' }],
        port: 0,
        dbPath: 'data/room.db',
        drops: { frequencies: [{ freq: '99.6', holder: 'Quartz' }] },
      },
      dir,
    );
    const first = await startRoom(config, { forgetEveryMs: 60_000 });
    first.store.addDrop({ freq: '99.6', body: 'brief', fadeMs: 1 }, 50);
    assert.equal(first.store.countDrops('99.6'), 1);
    await first.close();
    await sleep(20);
    const second = await startRoom(config, { forgetEveryMs: 60_000 });
    try {
      assert.equal(second.store.countDrops('99.6'), 0); // gone at the start, not at the first read
    } finally {
      await second.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
