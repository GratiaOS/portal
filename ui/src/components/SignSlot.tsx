/**
 * 🗿 trace
 * Name from:  new. The feel is the 90s consoles' (a slot of initials on the high-score screen, a frame moved on a
 *             character-select grid), and the words are M3's joy (a high five when it is kept, a plot twist when it is not).
 * Path:       https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ui/src/utils/joy.ts
 * Same idea:  something small that answers you with a little play; "joy is a feature, not a bug"
 *             (https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/Whisper.md).
 * Different:  no toast and no icon of its own; the slot pops for a moment (only for those who did not ask for less motion), and
 *             the words are said once, to a screen reader as to the eye.
 * Not copied: written new for the portal (MPL-2.0); only a turn of phrase is taken from M3, no code.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { OWN_MAX, addOwnSign, isSign, ownSigns, stepSign, tilesOf } from '../lib/sign.ts';
import type { Strings } from '../lib/strings.ts';

const COLUMNS = 4;
/** Stepping with ↑↓ keeps the sign once you stop for this long, or at once with Enter. */
const SETTLE_MS = 1200;

/**
 * Your sign, in your name: a slot. ↑↓ (or ▲▼) step through the signs and keep one when you stop, Enter keeps it at once, Esc
 * puts back the one you had. A click opens the grid behind it: your own signs, the set, and + for any emoji you like.
 */
export default function SignSlot({ name, current, onChoose, t }: { name: string; current: string | undefined; onChoose: (sign: string | null) => Promise<void>; t: Strings }) {
  const [own, setOwn] = useState<string[]>(ownSigns);
  const tiles = useMemo(() => tilesOf(own), [own]);
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState('');
  const [focus, setFocus] = useState(0);
  const [said, setSaid] = useState('');
  const [popping, setPopping] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = preview ?? current;

  useEffect(() => () => clearTimeout(settle.current), []);
  useEffect(() => {
    if (open && !adding) tileRefs.current[focus]?.focus();
  }, [open, adding, focus]);

  // what was said stays a moment, then the line is quiet again
  useEffect(() => {
    if (!said) return;
    const quiet = setTimeout(() => setSaid(''), 4000);
    return () => clearTimeout(quiet);
  }, [said]);

  const keep = async (sign: string | null) => {
    clearTimeout(settle.current);
    setPreview(undefined);
    if (sign === (current ?? null)) return;
    try {
      await onChoose(sign);
      setSaid(sign ? t.signKept(sign) : t.signLetGoDone);
      setPopping(true);
      setTimeout(() => setPopping(false), 600);
    } catch (err) {
      setSaid(t.signPlotTwist(err instanceof Error && err.message ? err.message : ''));
    }
  };

  const step = (by: 1 | -1) => {
    const next = stepSign(tiles, shown, by);
    setPreview(next);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => void keep(next), SETTLE_MS);
  };

  const onSlotKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === 'Enter' && preview) {
      e.preventDefault();
      void keep(preview);
    } else if (e.key === 'Escape' && preview) {
      clearTimeout(settle.current);
      setPreview(undefined);
    }
  };

  const openGrid = () => {
    clearTimeout(settle.current);
    setPreview(undefined);
    setFocus(Math.max(0, tiles.indexOf(current ?? '')));
    setOpen((was) => !was);
    setAdding(false);
  };

  const pick = (sign: string) => {
    setOpen(false);
    void keep(sign);
  };

  const addOne = () => {
    const sign = added.trim();
    if (!isSign(sign)) return setSaid(t.signNotOne);
    setOwn(addOwnSign(sign));
    setAdded('');
    setAdding(false);
    pick(sign);
  };

  // the frame moves like a cursor on a select screen: the arrows, Home and End; Enter picks; Esc closes
  const count = tiles.length + 1; // the tiles, and +
  const onGridKey = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS };
    if (e.key in moves) {
      e.preventDefault();
      setFocus((at) => Math.min(count - 1, Math.max(0, at + moves[e.key]!)));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setFocus(e.key === 'Home' ? 0 : count - 1);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div data-part="sign-slot-wrap">
      <span data-part="self-name">{name}</span>
      <button
          type="button"
          aria-label={t.signSlot(shown)}
          aria-expanded={open}
          title={t.signHelp}
          onClick={openGrid}
          onKeyDown={onSlotKey}
          onBlur={() => preview && void keep(preview)}
          data-part="sign-slot"
          data-popping={popping ? '' : undefined}
          data-preview={preview ? '' : undefined}
        >
          {shown ?? '◌'}
        </button>
      <span data-part="sign-steps">
        <button type="button" aria-label={t.signPrevious} onClick={() => step(-1)} data-part="sign-step">
          ▲
        </button>
        <button type="button" aria-label={t.signNext} onClick={() => step(1)} data-part="sign-step">
          ▼
        </button>
      </span>

      {open && (
        <div role="group" aria-label={t.signGrid} onKeyDown={onGridKey} data-part="sign-grid">
          {tiles.map((sign, i) => (
            <button
              key={sign}
              ref={(el) => {
                tileRefs.current[i] = el;
              }}
              type="button"
              tabIndex={i === focus ? 0 : -1}
              aria-pressed={sign === current}
              aria-label={sign}
              onClick={() => pick(sign)}
              onFocus={() => setFocus(i)}
              data-part="sign-tile"
              data-own={own.includes(sign) ? '' : undefined}
            >
              {sign}
            </button>
          ))}
          {adding ? (
            <input
              autoFocus
              value={added}
              onChange={(e) => setAdded(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addOne();
                if (e.key === 'Escape') setAdding(false);
                e.stopPropagation();
              }}
              placeholder="🗿"
              aria-label={t.signAdd(OWN_MAX)}
              maxLength={16}
              data-part="sign-input"
            />
          ) : (
            <button
              ref={(el) => {
                tileRefs.current[tiles.length] = el;
              }}
              type="button"
              tabIndex={focus === tiles.length ? 0 : -1}
              aria-label={t.signAdd(OWN_MAX)}
              title={t.signAdd(OWN_MAX)}
              onClick={() => setAdding(true)}
              onFocus={() => setFocus(tiles.length)}
              data-part="sign-add"
            >
              +
            </button>
          )}
          {current && (
            <button type="button" tabIndex={-1} aria-label={t.signLetGo} title={t.signLetGo} onClick={() => (setOpen(false), void keep(null))} data-part="sign-add">
              ×
            </button>
          )}
        </div>
      )}
      <span role="status" aria-live="polite" data-part="sign-said">
        {said}
      </span>
    </div>
  );
}
