import type { Participant } from './types.ts';

/** A line of prose, taken apart into what the reader should see as what it is. */
export type Piece =
  | { kind: 'text'; text: string }
  /** `@Nova`: someone the room knows to be named in this message. */
  | { kind: 'mention'; text: string; person: Participant }
  /** `#decizie`: a word someone marked. */
  | { kind: 'tag'; text: string }
  /** `` `kill switch` ``: a few words that are code, or must be taken as written. */
  | { kind: 'code'; text: string }
  /** `https://…`: an address someone wrote; the text is the address itself, so what is shown is where it goes. Only http and https. */
  | { kind: 'link'; text: string; href: string };

// a run of backticks, then something that does not begin with one, then the same run again; not across lines
const CODE = /(?<!`)(`+)(?!`)([^\n]*?[^`\n])\1(?!`)/g;

// the same rule as the room's (`@` after a space or punctuation, so an e-mail address is not a mention), and `#` the same way, followed by a
// letter: "#78" is a number, and "&#39;" is not a tag
const MARK = /(?<![\p{L}\p{N}_.-])@(?<mention>[\p{L}\p{N}][\p{L}\p{N}_.-]{0,31})|(?<![\p{L}\p{N}_&/#.-])#(?<tag>\p{L}[\p{L}\p{N}_-]{1,31})/gu;

// an address that begins with http:// or https://, up to a space or a mark that cannot be in one; what ends a sentence is taken off its end below
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

/** The end of an address, without what ends the sentence around it: "https://a.b/c)." is "https://a.b/c", but "https://a.b/(c)" keeps its bracket. */
function trimmed(address: string): string {
  let end = address;
  for (;;) {
    const last = end.at(-1) ?? '';
    const unbalanced = (open: string, close: string) => last === close && end.split(close).length > end.split(open).length;
    if (/[.,;:!?'"]/.test(last) || unbalanced('(', ')') || unbalanced('[', ']') || unbalanced('{', '}')) end = end.slice(0, -1);
    else return end;
  }
}

function webAddress(text: string): string | undefined {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One line or paragraph of a message as pieces, in order. Only the people the room says were mentioned (`mentioned`, from the
 * message itself) are mentions: an `@word` that names no one stays text. A `#word` that is the name of a channel (`channels`) stays
 * text too, since it points somewhere and is not a mark. What is inside a code span is never read for either.
 */
export function inlineOf(text: string, mentioned: readonly Participant[], channels: readonly string[] = []): Piece[] {
  const byAlias = new Map(mentioned.map((p) => [p.alias.toLowerCase(), p] as const));
  const channelNames = new Set(channels.map((c) => c.toLowerCase()));
  const pieces: Piece[] = [];
  const push = (piece: Piece) => {
    const last = pieces[pieces.length - 1];
    if (piece.kind === 'text' && last?.kind === 'text') last.text += piece.text;
    else if (piece.text) pieces.push(piece);
  };

  // an address is read first, so that a `#` or an `@` inside it is never a tag or a mention
  const prose = (segment: string) => {
    let at = 0;
    for (const match of segment.matchAll(URL_RE)) {
      const found = trimmed(match[0]);
      const start = match.index ?? 0;
      if (!webAddress(found)) continue;
      marks(segment.slice(at, start));
      push({ kind: 'link', text: found, href: webAddress(found) as string });
      at = start + found.length;
    }
    marks(segment.slice(at));
  };

  const marks = (segment: string) => {
    let from = 0;
    for (const match of segment.matchAll(MARK)) {
      const at = match.index ?? 0;
      let name = match.groups?.mention ?? match.groups?.tag ?? '';
      // "@hera." ends a sentence, and the dot is not part of the name
      name = name.replace(/[_.-]+$/, '');
      const end = at + 1 + name.length;
      if (match.groups?.mention !== undefined) {
        const person = byAlias.get(name.toLowerCase());
        if (!person) continue;
        push({ kind: 'text', text: segment.slice(from, at) });
        push({ kind: 'mention', text: segment.slice(at, end), person });
      } else {
        if (name.length < 2 || channelNames.has(name.toLowerCase())) continue;
        push({ kind: 'text', text: segment.slice(from, at) });
        push({ kind: 'tag', text: segment.slice(at, end) });
      }
      from = end;
    }
    push({ kind: 'text', text: segment.slice(from) });
  };

  let from = 0;
  for (const match of text.matchAll(CODE)) {
    const at = match.index ?? 0;
    prose(text.slice(from, at));
    push({ kind: 'code', text: match[2]!.replace(/^ (?=.*[^ ])|(?<=[^ ].*) $/g, '') });
    from = at + match[0].length;
  }
  prose(text.slice(from));
  return pieces;
}

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
// a picture by itself, or one that asks to be a picture (a heart with the variation selector), a flag, a keycap
const EMOJI = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️|\p{Regional_Indicator}{2}|[0-9#*]️?⃣)/u;

/** How many emoji a text is made of when it is made of nothing else (one to three), and 0 for any other text. */
export function emojiOnly(text: string): number {
  let count = 0;
  for (const { segment } of GRAPHEMES.segment(text.trim())) {
    if (/^\s+$/.test(segment)) continue;
    if (!EMOJI.test(segment)) return 0;
    count += 1;
    if (count > 3) return 0;
  }
  return count;
}
