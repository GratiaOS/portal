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
import { stepThroughMeans } from '../lib/guest.ts';
import type { Refused } from '../lib/guest.ts';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, createApi } from '../lib/client.ts';
import { useLang } from '../lib/lang.ts';
import { stringsFor } from '../lib/strings.ts';

/** The place the "run your own" link leads to: the repository of the portal, public since 0.1.0. */
const RUN_YOUR_OWN = 'https://github.com/GratiaOS/portal';
const ALONE_IN_THE_GARDEN = 'https://gratiaos.dev/garden';


/**
 * Each cloud is a few ellipses laid along a line, wider in the middle and lighter at the ends, and then softened: so it thins out
 * the way a cloud does, instead of ending at a point or at an edge. [centre x, centre y, half width, half height, opacity].
 */
const CLOUDS: { id: string; depth: 'far' | 'near'; puffs: [number, number, number, number, number][] }[] = [
  { id: 'a', depth: 'far', puffs: [[40, 117, 110, 7, 0.42], [150, 112, 90, 8, 0.66], [262, 115, 85, 6.5, 0.74], [375, 111, 75, 5.5, 0.6], [470, 114, 60, 4, 0.36]] },
  { id: 'b', depth: 'far', puffs: [[300, 153, 55, 4.5, 0.45], [372, 150, 70, 6, 0.7], [446, 153, 55, 4.5, 0.46]] },
  { id: 'c', depth: 'near', puffs: [[845, 68, 70, 8, 0.42], [925, 59, 95, 12, 0.7], [1025, 56, 110, 13, 0.78], [1120, 62, 90, 10, 0.68], [1205, 65, 70, 7, 0.42]] },
  { id: 'd', depth: 'near', puffs: [[975, 153, 60, 7, 0.46], [1060, 147, 90, 10, 0.74], [1150, 150, 100, 8, 0.68], [1235, 155, 60, 5.5, 0.4]] },
  { id: 'e', depth: 'far', puffs: [[30, 237, 90, 6, 0.44], [150, 231, 110, 7, 0.66], [285, 234, 100, 6, 0.68], [385, 237, 55, 4, 0.4]] },
  { id: 'f', depth: 'far', puffs: [[735, 253, 60, 5, 0.42], [850, 248, 100, 6, 0.66], [985, 247, 120, 7, 0.72], [1105, 251, 100, 6, 0.66], [1215, 255, 70, 4.5, 0.42]] },
  { id: 'g', depth: 'far', puffs: [[155, 303, 45, 3.2, 0.42], [235, 299, 70, 4, 0.62], [320, 302, 50, 3, 0.42]] },
  { id: 'h', depth: 'far', puffs: [[1015, 321, 55, 3.2, 0.42], [1100, 317, 70, 4, 0.62], [1175, 320, 50, 3, 0.4]] },
];

/**
 * The sky of the photograph: dark clouds drawn across the dusk, the edge of the land, and one tree alone on it. Its colours are in
 * gate.css; held to the bottom, so that the tree stands on the horizon at any width.
 */
