import { useEffect, useRef } from 'react';
import { advance, noticesFor } from './notify.ts';
import type { Mark } from './notify.ts';
import type { RoomState } from './state.ts';
import type { Strings } from './strings.ts';

const allowed = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';

/**
 * A notification from the browser for what others say while the page is not being looked at, if the person has turned
 * them on. Only what came after the page opened: history is not news. While the page is in front nothing is shown, and
 * what was said meanwhile is not shown later either. While it is away the notice counts everything since it was last
 * looked at, and each new arrival takes the place of the one before.
 */
export function useNotify(state: RoomState, here: boolean, start: number, t: Strings) {
  // what has been looked at and what has been told, kept with the start they were counted from, so a room started anew begins again
  const mark = useRef<{ start: number } & Mark>({ start, seen: start, notified: start });
  if (mark.current.start !== start) mark.current = { start, seen: start, notified: start };

  useEffect(() => {
    const step = advance(mark.current, state.turns, state.you?.id, here);
    mark.current = { start, ...step.mark };
    const news = step.news;
    if (news.length === 0 || !allowed()) return;

    const names = Object.fromEntries(state.participants.map((p) => [p.id, p.alias] as const));
    const channels = Object.fromEntries(state.conversations.map((c) => [c.id, c.title] as const));
    for (const notice of noticesFor(news, names, channels, t.newMessages)) {
      try {
        const shown = new Notification(notice.title, { body: notice.body, tag: notice.tag });
        shown.onclick = () => {
          window.focus();
          shown.close();
        };
      } catch {
        // some browsers only allow notifications through a service worker; the title count is still there
      }
    }
  }, [state.turns, state.you, state.participants, state.conversations, here, start, t]);
}
