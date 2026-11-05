/** How far from the end of the log still counts as reading the end of it. */
export const NEAR_BOTTOM_PX = 96;

/** Whether a scroller is at its end, or near enough that new words should carry it along. */
export function nearBottom(box: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX;
}
