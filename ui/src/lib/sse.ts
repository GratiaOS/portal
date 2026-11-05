export type SseFrame = { event: string; id?: string; data: unknown };

/** One event: the lines up to a blank line. Comments, `retry:` and anything without data are not events. */
function readBlock(block: string): SseFrame | null {
  let event = 'message';
  let id: string | undefined;
  const data: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'id') id = value;
    else if (field === 'data') data.push(value);
  }

  if (!data.length) return null;
  try {
    return { event, ...(id === undefined ? {} : { id }), data: JSON.parse(data.join('\n')) };
  } catch {
    return null; // not ours to understand
  }
}

/** Takes text as it arrives, in whatever pieces, and gives back the events that are complete. */
export function createSseParser(): (chunk: string) => SseFrame[] {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    const frames: SseFrame[] = [];
    for (let end = /\r?\n\r?\n/.exec(buffer); end; end = /\r?\n\r?\n/.exec(buffer)) {
      const frame = readBlock(buffer.slice(0, end.index));
      buffer = buffer.slice(end.index + end[0].length);
      if (frame) frames.push(frame);
    }
    return frames;
  };
}
