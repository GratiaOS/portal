/**
 * 🗿 trace
 * Name from:  Firegate `SeedPortal`, the one place where something is written.
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/SeedPortal.tsx
 * Same idea:  a box that grows with what you write; Enter sends, Shift+Enter breaks the line; it asks for nothing.
 *             Here Enter sends only where there is a keyboard to press it with; on a touch screen it breaks the line and the
 *             button sends. What is written and not sent is kept for each channel; near the limit the box says how far it is.
 * Different:  no dice, no voice, no choice of who is speaking (a token says who you are). The text of a refusal
 *             (too fast, too long, not sent) shows under the box in a calm colour and the words stay put.
 *             The whispers in the box (Firegate's `placeholderWhispers`) say how to call a companion and give
 *             questions the company wrote for her, instead of lines about the field; they turn more slowly, and stop
 *             while someone is reading them, writing, or has asked the system for less motion.
 * Not copied: written new for Room (MPL-2.0); Firegate is AGPL-3.0.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MAX_CHARS, boxHeight, counter, sendsOnEnter } from '../lib/composer.ts';
import { keepDraft, readDraft } from '../lib/drafts.ts';
import type { Strings } from '../lib/strings.ts';
import { nextWhisper } from '../lib/whispers.ts';

const WHISPER_MS = 7000;

const finePointer = () => window.matchMedia('(pointer: fine)').matches;

/** Mounted once for each channel (the page gives it the channel as its `key`), so that what is written belongs to one. */
export default function SeedPortal({ channel, onSend, note, whispers, t }: { channel: string; onSend: (text: string) => Promise<void>; note: string; whispers: string[]; t: Strings }) {
  const [text, setText] = useState(() => readDraft(channel));
  const [line, setLine] = useState(0);
  const [reading, setReading] = useState(false); // the mouse is over the box, or it has focus: leave the line where it is
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const noteId = useId();

  useEffect(() => keepDraft(channel, text), [channel, text]);

  // as tall as the text needs, up to two fifths of the window; past that it scrolls inside
  const fit = useCallback(() => {
    const node = box.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${boxHeight(node.scrollHeight, window.innerHeight)}px`;
  }, []);

  useEffect(fit, [text, fit]);

  // and again when what it is measured against changes: a taller or lower window, or another look (its padding and type are its own;
  // the height measured in one is wrong in the next, so the first letter would make the box jump)
  useEffect(() => {
    window.addEventListener('resize', fit);
    const look = new MutationObserver(fit);
    look.observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin', 'data-skin-base'] });
    return () => {
      window.removeEventListener('resize', fit);
      look.disconnect();
    };
  }, [fit]);

  // the lines turn slowly while the box is empty and left alone; for anyone who asks for less motion, the first stays
  useEffect(() => {
    if (whispers.length < 2 || text || reading || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const turn = setInterval(() => setLine((current) => nextWhisper(current, whispers.length)), WHISPER_MS);
    return () => clearInterval(turn);
  }, [whispers.length, text, reading]);

  async function send() {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      await onSend(message);
      // the box may be gone by now (they went to another channel while it was on its way) and a newer draft may be there in its place:
      // what was sent is let go of only if it is still what is kept
      if (readDraft(channel) === text) keepDraft(channel, '');
      setText(''); // gone only once the room has it
    } catch {
      /* the page says why, under the box; the words stay */
    } finally {
      setSending(false);
      box.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (sendsOnEnter({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing }, finePointer())) {
      event.preventDefault();
      void send();
    }
  }

  // under the box, when there is no refusal to say: how to break a line (only where Enter sends), and how far it is from the limit
  const hint = [text && finePointer() ? t.lineBreak : '', counter(text.length) ?? ''].filter(Boolean).join(' · ');

  return (
    <div data-part="composer">
      <div data-part="composer-row">
        <textarea
          ref={box}
          value={text}
          rows={1}
          maxLength={MAX_CHARS}
          placeholder={whispers[line % Math.max(whispers.length, 1)] ?? t.say}
          aria-label={t.say}
          aria-describedby={noteId}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setReading(true)}
          onBlur={() => setReading(false)}
          onMouseEnter={() => setReading(true)}
          onMouseLeave={() => setReading(document.activeElement === box.current)}
          onKeyDown={onKeyDown}
          data-part="composer-input"
        />
        <button type="button" onClick={() => void send()} disabled={!text.trim() || sending} data-part="composer-send">
          {t.send}
        </button>
      </div>
      {/* a refusal is said once, as it comes; the line under the box is read when the box is focused, and says nothing as the count changes */}
      <p role="status" data-part="sr-only">
        {note}
      </p>
      <p id={noteId} data-part="composer-note">
        {note || hint}
      </p>
    </div>
  );
}
