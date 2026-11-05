/** A comment line: keeps the connection warm through proxies and tells a dead socket from a quiet room. */
export const PING = ': ping\n\n';

/** One server-sent event. The `id` is what the browser sends back as `Last-Event-ID` when it reconnects. */
export function frame(event: string, data: unknown, id?: string | number): string {
  // JSON.stringify never puts a raw newline in its output, so `data` is always one line
  return `event: ${event}\n${id === undefined ? '' : `id: ${id}\n`}data: ${JSON.stringify(data)}\n\n`;
}
