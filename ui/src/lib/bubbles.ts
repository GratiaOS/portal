export type Bubble = {
  /** Across the page, in percent. */
  left: number;
  /** Across the bubble, in pixels. */
  size: number;
  /** Seconds. Negative: it is already on its way when the page opens. */
  delay: number;
  /** Seconds for the whole way up. Slow. */
  duration: number;
  /** Sideways over the way up, in pixels. */
  drift: number;
  opacity: number;
};

/** The same bubbles for the same seed: they are placed once, not drawn again at every render. */
export function makeBubbles(count: number, seed = 7): Bubble[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const at = (min: number, max: number, places = 0) => {
    const k = 10 ** places;
    return Math.round((min + random() * (max - min)) * k) / k;
  };
  return Array.from({ length: count }, () => {
    const size = at(4, 22);
    // a bubble of oxygen rises faster the bigger it is: from about 26 s for the smallest to about 12 s for the biggest, and a little different each time
    const duration = Math.round((26 - ((size - 4) / 18) * 14 + at(-2, 2, 1)) * 10) / 10;
    return {
      left: at(0, 100),
      size,
      delay: at(-20, 0, 1),
      duration,
      drift: at(-24, 24),
      opacity: at(0.45, 0.85, 2),
    };
  });
}
