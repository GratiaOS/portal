import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { forgetToken, keepToken, readToken } from './session.ts';

const memory = () => {
  const kept = new Map<string, string>();
  return {
    getItem: (k: string) => kept.get(k) ?? null,
    setItem: (k: string, v: string) => void kept.set(k, v),
    removeItem: (k: string) => void kept.delete(k),
  };
};

type Setup = { standalone: boolean; session?: ReturnType<typeof memory>; local?: ReturnType<typeof memory> };
function setup({ standalone, session = memory(), local = memory() }: Setup) {
  const w = { matchMedia: () => ({ matches: standalone }), sessionStorage: session, localStorage: local };
  Object.defineProperty(globalThis, 'window', { value: w, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
  return { session, local };
}

afterEach(() => {
  for (const name of ['window', 'sessionStorage', 'localStorage']) delete (globalThis as Record<string, unknown>)[name];
});

test('in a tab of a browser the token lives as long as the tab, remembered or not', () => {
  const { local } = setup({ standalone: false });
  keepToken('k-team', true);
  assert.equal(readToken(), 'k-team');
  assert.equal(local.getItem('portal.token'), null, 'nothing goes to the device');
});

test('in the installed app a person of the team is kept on the device, and a visitor never is', () => {
  const { local, session } = setup({ standalone: true });
  keepToken('k-visitor'); // a visitor: no `remember`
  assert.equal(local.getItem('portal.token'), null);
  forgetToken();
  keepToken('k-team', true);
  assert.equal(local.getItem('portal.token'), 'k-team');
  // the app is closed and opened again: no tab storage, and the person is still in
  session.removeItem('portal.token');
  assert.equal(readToken(), 'k-team');
});

test('signing out lets go of both, and a tab that is not the installed app never reads what the device kept', () => {
  const local = memory();
  local.setItem('portal.token', 'k-team');
  setup({ standalone: false, local });
  assert.equal(readToken(), undefined, 'a browser tab does not pick up the key of the installed app');
  setup({ standalone: true, local });
  assert.equal(readToken(), 'k-team');
  forgetToken();
  assert.equal(readToken(), undefined);
  assert.equal(local.getItem('portal.token'), null);
});

test('storage that throws is no reason to fail', () => {
  const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
  setup({ standalone: true, session: broken as never, local: broken as never });
  assert.doesNotThrow(() => keepToken('k', true));
  assert.equal(readToken(), undefined);
  assert.doesNotThrow(() => forgetToken());
});
