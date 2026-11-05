import type { Participant } from './domain.js';

// `@` must stand at the start or after a space or punctuation, so an e-mail address is not a mention.
const MENTION = /(?<![\p{L}\p{N}_.-])@([\p{L}\p{N}][\p{L}\p{N}_.-]{0,31})/gu;

/** The known participants named with `@alias` in the text, once each, in the order they appear. */
export function extractMentions(text: string, participants: Iterable<Participant>): string[] {
  const byAlias = new Map<string, string>();
  for (const p of participants) byAlias.set(p.alias.toLowerCase(), p.id);

  const found: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    // "@hera." ends a sentence, the dot is not part of the name
    const alias = match[1].replace(/[_.-]+$/, '').toLowerCase();
    const id = byAlias.get(alias);
    if (id && !found.includes(id)) found.push(id);
  }
  return found;
}
