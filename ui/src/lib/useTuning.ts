import { useEffect, useState } from 'react';
import { TUNING_MS, tuned } from './drops.ts';

/**
 * The words of a packet as they settle after the seal is broken (about a second, from noise to the words), and whether they have. Someone who
 * asks for less motion is given the words at once. Nothing is kept: leaving the packet shut starts it over.
 */
export function useTuning(text: string, running: boolean): { shown: string; done: boolean } {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!running) {
      setProgress(0);
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const step = (at: number) => {
      const done = Math.min(1, (at - began) / TUNING_MS);
      setProgress(done);
      if (done < 1) frame = requestAnimationFrame(step);
    };
    setProgress(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [running, text]);
  return { shown: progress >= 1 ? text : tuned(text, progress), done: progress >= 1 };
}
