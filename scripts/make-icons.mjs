// The icons of the installed app, drawn here and written as PNG with nothing but Node: an enso, a circle in one stroke that does not
// quite close, light on the dark ground the manifest names. `node scripts/make-icons.mjs` writes ui/public/icons/. They are kept in the
// repository so that a build needs no tool for them; run this only to change them.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'public', 'icons');
mkdirSync(out, { recursive: true });

const GROUND = [0x0d, 0x1b, 0x22];
const STROKE = [0xf1, 0xed, 0xe4];

/** One icon: `size` px square; `radius` of the circle as a share of the size; the stroke thins from `thick` to `thin` (shares of the size) along the way round. */
function draw(size, { radius, thick, thin }) {
  const SAMPLES = 3;
  const start = (-70 * Math.PI) / 180; // where the stroke begins, a little right of the top
  const sweep = (305 * Math.PI) / 180; // and how far it goes round: the rest is the opening
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const dx = x + (sx + 0.5) / SAMPLES - cx;
          const dy = y + (sy + 0.5) / SAMPLES - cy;
          let angle = Math.atan2(dy, dx) - start; // 0 at the start, growing clockwise
          while (angle < 0) angle += 2 * Math.PI;
          if (angle > sweep) continue;
          const along = angle / sweep;
          const half = ((thick + (thin - thick) * along) * size) / 2;
          if (Math.abs(Math.hypot(dx, dy) - radius * size) <= half) covered += 1;
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

// the circle fills about three quarters of the icon; the maskable one keeps everything inside the middle 80% that a phone may cut to
const icons = [
  ['icon-192.png', 192, { radius: 0.31, thick: 0.09, thin: 0.03 }],
  ['icon-512.png', 512, { radius: 0.31, thick: 0.09, thin: 0.03 }],
  ['icon-512-maskable.png', 512, { radius: 0.24, thick: 0.07, thin: 0.025 }],
  ['apple-touch-icon.png', 180, { radius: 0.31, thick: 0.09, thin: 0.03 }],
];
for (const [name, size, shape] of icons) {
  writeFileSync(join(out, name), draw(size, shape));
  console.log(`wrote ${name}`);
}
