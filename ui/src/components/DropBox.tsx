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
 * the seal. Broken, the words settle out of noise and the packet says OPEN, with two things to do and no others (no reply, no copy):
 * 🔒 Close, which shuts it on this page and keeps it, and 🔥 Burn, which is not the same: it deletes the packet at once, for everyone who
 * holds the frequency, and there is no way back (no question, no undo; Burn is burn). Burn is there only while the packet is open. The page
 * never takes a burn to be done before the server says so: a burn that fails leaves the packet as it was, says so quietly, and asking
 * again is safe. When it is done the packet is gone from the list, never sealed again. Left alone it goes at its fade, and the line under
 * it shows how much of it is left.
 */
function Packet({ drop, open, now, onToggle, onBurn, t }: { drop: Drop; open: boolean; now: number; onToggle: () => void; onBurn: () => Promise<boolean>; t: Strings }) {
  const tuning = useTuning(drop.payload.body, open);
  const [burning, setBurning] = useState(false);
  const [burnFailed, setBurnFailed] = useState(false);
  const burn = async () => {
    if (burning) return;
    setBurning(true);
    setBurnFailed(false);
    const done = await onBurn();
    // gone: the packet leaves the list and this goes with it; not gone: it is still here, and the page says so without raising its voice
    if (!done) {
      setBurning(false);
      setBurnFailed(true);
    }
  };
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
      {open && burnFailed && (
        <p data-part="drop-burn-failed" role="status">
          {t.dropBurnFailed}
        </p>
      )}
      <div data-part="drop-actions">
        <button type="button" data-part="drop-seal" aria-expanded={open} onClick={onToggle}>
          <span aria-hidden>{open ? '🔒' : '🔓'}</span> {open ? t.dropShut : t.dropBreak}
        </button>
        {open && (
          <button type="button" data-part="drop-burn" aria-busy={burning ? true : undefined} disabled={burning} onClick={burn}>
            <span aria-hidden>🔥</span> {t.dropBurn}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * The box of drops (RFC 002): what is left on the frequency a person holds, read and not written in. The seal of each packet is broken on its
 * own, one packet open at a time; it has no sender and no hour. There is nothing to write here and nothing to answer: whoever wants an answer wrote their
 * own frequency in the words. A packet whose fade is reached is not in the list the next time the page counts, whether or not it was open.
 */
export default function DropBox({ title, drops, now, loaded, failed, retry, burn, connection, t }: { title: string; drops: Drop[]; now: number; loaded: boolean; failed: boolean; retry: () => void; burn: (id: string) => Promise<boolean>; connection: Connection; t: Strings }) {
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
            <Packet key={drop.id} drop={drop} open={drop.id === openId} now={now} onToggle={() => setOpenId(drop.id === openId ? undefined : drop.id)} onBurn={() => burn(drop.id)} t={t} />
          ))}
        </ol>
      </div>
    </section>
  );
}
