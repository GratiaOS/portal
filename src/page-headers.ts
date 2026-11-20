// How the page's own files are sent, the same in every home: from a folder in Node (static.ts), from the Worker's assets on
// Cloudflare (cloudflare/worker.ts).

/**
 * Everything the page loads comes from the portal itself: no fonts, scripts or images from elsewhere, and nobody may frame it.
 * One exception, and only for sound: the tape of Amigo FM, which the mushroom in the guest room plays (`ui/src/lib/radio.ts`, `BAND`). It is a
 * `media-src` and not a `connect-src`: the page only plays that address, it never fetches or sends anything to it.
 */
export const BAND_MEDIA = 'https://amigo-fm.gratia.workers.dev';

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  `media-src 'self' ${BAND_MEDIA}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** A file the build named by its content is kept for good; anything else is asked for again; the page itself under its policy. */
export function pageHeaders(pathname: string, contentType: string): Record<string, string> {
  return {
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Referrer-Policy': 'no-referrer',
    ...(contentType.startsWith('text/html') ? { 'Content-Security-Policy': CONTENT_SECURITY_POLICY } : {}),
  };
}
