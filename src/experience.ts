/**
 * The topology of an experience: a ground that is always there, and a flow that is lent for a while.
 *
 * The ground (the elephant) is the substrate: it is present from the start, asks nothing, scores nothing, and has no start or stop.
 * A flow is a bounded piece of work on top of it, with a defined activity, a challenge matched to the skill, a loop that answers, and
 * an end. Flow is a tool with a duration, not a condition for feeling whole: closing it moves nothing on the ground.
 *
 * Pure types and one function; nothing is stored, counted or sent. The portal does not measure how long anyone is in a flow.
 */

/** The substrate. It has no `start()` and no `stop()`: it is not entered, so it cannot be left. */
export interface Ground {
  readonly kind: 'ELEPHANT';
  readonly activity: 'optional';
  readonly challengeSkill: null;
  readonly feedbackLoop: null;
  readonly duration: 'unbounded';
}

/** A bounded process on top of the ground. */
export interface Flow {
  readonly kind: 'FLOW';
  readonly activity: 'defined';
  readonly challengeSkill: 'matched';
  readonly feedbackLoop: 'active';
  readonly duration: 'bounded';
  /** What this flow is for, in the words it was entered with. */
  readonly context: string;
  /** Whether `close()` has been called. */
  readonly closed: boolean;
  /** Releases the flow's context and leaves the ground as it was. Closing twice is the same as closing once. */
  close(): void;
}

/** A ground is there from the start; a flow is made on the spot and closed cleanly at the end. */
export interface ExperienceTopology {
  readonly ground: Ground;
  flow?: Flow;
}

/** The one ground: the same for everyone, frozen, with nothing to mutate. */
export const GROUND: Ground = Object.freeze({
  kind: 'ELEPHANT',
  activity: 'optional',
  challengeSkill: null,
  feedbackLoop: null,
  duration: 'unbounded',
});

/**
 * Enters a flow over a ground. `onClose` is the flow's one way to let go of what it held (a release, a raw note to wherever the caller
 * settles things); it runs once, on the first `close()`, and is handed nothing of the ground, because the ground is not changed by it.
 */
export function enterFlow(ground: Ground, context: { activity: string }, onClose?: () => void): Flow {
  // The ground is only the place the flow stands on; it is read, never written.
  void ground;
  let closed = false;
  return {
    kind: 'FLOW',
    activity: 'defined',
    challengeSkill: 'matched',
    feedbackLoop: 'active',
    duration: 'bounded',
    context: context.activity,
    get closed() {
      return closed;
    },
    close() {
      if (closed) return;
      closed = true;
      onClose?.();
    },
  };
}
