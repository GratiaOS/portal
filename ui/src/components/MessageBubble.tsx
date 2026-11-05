/**
 * 🗿 trace
 * Name from:  Firegate `MessageBubble`, one message in a soft translucent shape that fades in.
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MessageBubble.tsx
 * Same idea:  a message is a soft shape, not a row of a table; it arrives gently and says when it was said, small.
 * Different:  a message that names the reader says so (`data-to-you`), so that an answer is not lost in a busy log;
 *             inside the text, a mention, a #tag and a span of code are told apart from the words around them, and a
 *             message of one to three emoji is shown large; nothing is made of a word the room does not know.
 *             Many voices, not two: every message is on the left, with the name once per run and a colour that stays
 *             with the person. No layers, tags, translation or typewriter: an answer that took half a minute to think
 *             does not also type itself out. Nova's sources are set apart under her answer.
 * Not copied: written new for Room (MPL-2.0); Firegate is AGPL-3.0.
 */
import CodeBlock from './CodeBlock.tsx';
import type { CSSProperties } from 'react';
import { blocksOf } from '../lib/blocks.ts';
import { addressedTo, clock, hueOf, splitSources } from '../lib/format.ts';
import { emojiOnly, inlineOf } from '../lib/inline.ts';
import type { Row } from '../lib/format.ts';
import type { Strings } from '../lib/strings.ts';

export default function MessageBubble({ row, mine, meId, channelIds, t }: { row: Row; mine: boolean; meId: string | undefined; channelIds: string[]; t: Strings }) {
  const { turn, speaker, head, mentioned } = row;
  const companion = speaker?.kind === 'companion';
  const { body, sources } = splitSources(turn.text);
  const name = speaker?.alias ?? turn.speakerId.split(':')[1] ?? turn.speakerId;
  const time = clock(turn.createdAt);
  const toYou = addressedTo(row, meId);
  const blocks = blocksOf(body);
  // a message that is one to three emoji and nothing else
  const jumbo = blocks.length === 1 && blocks[0]!.kind === 'text' && emojiOnly(blocks[0]!.text) > 0;

  return (
    <li data-part="message" data-head={head ? '' : undefined} data-from={companion ? 'companion' : mine ? 'mine' : 'other'} data-to-you={toYou ? '' : undefined}>
      <time dateTime={turn.createdAt} title={time} data-part="time">
        {time}
      </time>
      <div data-part="message-body">
        {head && (
          <p data-part="speaker" style={{ '--hue': hueOf(turn.speakerId) } as CSSProperties}>
            {name}
            {speaker?.sign && <span data-part="sign">{speaker.sign}</span>}
            {companion && <span data-part="speaker-mark">·</span>}
          </p>
        )}
        <div data-part="bubble">
          {toYou && <span data-part="sr-only">{t.toYou}: </span>}
          <div data-part="content">
            {blocks.map((block, i) =>
              block.kind === 'code' ? (
                <CodeBlock key={i} lang={block.lang} code={block.code} t={t} />
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
          {sources.length > 0 && (
            <p data-part="sources">
              {t.sources}: {sources.join(' · ')}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
