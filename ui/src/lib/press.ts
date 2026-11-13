// 👆 One touch on the tree, as a state machine that cannot stick. A press is a tap when it ends before `HOLD_MS`, and a hold when it lasts longer; a hold that
// has lasted `MAX_HOLD_MS` lets itself go, and a new press while one is still down (an end that never came, as when a phone takes a long touch for a
// menu) ends the old one first. Nothing here reads the page, the clock or a timer: the page says what happened and what time it is.

/** A press longer than this is a hold (the person's own rhythm); a shorter one is a tap. */
export const HOLD_MS = 350;
/** The longest a hold is let last: a thumb that has been down this long is a thumb that was lost, not a breath. */
export const MAX_HOLD_MS = 15_000;

export type PressEvent = 'down' | 'hold' | 'release' | 'tap';

export class Press {
  private since: number | undefined;
  private holdingSince: number | undefined;

  get pressing(): boolean {
    return this.since !== undefined;
  }

  get holding(): boolean {
    return this.holdingSince !== undefined;
  }

  /** A press begins. If one was already down, its end never came: it ends first, as it would have. */
  down(now: number): PressEvent[] {
    const stale = this.up(now);
    this.since = now;
    return [...stale, 'down'];
  }

  /** The press ends, whether the finger lifted, the touch was cancelled, the pointer was lost or the page was left. Nothing, if none was down. */
  up(_now: number): PressEvent[] {
    if (this.since === undefined) return [];
    const was = this.holdingSince !== undefined ? 'release' : 'tap';
    this.since = undefined;
    this.holdingSince = undefined;
    return [was];
  }

  /** Time passes: a press that has lasted long enough becomes a hold, and a hold that has lasted too long lets go. */
  tick(now: number): PressEvent[] {
    if (this.since === undefined) return [];
    if (this.holdingSince === undefined) {
      if (now - this.since < HOLD_MS) return [];
      this.holdingSince = now;
      return ['hold'];
    }
    if (now - this.holdingSince < MAX_HOLD_MS) return [];
    this.since = undefined;
    this.holdingSince = undefined;
    return ['release'];
  }
}
