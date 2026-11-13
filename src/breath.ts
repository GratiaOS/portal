// 🌬️ The breath of the gate: a hub with no identity (docs/rfc-001-presence-physics.md §17). It keeps no one's name, writes nothing down,
// and answers nothing: a signal goes in, and goes out to the others, and that is all. Whoever listens hears the others breathe; whoever
// sits (sends a first breath) is heard, up to four at once. It has no clock of its own and no timer: the one who runs it says when to
// look for a silence (`sweep`), so that it can be tested with a clock in the hand and run in a Node process or in a Durable Object.
//
// What it will not do, on purpose: no count (nothing here says how many are listening or sitting, not even to its caller), no
// "joined" or "left", no history, no timestamp on a signal, no answer to the one who sends. The id of a listener lives as long as
// its stream and goes nowhere but into the signals of that listener's breath, so that each person is one oscillator on the page.

export type Phase = 'inhale' | 'exhale' | 'hold';

/** What a listener is told. A breath carries the id of its source (to be one oscillator among others); a knock carries nothing. */
export type BreathFrame = { type: 'breath'; id: string; rate: number; phase: Phase } | { type: 'knock' };

export type BreathSink = (frame: BreathFrame) => void;

export type BreathOptions = {
  /** How many may sit (be heard) at once. Defaults to 4. */
  seats?: number;
  /** A seat is let go after this long with no signal. Defaults to 10 000 ms. */
  silenceMs?: number;
  /** The least time between two knocks of one person. Defaults to 30 000 ms. */
  knockEveryMs?: number;
  /** For tests. Defaults to `Date.now`. */
  now?: () => number;
};

export const BREATH_RATE = { min: 1, max: 30 } as const;
const PHASES: readonly string[] = ['inhale', 'exhale', 'hold'];

type Listener = { sink: BreathSink; seated: boolean; lastSignalAt: number; lastKnockAt: number | undefined };

export class BreathHub {
  private readonly listeners = new Map<string, Listener>();
  private readonly seats: number;
  private readonly silenceMs: number;
  private readonly knockEveryMs: number;
  private readonly now: () => number;

  constructor(options: BreathOptions = {}) {
    this.seats = options.seats ?? 4;
    this.silenceMs = options.silenceMs ?? 10_000;
    this.knockEveryMs = options.knockEveryMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  /**
   * Opens a stream: from now, the sink hears the others. Returns an id that lives as long as the stream, and the way to end it
   * (calling that twice is fine). Listening takes no seat and tells no one.
   */
  listen(sink: BreathSink): { id: string; leave: () => void } {
    const id = crypto.randomUUID();
    this.listeners.set(id, { sink, seated: false, lastSignalAt: this.now(), lastKnockAt: undefined });
    return { id, leave: () => void this.listeners.delete(id) };
  }

  /**
   * A signal from a listener: `{ type: 'breath', rate, phase }` or `{ type: 'knock' }`. Fire and forget: nothing is returned, so
   * nothing can tell the sender whether it was heard. What is not a signal, or comes from no one here, or finds no free seat, or comes
   * too soon after a knock, is let drop without a word.
   */
  signal(id: string, message: unknown): void {
    const from = this.listeners.get(id);
    if (!from || typeof message !== 'object' || message === null) return;
    const { type, rate, phase } = message as Record<string, unknown>;
    const t = this.now();

    if (type === 'breath') {
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < BREATH_RATE.min || rate > BREATH_RATE.max) return;
      if (typeof phase !== 'string' || !PHASES.includes(phase)) return;
      if (!this.sit(from)) return;
      from.lastSignalAt = t;
      this.tell(id, { type: 'breath', id, rate: Math.round(rate * 10) / 10, phase: phase as Phase });
    } else if (type === 'knock') {
      if (!from.seated) return;
      if (from.lastKnockAt !== undefined && t - from.lastKnockAt < this.knockEveryMs) return;
      from.lastKnockAt = t;
      from.lastSignalAt = t;
      this.tell(id, { type: 'knock' });
    }
  }

  /** Lets go of the seats of those who have been silent too long. They stay listeners, and may sit again. */
  sweep(): void {
    const t = this.now();
    for (const listener of this.listeners.values()) if (listener.seated && t - listener.lastSignalAt >= this.silenceMs) listener.seated = false;
  }

  /** Whether anyone is listening at all. The one who runs the hub stops its clock when this is false: a room with no one in it is not a room. */
  get open(): boolean {
    return this.listeners.size > 0;
  }

  /** Ends every stream's place here, at once. The sinks are not told. */
  close(): void {
    this.listeners.clear();
  }

  private sit(listener: Listener): boolean {
    if (listener.seated) return true;
    let seated = 0;
    for (const other of this.listeners.values()) if (other.seated) seated += 1;
    if (seated >= this.seats) return false;
    listener.seated = true;
    return true;
  }

  /** To everyone but the source. A sink that throws is a stream that is gone: it is let go, and the others are not troubled. */
  private tell(sourceId: string, frame: BreathFrame): void {
    for (const [id, listener] of [...this.listeners]) {
      if (id === sourceId) continue;
      try {
        listener.sink(frame);
      } catch {
        this.listeners.delete(id);
      }
    }
  }
}
