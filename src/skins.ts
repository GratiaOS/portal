import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { fileBody } from './http-node.js';
import { extname, join, resolve, sep } from 'node:path';

/** The looks the page has built in. A skin from a folder may not take one of these names, and may build on one of them. */
export const BUILT_IN_SKINS = ['bubbles', 'bank', 'radar'] as const;

/** What the page needs to offer a skin: its id (the name of its folder), what to call it, a sign for its button. */
/** The version of the skin contract (`ui/src/skins/README.md`) this room understands; a skin may say which one it was made for. */
export const SKIN_CONTRACT = 1;

export type SkinInfo = { id: string; name: string; emoji?: string; /** A built-in skin whose layout it keeps, so that it only has to say what is different. */ extends?: string };

const ID = /^[a-z][a-z0-9-]{1,31}$/;
const MAX_CSS_BYTES = 256_000;
const MAX_FILE_BYTES = 4_000_000;

/** What a skin may hold. A script is not here, and nothing here can run one: an image is shown, a font is read, a sheet is applied. */
const TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/**
 * What is wrong with the stylesheet of a skin, or `undefined` if nothing. A skin puts every rule inside `:root[data-skin='<id>']`
 * and names its keyframes `<id>-…`, so that skins sit side by side and only the chosen one answers; `@font-face` is the one
 * rule that may stand outside, and it names its family `<id>-…` too: a face is registered for the whole page, and one that took the
 * name of a font another look uses would change that look as well. No `@import`, and nothing it loads may come from another place (the page would refuse it).
 */
