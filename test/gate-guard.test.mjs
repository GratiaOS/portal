// 🛡️ The guard of the gate. It keeps three things true, and nothing more, by reading the source: a test of the architecture, so that whoever changes the gate
// (a contributor, or a model making a pull request to "improve the UX") finds out at once, in red, what it was asked to keep.
//
//   1. The breath of the tree is the clock and nothing else: no network, no storage, no timer, no randomness (docs/the-tree-on-the-gate.md).
//   2. Nothing on the gate lets anyone verify that someone else is home (docs/rfc-001-presence-physics.md §11: "If I remove this, can someone verify
//      whether another person is home? If yes, remove it.").
//   3. The tree is one organism and the gate is quiet: one number, `--breath`, moves the crown, the sky and the roots; nothing in the scene is a control,
//      and there is no word of guidance; and where less motion is asked for, the number stays at 0.
//
// These are rules, not habits: if one of them has to change, change it here, in the same pull request, and say why in it. The messages say what each means.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

/** The code, without its comments: a comment may say what the code does not do. Strings with `//` in them (a URL) are left whole. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<![:"'`])\/\/[^\n]*/g, '');

/** The source files under a folder, without tests and without this guard. */
function sources(dir, extensions) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const path = `${dir}/${name}`;
    if (statSync(join(root, path)).isDirectory()) out.push(...sources(path, extensions));
    else if (extensions.some((e) => name.endsWith(e)) && !/\.test\.[mt]?[jt]sx?$/.test(name)) out.push(path);
  }
  return out;
}

/** The text of one top-level function of a component file, from its first line to its closing brace at the start of a line. */
function functionBody(text, name) {
  const found = new RegExp(`function ${name}\\b[\\s\\S]*?\\n}\\n`).exec(text);
  assert.ok(found, `the gate has lost its ${name}`);
  return found[0];
}

/** The body of the first rule for a selector in a stylesheet (no nesting in this one). */
function rule(css, selector) {
  const found = new RegExp(`${selector.replace(/[[\]'.]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
  assert.ok(found, `gate.css has lost the rule for ${selector}`);
  return found[1];
}

const BREATH_FILES = ['ui/src/lib/breath.ts', 'ui/src/lib/useBreath.ts', 'ui/src/lib/roots.ts'];

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 1. The breath is the clock and nothing else
// ---------------------------------------------------------------------------------------------------------------------------------------------------

test('1. the tree breathes from the clock: its modules touch no network, no storage, no timer and no randomness', () => {
  const forbidden = [
    [/\bfetch\s*\(/, 'a network call'],
    [/\bEventSource\b/, 'a server-sent stream'],
    [/\bWebSocket\b/, 'a socket'],
    [/\bXMLHttpRequest\b/, 'a network call'],
    [/sendBeacon/, 'a network call'],
    [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie/, 'storage: the breath keeps nothing'],
    [/\bsetInterval\b|\bsetTimeout\b/, 'a timer (a reconnect, a poll): the frame loop is the only clock it needs'],
    [/Math\.random/, 'randomness: the breath is the same for everyone'],
    [/from '\.\/(client|sse|session|useRoom|guest|state)\.ts'/, 'a module of the room: the gate breathes before anyone is in it'],
  ];
  for (const file of BREATH_FILES) {
    const text = code(read(file));
    for (const [pattern, what] of forbidden) assert.ok(!pattern.test(text), `${file} has ${what} (${pattern}). The tree breathes from the clock alone: see docs/the-tree-on-the-gate.md.`);
  }
});

test('1. the only source of the phase is the system clock, read in one place, and the wave itself is pure', () => {
  const hook = code(read('ui/src/lib/useBreath.ts'));
  assert.match(hook, /breathAt\(Date\.now\(\)\)/, 'useBreath must read the phase as breathAt(Date.now()): the clock, and nothing else');
  assert.equal((hook.match(/Date\.now\(\)/g) ?? []).length, 1, 'the clock is read in one place');
  assert.ok(!/Date\.now|performance\.now|new Date/.test(code(read('ui/src/lib/breath.ts'))), 'breath.ts is a pure function of the time it is given: it must not read a clock itself');
});

test('1. the network door of the tree has not come back: no route, no hub, no object, no flag', () => {
  const everywhere = [...sources('src', ['.ts']), ...sources('ui/src', ['.ts', '.tsx']), ...sources('cloudflare', ['.ts', '.mjs'])];
  for (const file of everywhere) {
    if (file === 'cloudflare/test/run.mjs' || file.endsWith('gate-guard.test.mjs')) continue;
    const text = code(read(file));
    assert.ok(!/\/api\/breath|BreathHub|createBreathHandler|BREATH\b/.test(text), `${file} brings the tree's network back (a route, a hub or an object). The tree breathes from the clock.`);
  }
  assert.ok(!/breath/i.test(code(read('src/app.ts'))), 'the health and the app say nothing of the tree: it needs no flag');
  assert.ok(!/breath/i.test(code(read('src/config.ts'))), 'the config has no block for the tree: there is nothing to set');

  const wrangler = JSON.parse(code(read('cloudflare/wrangler.jsonc')).replace(/,(\s*[}\]])/g, '$1'));
  assert.deepEqual(wrangler.durable_objects.bindings.map((b) => b.name), ['PORTAL'], 'the Worker has one object, the portal');
  assert.ok(wrangler.migrations.some((m) => m.deleted_classes?.includes('Breath')), "the migration that took the tree's object away stays, as history: a migration is never rewritten");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 2. Nothing on the gate lets anyone verify that someone else is home (RFC 001 §11)
