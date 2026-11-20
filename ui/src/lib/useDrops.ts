import { useEffect, useMemo, useRef, useState } from 'react';
import type { Connection, createApi } from './client.ts';
import { cameBack, stillThere } from './drops.ts';
import type { DropBox } from './types.ts';

/**
 * What is left on the frequency held, while the box is open: asked when it is opened and each time the room says something came, and
 * let go of when the box is left (the page keeps no copy of it). A packet whose fade is reached goes from the list at once, without asking.
 */
export function useDrops(api: ReturnType<typeof createApi>, held: { freq: string } | null | undefined, pulse: number, open: boolean, gone: string[] = [], connection: Connection = 'live') {
  const [box, setBox] = useState<DropBox | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [again, setAgain] = useState(0);
  // what the server has said is burned, by this page or by another of the holder's: the list lets it go before it asks again, and the box not asked for is not kept
  const [burned, setBurned] = useState<string[]>([]);
  const freq = held?.freq;

  // the stream came back after being lost: what was burned meanwhile is not told again, so the list is asked for again (not a pulse: nothing lights)
  const lastConnection = useRef<Connection | undefined>(undefined);
  useEffect(() => {
    if (cameBack(lastConnection.current, connection)) setAgain((n) => n + 1);
    lastConnection.current = connection;
  }, [connection]);

  useEffect(() => {
    if (!open || freq === undefined) {
      setBox(undefined);
      setFailed(false);
      setBurned([]);
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
  }, [api, freq, pulse, open, again]);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const every = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(every);
  }, [open]);

  const drops = useMemo(() => stillThere(box?.drops ?? [], now).filter((d) => !burned.includes(d.id) && !gone.includes(d.id)), [box, now, burned, gone]);

  /** Burns a packet. It is gone from the list only once the server has said so; a burn that did not go through leaves it where it was, and asking again is safe. */
  const burn = async (id: string): Promise<boolean> => {
    if (freq === undefined) return false;
    try {
      await api.burn(freq, id);
    } catch {
      return false;
    }
    setBurned((ids) => (ids.includes(id) ? ids : [...ids, id]));
    return true;
  };
  return { drops, now, loaded: box !== undefined, failed, retry: () => setAgain((n) => n + 1), burn };
}
