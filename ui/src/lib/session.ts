const KEY = 'portal.token';

/**
 * Whether the page runs as an installed app (a window of its own, from the home screen) and not in a tab of a browser. A phone that has
 * been given the portal as an app is one that a person has chosen to keep it on.
 */
export function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/**
 * The token lives as long as the tab does: `sessionStorage`, not `localStorage`, so closing the tab signs out and a
 * shared computer does not keep it. Storage can be blocked; then the token lives in memory only, and a reload asks again.
 * One exception, and only for a person of the team in the installed app: it is kept on the device (`localStorage`) until they sign
 * out, since an app that is closed has no tab to outlive. A visitor's key is never kept past the tab, installed or not.
 */
export function readToken(): string | undefined {
  try {
    const own = sessionStorage.getItem(KEY);
    if (own) return own;
  } catch {
    /* no tab storage */
  }
  try {
    return (isStandalone() ? localStorage.getItem(KEY) : null) ?? undefined;
  } catch {
    return undefined;
  }
}

/** `remember` is for a person of the team, and takes effect only in the installed app. */
export function keepToken(token: string, remember = false): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* in memory only */
  }
  if (!remember || !isStandalone()) return;
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* kept for this visit only */
  }
}

export function forgetToken(): void {
  for (const storage of ['sessionStorage', 'localStorage'] as const) {
    try {
      window[storage].removeItem(KEY);
    } catch {
      /* nothing kept */
    }
  }
}

const GUEST_KEY = 'portal.guest';

/** Whether this tab's key is a visitor's, so that when it stops opening, the gate says the visit has ended and not that a key is wrong. */
export function readGuest(): boolean {
  try {
    return sessionStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}

const UNTIL_KEY = 'portal.guest.until';

/** When the visit ends (ms since the epoch), kept for the tab so that a reload still knows; `undefined` when it was not kept. */
export function readGuestUntil(): number | undefined {
  try {
    const value = Number(sessionStorage.getItem(UNTIL_KEY));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function keepGuest(until?: number): void {
  try {
    sessionStorage.setItem(GUEST_KEY, '1');
    if (until !== undefined) sessionStorage.setItem(UNTIL_KEY, String(until));
  } catch {
    /* in memory only */
  }
}

export function forgetGuest(): void {
  try {
    sessionStorage.removeItem(GUEST_KEY);
    sessionStorage.removeItem(UNTIL_KEY);
  } catch {
    /* nothing kept */
  }
}
