// 🌬️ The breath of the tree on the gate, as numbers (docs/rfc-001-presence-physics.md §17). Nothing here touches the page or the network:
// it takes what was heard and the clock, and says how far the canopy is open. Each person is one oscillator; the canopy is their
// superposition, not their average, so that the irregularity is kept. When the last one is gone it settles to a neutral of 8 bpm over ten
// seconds. Nothing is counted, named or remembered past what is needed to draw the next frame.

export type Phase = 'inhale' | 'exhale' | 'hold';

/** Breaths a minute when no one is breathing: the tree's own. */
export const NEUTRAL_BPM = 8;
/** A source heard this recently is whole; after it, it fades (a signal comes every two seconds, with room for a late one). */
export const KEEP_MS = 2_500;
/** A source silent this long is gone from the canopy: it has faded over the time between. */
export const GONE_MS = 10_000;
/** How often a person who sits sends their breath, whatever the phase. */
export const SIGNAL_MS = 2_000;
/** The range the portal accepts for a rate; a person's own is kept inside it. */
export const RATE = { min: 1, max: 30 } as const;

const TAU = Math.PI * 2;
/** The bottom of the breath, where an inhale begins; the crest is where an exhale begins. */
const TROUGH = -Math.PI / 2;
const CREST = Math.PI / 2;

export const clampRate = (rate: number): number => Math.min(RATE.max, Math.max(RATE.min, rate));

type Source = { rate: number; phase: Phase; theta: number; at: number; heardAt: number; bornAt: number };

/** A source that is new comes in over this long, so that the canopy never jumps to meet it. */
export const BORN_MS = 1_000;

/** How whole a source is, `dt` ms after it was last heard: 1 while it is fresh, then down to 0 at `GONE_MS`. */
export function weight(dt: number): number {
  if (dt <= KEEP_MS) return 1;
  return Math.min(1, Math.max(0, (GONE_MS - dt) / (GONE_MS - KEEP_MS)));
}

/** Past 1 a sum is let grow, slowly: complexity is the ceiling, not suffocation, but the tree is never asked to be taller than a third more. */
export function ceiling(sum: number): number {
  const size = Math.abs(sum);
  return size <= 1 ? sum : Math.sign(sum) * (1 + 0.35 * Math.tanh(size - 1));
}

export class Circle {
  private readonly sources = new Map<string, Source>();

  /**
   * A breath was heard from `id`. When the phase is a new one, the oscillator turns to it **from where the canopy is**: an inhale goes on rising
   * from the present value, an exhale goes on falling, a hold stays where it is. Nothing snaps to the bottom or the top, so that a touch, a hold
   * and a release never make the canopy jump. When it is the same phase, the signal that comes every two seconds only says the source is still here.
   */
  hear(id: string, rate: number, phase: Phase, now: number): void {
    const known = this.sources.get(id);
    const r = clampRate(rate);
    if (known && known.phase === phase && known.rate === r) {
      known.heardAt = now;
      return;
    }
    const here = known ? thetaAt(known, now) : undefined;
    const y = Math.max(-1, Math.min(1, here === undefined ? this.value(now) : Math.sin(here)));
    const theta = phase === 'inhale' ? Math.asin(y) : phase === 'exhale' ? Math.PI - Math.asin(y) : (here ?? CREST);
    this.sources.set(id, { rate: r, phase, theta, at: now, heardAt: now, bornAt: known ? known.bornAt : now });
  }

  /** How open the canopy is at `now`: from about -1 (closed) to +1 (open), a little past either with many. Sources that have faded are let go. */
  value(now: number): number {
    let sum = 0;
    let whole = 0;
    for (const [id, source] of this.sources) {
      const fade = weight(now - source.heardAt);
      if (fade <= 0) {
        this.sources.delete(id);
        continue;
      }
      const w = fade * Math.min(1, Math.max(0, (now - source.bornAt) / BORN_MS));
      sum += w * Math.sin(thetaAt(source, now));
      whole += w;
    }
    // the tree's own breath fills what the others leave empty, so that when they go, it comes back to itself and not all at once
    const neutral = Math.max(0, 1 - whole);
    if (neutral > 0) sum += neutral * Math.sin(TAU * (NEUTRAL_BPM / 60_000) * now + TROUGH);
    return ceiling(sum);
  }

