import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { canvasToText } from './canvas.js';
import { knowledgeText } from './knowledge-files.js';
import type { Knowledge } from './knowledge-files.js';

/** What fits in a prompt next to a conversation: the whole folder, until it does not. */
const DEFAULT_MAX_BYTES = 400_000;

export type KnowledgeOptions = {
  /**
   * Folders and files, as paths inside the knowledge folder, that are never read, whatever they hold: what a company keeps
   * out of the model's prompt (and so out of every answer). Matched without regard to case; a folder takes everything under it.
   */
  exclude?: readonly string[];
  /** Told when a folder shows up at the top of the knowledge that was not there at the last look, so that Nova does not start reading it unseen. */
  onNewFolder?: (folder: string, files: number) => void;
};

/**
 * A path as it is compared, for an entry of `exclude` and for a path found on disk alike: `/` between parts, no empty and no `.`
 * parts (`private/./a.md` is `private/a.md`), the same Unicode form (a name with a diacritic can be stored composed or
 * decomposed, and they must meet), lower case. Whatever is left out of this meeting would be read, so it errs towards meeting.
 */
export const normalizeExclude = (entry: string): string =>
  entry
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/')
    .normalize('NFC')
    .toLowerCase();

/** Whether a path inside the folder (with `/`) is one of the excluded ones, or under one. */
export const isExcluded = (path: string, exclude: readonly string[]): boolean => {
  const found = normalizeExclude(path);
  return exclude.some((entry) => found === entry || found.startsWith(`${entry}/`));
};

/**
 * A folder of markdown and canvases, read whole. A canvas (the flows) is read as text: its boxes and arrows. The files
 * are headed `### FILE: path`, so an answer can say which ones it used, and the text stays the same from one question to
 * the next, so the server's prefix cache can hold it.
 */
export class KnowledgeBase implements Knowledge {
  /** Path inside the folder (with `/`) to the text of the file. */
  files: ReadonlyMap<string, string> = new Map();
  /** All of it, ready to go into a prompt. */
  text = '';
  bytes = 0;

  private signature = '';
  private readonly exclude: readonly string[];
  private readonly onNewFolder: ((folder: string, files: number) => void) | undefined;
  private folders: ReadonlySet<string> | undefined;

  constructor(
    private readonly dir: string,
    private readonly maxBytes: number = DEFAULT_MAX_BYTES,
    options: KnowledgeOptions = {},
  ) {
    this.exclude = (options.exclude ?? []).map(normalizeExclude).filter(Boolean);
    this.onNewFolder = options.onNewFolder;
    try {
      this.scan();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code) throw new Error(`nova: cannot read the knowledge folder ${dir} (${code})`);
      throw err;
    }
  }

  /** Picks up files that were added, changed or removed since the last look: a knowledge base is meant to grow. Keeps what it has if the folder cannot be read. */
  refresh(): boolean {
    try {
      return this.scan();
    } catch (err) {
      console.error(`portal: could not refresh the knowledge in ${this.dir}`, err);
      return false;
    }
  }

  private scan(): boolean {
    const found = walk(this.dir, this.dir, this.exclude).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (!found.length) throw new Error(`no .md or .canvas files in ${this.dir}`);

    const stats = found.map((path) => ({ path, stat: statSync(join(this.dir, ...path.split('/'))) }));
    const signature = stats.map(({ path, stat }) => `${path}:${stat.mtimeMs}:${stat.size}`).join('|');
    if (signature === this.signature) return false;

    const bytes = stats.reduce((sum, { stat }) => sum + stat.size, 0);
    if (bytes > this.maxBytes) {
      throw new Error(`the knowledge in ${this.dir} is ${Math.ceil(bytes / 1000)} KB, more than the ${Math.floor(this.maxBytes / 1000)} KB that fit in a prompt; it needs retrieval`);
    }

    const files = new Map<string, string>();
    for (const { path } of stats) {
      const content = readFileSync(join(this.dir, ...path.split('/')), 'utf8');
      const text = path.endsWith('.canvas') ? canvasToText(content) : content;
      if (text === null) console.error(`portal: skipping ${path}: it is not a canvas`);
      else files.set(path, text);
    }
    if (!files.size) throw new Error(`no readable .md or .canvas files in ${this.dir}`);
    this.files = files;
    this.text = knowledgeText(files);
    this.bytes = bytes;
    this.signature = signature;
    this.noticeNewFolders();
    return true;
  }

  /** What is read, by the folder at the top it sits in (a file at the top is counted under ''). */
  summary(): { folder: string; files: number }[] {
    const counts = new Map<string, number>();
    for (const path of this.files.keys()) {
      const top = path.includes('/') ? path.slice(0, path.indexOf('/')) : '';
      counts.set(top, (counts.get(top) ?? 0) + 1);
    }
    return [...counts].map(([folder, files]) => ({ folder, files })).sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0));
  }

  /** The lines that say what Nova reads and what is kept from her: for the room to print when it starts. */
  describe(): string[] {
    const read = this.summary()
      .map(({ folder, files }) => (folder ? `${folder} (${files})` : `${files} at the top`))
      .join(', ');
    const lines = [`reads ${this.files.size} files: ${read}`];
    if (this.exclude.length) {
      const left = this.exclude.map((entry) => `${entry}${existsSync(join(this.dir, ...entry.split('/'))) ? '' : ' (nothing there now)'}`).join(', ');
      lines.push(`leaves out: ${left}`);
    }
    return lines;
  }

  private noticeNewFolders(): void {
    const now = new Map(this.summary().map(({ folder, files }) => [folder, files] as const));
    const before = this.folders;
    this.folders = new Set(now.keys());
    if (!before || !this.onNewFolder) return;
    for (const [folder, files] of now) if (folder && !before.has(folder)) this.onNewFolder(folder, files);
  }
}

function walk(root: string, dir: string, exclude: readonly string[]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return [];
    const path = join(dir, entry.name);
    const inside = relative(root, path).split(sep).join('/');
    if (isExcluded(inside, exclude)) return [];
    if (entry.isDirectory()) return walk(root, path, exclude);
    return entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.canvas')) ? [inside] : [];
  });
}
