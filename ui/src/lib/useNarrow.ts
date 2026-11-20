// Is the page narrow (under 48 rem), where the skins show the top bar and not the head of the channel? The same line the skins use.
import { useEffect, useState } from 'react';

export const NARROW = '(max-width: 47.99rem)';

export function useNarrow(): boolean {
  const query = () => (typeof matchMedia === 'function' ? matchMedia(NARROW) : undefined);
  const [narrow, setNarrow] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const m = query();
    if (!m) return;
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}
