import { createReadStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { CALLER_HEADER } from './app.js';

// The first home's door: the portal's handler speaks `Request` and `Response`, and `node:http` speaks sockets. This is the
// only place where the two meet; a Worker hands the handler its `Request` as it is.

/** A file as the body of a `Response`, read as it is sent. */
export function fileBody(path: string): ReadableStream<Uint8Array> {
  return Readable.toWeb(createReadStream(path)) as unknown as ReadableStream<Uint8Array>;
}

export type NodeListenerOptions = {
  /**
   * Behind a proxy every socket is the proxy's: name the header the proxy sets with the real address (`x-forwarded-for`,
   * `cf-connecting-ip`) and it is used instead, its last entry, the one the nearest proxy added. Only for a proxy that sets it.
   */
  clientIpHeader?: string;
};

function callerOf(req: IncomingMessage, clientIpHeader?: string): string {
  if (clientIpHeader) {
    const raw = req.headers[clientIpHeader.toLowerCase()];
    const last = (Array.isArray(raw) ? raw.join(',') : raw)?.split(',').pop()?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function toRequest(req: IncomingMessage, signal: AbortSignal, clientIpHeader?: string): Request {
  const url = new URL(req.url ?? '/', 'http://portal.local');
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name === CALLER_HEADER) continue;
    for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one);
  }
  headers.set(CALLER_HEADER, callerOf(req, clientIpHeader));
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : (Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>);
  return new Request(url, { method, headers, body, signal, duplex: 'half' } as RequestInit);
}

/** Until the socket can take more, or is gone; whichever comes first takes the other listener away, so none pile up. */
function drained(res: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      res.off('drain', done);
      res.off('close', done);
      resolve();
    };
    res.on('drain', done);
    res.on('close', done);
  });
}

async function write(response: Response, res: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  res.writeHead(response.status, headers);
  if (!response.body) return void res.end();

  const reader = response.body.getReader();
  // the client went away: the body is told, so a stream stops and lets go of what it holds
  res.once('close', () => void reader.cancel().catch(() => {}));
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (res.destroyed) return;
      // wait while the socket is full, so what has not gone out yet stays counted in the body's own queue
      if (!res.write(value)) await drained(res);
    }
    res.end();
  } catch {
    res.destroy(); // a body that broke halfway, or a stream cut off: the client sees the connection end, and reconnects
  }
}

/** Puts a `Request` → `Response` handler on `node:http`: `createServer(toNodeListener(handler))`. */
export function toNodeListener(handle: (request: Request) => Promise<Response>, options: NodeListenerOptions = {}): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const gone = new AbortController();
    res.once('close', () => gone.abort());
    let request: Request;
    try {
      request = toRequest(req, gone.signal, options.clientIpHeader);
    } catch {
      // a method or a header that a Request cannot hold (CONNECT, TRACE, …)
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }).end('bad request');
      return;
    }
    handle(request)
      .then((response) => write(response, res))
      .catch((err: unknown) => {
        console.error('portal: a request failed', err);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }).end('{"error":"internal error"}');
        else res.destroy();
      });
  };
}
