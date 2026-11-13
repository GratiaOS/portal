// 🌬️ Puts the breath on the page: one number, `--breath`, set on the element it is given and nothing else, once a frame, from the clock (lib/breath.ts).
// A page that is hidden is not asked (the browser stops the frames), and one that comes back is in step at once, because it never counted: it only reads
// the time. Where less motion is asked for, the number is 0 and stays: the tree stands still.
import { useEffect } from 'react';
import type { RefObject } from 'react';
import { breathAt } from './breath.ts';

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useBreath(page: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    if (reducedMotion()) {
      el.style.setProperty('--breath', '0');
      return;
    }
    let frame = 0;
    const loop = () => {
      el.style.setProperty('--breath', breathAt(Date.now()).toFixed(4));
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [page]);
}
