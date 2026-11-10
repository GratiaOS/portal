import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nameThePage } from './identity.ts';

const doc = () => {
  const meta = { value: '', setAttribute: (_: string, v: string) => void (meta.value = v) };
  return { title: 'El portal', meta, querySelector: () => meta } as unknown as Document & { meta: typeof meta };
};
const says = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body }) as Response) as typeof fetch;

test('the page takes the name the portal gives, on its tab and under its icon', async () => {
  const d = doc();
  assert.equal(await nameThePage(says({ ok: true, name: 'Firegate' }), d), 'Firegate');
  assert.equal(d.title, 'Firegate');
  assert.equal(d.meta.value, 'Firegate');
});

test('without a name, or when the portal cannot be asked, it stays El portal', async () => {
  for (const fetchImpl of [says({ ok: true }), says({ name: 7 }), says({ name: '  ' }), says({}, false), (async () => { throw new Error('away'); }) as typeof fetch]) {
    const d = doc();
    assert.equal(await nameThePage(fetchImpl, d), undefined);
    assert.equal(d.title, 'El portal');
  }
});
