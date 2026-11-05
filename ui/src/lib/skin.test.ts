import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_SKIN, SKINS, chooseSkin, chosenSkin, isBuiltIn, isSkinId, showSkin } from './skin.ts';

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => void (data[key] = value) };
};

// a page that is only as much as the skin module touches: a root with a dataset, and a head that can hold links
const page = () => {
  const links: { rel?: string; href?: string; dataset: Record<string, string> }[] = [];
  const ownerDocument = {
    head: { append: (link: (typeof links)[number]) => void links.push(link) },
    querySelector: (selector: string) => links.find((link) => selector === `link[data-skin-sheet="${link.dataset.skinSheet}"]`) ?? null,
    createElement: () => ({ dataset: {} as Record<string, string> }),
  };
  return { root: { dataset: {} as Record<string, string>, ownerDocument } as unknown as HTMLElement, links };
};

test('skin: the first is the default, and the built-in ids are plain words', () => {
  assert.equal(DEFAULT_SKIN, SKINS[0].id);
  assert.equal(new Set(SKINS.map((s) => s.id)).size, SKINS.length);
  for (const { id } of SKINS) assert.match(id, /^[a-z]+$/);
});

test('skin: the room refuses these names to a skin from a folder, and the list is the same here and there', () => {
  const server = readFileSync(new URL('../../../src/skins.ts', import.meta.url), 'utf8');
  const listed = /BUILT_IN_SKINS = \[([^\]]*)\]/.exec(server)?.[1]?.match(/'([a-z]+)'/g)?.map((word) => word.slice(1, -1));
  assert.deepEqual(listed, SKINS.map((skin) => skin.id));
});

test('skin: a name is a plain word of the shape a folder may have, and nothing that could be a path or a selector', () => {
  for (const good of ['bubbles', 'atlas', 'paper-2']) assert.equal(isSkinId(good), true, good);
  for (const bad of ['', 'a', 'A', '1abc', 'a b', 'a/b', '../x', "a'b", 'a"]b', '__proto__', 'x'.repeat(33), 42, undefined]) assert.equal(isSkinId(bad), false, String(bad));
  assert.equal(isBuiltIn('bank'), true);
  assert.equal(isBuiltIn('atlas'), false);
});

test('skin: what was chosen is read back; anything else, or nothing, is the default', () => {
  assert.deepEqual(chosenSkin(memory({ 'portal.skin': 'bank' })), { id: 'bank' });
  assert.deepEqual(chosenSkin(memory({ 'portal.skin': 'atlas' })), { id: 'atlas' }); // taken on trust until the room says which it has
  assert.deepEqual(chosenSkin(memory({ 'portal.skin': 'atlas', 'portal.skin.base': 'bank' })), { id: 'atlas', base: 'bank' });
  assert.deepEqual(chosenSkin(memory({ 'portal.skin': 'atlas', 'portal.skin.base': 'neon' })), { id: 'atlas' });
  assert.deepEqual(chosenSkin(memory({ 'portal.skin': 'bank', 'portal.skin.base': 'radar' })), { id: 'bank' }); // a built-in look builds on nothing
  assert.deepEqual(chosenSkin(memory({ 'portal.skin': 'Not A Name' })), { id: DEFAULT_SKIN });
  assert.deepEqual(chosenSkin(memory()), { id: DEFAULT_SKIN });
  assert.deepEqual(chosenSkin(undefined), { id: DEFAULT_SKIN });
  assert.deepEqual(chosenSkin({ getItem: () => { throw new Error('forbidden'); }, setItem: () => undefined }), { id: DEFAULT_SKIN });
});

test('skin: a built-in look is put on the page with no stylesheet, and takes the base of an earlier one away', () => {
  const { root, links } = page();
  showSkin({ id: 'atlas', base: 'bank' }, root);
  assert.equal(root.dataset.skinBase, 'bank');
  showSkin({ id: 'radar' }, root);
  assert.equal(root.dataset.skin, 'radar');
  assert.equal(root.dataset.skinBase, undefined);
  assert.equal(links.length, 1); // the one of atlas, still there: it is scoped, so it does no harm
});

test('skin: a skin from a folder brings its stylesheet, once', () => {
  const { root, links } = page();
  showSkin({ id: 'atlas', base: 'bank' }, root);
  showSkin({ id: 'atlas', base: 'bank' }, root);
  assert.equal(root.dataset.skin, 'atlas');
  assert.equal(links.length, 1);
  assert.equal(links[0]!.href, '/skins/atlas/skin.css');
  assert.equal(links[0]!.rel, 'stylesheet');
  showSkin({ id: 'paper' }, root);
  assert.deepEqual(links.map((link) => link.href), ['/skins/atlas/skin.css', '/skins/paper/skin.css']);
});

test('skin: a name that is not one is never put on the page or in a link', () => {
  const { root, links } = page();
  showSkin({ id: '../../etc' }, root);
  assert.equal(root.dataset.skin, DEFAULT_SKIN);
  assert.equal(links.length, 0);
});

test('skin: choosing shows it and remembers it, with its base; a browser that will not remember still shows it', () => {
  const { root } = page();
  const store = memory();
  chooseSkin({ id: 'atlas', base: 'bank' }, root, store);
  assert.equal(root.dataset.skin, 'atlas');
  assert.deepEqual(store.data, { 'portal.skin': 'atlas', 'portal.skin.base': 'bank' });
  chooseSkin({ id: 'bubbles' }, root, store);
  assert.deepEqual(store.data, { 'portal.skin': 'bubbles', 'portal.skin.base': '' });

  const other = page();
  chooseSkin({ id: 'bubbles' }, other.root, { getItem: () => null, setItem: () => { throw new Error('full'); } });
  assert.equal(other.root.dataset.skin, 'bubbles');
});

test('skin: nothing but skin.ts writes data-skin or data-skin-base', () => {
  const src = new URL('..', import.meta.url).pathname;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && name !== 'skin.ts') files.push(path);
    }
  };
  walk(src);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.equal(/dataset\.skin(Base)?\b|setAttribute\(\s*['"]data-skin|data-skin(-base)?=/.test(text), false, `${file} writes data-skin`);
  }
});
