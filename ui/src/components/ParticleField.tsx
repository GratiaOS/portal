/**
 * 🗿 trace
 * Name from:  Firegate `ParticleField`, the small lights that float up behind the conversation.
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/index.css
 * Same idea:  round, soft things rise slowly behind the page, so that it is alive without asking for attention.
 * Different:  bubbles of oxygen, not coloured dots, and one colour of life for all of them: they do not follow the mood of
 *             the last answer. They sit behind everything, are placed once and never again, and there are none at all
 *             for anyone who asks for less motion, not even still ones.
 * Not copied: written new for Room (MPL-2.0); Firegate is AGPL-3.0.
 */
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { makeBubbles } from '../lib/bubbles.ts';

export default function ParticleField({ count = 28 }: { count?: number }) {
  const bubbles = useMemo(() => makeBubbles(count), [count]);
  return (
    <div aria-hidden data-part="ambient">
      {bubbles.map((b, i) => (
        <span
          key={i}
          data-part="mote"
          style={{ left: `${b.left}%`, width: b.size, height: b.size, '--dur': `${b.duration}s`, '--delay': `${b.delay}s`, '--drift': `${b.drift}px`, '--o': b.opacity } as CSSProperties}
        />
      ))}
    </div>
  );
}
