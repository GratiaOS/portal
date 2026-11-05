/**
 * 🗿 trace
 * Name from:  the pulsing bar of Firegate's `MemoryPool`, shown in place of a companion's message while it thinks.
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx
 * Same idea:  while the companion thinks, something soft breathes where the answer will be, so the page is never silent
 *             and never in a hurry.
 * Different:  it names who is thinking and where, and comes from the room (the `activity` event), so everyone in the
 *             channel sees it, not only the one who asked. An answer takes twenty to forty seconds; this is for that.
 *             Three dots bounce like a ball (and stay still for anyone who asks for less motion): thinking is play.
 * Not copied: written new for Room (MPL-2.0); Firegate is AGPL-3.0.
 */
import type { CSSProperties } from 'react';
import type { Strings } from '../lib/strings.ts';

export default function ThinkingPill({ names, t }: { names: string[]; t: Strings }) {
  if (!names.length) return null;
  return (
    <p role="status" data-part="thinking">
      <span aria-hidden data-part="thinking-dots">
        {[0, 1, 2].map((i) => (
          <span key={i} data-part="dot" style={{ '--i': i } as CSSProperties} />
        ))}
      </span>
      {t.thinking(names)}
    </p>
  );
}
