import { useEffect, useRef, useState } from 'react';
import type { Person } from './people.ts';

/**
 * Who is here now and was not at the last look. Nobody on the first look: who was already here when the page opened did not arrive.
 * No word about when, and nothing for those who leave: a skin may show that someone has just come in, and has no way to show that
 * someone has just gone.
 */
export function arrivalsOf(before: ReadonlySet<string> | undefined, people: Person[]): string[] {
  if (!before) return [];
  return people.filter((p) => p.here && !before.has(p.participant.id)).map((p) => p.participant.id);
}

/**
 * Who has just arrived: an id stays in the set for a moment after they come in, then leaves. The set is worked out while the page is
 * drawn, not after it, so that a person is never on the page for one frame before they are marked as arriving: a look that makes
 * them appear from nothing would show them whole first, and then again from nothing.
 */
export function useArrived(people: Person[], ms = 2500): ReadonlySet<string> {
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  const [last, setLast] = useState<{ people: Person[]; here: ReadonlySet<string> | undefined }>({ people: [], here: undefined });
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  if (last.people !== people && people.length) {
    const coming = arrivalsOf(last.here, people);
    setLast({ people, here: new Set(people.filter((p) => p.here).map((p) => p.participant.id)) });
    if (coming.length) setArrived((current) => new Set([...current, ...coming]));
  }

  // each id that has been marked is let go of after a moment
  useEffect(() => {
    for (const id of arrived) {
      if (timers.current.has(id)) continue;
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          setArrived((current) => new Set([...current].filter((other) => other !== id)));
        }, ms),
      );
    }
  }, [arrived, ms]);

  useEffect(() => {
    const open = timers.current;
    return () => open.forEach((timer) => clearTimeout(timer));
  }, []);

  return arrived;
}
