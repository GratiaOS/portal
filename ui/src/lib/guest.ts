// The way in for someone with no key: the portal's door for visitors (`POST /api/guest`), and the path that leads straight to it.

export type Entered = {
  /** The visitor's key, shown once. It lives as long as the tab, like any other. */
  token: string;
  participant: { id: string; alias: string; kind: 'guest' };
  room: { id: string; title: string };
  /** When their visit ends, in milliseconds since the epoch. */
  expiresAt: number;
};

/** Why it did not open: the room is full, this address has brought in enough for now, there is no door, or the portal is out of reach. */
export type Refused = 'full' | 'slow' | 'closed' | 'away';
export type Stepped = { ok: true; entered: Entered } | { ok: false; reason: Refused };

/** The path that opens the door by itself: a link that says "Step through" on another site points here, and nothing is asked. */
export const GUEST_PATH = '/guest';

export const isGuestPath = (pathname: string): boolean => pathname.replace(/\/+$/, '') === GUEST_PATH;

/**
 * Whether leaving ends a visit at the portal. Who they are is known from the stream's first word; until it comes, what the page kept of how they
 * came in (`remembered`) decides, so that a visitor who leaves in that first moment does not leave their slot behind.
 */
export const leavingEndsAVisit = (kind: string | undefined, remembered: boolean): boolean => (kind === undefined ? remembered : kind === 'guest');

/** Whether this portal has a door for visitors at all (it says so in its health, and says nothing when it has none). */
export async function opensToGuests(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl('/api/health');
    if (!res.ok) return false;
    return ((await res.json()) as { guests?: unknown }).guests === true;
  } catch {
    return false;
  }
}

/** Steps through: the portal gives a name of the hour, a key and the one room. */
export async function stepThrough(fetchImpl: typeof fetch = fetch): Promise<Stepped> {
  let res: Response;
  try {
    res = await fetchImpl('/api/guest', { method: 'POST' });
  } catch {
    return { ok: false, reason: 'away' };
  }
  if (res.status === 201) {
    try {
      return { ok: true, entered: (await res.json()) as Entered };
    } catch {
      return { ok: false, reason: 'away' };
    }
  }
  if (res.status === 503) return { ok: false, reason: 'full' };
  if (res.status === 429) return { ok: false, reason: 'slow' };
  // no door (401 as for any route without a key, or 404): not a portal for visitors
  if (res.status === 401 || res.status === 404) return { ok: false, reason: 'closed' };
  return { ok: false, reason: 'away' };
}
