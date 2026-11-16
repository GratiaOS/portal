/** What a browser says of the part of the page that is seen (`window.visualViewport`). */
export type Seen = { height: number; offsetTop: number; scale: number };

/**
 * Where the room should sit while part of the window is covered: on a phone the keyboard rises over the page, and on iOS the window
 * keeps its height under it, so the box and the end of what was said would be behind the keys. The answer is the part that is seen
 * (its top and its height, in px), or nothing when the whole window is seen, or when the page is zoomed by hand (then the seen
 * part is a detail of the page, not the page).
 */
export function seenWindow(seen: Seen, windowHeight: number): { top: number; height: number } | undefined {
  if (Math.abs(seen.scale - 1) > 0.01) return undefined;
  if (windowHeight - seen.height < 1) return undefined;
  return { top: Math.max(0, Math.round(seen.offsetTop)), height: Math.round(seen.height) };
}