function Sky() {
  return (
    <svg data-gate="sky" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        {/* two softnesses: the clouds low and small are far, and a little sharper; the big ones are near, and softer */}
        <filter id="gate-soft-far" x="-10%" y="-60%" width="120%" height="220%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id="gate-soft-near" x="-10%" y="-80%" width="120%" height="260%">
          <feGaussianBlur stdDeviation="3.6" />
        </filter>
      </defs>
      {CLOUDS.map((cloud) => (
        <g key={cloud.id} filter={`url(#gate-soft-${cloud.depth})`}>
          {cloud.puffs.map(([cx, cy, rx, ry, o]) => (
            <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={rx} ry={ry} opacity={o} data-gate="cloud" />
          ))}
        </g>
      ))}
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
 * The fence in the field, and its lights: along the top and down the right post, and on the left post a loop that lights the grass.
 * Its shape is the doorway the key is given in; its colours are in gate.css. The fence is as tall as what is given in it (the key,
 * and the door for visitors when there is one): it is drawn to be stretched, with strokes that keep their width, and the lantern is
 * drawn apart, so that it keeps its proportions however tall the doorway is.
 */
function Fence() {
  // the string along the top and the right post, and the stub of the left one that carries the lantern
  const string = ['M72 38 Q160 47 250 41 T428 42 L432 120 L436 222', 'M72 38 L74 104'];
  return (
    <svg data-gate="fence" viewBox="0 0 480 250" preserveAspectRatio="none" aria-hidden="true" focusable="false">
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

/** The lantern on the left post: a loop of the string that lights the grass, hung where the stub ends and never stretched. */
function Lantern() {
  const loop = 'M74 104 C46 102 44 146 68 150 C34 154 36 214 66 214 C96 214 94 158 72 152';
  return (
    <svg data-gate="lantern" viewBox="20 104 90 146" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="gate-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" data-gate="glow-in" />
          <stop offset="1" data-gate="glow-out" />
        </radialGradient>
      </defs>
      <ellipse cx="62" cy="196" rx="78" ry="46" fill="url(#gate-glow)" />
      <g data-gate="string">
        {(['halo', 'bulbs'] as const).map((layer) => (
          <g key={layer} data-gate={layer} data-lantern="">
            <path d={loop} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** The door for visitors, when the portal has one: what it is doing, and how to ask it to open. `only` hides the key, for the link that steps through by itself. */
export type GuestDoor = { state: 'idle' | 'stepping' | Refused; onStep: () => void; only: boolean };

export default function LoginGate({ onEnter, door, ended }: { onEnter: (token: string) => void; door?: GuestDoor; ended?: boolean }) {
  const t = stringsFor(navigator.language);
  useLang(navigator.language);
  const [token, setToken] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'unknown' | 'slow' | 'away'>('idle');

  /** Goes in with the key in the field: as themselves, to their place. Enter does this, and *Step through* when there is a key. */
  async function enterWithKey() {
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

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void enterWithKey();
  }

  return (
    <main data-gate="page">
      <Sky />
      <form onSubmit={onSubmit} data-gate="doorway" aria-labelledby="gate-title">
        <Fence />
        <Lantern />
        <div data-gate="opening">
          <h1 id="gate-title" data-gate="title">
            El portal
          </h1>
          <span data-gate="sr-only">{t.signInTitle}</span>
          {!door?.only && (
            <label htmlFor="token" data-gate="sr-only">
              {t.gateKey}
            </label>
          )}
          {!door?.only && (
          <input
            id="token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            enterKeyHint="go"
            placeholder={`🗝️\u2002${t.gatePlaceholder}`}
            aria-describedby="gate-hint"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              if (state !== 'checking') setState('idle');
            }}
            data-gate="input"
          />
          )}
          <span id="gate-hint" data-gate="sr-only">
            {t.signInHint} {t.gateEnter}
          </span>
          <p role="status" data-gate="note">
            {door && door.state !== 'idle'
              ? door.state === 'stepping'
                ? t.stepping
                : door.state === 'full'
                  ? t.guestFull
                  : door.state === 'slow'
                    ? t.guestSlow
                    : door.state === 'closed'
                      ? t.guestClosed
                      : t.guestAway
              : state === 'checking'
                ? t.checking
                : state === 'unknown'
                  ? t.tokenUnknown
                  : state === 'slow'
                    ? t.tooManyKeys
                    : state === 'away'
                      ? t.roomAway
                      : ended
                        ? t.visitEnded
                        : ''}
          </p>
          {door && door.state !== 'closed' && (
            <button
              type="button"
              onClick={() => (stepThroughMeans(token) === 'key' ? void enterWithKey() : door.onStep())}
              disabled={door.state === 'stepping' || state === 'checking'}
              data-gate="step"
              autoFocus={door.only}
            >
              {t.stepThrough}
            </button>
          )}
        </div>
      </form>
      <div data-gate="sides">
        <a href={ALONE_IN_THE_GARDEN} data-gate="side">
          {t.aloneInTheGarden} →
        </a>
        <a href={RUN_YOUR_OWN} target="_blank" rel="noopener noreferrer" data-gate="side">
          {t.runYourOwn} ↗
        </a>
      </div>
    </main>
  );
}
