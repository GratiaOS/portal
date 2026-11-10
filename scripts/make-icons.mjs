// The icons of the installed app, drawn here and written as PNG with nothing but Node: one brush stroke that goes round a circle and
// then curls inward on itself, light on the dark ground the manifest names. The hand of it (a stroke that thins as it goes, an edge that is
// not quite even, a dry brush at its end) is in the manner of the Gratia mark, which is not used here: its name and its logo are the
// family's own (TRADEMARK.md), and a portal that is run by someone else has its own icon to draw. `node scripts/make-icons.mjs` writes
// ui/public/icons/. They are kept in the repository so that a build needs no tool for them; run this only to change them.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'public', 'icons');
mkdirSync(out, { recursive: true });

const GROUND = [0x0d, 0x1b, 0x22];
const STROKE = [0xf1, 0xed, 0xe4];
const TAU = 2 * Math.PI;

/** A number from two whole numbers, always the same, between 0 and 1: the grain of the brush. */
function grain(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth noise along a line: the edge of the stroke is not even. */
function wobble(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const t = f * f * (3 - 2 * f);
  return grain(i, seed) * (1 - t) + grain(i + 1, seed) * t;
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * One icon: `size` px square. The stroke starts at the top right and goes clockwise: first round, then, still turning, inward, so that it
 * ends in a curl. `radius` is that of the circle as a share of the size; the stroke thins from `thick` to `thin` (shares of the size).
 */
function draw(size, { radius, thick, thin }) {
  const SAMPLES = 3;
  const start = (-72 * Math.PI) / 180;
  const total = TAU * 1.85; // how far the stroke goes in all, in turns
  const round = TAU * 0.4; // where the circle ends and the curl begins
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2 + size * 0.012;
  const radiusAt = (t) => (t <= round ? 1 : 1 - 0.72 * smooth((t - round) / (total - round)) ** 0.7) * radius * size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const dx = x + (sx + 0.5) / SAMPLES - cx;
          const dy = y + (sy + 0.5) / SAMPLES - cy;
          const dist = Math.hypot(dx, dy);
          let angle = Math.atan2(dy, dx) - start;
          while (angle < 0) angle += TAU;
          // the stroke goes round more than once: the turns this point could be on
          for (let turn = 0; turn < 2; turn += 1) {
            const t = angle + turn * TAU;
            if (t > total) break;
            const along = t / total;
            const edge = (wobble(t * 9, 3) - 0.5) * 0.34; // the edge breathes by a third of the width
            // the brush lands: the stroke begins narrower and a little rounded, and comes to its full width in the first of its length
            const landing = 0.45 + 0.55 * smooth(along / 0.07);
            const half = (((thick + (thin - thick) * smooth(along)) * size) / 2) * (1 + edge) * landing;
            const across = (dist - radiusAt(t)) / half; // -1 to 1 over the width
            if (Math.abs(across) > 1) continue;
            // the dry brush: towards the end and at the edge, the bristles leave gaps
            const dry = smooth((along - 0.35) / 0.65) * 0.55 + 0.12;
            const bristle = wobble(across * 5 + t * 1.3, 11);
            if (Math.abs(across) > 0.4 && grain(x * 3 + sx, y * 3 + sy) < dry * Math.abs(across) * 1.1) continue;
            if (bristle < dry * 0.32 * smooth((along - 0.5) / 0.5)) continue;
            covered += 1;
            break;
          }
        }
      }
      const a = covered / (SAMPLES * SAMPLES);
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c += 1) px[i + c] = Math.round(GROUND[c] + (STROKE[c] - GROUND[c]) * a);
      px[i + 3] = 255;
    }
  }
  return png(size, px);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function png(size, rgba) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// the stroke fills about three quarters of the icon; the maskable one keeps everything inside the middle 80% that a phone may cut to
const icons = [
  ['icon-192.png', 192, { radius: 0.33, thick: 0.068, thin: 0.02 }],
  ['icon-512.png', 512, { radius: 0.33, thick: 0.068, thin: 0.02 }],
  ['icon-512-maskable.png', 512, { radius: 0.26, thick: 0.055, thin: 0.017 }],
  ['apple-touch-icon.png', 180, { radius: 0.33, thick: 0.068, thin: 0.02 }],
];
for (const [name, size, shape] of icons) {
  writeFileSync(join(out, name), draw(size, shape));
  console.log(`wrote ${name}`);
}
