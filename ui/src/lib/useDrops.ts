import { useEffect, useMemo, useState } from 'react';
import type { createApi } from './client.ts';
import { stillThere } from './drops.ts';
import type { DropBox } from './types.ts';

/**
 * What is left on the frequency held, while the box is open: asked when it is opened and each time the room says something came, and
 * let go of when the box is left (the page keeps no copy of it). A packet whose fade is reached goes from the list at once, without asking.
 */
export function useDrops(api: ReturnType<typeof createApi>, held: { freq: string } | null | undefined, pulse: number, open: boolean) {
  const [box, setBox] = useState<DropBox | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const freq = held?.freq;

  useEffect(() => {
    if (!open || freq === undefined) {
      setBox(undefined);
      setFailed(false);
      return;
    }
    let cancelled = false;
    api
      .drops(freq)
      .then((found) => {
        if (cancelled) return;
        setBox(found);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [api, freq, pulse, open]);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const every = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(every);
  }, [open]);

  const drops = useMemo(() => stillThere(box?.drops ?? [], now), [box, now]);
  return { drops, now, loaded: box !== undefined, failed };
}
