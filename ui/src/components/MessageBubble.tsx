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
import Words from './Words.tsx';
import type { CSSProperties } from 'react';
import { addressedTo, clock, hueOf, splitSources } from '../lib/format.ts';
import type { Row } from '../lib/format.ts';
import type { Strings } from '../lib/strings.ts';

export default function MessageBubble({ row, mine, meId, channelIds, t }: { row: Row; mine: boolean; meId: string | undefined; channelIds: string[]; t: Strings }) {
  const { turn, speaker, head } = row;
  const companion = speaker?.kind === 'companion';
  const { body, sources } = splitSources(turn.text);
  const name = speaker?.alias ?? turn.speakerId.split(':')[1] ?? turn.speakerId;
  const time = clock(turn.createdAt);
  const toYou = addressedTo(row, meId);

  return (
    <li data-part="message" data-fading={row.opacity !== undefined ? '' : undefined} style={row.opacity !== undefined ? { opacity: row.opacity } : undefined} data-head={head ? '' : undefined} data-from={companion ? 'companion' : mine ? 'mine' : 'other'} data-to-you={toYou ? '' : undefined}>
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
          <Words body={body} mentioned={row.mentioned} meId={meId} channelIds={channelIds} t={t} />
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
