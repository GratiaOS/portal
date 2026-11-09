/**
 * The languages of the portal: Romanian, English and Spanish, in no particular order. One rule says which of them a person gets, for the
 * page and for the sentences the portal says in Nova's place; anything else falls to English, which most visitors can read.
 */

export const LOCALES = ['ro', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** The language of a tag (`es-AR`, `EN`, `ro_RO`), or English when it is none of ours or there is none. */
export function pickLocale(tag: string | undefined | null): Locale {
  const primary = tag?.trim().toLowerCase().split(/[-_]/)[0];
  return (LOCALES as readonly string[]).includes(primary ?? '') ? (primary as Locale) : DEFAULT_LOCALE;
}

/** The first language of an `Accept-Language` header that is one of ours, by what the visitor prefers; English when none is. */
export function fromAcceptLanguage(header: string | undefined | null): Locale {
  const wanted = (header ?? '')
    .split(',')
    .map((part, order) => {
      const [tag, ...params] = part.trim().split(';');
      const q = Number(params.map((p) => p.trim()).find((p) => p.startsWith('q='))?.slice(2) ?? 1);
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0, order };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.order - b.order);
  for (const { tag } of wanted) {
    const primary = tag.split(/[-_]/)[0];
    if ((LOCALES as readonly string[]).includes(primary)) return primary as Locale;
  }
  return DEFAULT_LOCALE;
}
