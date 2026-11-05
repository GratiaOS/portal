import { statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileBody } from './http-node.js';
import { pageHeaders } from './page-headers.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function fileIn(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const file = resolve(root, `.${sep}${decoded}`);
  return file === root || file.startsWith(root + sep) ? file : null;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves a built single-page app from a folder: its files, and `index.html` for any path that is not a file and has no
 * extension (so a reload on `/channels/olympus` lands in the app). A missing file with an extension is a plain 404.
 */
export function createStaticHandler(dir: string): (request: Request) => Response {
  const root = resolve(dir);

  return (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });

    const { pathname } = new URL(request.url);
    const wanted = fileIn(root, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
    if (wanted === null) return new Response(null, { status: pathname.includes('%') ? 400 : 404 });

    const lastSegment = pathname.split('/').pop() ?? '';
    const file = isFile(wanted) ? wanted : extname(lastSegment) === '' ? join(root, 'index.html') : null;
    if (file === null || !isFile(file)) return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    return new Response(request.method === 'HEAD' ? null : fileBody(file), {
      status: 200,
      headers: { 'Content-Type': type, 'Content-Length': String(statSync(file).size), ...pageHeaders(pathname, type) },
    });
  };
}
