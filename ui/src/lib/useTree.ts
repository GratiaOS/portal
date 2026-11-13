// 🌬️ The tree on the gate breathes with whoever else is there (docs/rfc-001-presence-physics.md §17). It listens to `/api/breath` with no key and
// moves its canopy by what it hears; a touch sits the person down, held it is their own rhythm, and a tap after that changes nothing. The page
// shows nothing about it: no count, no name, no "connecting", no error. A stream that fails is tried again, quietly; a tab that is hidden
// neither listens nor sends (and so gives its seat up). Nothing is kept: no cookie, no storage, no id past the stream that has it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import { Breather, Circle, Rhythm, SIGNAL_MS } from './breath.ts';
import type { Phase } from './breath.ts';
import { createSseParser } from './sse.ts';

/** A press longer than this is a hold (the person's own rhythm); a shorter one is a tap. */
export const HOLD_MS = 350;
const RETRY_MS = 3_000;

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export type Tree = {
  /** Put on the canopy's group. */
  ref: RefObject<SVGGElement | null>;
  /** Put on the roots' drawing; its parent, the page, carries `--light`, the one number the sky and the roots are lit by. */
  roots: RefObject<SVGSVGElement | null>;
  /** Whether the tree is leaning a hair off its place, waiting for a first touch (the Missing Screw: nudge, touch, wink, reward). */
  nudge: boolean;
  /** Whether this person is sitting. For the one who uses a screen reader: nothing on the page says it. */
  seated: boolean;
  handlers: {
    onPointerDown: (event: PointerEvent<SVGGElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => void;
    onKeyUp: (event: KeyboardEvent<SVGGElement>) => void;
  };
};

type Person = { seated: boolean; holding: boolean; timer?: ReturnType<typeof setTimeout>; phase?: Phase; sentAt: number };

export function useTree(enabled: boolean): Tree {
  const crown = useRef<SVGGElement | null>(null);
  const roots = useRef<SVGSVGElement | null>(null);
  const [seated, setSeated] = useState(false);
  const [touched, setTouched] = useState(false);
  const circle = useRef(new Circle());
  const breather = useRef(new Breather());
  const rhythm = useRef(new Rhythm());
  const me = useRef<string | undefined>(undefined);
  const person = useRef<Person>({ seated: false, holding: false, sentAt: 0 });

  const send = useCallback((rate: number, phase: Phase) => {
    const id = me.current;
    if (!id) return;
    void fetch(`/api/breath/${id}`, { method: 'POST', body: JSON.stringify({ type: 'breath', rate, phase }) }).catch(() => {});
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
      if (!reducedMotion()) {
        crown.current?.style.setProperty('--breath', c.value(now).toFixed(4));
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
      clearTimeout(p.timer);
      halt();
      c.clear();
      p.seated = false;
      p.holding = false;
      p.phase = undefined;
      me.current = undefined;
    };
  }, [enabled, send]);

  const down = useCallback(() => {
    const p = person.current;
    if (!enabled || p.timer !== undefined) return; // a key held down is one press, not many
    const now = performance.now();
    if (!p.seated) {
      p.seated = true;
      p.phase = undefined; // the next step says the first inhale
      breather.current.sit(now);
      setSeated(true);
      setTouched(true); // the screw is touched once, and is set right
    }
    p.timer = setTimeout(() => {
      p.holding = true;
      const at = performance.now();
      rhythm.current.press(at);
      breather.current.press(at);
    }, HOLD_MS);
  }, [enabled]);

  const up = useCallback(() => {
    const p = person.current;
    if (p.timer === undefined) return;
    clearTimeout(p.timer);
    p.timer = undefined;
    const now = performance.now();
    if (p.holding) {
      p.holding = false;
      breather.current.release(now, rhythm.current.rate());
    }
    // a tap on a tree one is already sitting under changes nothing: a click never resets the breath (it is the knock's, later), and one leaves by leaving
  }, []);

  const keyDown = useCallback(
    (event: KeyboardEvent<SVGGElement>) => {
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
        event.preventDefault();
        down();
      }
    },
    [down],
  );
  const keyUp = useCallback(
    (event: KeyboardEvent<SVGGElement>) => {
      if (event.key === ' ' || event.key === 'Enter') up();
    },
    [up],
  );

  return {
    ref: crown,
    roots,
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
      onKeyDown: keyDown,
      onKeyUp: keyUp,
    },
  };
}
