/** What a person selected, if it is a word worth finding again: a name, a tag, a term, not a letter or a sentence. */
export function selectedWord(selected: string): string | undefined {
  const word = selected.trim();
  if (word.length < 2 || word.length > 40) return undefined;
  if (!/^[\p{L}\p{N}@#_.'’-]+$/u.test(word) || !/[\p{L}\p{N}]/u.test(word)) return undefined;
  return word;
}

/** Where `word` is in `text`, as start positions, whatever the case, without overlapping. */
export function occurrencesIn(text: string, word: string): number[] {
  const hay = text.toLowerCase();
  const needle = word.toLowerCase();
  // a few letters change length when lower-cased; then the places would be wrong, and the text is left alone
  if (hay.length !== text.length || needle.length !== word.length) return [];
  const found: number[] = [];
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) found.push(at);
  return found;
}
