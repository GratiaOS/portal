const KEY = 'portal.token';

/**
 * The token lives as long as the tab does: `sessionStorage`, not `localStorage`, so closing the tab signs out and a
 * shared computer does not keep it. Storage can be blocked; then the token lives in memory only, and a reload asks again.
 */
export function readToken(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function keepToken(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* in memory only */
  }
}

export function forgetToken(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
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
