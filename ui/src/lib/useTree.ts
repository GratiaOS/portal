// 🌬️ The tree on the gate breathes with whoever else is there (docs/rfc-001-presence-physics.md §17). It listens to `/api/breath` with no key and
// moves its canopy by what it hears; a touch on the seat, to the right of the tree, sits the person down, held it is their own rhythm, and a tap after that changes nothing. The page
// shows nothing about it: no count, no name, no "connecting", no error. A stream that fails is tried again, quietly; a tab that is hidden
// neither listens nor sends (and so gives its seat up). Nothing is kept: no cookie, no storage, no id past the stream that has it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent, RefObject } from 'react';
import { Breather, Circle, Pacer, Rhythm, SIGNAL_MS } from './breath.ts';
import type { Phase } from './breath.ts';
import { Press } from './press.ts';
import type { PressEvent } from './press.ts';
import { createSseParser } from './sse.ts';

const RETRY_MS = 3_000;

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export type Tree = {
  /** Put on the canopy's group. */
  ref: RefObject<SVGGElement | null>;
  /** Put on the roots' drawing; its parent, the page, carries `--light`, the one number the sky and the roots are lit by. */
  roots: RefObject<SVGSVGElement | null>;
  /** Put on the seat, the place to press, to the right of the tree: it carries the word (`data-word`) and breathes (`--breath`) with the canopy. */
  seat: RefObject<HTMLButtonElement | null>;
  /** Whether the tree is leaning a hair off its place, waiting for a first touch (the Missing Screw: nudge, touch, wink, reward). */
  nudge: boolean;
  /** Whether this person is sitting. For the one who uses a screen reader: nothing on the page says it. */
  seated: boolean;
  handlers: {
    onPointerDown: (event: PointerEvent<Element>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onLostPointerCapture: () => void;
    onContextMenu: (event: MouseEvent<Element>) => void;
    onKeyDown: (event: KeyboardEvent<Element>) => void;
    onKeyUp: (event: KeyboardEvent<Element>) => void;
  };
};

type Person = { seated: boolean; phase?: Phase; sentAt: number };

export function useTree(enabled: boolean): Tree {
  const crown = useRef<SVGGElement | null>(null);
  const roots = useRef<SVGSVGElement | null>(null);
  const seat = useRef<HTMLButtonElement | null>(null);
  const pacer = useRef(new Pacer());
  const [seated, setSeated] = useState(false);
  const [touched, setTouched] = useState(false);
  const circle = useRef(new Circle());
  const breather = useRef(new Breather());
  const rhythm = useRef(new Rhythm());
  const me = useRef<string | undefined>(undefined);
  const person = useRef<Person>({ seated: false, sentAt: 0 });
  const press = useRef(new Press());

  const send = useCallback((rate: number, phase: Phase) => {
    const id = me.current;
    if (!id) return;
    void fetch(`/api/breath/${id}`, { method: 'POST', body: JSON.stringify({ type: 'breath', rate, phase }) }).catch(() => {});
  }, []);

  /** What a touch did, in order: a press sits the person down (once), a hold is their own rhythm, a release goes on from there; a tap changes nothing. */
  const apply = useCallback((events: PressEvent[], now: number) => {
    const p = person.current;
    for (const event of events) {
      if (event === 'down' && !p.seated) {
        p.seated = true;
        p.phase = undefined; // the next step says the first inhale
        breather.current.sit(now);
        setSeated(true);
        setTouched(true); // the screw is touched once, and is set right
      } else if (event === 'hold') {
        rhythm.current.press(now);
        breather.current.press(now);
      } else if (event === 'release') {
        breather.current.release(now, rhythm.current.rate());
      }
      // a tap on a tree one is already sitting under changes nothing: a click never resets the breath (it is the knock's, later), and one leaves by leaving
    }
  }, []);

  // listening, and moving: only while the page is in front of someone
  useEffect(() => {
    if (!enabled) return;
    const c = circle.current;
    const p = person.current;
    let stream: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    let alive = true;

    const listen = async () => {
      stream = new AbortController();
      try {
        const res = await fetch('/api/breath', { signal: stream.signal });
        if (res.status !== 200 || !res.body) return; // a tree that stands still: nothing is said
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parse = createSseParser();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const f of parse(decoder.decode(value, { stream: true }))) {
            const data = f.data as { you?: string; id?: string; rate?: number; phase?: Phase };
            if (f.event === 'hello' && typeof data.you === 'string') me.current = data.you;
            else if (f.event === 'breath' && typeof data.id === 'string' && typeof data.rate === 'number' && data.phase) c.hear(data.id, data.rate, data.phase, performance.now());
          }
        }
      } catch {
        // cut, or the portal is away: either way the tree goes on, and tries again
      }
      me.current = undefined;
      if (alive && !document.hidden) retry = setTimeout(() => void listen(), RETRY_MS + Math.random() * 3_000);
    };

    const step = () => {
      const now = performance.now();
      apply(press.current.tick(now), now); // a press that has lasted becomes a hold, and a hold that has lasted too long lets go
      // the word, as the garden's pacer says it: what the canopy is doing, for the one who sits and for the one who only watches
      const word = pacer.current.next(c, now);
      if (seat.current && seat.current.dataset.word !== word) seat.current.dataset.word = word;
      if (!reducedMotion()) {
        const open = c.value(now).toFixed(4);
        crown.current?.style.setProperty('--breath', open);
        seat.current?.style.setProperty('--breath', open);
        // one number for the whole scene: the sky is lit by it, and the roots by what the sky gives up
        roots.current?.parentElement?.style.setProperty('--light', c.light(now).toFixed(3));
      } else roots.current?.parentElement?.style.setProperty('--light', '0.5'); // still, half and half
      if (p.seated) {
        const phase = breather.current.phase(now);
        if (phase !== p.phase) {
          p.phase = phase;
          p.sentAt = now;
          c.hear('me', breather.current.rate, phase, now);
          send(breather.current.rate, phase);
        } else if (now - p.sentAt >= SIGNAL_MS) {
          p.sentAt = now;
          c.hear('me', breather.current.rate, phase, now);
          send(breather.current.rate, phase);
        }
      }
    };
    const run = () => {
      if (reducedMotion()) interval = setInterval(step, 250);
      else {
        const loop = () => {
          step();
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      }
    };
    const halt = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearInterval(interval);
      frame = undefined;
      interval = undefined;
    };

    const toggle = () => {
      if (document.hidden) {
        apply(press.current.up(performance.now()), performance.now()); // a touch left behind with the page is over
        stream?.abort();
        clearTimeout(retry);
        halt();
      } else if (alive) {
        stream?.abort();
        void listen();
        run();
      }
    };
    document.addEventListener('visibilitychange', toggle);
    if (!document.hidden) {
      void listen();
      run();
    }
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', toggle);
      stream?.abort();
      clearTimeout(retry);
      halt();
      c.clear();
      press.current = new Press();
      p.seated = false;
      p.phase = undefined;
      me.current = undefined;
    };
  }, [enabled, send, apply]);

  const down = useCallback(() => {
    if (!enabled) return;
    const now = performance.now();
    apply(press.current.down(now), now); // a press that never ended is ended first, so that none is ever ignored
  }, [enabled, apply]);

  const up = useCallback(() => {
    const now = performance.now();
    apply(press.current.up(now), now);
  }, [apply]);

  // a phone may take a long touch for a menu or a selection and never say that it ended: whatever ends it anywhere on the page ends it here
  useEffect(() => {
    if (!enabled) return;
    const end = () => up();
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
    };
  }, [enabled, up]);

  const keyDown = useCallback(
    (event: KeyboardEvent<Element>) => {
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
        event.preventDefault();
        down();
      }
    },
    [down],
  );
  const keyUp = useCallback(
    (event: KeyboardEvent<Element>) => {
      if (event.key === ' ' || event.key === 'Enter') up();
    },
    [up],
  );

  return {
    ref: crown,
    roots,
    seat,
    nudge: enabled && !touched,
    seated,
    handlers: {
      // the hold is followed even if the finger slides off the tree before it lets go
      onPointerDown: (event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        down();
      },
      onPointerUp: up,
      onPointerCancel: up,
      onLostPointerCapture: up,
      // a long touch must not raise the menu of the browser: it is the person's breath
      onContextMenu: (event) => event.preventDefault(),
      onKeyDown: keyDown,
      onKeyUp: keyUp,
    },
  };
}
