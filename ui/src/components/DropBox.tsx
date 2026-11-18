import { useState } from 'react';
import type { CSSProperties } from 'react';
import SignalQuality from './SignalQuality.tsx';
import Words from './Words.tsx';
import type { Connection } from '../lib/client.ts';
import { fadeLevel, sigilOf } from '../lib/drops.ts';
import type { Strings } from '../lib/strings.ts';
import type { Drop } from '../lib/types.ts';
import { useTuning } from '../lib/useTuning.ts';

/**
 * One packet, seen as Amigo shows a signal when its seal is still to be broken: SEALED, a closed letter (faint writing, the same whatever it
 * says) with the wax and the sigil it was sealed with over its lower edge, the title of an incoming transmission, and the button that breaks
 * the seal. Broken, the words settle out of noise and the packet says OPEN. There is nothing else to do with it: no reply, no copy, no
 * burn; it goes at its fade, and the line under it shows how much of it is left.
 */
function Packet({ drop, open, now, onToggle, t }: { drop: Drop; open: boolean; now: number; onToggle: () => void; t: Strings }) {
  const tuning = useTuning(drop.payload.body, open);
  return (
    <li data-part="drop" data-open={open ? '' : undefined} style={{ '--fade': fadeLevel(drop.fadesAt, now) } as CSSProperties}>
      <p data-part="drop-state">{open ? t.dropOpened : t.dropSealed}</p>
      {!open && (
        <>
          <div aria-hidden data-part="drop-letter">
            <div data-part="drop-paper">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <span data-part="drop-wax">
              <i data-part="drop-wax-lip" />
              <i data-part="drop-wax-grain" />
              <span data-part="drop-wax-glyph">{sigilOf(drop)}</span>
            </span>
          </div>
          <p data-part="drop-title">{t.dropTitle}</p>
        </>
      )}
      {open && (
        <div data-part="drop-body" aria-live="polite" aria-atomic="true">
          {/* settling out of noise; the words themselves are read only once they have settled, so a screen reader is not given noise */}
          {tuning.done ? <Words body={drop.payload.body} mentioned={[]} meId={undefined} channelIds={[]} t={t} copyable={false} /> : <p aria-hidden data-part="text">{tuning.shown}</p>}
        </div>
      )}
      <span aria-hidden data-part="drop-fade" />
      <button type="button" data-part="drop-seal" aria-expanded={open} onClick={onToggle}>
        <span aria-hidden>{open ? '🔒' : '🔓'}</span> {open ? t.dropShut : t.dropBreak}
      </button>
    </li>
  );
}

/**
 * The box of drops (RFC 002): what is left on the frequency a person holds, read and not written in. The seal of each packet is broken on its
 * own, one packet open at a time; it has no sender and no hour. There is nothing to write here and nothing to answer: whoever wants an answer wrote their
 * own frequency in the words. A packet whose fade is reached is not in the list the next time the page counts, whether or not it was open.
 */
export default function DropBox({ title, drops, now, loaded, failed, retry, connection, t }: { title: string; drops: Drop[]; now: number; loaded: boolean; failed: boolean; retry: () => void; connection: Connection; t: Strings }) {
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  return (
    <section aria-label={title} data-part="channel-view">
      <header data-part="channel-head">
        <h2 data-part="channel-title">{title}</h2>
        <SignalQuality connection={connection} t={t} />
      </header>
      <div data-part="log">
        {/* while the first answer is awaited the page says so, as Amigo's Room does ("tuning"); a box that is empty is not told as empty: it is only quiet */}
        {!loaded && !failed && (
          <p data-part="empty" role="status">
            {t.dropTuning}
          </p>
        )}
        {failed && (
          <>
            <p data-part="empty" role="status">
              {t.dropFailed}
            </p>
            <button type="button" data-part="drop-retry" onClick={retry}>
              {t.dropRetry}
            </button>
          </>
        )}
        {loaded && !failed && drops.length === 0 && (
          <p data-part="sr-only" role="status">
            {t.dropEmpty}
          </p>
        )}
        <ol data-part="drops" aria-label={t.dropList}>
          {drops.map((drop) => (
            <Packet key={drop.id} drop={drop} open={drop.id === openId} now={now} onToggle={() => setOpenId(drop.id === openId ? undefined : drop.id)} t={t} />
          ))}
        </ol>
      </div>
    </section>
  );
}
