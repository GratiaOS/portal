/** What the room accepts in one message. */
export const MAX_CHARS = 4000;

/** From this share of the limit on, the box says how far it is. */
const NEAR = 0.9;

/**
 * Whether this key sends. Where there is a keyboard to press it with (a fine pointer), Enter sends and Shift+Enter breaks the line.
 * On a touch screen the key on the keyboard is Enter and means a new line, and the button sends. Never while an input method is
 * still composing a character.
 */
export function sendsOnEnter(key: { key: string; shiftKey: boolean; isComposing: boolean }, finePointer: boolean): boolean {
  return key.key === 'Enter' && !key.shiftKey && !key.isComposing && finePointer;
}

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 320;

/** How tall the box grows before it scrolls inside: what the text needs, up to two fifths of the window, between 120 and 320 px. */
export function boxHeight(contentHeight: number, windowHeight: number): number {
  const cap = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(windowHeight * 0.4)));
  return Math.min(contentHeight, cap);
}

/** "3812 / 4000" once the text is near what the room accepts, and nothing before. */
export function counter(length: number): string | undefined {
  return length >= MAX_CHARS * NEAR ? `${length} / ${MAX_CHARS}` : undefined;
}
