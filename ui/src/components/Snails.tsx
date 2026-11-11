import type { CSSProperties } from 'react';
import type { Snail } from '../lib/snails.ts';
import type { Strings } from '../lib/strings.ts';

/** The colours and marks come round again if a portal's visit holds more than four trails. */
const KINDS = 4;

/** A circle as a piece of a path, so that the shell can have holes (`evenodd`): the marks are cut out of it, and show what is behind. */
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

/**
 * The snail that is walking in a visitor's time, on a path from a point of departure to a point of arrival. The skin decides what the path
 * is and where it lies; the page says only which snail it is (`data-snail`, 1 to 4: a colour, and as many holes in its shell), how many there
 * are in the visit (`data-of`) and how far along it is (`--progress`, 0 to 1). It is told in words too, so that the colour is not the only way.
 */
export default function Snails({ snail, t }: { snail: Snail; t: Strings }) {
  const kind = (snail.index % KINDS) + 1;
  const name = t.snailNames[snail.index % KINDS]!;
  const shell = circle(11, 8, 7) + Array.from({ length: kind }, (_, i) => circle(11 + (i - (kind - 1) / 2) * 2.8, 8, 1.15)).join('');
  return (
    <div data-part="snails" role="img" aria-label={t.snailOn(name, snail.index + 1, snail.of)}>
      <span data-part="snail" data-snail={kind} data-of={snail.of} style={{ '--progress': snail.progress } as CSSProperties}>
        <svg viewBox="0 0 28 18" aria-hidden focusable="false">
          <path d="M2 16c0-3 2-4 5-4h14c3 0 5 1 5 4z" fill="currentColor" />
          <path d="M22 12c0-3 1-5 3-6M24 12c0-3 2-4 3-5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path data-part="snail-shell" d={shell} fillRule="evenodd" />
        </svg>
      </span>
    </div>
  );
}
