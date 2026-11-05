import type { Strings } from './strings.ts';
import type { Hints } from './types.ts';

/**
 * What the box where people write says while it is empty: first what it always said, then how a companion is called, by
 * example, then the questions the company wrote for her. A room without a companion says only the first.
 */
export function whispersFor(t: Strings, hints: Hints | undefined): string[] {
  const companion = hints?.companion;
  if (!companion) return [t.say];
  return [t.say, ...t.whispers(companion), ...hints.examples.map((example) => `@${companion}, ${example}`)];
}

/** The next line in the turn, starting over after the last. */
export const nextWhisper = (index: number, count: number): number => (count > 0 ? (index + 1) % count : 0);
