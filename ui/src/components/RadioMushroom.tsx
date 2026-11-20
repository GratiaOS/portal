/**
 * 🗿 trace
 * Name from:  the radio at /fm of Amigo FM, and its `Mushroom`: the switch that turns the radio on and off.
 * Path:       apps/amigo-web/app/fm/Radio.tsx ＠ c3889d87 (`Mushroom`), apps/amigo-web/app/fm/page.tsx ＠ c3889d87 and apps/amigo-web/app/lib/fm.ts ＠ c3889d87 (the tape on the clock), in the private monorepo GratiaOS/gratiaos
 * Same idea:  one mushroom is the only control; its cap turns when the radio is on and the moon on it does not. The tape is one, public, and plays
 *             on the clock (the second is `Date.now()` modulo its length, so two visitors hear the same second), natively and looping, put back on
 *             the clock when it comes round, with a new address on every load, Media Session for the lock screen, and a silent band said calmly.
 * Different:  a button in the guest room's head (the top bar on a phone), not a radio drawn on a log; no breath, no loudness, no tuner, no garden
 *             table. The drawing is flat shapes the skins colour (`data-part`), not gradients named in the page. Nothing is sent to anyone: the
 *             portal never says who listens, and the sound starts only from the press.
 * Not copied: written new for Room (MPL-2.0); the shapes and the numbers are those of the same family's drawing, kept by hand.
 */
import type { RadioState } from '../lib/useRadio.ts';
import type { Strings } from '../lib/strings.ts';

// where the dots sit on the cap, and how big (the same eight as the radio's)
const DOTS: Array<[number, number, number]> = [
  [-14, -18, 7], [13, -9, 5], [-3, 9, 8.5], [21, 15, 4.5], [-25, 7, 4], [5, -29, 3.5], [-11, 27, 4], [28, -6, 3],
];

// the tuner's ticks, in degrees from the middle, and the needle's pivot is the middle of the window's foot
const TICKS = [-60, -40, -20, 0, 20, 40, 60];
const WINDOW = 'M-32 2 V-27 A32 32 0 0 1 32 -27 V2 Z';

/**
 * The mushroom that switches Amigo FM on and off, and beside it the tuner of the same radio: the window with its needle, dark while off, lit
 * while the tape plays. The tuner only shows; the mushroom is the one control. The band being silent is told by the needle and, in words, to
 * screen readers only.
 */
export default function RadioMushroom({ state, onToggle, t }: { state: RadioState; onToggle: () => void; t: Strings }) {
  return (
    <span data-part="radio-wrap" data-state={state}>
      <svg data-part="radio-tuner" viewBox="0 0 68 68" aria-hidden focusable="false">
        <g transform="translate(34 64)">
        <clipPath id="radio-window">
          <path d={WINDOW} />
        </clipPath>
        <path data-part="radio-glass" d={WINDOW} />
        <path data-part="radio-lit" d={WINDOW} />
        <g clipPath="url(#radio-window)">
          {TICKS.map((a) => (
            <path key={a} data-part="radio-tick" d="M0 -44 V-38" transform={`rotate(${a})`} />
          ))}
          <g data-part="radio-needle">
            <path d="M0 0 V-40" />
            <circle r="3.5" />
          </g>
        </g>
        </g>
      </svg>
      <button type="button" role="switch" aria-checked={state === 'on' || state === 'tuning'} aria-label={t.radioName} data-part="radio" data-state={state} onClick={onToggle}>
        <svg viewBox="-50 -50 100 100" aria-hidden focusable="false">
          <g data-part="radio-spin">
            <circle data-part="radio-cap" r="41" />
            {DOTS.map(([x, y, r]) => (
              <circle key={`${x}-${y}`} data-part="radio-dot" cx={x} cy={y} r={r} />
            ))}
          </g>
          <path data-part="radio-moon" d="M-37 -17 A41 41 0 0 1 17 -37" fill="none" />
        </svg>
      </button>
      <span role="status" data-part="sr-only">
        {state === 'silent' ? t.radioSilent : ''}
      </span>
    </span>
  );
}
