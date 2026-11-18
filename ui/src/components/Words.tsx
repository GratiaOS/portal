import CodeBlock from './CodeBlock.tsx';
import type { CSSProperties } from 'react';
import { blocksOf } from '../lib/blocks.ts';
import { hueOf } from '../lib/format.ts';
import type { Row } from '../lib/format.ts';
import { emojiOnly, inlineOf } from '../lib/inline.ts';
import type { Strings } from '../lib/strings.ts';

/**
 * The words of one message, or of one packet in the box of drops, cut into what they are: prose, who is named, a #tag, an address, a span
 * of code, a fenced block. A packet names no one the room knows, so it passes none; the rest is the same, so a skin dresses both alike.
 */
export default function Words({ body, mentioned, meId, channelIds, t, copyable = true }: { body: string; mentioned: Row['mentioned']; meId: string | undefined; channelIds: string[]; t: Strings; /** Whether a block of code has its button to copy it: a message does, a packet does not. */ copyable?: boolean }) {
  const blocks = blocksOf(body);
  // one to three emoji and nothing else
  const jumbo = blocks.length === 1 && blocks[0]!.kind === 'text' && emojiOnly(blocks[0]!.text) > 0;
  return (
    <div data-part="content">
      {blocks.map((block, i) =>
        block.kind === 'code' ? (
          <CodeBlock key={i} lang={block.lang} code={block.code} t={t} copyable={copyable} />
        ) : (
          <p key={i} data-part="text" data-jumbo={jumbo ? '' : undefined}>
            {inlineOf(block.text, mentioned, channelIds).map((piece, j) => {
              if (piece.kind === 'mention') {
                return (
                  <span key={j} data-part="mention" data-from={piece.person.kind === 'companion' ? 'companion' : 'other'} data-you={piece.person.id === meId ? '' : undefined} style={{ '--hue': hueOf(piece.person.id) } as CSSProperties}>
                    {piece.text}
                  </span>
                );
              }
              if (piece.kind === 'link') {
                return (
                  <a key={j} data-part="link" href={piece.href} target="_blank" rel="noopener noreferrer nofollow ugc">
                    {piece.text}
                  </a>
                );
              }
              if (piece.kind === 'tag') {
                return (
                  <span key={j} data-part="tag">
                    {piece.text}
                  </span>
                );
              }
              if (piece.kind === 'code') {
                return (
                  <code key={j} data-part="inline-code">
                    {piece.text}
                  </code>
                );
              }
              return piece.text;
            })}
          </p>
        ),
      )}
    </div>
  );
}
