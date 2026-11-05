import { useEffect, useRef, useState } from 'react';
import type { RoomState } from './state.ts';
import type { Turn } from './types.ts';

/** Who said something with a number after `after` up to and including `upTo`, each once, in the order they first spoke. */
export function speakersBetween(turns: Record<string, Turn[]>, after: number, upTo: number): string[] {
  const heard = Object.values(turns)
    .flat()
    .filter((turn) => turn.seq > after && turn.seq <= upTo)
    .sort((a, b) => a.seq - b.seq);
  return [...new Set(heard.map((turn) => turn.speakerId))];
}

/**
 * Who has just spoken: a person's id stays in the set for a moment after a message of theirs arrives live, then leaves. For a
 * skin that wants to show that someone spoke (a ping on a radar) without a word about when. What was already there when the page
 * opened, and what is read from history, does not count.
 */
export function useSpoke(state: RoomState, ms = 2500): ReadonlySet<string> {
  const [spoke, setSpoke] = useState<ReadonlySet<string>>(new Set());
  const seen = useRef<number | undefined>(undefined);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const { cursor } = state;
    if (cursor === undefined) return;
    const before = seen.current;
    seen.current = cursor;
    if (before === undefined || cursor <= before) return; // the first look, or a room started anew
    const speakers = speakersBetween(state.turns, before, cursor);
    if (speakers.length === 0) return;
    setSpoke((current) => new Set([...current, ...speakers]));
    for (const id of speakers) {
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          setSpoke((current) => new Set([...current].filter((other) => other !== id)));
        }, ms),
      );
    }
  }, [state.cursor, state.turns, ms]);

  useEffect(() => {
    const open = timers.current;
    return () => open.forEach((timer) => clearTimeout(timer));
  }, []);

  return spoke;
}
