import { useEffect, useState } from 'react';
import { IDLE_MS, isIdle } from './idle.ts';

/** True once the person has not moved the pointer, pressed a key, touched the screen or scrolled for `after` ms; false again at the first of them. Local to the page. */
export function useIdle(after = IDLE_MS): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let last = Date.now();
    const touched = () => {
      last = Date.now();
      setIdle(false);
    };
    const events = ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'scroll'] as const;
    for (const name of events) window.addEventListener(name, touched, { passive: true });
    const check = setInterval(() => setIdle(isIdle(last, Date.now(), after)), 5000);
    return () => {
      for (const name of events) window.removeEventListener(name, touched);
      clearInterval(check);
    };
  }, [after]);
  return idle;
}
