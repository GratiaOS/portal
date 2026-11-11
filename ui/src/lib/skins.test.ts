import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { SKINS } from './skin.ts';

const src = new URL('..', import.meta.url).pathname;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx$/.test(name)) yield path;
  }
}

const used = new Set<string>();
for (const file of sources(src)) for (const [, part] of readFileSync(file, 'utf8').matchAll(/data-part="([a-z-]+)"/g)) used.add(part!);

const readme = readFileSync(join(src, 'skins', 'README.md'), 'utf8');
const skinCss = (id: string) => readFileSync(join(src, 'skins', `${id}.css`), 'utf8');

test('skins: every part the page uses is in the contract', () => {
  assert.ok(used.size > 40, `found only ${used.size} parts`);
  assert.deepEqual([...used].filter((part) => !readme.includes(`\`${part}\``)), [], 'parts the page uses that skins/README.md does not list');
});

for (const { id } of SKINS) {
  test(`skins: ${id} answers every part, and keeps everything inside its own scope`, () => {
    const css = skinCss(id);
    const unstyled = [...used].filter((part) => !css.includes(`[data-part='${part}']`) && !['channels'].includes(part));
    assert.deepEqual(unstyled, [], `parts the page uses that ${id}.css has no rule for`);

    // at the top of the file there is the one block of the skin, and keyframes named for it; nothing else, or it would leak into the others
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const top: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < bare.length; i += 1) {
      if (bare[i] === '{') {
        if (depth === 0) top.push(bare.slice(start, i).trim());
        depth += 1;
      } else if (bare[i] === '}') {
        depth -= 1;
        if (depth === 0) start = i + 1;
      }
    }
    assert.equal(depth, 0, 'unbalanced braces');
    const scope = `:root:is([data-skin='${id}'], [data-skin-base='${id}'])`; // the look itself, and a skin from a folder that builds on it
    const allowed = (prelude: string) => prelude === scope || prelude.startsWith(`@keyframes ${id}-`);
    assert.deepEqual(top.filter((prelude) => !allowed(prelude)), [], `${id}.css has rules outside its scope`);
    assert.ok(top.includes(scope), `${id}.css has no block of its own`);
  });
}

for (const { id } of SKINS) {
  test(`skins: ${id} makes the log a positioned box, so that what is only for a screen reader does not stretch the page`, () => {
    // `sr-only` is absolute; with nothing positioned between it and the page, its place inside the scrolled log counted in the height of the page
    const rule = /\[data-part='log'\] \{([^}]*)\}/.exec(skinCss(id).replace(/\/\*[\s\S]*?\*\//g, ''));
    assert.ok(rule, `${id}.css has no rule for the log`);
    assert.match(rule[1]!, /position:\s*relative/);
  });
}

test('skins: the third column, which came after contract 1, is hidden until a skin shows it', () => {
  const base = readFileSync(join(src, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(base, /\[data-part='field'\]\s*\{\s*display:\s*none;\s*\}/);
  for (const { id } of SKINS) assert.ok(skinCss(id).includes("[data-part='field']"), `${id}.css shows the third column`);
});

test('skins: the contract lists no part the page does not have', () => {
  const listed = new Set<string>();
  for (const [, part] of readme.matchAll(/`([a-z][a-z-]+)`/g)) listed.add(part!);
  const known = new Set([...used, 'live', 'connecting', 'reconnecting', 'refused', 'mine', 'companion', 'other', 'pre', 'figure', 'log', 'disabled', 'data-here', 'data-popping', 'data-thinking', 'data-spoke', 'data-arrived', 'data-you', 'data-to-you', 'data-jumbo', 'room-occurrence', 'data-head', 'data-from', 'data-connection', 'data-part', 'data-gate', 'data-skin', 'data-skin-base', 'font-family', 'aria-current', 'aria-hidden', 'display', 'grid', 'order', 'left', 'width', 'height', 'text', 'data-idle', 'data-first', 'data-preview', 'data-own', 'data-welcome', 'data-fading', 'data-sheet', 'aria-expanded', 'data-group', 'data-sheet-only', 'data-snail', 'data-of']);
  const stray = [...listed].filter((word) => !known.has(word) && /^[a-z]+(-[a-z]+)+$/.test(word));
  assert.deepEqual(stray, []);
});

test('skins: the page puts no class and no fixed colour on an element', () => {
  for (const file of sources(src)) {
    const text = readFileSync(file, 'utf8');
    assert.equal(/className=/.test(text), false, `${file} has a className`);
    assert.equal(/style=\{\{[^}]*(var\(--|#[0-9a-f]{3,6}|rgb|hsl|oklch)/.test(text.replace(/'--hue': hueOf/g, '')), false, `${file} puts a colour inline`);
  }
});

for (const { id } of SKINS) {
  test(`skins: ${id} makes what is pressed 44 px and what is written 16 px on a touch screen`, () => {
    const css = skinCss(id).replace(/\/\*[\s\S]*?\*\//g, '');
    const coarse = /@media \(pointer: coarse\) \{([\s\S]*?)\n  \}\n/.exec(css)?.[1] ?? '';
    assert.ok(coarse, `${id}.css has no block for a touch screen`);
    for (const part of ['skin-option', 'channel', 'signout', 'code-copy', 'sign-slot', 'sign-step', 'sign-tile', 'sign-add', 'composer-send']) assert.ok(coarse.includes(`[data-part='${part}']`), `${id}: ${part} is not made 44 px for a finger`);
    assert.match(coarse, /min-height: 44px/);
    assert.match(coarse, /\[data-part='sign-input'\] \{[^}]*font-size: 16px/, `${id}: the box for an emoji is not 16 px`);
    assert.match(coarse, /\[data-part='composer-input'\] \{[^}]*font-size: 16px/, `${id}: the box for writing is not 16 px (iOS zooms the page below it)`);
  });
}

for (const { id } of SKINS) {
  test(`skins: ${id} keeps what is said and where it is written to a reading column on a wide page`, () => {
    const css = skinCss(id).replace(/\/\*[\s\S]*?\*\//g, '');
    const block = /@media \(min-width: 48rem\) \{\s*\[data-part='log'\] \{([^}]*)\}\s*\[data-part='channel-head'\],\s*\[data-part='channel-view'\] \[data-part='composer'\] \{([^}]*)\}/.exec(css);
    assert.ok(block, `${id}.css has no reading column`);
    assert.match(block![1]!, /calc\(\(100% - 44rem\) \/ 2\)/);
    assert.match(block![2]!, /calc\(\(100% - 44rem\) \/ 2/);
  });
}
