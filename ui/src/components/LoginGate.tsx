/**
 * 🗿 trace
 * Name from:  Firegate `MembraneGate`, the threshold before the conversation.
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/features/Firegate/components/MembraneGate.tsx
 * Same idea:  a quiet card in the middle of an empty page: you cross a threshold on purpose, and the page does not rush you.
 * Different:  a token, not a hold of four and a half seconds. A refusal is a calm sentence, never a block or a countdown. Since
 *             the gate of lights, the threshold is the portal's own and the same in every look (gate.css), drawn from the
 *             photograph of the trip of El portal: a fence lit at dusk is the doorway, and the key is given inside it, with no
 *             card around it. Enter in the field sends; there is no button.
 * Not copied: written new for Room (MPL-2.0); Firegate is AGPL-3.0.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, createApi } from '../lib/client.ts';
import { stringsFor } from '../lib/strings.ts';

/** The place the "run your own" link leads to: the GratiaOS organisation, until GratiaOS/portal exists. */
const RUN_YOUR_OWN = 'https://github.com/GratiaOS';

/**
 * The sky of the photograph: dark clouds drawn across the dusk, the edge of the land, and one tree alone on it. Its colours are in
 * gate.css; held to the bottom, so that the tree stands on the horizon at any width.
 */
function Sky() {
  return (
    <svg data-gate="sky" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <path d="M-40 112 Q60 96 170 104 Q250 92 330 108 Q420 100 520 112 Q440 122 330 120 Q240 128 150 122 Q60 130 -40 128 Z" data-gate="cloud" />
      <path d="M260 150 Q330 142 410 150 Q470 146 520 156 Q450 162 380 160 Q320 164 260 158 Z" data-gate="cloud" />
      <path d="M800 64 Q880 44 980 56 Q1060 40 1160 58 Q1210 54 1260 62 L1260 92 Q1180 100 1100 90 Q1010 102 930 92 Q860 98 800 84 Z" data-gate="cloud" />
      <path d="M940 150 Q1010 132 1090 146 Q1160 136 1260 150 L1260 176 Q1180 182 1110 172 Q1040 184 960 170 Z" data-gate="cloud" />
      <path d="M-40 232 Q80 222 200 230 Q300 224 400 234 Q300 242 190 240 Q80 246 -40 242 Z" data-gate="cloud" />
      <path d="M700 250 Q800 240 900 248 Q1000 238 1110 250 Q1190 246 1260 252 L1260 262 Q1170 266 1080 260 Q980 270 880 262 Q790 268 700 260 Z" data-gate="cloud" />
      <path d="M120 300 Q220 294 330 300 Q240 306 120 306 Z" data-gate="cloud" />
      <path d="M980 318 Q1080 310 1190 318 Q1090 324 980 324 Z" data-gate="cloud" />
      {/* an olive tree: a crown uneven at its edge, wider than tall, on a short trunk, and a shrub beside it */}
      <path
        d="M552 392 L554 368 Q530 372 512 364 Q494 366 490 354 Q478 348 488 338 Q480 326 494 320 Q492 306 508 304 Q512 290 528 292 Q534 278 550 282 Q560 270 574 278 Q590 272 598 284 Q614 282 618 296 Q634 298 632 312 Q646 318 638 330 Q650 340 638 350 Q640 362 624 364 Q610 374 590 368 Q578 372 566 368 L568 392 Z"
        data-gate="tree"
      />
      <path d="M452 392 Q448 380 458 376 Q462 366 474 370 Q484 364 490 374 Q500 376 496 388 L496 392 Z" data-gate="tree" />
      <path d="M-40 392 Q400 384 760 388 T1260 380 L1260 400 L-40 400 Z" data-gate="hill" />
    </svg>
  );
}

/**
 * The fence in the field, and its lights: along the top, down the right post, and on the left post a loop that lights the grass.
 * Its shape is the doorway the key is given in; its colours are in gate.css.
 */
function Fence() {
  // the string, once for its halo and once for its bulbs
  const string = [
    'M72 38 Q160 47 250 41 T428 42 L432 120 L436 222',
    'M72 38 L74 104 C46 102 44 146 68 150 C34 154 36 214 66 214 C96 214 94 158 72 152',
  ];
  return (
    <svg data-gate="fence" viewBox="0 0 480 250" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="gate-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" data-gate="glow-in" />
          <stop offset="1" data-gate="glow-out" />
        </radialGradient>
      </defs>
      <ellipse cx="62" cy="196" rx="78" ry="46" fill="url(#gate-glow)" />
      <polygon points="66,34 74,34 79,228 71,228" data-gate="post" />
      <polygon points="426,38 432,38 438,226 432,226" data-gate="post" />
      {[78, 110, 142, 174, 206].map((y) => (
        <line key={y} x1={76} y1={y} x2={432} y2={y + 2} data-gate="wire" />
      ))}
      <g data-gate="string">
        {(['halo', 'bulbs'] as const).map((layer) => (
          <g key={layer} data-gate={layer}>
            {string.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function LoginGate({ onEnter }: { onEnter: (token: string) => void }) {
  const t = stringsFor(navigator.language);
  const [token, setToken] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'unknown' | 'slow' | 'away'>('idle');

  async function enter(event: FormEvent) {
    event.preventDefault();
    const candidate = token.trim();
    if (!candidate || state === 'checking') return;
    // A key is plain visible characters. Anything else (a pasted ellipsis, a line break) cannot even be sent
    // as a header, and would otherwise read as "the portal is away" when the portal was never asked.
    if (!/^[\x21-\x7e]+$/.test(candidate)) {
      setState('unknown');
      return;
    }
    setState('checking');
    try {
      await createApi(candidate).me();
      onEnter(candidate);
    } catch (err) {
      setState(err instanceof ApiError ? (err.status === 401 ? 'unknown' : err.status === 429 ? 'slow' : 'away') : 'away');
    }
  }

  return (
    <main data-gate="page">
      <Sky />
      <form onSubmit={enter} data-gate="doorway" aria-labelledby="gate-title">
        <Fence />
        <div data-gate="opening">
          <h1 id="gate-title" data-gate="title">
            El portal
          </h1>
          <span data-gate="sr-only">{t.signInTitle}</span>
          <label htmlFor="token" data-gate="label">
            {t.gateKey}
          </label>
          <input
            id="token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            enterKeyHint="go"
            placeholder={t.gatePlaceholder}
            aria-describedby="gate-hint"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              if (state !== 'checking') setState('idle');
            }}
            data-gate="input"
          />
          <span id="gate-hint" data-gate="sr-only">
            {t.signInHint} {t.gateEnter}
          </span>
          <p role="status" data-gate="note">
            {state === 'checking' ? t.checking : state === 'unknown' ? t.tokenUnknown : state === 'slow' ? t.tooManyKeys : state === 'away' ? t.roomAway : ''}
          </p>
        </div>
      </form>
      <a href={RUN_YOUR_OWN} target="_blank" rel="noopener noreferrer" data-gate="side">
        {t.runYourOwn} ↗
      </a>
    </main>
  );
}