  /**
   * The light of the whole scene at `now`, from 0 to 1, on the canopy's own curve: dark when it is closed, whole when it is open. It is one movement
   * for every step of the breath: the sky takes it as it is, and the roots take what the sky gives up (`1 - light`), so that on an inhale the light rises
   * into the sky, in a hold it rests there, and on the exhale it goes down into the roots. Together they are always one whole.
   */
  light(now: number): number {
    return Math.min(1, Math.max(0, (1 + this.value(now)) / 2));
  }

  clear(): void {
    this.sources.clear();
  }
}

/**
 * Where a source's oscillator is at `now`. An inhale rises and rests at the top until the next phase comes, an exhale falls and rests at the bottom, a
 * hold stays where it is: a phase never runs past its own end into the next one's, so that a breath held (or one whose next phase is late) is at the top,
 * and not caught half way down.
 */
const thetaAt = (source: Source, now: number): number => {
  if (source.phase === 'hold') return source.theta;
  const theta = source.theta + TAU * (source.rate / 60_000) * (now - source.at);
  return Math.min(theta, source.phase === 'inhale' ? CREST : CREST + Math.PI);
};

/**
 * One person's breath. Sitting begins an inhale at the neutral rate and goes on by itself; held, it is an inhale until it reaches the top, and a
 * hold there for as long as it is held; let go, it is an exhale at the rate the person's holds have set, and goes on by itself from there.
 */
export class Breather {
  rate = NEUTRAL_BPM;
  private held = false;
  private since = 0;
  private first: Phase = 'inhale';

  sit(now: number): void {
    this.rate = NEUTRAL_BPM;
    this.held = false;
    this.since = now;
    this.first = 'inhale';
  }

  press(now: number): void {
    this.held = true;
    this.since = now;
  }

  release(now: number, rate: number): void {
    this.rate = clampRate(rate);
    this.held = false;
    this.since = now;
    this.first = 'exhale';
  }

  phase(now: number): Phase {
    // held: the breath rises for as long as a breath takes to rise, and then rests at the top until it is let go
    if (this.held) return now - this.since < 30_000 / this.rate ? 'inhale' : 'hold';
    const half = 30_000 / this.rate;
    const turns = Math.floor(Math.max(0, now - this.since) / half);
    const other: Phase = this.first === 'inhale' ? 'exhale' : 'inhale';
    return turns % 2 === 0 ? this.first : other;
  }
}

/**
 * The rate a person's holds set: the time between one press and the next is one breath. It follows them (half of what was, half of what is), and
 * a pause of a minute starts it over. Before a second press there is no rate to say, and the neutral one stands.
 */
export class Rhythm {
  private last: number | undefined;
  private cycle: number | undefined;

  press(now: number): void {
    if (this.last !== undefined) {
      const gap = now - this.last;
      if (gap >= 60_000) this.cycle = undefined;
      else if (gap > 0) this.cycle = this.cycle === undefined ? gap : (this.cycle + gap) / 2;
    }
    this.last = now;
  }

  rate(): number {
    return this.cycle === undefined ? NEUTRAL_BPM : Math.round(clampRate(60_000 / this.cycle) * 10) / 10;
  }
}

/** Whether this portal has a tree on its gate: it says so in its health, and says nothing when it has none. */
export async function hasTree(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl('/api/health');
    if (!res.ok) return false;
    return ((await res.json()) as { breath?: unknown }).breath === true;
  } catch {
    return false;
  }
}
