// What Nova reads, as she reads it, in every home: files by their path, and the text they make together in her prompt. In Node
// they come from a folder that may grow (knowledge.ts, KnowledgeBase); on Cloudflare from a bundle made from that folder with
// the same rules (cloudflare/bundle-knowledge.mjs).

/** What Nova needs of her knowledge. `refresh` looks again and says whether anything changed. */
export type Knowledge = {
  readonly files: ReadonlyMap<string, string>;
  readonly text: string;
  refresh(): boolean;
};

/** The files headed `### FILE: path`, so an answer can say which ones it used; the same text each time, for the prefix cache. */
export function knowledgeText(files: ReadonlyMap<string, string>): string {
  return [...files].map(([path, content]) => `### FILE: ${path}\n${content.trim()}`).join('\n\n');
}

/** Knowledge that does not change while the portal runs: a bundle, already read (canvases as text, the excluded left out). */
export function fixedKnowledge(files: Record<string, string>): Knowledge {
  const map = new Map(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const text = knowledgeText(map);
  return { files: map, text, refresh: () => false };
}
