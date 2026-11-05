/**
 * 🗿 trace
 * Name from:  Firegate `PresenceDot`, a small round dot that says someone is there.
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/presence/PresenceDot.tsx
 * Same idea:  presence is a dot, not a sentence; it tells that someone is here and nothing more.
 * Different:  it says "here" or "not here" and nothing about when: no pulse (a pulse asks for attention), no clock time,
 *             and nothing to hover over that would show one. "Not here" is an empty ring, not a grey or a red.
 *             When someone arrives the dot gives one small pop, a hello; when they leave, nothing, no goodbye to watch.
 * Not copied: written new for Room (MPL-2.0); Firegate is AGPL-3.0.
 */
import { useEffect, useRef, useState } from 'react';

export default function PresenceDot({ here, label }: { here: boolean; label: string }) {
  // one small pop when someone arrives while we are looking; not when the page opens, not when someone leaves
  const was = useRef(here);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (here && !was.current) {
      setPopping(true);
      const done = setTimeout(() => setPopping(false), 600);
      was.current = here;
      return () => clearTimeout(done);
    }
    was.current = here;
  }, [here]);

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-part="presence"
      data-here={here ? '' : undefined}
      data-popping={popping ? '' : undefined}
    />
  );
}
