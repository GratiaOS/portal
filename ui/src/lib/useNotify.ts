import { useEffect, useRef } from 'react';
import { advance, mayNotify, noticesFor } from './notify.ts';
import type { Mark, Notice } from './notify.ts';
import type { RoomState } from './state.ts';
import type { Strings } from './strings.ts';

const allowed = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';

/**
 * Shows one notice. Through the service worker's registration when there is one, because that is the only way Android Chrome
 * shows a notice at all (its `new Notification()` throws); with no worker (while developing) the page shows it itself. `renotify`
 * so that a notice that takes the place of an older one of the same channel is still heard. Nothing is kept: the worker only
 * answers a click (public/sw.js).
 */
async function show(notice: Notice): Promise<void> {
  const options = { body: notice.body, tag: notice.tag, renotify: true, data: { channel: notice.tag } } as NotificationOptions;
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) {
      await registration.showNotification(notice.title, options);
      return;
    }
    const shown = new Notification(notice.title, options);
    shown.onclick = () => {
      window.focus();
      shown.close();
    };
  } catch {
    // a browser that allows neither: the number in the title is still there
  }
}

/** The count on the icon of the installed app, where the browser has one. Not shown, not asked for: it is only a number. */
function badge(count: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
    void done?.catch(() => undefined);
  } catch {
    // no badge here
  }
}

/**
 * A notice from the browser when someone names the person while the page is not being looked at, if the person has turned
 * them on, and the same count on the app's icon. Only a mention: everything else is the number in the title. Only what came after
 * the page opened: history is not news. While the page is in front nothing is shown, and what was said meanwhile is not shown
 * later either. While it is away the notice counts every mention since it was last looked at, and each new arrival takes the
 * place of the one before. It says where, never what.
 */
export function useNotify(state: RoomState, here: boolean, start: number, t: Strings, enabled = true, app = '') {
  // what has been looked at and what has been told, kept with the start they were counted from, so a room started anew begins again
  const mark = useRef<{ start: number } & Mark>({ start, seen: start, notified: start });
  if (mark.current.start !== start) mark.current = { start, seen: start, notified: start };

  useEffect(() => {
    const step = advance(mark.current, state.turns, state.you?.id, here);
    mark.current = { start, ...step.mark };
    if (enabled) badge(step.waiting);
    const news = step.news;
    if (!mayNotify(enabled, news.length, allowed())) return;

    const channels = Object.fromEntries(state.conversations.map((c) => [c.id, c.title] as const));
    for (const notice of noticesFor(news, channels, app, { one: t.mentionedIn, many: t.mentionsIn })) void show(notice);
  }, [state.turns, state.you, state.conversations, here, start, t, enabled, app]);
}
