/**
 * 🗿 trace
 * Name from:  Firegate `FieldCompanion`, the calm panel beside the stream where a short line turns by itself.
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/FieldCompanion.tsx
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx
 * Same idea:  a few quiet lines that turn slowly, one set while someone is here and another once a minute has passed with
 *             nothing done, so that the page has something to say that asks for nothing.
 * Different:  a column of its own at the right of the channel on a wide page (from 64 rem: none on a phone or a tablet), not a panel inside the stream; the
 *             lines come with the language of the page, and a skin decides how the column looks and where it sits. They are not
 *             announced to a screen reader as they turn, they stop turning while the pointer is over them, and for anyone who asks for
 *             less motion the first stays. Whether the person is idle is only asked of the page itself, and kept nowhere.
 * Not copied: written new for Room (MPL-2.0); Firegate is AGPL-3.0.
 */
import { useEffect, useState } from 'react';
import { useIdle } from '../lib/useIdle.ts';
import { nextWhisper } from '../lib/whispers.ts';
import type { Strings } from '../lib/strings.ts';

const TURN_MS = 8000;

export default function FieldWhispers({ t }: { t: Strings }) {
  const idle = useIdle();
  const lines = idle ? t.fieldIdle : t.fieldActive;
  const [index, setIndex] = useState(0);
  const [reading, setReading] = useState(false); // the pointer is over the line: leave it where it is

  // another set starts from its first line
  useEffect(() => setIndex(0), [idle]);

  useEffect(() => {
    if (lines.length < 2 || reading || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const turn = setInterval(() => setIndex((current) => nextWhisper(current, lines.length)), TURN_MS);
    return () => clearInterval(turn);
  }, [lines.length, reading, idle]);

  return (
    <aside aria-label={t.fieldLabel} aria-live="off" data-part="field" data-idle={idle ? '' : undefined} onMouseEnter={() => setReading(true)} onMouseLeave={() => setReading(false)}>
      <p key={`${idle}-${index}`} data-part="field-line" data-first={index === 0 ? '' : undefined}>
        {lines[index % Math.max(lines.length, 1)]}
      </p>
    </aside>
  );
}
