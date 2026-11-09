import { useEffect } from 'react';
import { pickLocale } from './strings.ts';

/** The page says in which language it is written, so that a browser spells, hyphenates and reads it right. */
export function useLang(tag: string | undefined): void {
  const lang = pickLocale(tag);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
}
