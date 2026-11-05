/**
 * 🗿 trace
 * Name from:  Firegate `MemoryPool`, the part of it that holds the stream of messages (`.memory-stream`).
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx
 * Same idea:  the log scrolls on its own to the newest message, smoothly, and the page around it stays still.
 * Different:  it only follows the newest message while you are at the bottom (reading old ones is not interrupted),
 *             it stays at the bottom when what it is made of changes size (another look: the same words are taller or
 *             shorter), it keeps its place when older messages are added above, and it is a `log` for screen readers.
 *             No ambient layers or particles.
 * Not copied: written new for Room (MPL-2.0); Firegate is AGPL-3.0.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { nearBottom } from '../lib/scroll.ts';
import { useOccurrences } from '../lib/useOccurrences.ts';
import MessageBubble from './MessageBubble.tsx';
import ThinkingPill from './ThinkingPill.tsx';
import type { Row } from '../lib/format.ts';
import type { Strings } from '../lib/strings.ts';

export default function MemoryStream({ rows, meId, channelIds, hasMore, loading, onOlder, thinking, t }: { rows: Row[]; meId: string | undefined; channelIds: string[]; hasMore: boolean; loading: boolean; onOlder: () => void; thinking: string[]; t: Strings }) {
  const scroller = useRef<HTMLDivElement>(null);
  useOccurrences(scroller);
  const before = useRef({ height: 0, firstSeq: 0, atBottom: true });

  // what the screen looked like just before this change, so the change can leave it where it was
  const el = scroller.current;
  if (el) before.current = { ...before.current, height: el.scrollHeight, atBottom: nearBottom(el) };

  // at the end of the log, and staying there: when the log or the words in it change size without a new message (the look is changed,
  // a window is resized, a font arrives), the end is where it was, not the same number of pixels from the top
  const pinned = useRef(true);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onScroll = () => {
      pinned.current = nearBottom(node);
    };
    const follow = new ResizeObserver(() => {
      if (pinned.current) node.scrollTop = node.scrollHeight;
    });
    node.addEventListener('scroll', onScroll, { passive: true });
    // everything the log is made of, as it comes and goes: the list of messages, the older button, the "thinking" pill, the empty note
    const watch = () => {
      follow.observe(node);
      for (const child of node.children) follow.observe(child);
    };
    watch();
    const parts = new MutationObserver(() => {
      watch();
      if (pinned.current) node.scrollTop = node.scrollHeight;
    });
    parts.observe(node, { childList: true });
    return () => {
      node.removeEventListener('scroll', onScroll);
      follow.disconnect();
      parts.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const first = rows[0]?.turn.seq ?? 0;
    const prev = before.current;
    if (prev.firstSeq && first && first < prev.firstSeq) node.scrollTop += node.scrollHeight - prev.height; // older ones were added above
    else if (prev.atBottom || !prev.firstSeq) node.scrollTop = node.scrollHeight; // newer ones, and we were reading the end
    before.current = { ...prev, firstSeq: first };
  }, [rows, thinking.length]);

  return (
    <div ref={scroller} data-part="log">
      {hasMore && (
        <div data-part="older">
          <button type="button" onClick={onOlder} disabled={loading} data-part="older-button">
            {loading ? t.loading : t.older}
          </button>
        </div>
      )}
      {rows.length === 0 && !loading && (
        <p data-part="empty">
          {t.empty}
        </p>
      )}
      <ol role="log" aria-live="polite" data-part="messages">
        {rows.map((row) => (
          <MessageBubble key={row.turn.seq} row={row} mine={row.turn.speakerId === meId} meId={meId} channelIds={channelIds} t={t} />
        ))}
      </ol>
      <ThinkingPill names={thinking} t={t} />
    </div>
  );
}