// ---------------------------------------------------------------------------------------------------------------------------------------------------

test('2. the gate shows no sign that anyone else is there: no count, no "last seen", no "typing", no online or offline', () => {
  const residue = /last\s*seen|lastSeen|\btyping\b|\bonline\b|\boffline\b|\bpresence\b|\bparticipants?\b|read[\s-]?receipt|\breceipts?\b|\bjoined\b|people here|others? (are|is) here/i;
  for (const file of ['ui/src/components/LoginGate.tsx', 'ui/src/gate.css', ...BREATH_FILES]) {
    const found = residue.exec(code(read(file)));
    assert.ok(!found, `${file} has "${found?.[0]}": a sign that someone else is home. RFC 001 §11: if removing it stops anyone verifying that another person is there, it was not to be there.`);
  }
});

test('2. what the room says of who is here has no time and no place on it, and a visitor is told that someone is here, never how many', () => {
  const domain = read('src/domain.ts');
  const presence = /export type Presence = \{([^}]*)\}/.exec(domain)?.[1] ?? '';
  assert.ok(presence.includes('participantId') && presence.includes('state'), 'Presence is a participant and a state');
  assert.ok(!/lastSeen|channel|since|at\b|time|typing|count/i.test(presence), `Presence has a field that is a time, a place or a count: ${presence.trim()}`);

  const strings = read('ui/src/lib/strings.ts');
  assert.match(strings, /^\s*guestOthers: string;/m, 'guestOthers is a plain sentence, not a function of a number');
  for (const line of strings.split('\n').filter((l) => /^\s*guestOthers:/.test(l))) assert.ok(!/=>|\$\{/.test(line), `guestOthers takes a number or builds a count: ${line.trim()}`);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// 3. One organism, and a quiet gate
// ---------------------------------------------------------------------------------------------------------------------------------------------------

test('3. one number moves the crown, the sky and the roots, in the same frame, and nothing has an effect of its own', () => {
  const css = code(read('ui/src/gate.css'));
  for (const selector of ["[data-gate='crown']", "[data-gate='glow']", "[data-gate='roots']"]) {
    const body = rule(css, selector);
    assert.match(body, /var\(--breath/, `${selector} is not moved by --breath: the three move on one number or they read as separate things`);
    assert.ok(!/animation|transition/.test(body), `${selector} has an animation or a transition of its own: that is a second mechanism, out of step with the first`);
    assert.match(body, /pointer-events:\s*none/, `${selector} must not take the pointer: the scene is to be looked at`);
  }
  for (const file of [...sources('ui/src', ['.ts', '.tsx', '.css'])]) {
    assert.ok(!/--light|--exhale|--pulse|--phase/.test(code(read(file))), `${file} has a second variable for the breath (--light, --exhale...): there is one, --breath`);
  }
});

test('3. --breath is written in one place, once a frame, from the clock, and read only by the gate', () => {
  const writers = sources('ui/src', ['.ts', '.tsx']).filter((f) => /setProperty\(\s*['"]--breath['"]/.test(code(read(f))));
  assert.deepEqual(writers, ['ui/src/lib/useBreath.ts'], 'only useBreath sets --breath');
  const readers = sources('ui/src', ['.css', '.ts', '.tsx']).filter((f) => /var\(--breath/.test(code(read(f))));
  assert.deepEqual(readers, ['ui/src/gate.css'], 'only gate.css reads --breath');
});

test('3. where less motion is asked for, the number stays at 0 and no frame is asked', () => {
  const hook = code(read('ui/src/lib/useBreath.ts'));
  const reduced = hook.indexOf('prefers-reduced-motion: reduce');
  const frames = hook.indexOf('requestAnimationFrame');
  assert.ok(reduced > -1, 'useBreath must ask whether less motion is wanted');
  assert.ok(frames > reduced, 'less motion must be asked before any frame is requested');
  const between = hook.slice(reduced, frames);
  assert.match(between, /setProperty\(\s*['"]--breath['"],\s*['"]0['"]\s*\)/, 'with less motion the number is 0');
  assert.match(between, /\breturn\b/, 'with less motion, the loop must not start');
});

test('3. the scene is not a control: nothing in the tree, the roots or the sky can be pressed, focused or read as a button', () => {
  const gate = read('ui/src/components/LoginGate.tsx');
  const interactive = /<button|<a\s|<input|<select|<textarea|onClick|onPointer|onTouch|onKey|onMouse|onFocus|tabIndex|role=|aria-pressed|href=/;
  for (const name of ['Sky', 'Roots']) {
    const body = code(functionBody(gate, name));
    const found = interactive.exec(body);
    assert.ok(!found, `${name} has "${found?.[0]}": the tree is to be looked at, not pressed. The gate's only controls are the key and Step through.`);
  }
  assert.ok(/data-gate="glow"/.test(gate) && /data-gate="crown"/.test(gate) && /<Roots\s*\/>/.test(gate), 'the gate has lost a part of the organism (glow, crown or roots)');
});

test('3. the gate has its three controls and no others: the key, Step through, and the two paths at the foot', () => {
  const gate = code(read('ui/src/components/LoginGate.tsx'));
  const count = (re) => (gate.match(re) ?? []).length;
  assert.equal(count(/<input\b/g), 1, 'the gate has one field, the key. Another control needs a decision, and this guard changed in the same pull request.');
  assert.equal(count(/<button\b/g), 1, 'the gate has one button, Step through.');
  assert.equal(count(/<a\s/g), 2, 'the gate has two paths at its foot: the garden and the portal.');
  assert.equal(count(/<select\b|<textarea\b|role="button"|role='button'/g), 0, 'no other control on the gate');
  // and no guidance in words for a breath: it is looked at
  const strings = read('ui/src/lib/strings.ts');
  for (const line of strings.split('\n')) assert.ok(!/^\s*(breath|pacer|inhale|exhale|sit)\w*\s*:/i.test(line), `strings.ts has words to guide a breath (${line.trim()}): the tree is looked at, and nothing explains it`);
});
