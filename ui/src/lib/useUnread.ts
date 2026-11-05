import { useEffect, useState } from 'react';
import type { RoomState } from './state.ts';
import { readUpTo, rewound, titleWith, unreadIn } from './unread.ts';
import type { Seen } from './unread.ts';

const looking = () => document.visibilityState === 'visible' && document.hasFocus();

/**
 * What others said while the page was not being looked at, shown as a count in front of the tab's title, so that someone
 * who has gone to another tab sees that there is news. A channel counts as read while the page is visible and in focus
 * and that channel is the one on screen.
 */
export function useUnread(state: RoomState, channelId: string | undefined, name: string) {
  const [seen, setSeen] = useState<Seen>({});
  const [here, setHere] = useState(looking);
  // where the room stood when the page opened
  const [since, setSince] = useState<number | undefined>(undefined);
  if (since === undefined && state.cursor !== undefined) setSince(state.cursor);

  // a room started anew counts from its own beginning: the marks we hold are numbers of another life
  const [cursor, setCursor] = useState(state.cursor);
  if (state.cursor !== cursor) {
    setCursor(state.cursor);
    if (rewound(cursor, state.cursor)) {
      setSeen({});
      setSince(state.cursor);
    }
  }

  useEffect(() => {
    const update = () => setHere(looking());
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, []);

  const start = since ?? 0;
  const last = channelId ? state.turns[channelId]?.at(-1)?.seq : undefined;
  useEffect(() => {
    if (here && channelId) setSeen((current) => readUpTo(current, channelId, last, start));
  }, [here, channelId, last, start]);

  const count = unreadIn(state.turns, seen, start, state.you?.id);
  useEffect(() => {
    document.title = titleWith(count, name);
    return () => {
      document.title = name;
    };
  }, [count, name]);

  return { count, here, start };
}