export function checkSkinCss(css: string, id: string): string | undefined {
  if (css.length > MAX_CSS_BYTES) return `skin.css is larger than ${MAX_CSS_BYTES / 1000} KB`;
  if (/url\(\s*['"]?\s*(?!data:)(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(css)) return 'skin.css loads something from another place, and the page does not allow it: put it in the skin folder';

  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const scope = new RegExp(`^:root\\[data-skin=(['"])${id}\\1\\]$`);
  let depth = 0;
  let quote = '';
  let outside = '';
  let scoped = false;
  let face = -1; // where the body of a @font-face begins, while inside one
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      if (depth === 0) outside += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      if (depth === 0) outside += ch;
    } else if (ch === '{') {
      if (depth === 0) {
        const prelude = outside.trim().replace(/\s+/g, ' ');
        if (scope.test(prelude)) scoped = true;
        else if (prelude === '@font-face') face = i + 1;
        else if (!prelude.startsWith(`@keyframes ${id}-`)) return `skin.css has a rule outside its scope: ${prelude.slice(0, 60)} (every rule goes inside :root[data-skin='${id}'])`;
        outside = '';
      }
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth < 0) return 'skin.css has a } without a {';
      if (depth === 0 && face >= 0) {
        const family = /font-family\s*:\s*(['"]?)([^;'"}]*)\1/i.exec(text.slice(face, i))?.[2]?.trim().toLowerCase();
        if (!family?.startsWith(`${id}-`)) return `a @font-face in skin.css must name its family ${id}-… (this one says ${family ? JSON.stringify(family) : 'nothing'}), or it would change the other looks that use that font`;
        face = -1;
      }
    } else if (depth === 0) {
      if (ch === ';') {
        const statement = outside.trim();
        if (!statement.startsWith('@charset')) return `skin.css has a statement outside its rules: ${statement.slice(0, 60)}`;
        outside = '';
      } else outside += ch;
    }
  }
  if (depth !== 0) return 'skin.css has a { that is never closed';
  if (outside.trim()) return `skin.css ends with something that is not a rule: ${outside.trim().slice(0, 60)}`;
  if (!scoped) return `skin.css has no block of its own: :root[data-skin='${id}'] { … }`;
  return undefined;
}

type Loaded = { skin?: SkinInfo; problem?: string };

/**
 * A folder of skins, one folder to a skin: `<id>/skin.json` (`{ "id", "name", "emoji"?, "extends"? }`), `<id>/skin.css`, and
 * whatever the stylesheet uses (images, fonts) beside it. What is in the folder is the room's own: a person who runs the room
 * puts it there. A skin is looked at again whenever it is asked for, so one can be added without restarting.
 */
export class SkinFolder {
  private readonly cache = new Map<string, { signature: string; loaded: Loaded }>();

  constructor(readonly dir: string) {}

  /** Every skin that is good, by id, and what is wrong with the folders that are not. */
  scan(): { skins: SkinInfo[]; problems: string[] } {
    let ids: string[];
    try {
      ids = readdirSync(this.dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();
    } catch {
      return { skins: [], problems: [`cannot read the skins folder ${this.dir}`] };
    }
    const skins: SkinInfo[] = [];
    const problems: string[] = [];
    for (const id of ids) {
      const { skin, problem } = this.load(id);
      if (skin) skins.push(skin);
      else if (problem) problems.push(`${id}: ${problem}`);
    }
    return { skins, problems };
  }

  list(): SkinInfo[] {
    return this.scan().skins;
  }

  find(id: string): SkinInfo | undefined {
    return ID.test(id) ? this.load(id).skin : undefined;
  }

  private load(id: string): Loaded {
    const folder = join(this.dir, id);
    const manifest = join(folder, 'skin.json');
    const sheet = join(folder, 'skin.css');
    let signature: string;
    try {
      const a = statSync(manifest);
      const b = statSync(sheet);
      signature = `${a.mtimeMs}:${a.size}:${b.mtimeMs}:${b.size}`;
    } catch {
      this.cache.delete(id);
      return { problem: 'needs a skin.json and a skin.css' };
    }
    const hit = this.cache.get(id);
    if (hit?.signature === signature) return hit.loaded;

    const loaded = this.read(id, manifest, sheet);
    this.cache.set(id, { signature, loaded });
    return loaded;
  }

  private read(id: string, manifestPath: string, sheetPath: string): Loaded {
    if (!ID.test(id)) return { problem: 'the name of the folder must be lower case letters, digits and -, 2 to 32 characters, starting with a letter' };
    if ((BUILT_IN_SKINS as readonly string[]).includes(id)) return { problem: 'this name belongs to a look the page has built in' };

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      return { problem: 'skin.json is not valid JSON' };
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { problem: 'skin.json must be an object' };
    const entry = raw as Record<string, unknown>;
    if (entry.id !== id) return { problem: `skin.json says id ${JSON.stringify(entry.id)}, and the folder is ${id}` };
    if (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 40) return { problem: 'skin.json needs a name of 1 to 40 characters' };
    if (entry.emoji !== undefined && (typeof entry.emoji !== 'string' || !entry.emoji || entry.emoji.length > 8 || /[<>&"']/.test(entry.emoji))) return { problem: 'emoji must be a short sign, as text' };
    if (entry.extends !== undefined && !(typeof entry.extends === 'string' && (BUILT_IN_SKINS as readonly string[]).includes(entry.extends))) return { problem: `extends must be one of ${BUILT_IN_SKINS.join(', ')}` };
    if (entry.contract !== undefined && entry.contract !== SKIN_CONTRACT) return { problem: `this portal knows the skin contract ${SKIN_CONTRACT}` };

    const problem = checkSkinCss(readFileSync(sheetPath, 'utf8'), id);
    if (problem) return { problem };
    return { skin: { id, name: entry.name.trim(), ...(entry.emoji === undefined ? {} : { emoji: entry.emoji as string }), ...(entry.extends === undefined ? {} : { extends: entry.extends as string }) } };
  }

  /** `GET /skins/<id>/<file>`: a file of a good skin, of a kind a skin may hold, and nothing else. */
  serve(request: Request): Response {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    const notFound = () => new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    let parts: string[];
    try {
      parts = decodeURIComponent(new URL(request.url).pathname).split('/').slice(2);
    } catch {
      return new Response(null, { status: 400 });
    }
    const [id, ...rest] = parts;
    if (!id || !rest.length || !this.find(id) || rest.some((part) => !part || part === '.' || part === '..' || part.startsWith('.') || part.includes('\0') || part.includes('\\'))) return notFound();
    const type = TYPES[extname(rest[rest.length - 1]!).toLowerCase()];
    if (!type) return notFound();

    let file: string;
    let size: number;
    try {
      const root = realpathSync(join(this.dir, id));
      file = realpathSync(resolve(root, ...rest));
      if (!file.startsWith(root + sep)) return notFound(); // a link that leads out of the skin's folder
      const stat = statSync(file);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return notFound();
      size = stat.size;
    } catch {
      return notFound();
    }
    return new Response(request.method === 'HEAD' ? null : fileBody(file), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        // an image opened by itself must not run anything, whatever it holds
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    });
  }
}
