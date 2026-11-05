import { useEffect } from 'react';
import type { RefObject } from 'react';
import { occurrencesIn, selectedWord } from './occurrences.ts';

/** The name the page gives to the highlight, which a skin dresses with `::highlight(room-occurrence)`. */
export const OCCURRENCE = 'room-occurrence';
const MOST = 400;

type Registry = { set(name: string, highlight: unknown): void; delete(name: string): void };

/**
 * As in an editor: select a word in the log, and every place it is in the log lights up. It is the browser's own highlight (the
 * CSS Custom Highlight API), so nothing in the page changes and the selection is left alone; where the browser has no such thing,
 * nothing happens. It lets go when the selection does.
 */
export function useOccurrences(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const registry = (globalThis.CSS as unknown as { highlights?: Registry } | undefined)?.highlights;
    const Highlight = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!registry || !Highlight) return;

    let frame = 0;
    const paint = () => {
      frame = 0;
      const container = root.current;
      const selection = document.getSelection();
      const inside = container && selection && !selection.isCollapsed && selection.anchorNode && selection.focusNode && container.contains(selection.anchorNode) && container.contains(selection.focusNode);
      const word = inside ? selectedWord(selection.toString()) : undefined;
      if (!container || !word) {
        registry.delete(OCCURRENCE);
        return;
      }
      const ranges: Range[] = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node && ranges.length < MOST; node = walker.nextNode()) {
        for (const at of occurrencesIn(node.nodeValue ?? '', word)) {
          const range = new Range();
          range.setStart(node, at);
          range.setEnd(node, at + word.length);
          ranges.push(range);
        }
      }
      registry.set(OCCURRENCE, new Highlight(...ranges));
    };
    const onChange = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };

    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      cancelAnimationFrame(frame);
      registry.delete(OCCURRENCE);
    };
  }, [root]);
}
