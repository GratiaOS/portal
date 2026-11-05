const PREFIX = 'portal.draft.';

/**
 * What someone began to write in a channel and has not sent: kept per channel, so that going to another channel neither carries
 * the words along (to be sent where they were not meant) nor loses them, and a reload does not either. `sessionStorage`, like the
 * token: closing the tab lets it go, and a shared computer does not keep it. Storage can be blocked; then a draft lives as long
 * as the box does.
 */
export function readDraft(channel: string): string {
  try {
    return sessionStorage.getItem(PREFIX + channel) ?? '';
  } catch {
    return '';
  }
}

/** An empty text is no draft. */
export function keepDraft(channel: string, text: string): void {
  try {
    if (text) sessionStorage.setItem(PREFIX + channel, text);
    else sessionStorage.removeItem(PREFIX + channel);
  } catch {
    /* in the box only */
  }
}

/** All of them: whoever signs out leaves nothing of what they were writing. */
export function forgetDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    /* nothing kept */
  }
}
