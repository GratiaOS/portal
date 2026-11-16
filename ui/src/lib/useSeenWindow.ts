import { useEffect } from 'react';
import { seenWindow } from './window.ts';

/**
 * While part of the window is covered (a keyboard on a phone), says so on the root: `data-window` and the two numbers `--window-top`
 * and `--window-height`, which `index.css` answers by holding the page to the part that is seen. Nothing is said while the whole
 * window is seen, and nothing is left behind when the room is.
 */
export function useSeenWindow(): void {
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const root = document.documentElement;
    const clear = () => {
      root.removeAttribute('data-window');
      root.style.removeProperty('--window-top');
      root.style.removeProperty('--window-height');
    };
    const follow = () => {
      const seen = seenWindow(view, window.innerHeight);
      if (!seen) return clear();
      root.style.setProperty('--window-top', `${seen.top}px`);
      root.style.setProperty('--window-height', `${seen.height}px`);
      root.setAttribute('data-window', '');
    };
    follow();
    view.addEventListener('resize', follow);
    view.addEventListener('scroll', follow);
    return () => {
      view.removeEventListener('resize', follow);
      view.removeEventListener('scroll', follow);
      clear();
    };
  }, []);
}
