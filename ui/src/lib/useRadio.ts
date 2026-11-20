// 🍄 The radio of Parking, as a hook: a native `<audio>` that plays the band's tape on the clock (lib/radio.ts), so a phone keeps it going with the
// screen off (Media Session, no Web Audio). It starts only from the press of the mushroom, never by itself. Nothing is sent to anyone and nothing is
// kept: not that someone listened, not for how long. The element is made on the press and let go of when it is switched off, or when the page goes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DRIFT_MAX_S, START_DRIFT_S, cameRound, rejoinTarget, tapeAddress, tapePositionAt } from './radio.ts';

/** `off` (the tape is not playing), `tuning` (waiting for the first sound), `on`, or `silent` (no tape on the band, or it could not be heard). */
export type RadioState = 'off' | 'tuning' | 'on' | 'silent';

/** What the lock screen of a phone says of it: a name, and nothing of what is playing. */
const MEDIA_TITLE = 'Amigo FM';

const rejoin = (tape: HTMLAudioElement, tolerance = DRIFT_MAX_S) => {
  const target = rejoinTarget(Date.now(), tape.currentTime, tape.duration, tolerance);
  if (target !== null) tape.currentTime = target;
};

const session = (): MediaSession | undefined => (typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : undefined);

export function useRadio(): { state: RadioState; toggle: () => void } {
  const [state, setState] = useState<RadioState>('off');
  const tapeRef = useRef<HTMLAudioElement | null>(null);

  const turnOff = useCallback(() => {
    const tape = tapeRef.current;
    tapeRef.current = null;
    if (tape) {
      tape.pause();
      tape.removeAttribute('src');
      tape.load();
    }
    const media = session();
    if (media) {
      media.metadata = null;
      media.playbackState = 'none';
    }
    setState('off');
  }, []);

  const turnOn = useCallback(() => {
    if (tapeRef.current) return;
    const tape = new Audio();
    tape.preload = 'auto';
    tape.loop = true; // native, and the clock puts it back when it has come round
    tape.setAttribute('playsinline', '');
    tapeRef.current = tape;
    setState('tuning');

    // events of an element that was already let go of are not ours any more
    const mine = (then: () => void) => () => {
      if (tapeRef.current === tape && tape.getAttribute('src')) then();
    };

    let last = 0;
    let first = true;
    const tune = () => {
      first = true;
      tape.loop = true;
      tape.src = tapeAddress(Date.now()); // a new address on every load: the browser keeps the bytes of one
      void tape.play().catch(() => undefined);
    };

    tape.addEventListener(
      'loadedmetadata',
      mine(() => {
        tape.currentTime = tapePositionAt(Date.now(), tape.duration);
        last = tape.currentTime;
      }),
    );
    tape.addEventListener(
      'playing',
      mine(() => {
        setState('on');
        if (first) {
          first = false;
          rejoin(tape, START_DRIFT_S);
        }
        const media = session();
        if (media) {
          media.metadata = new MediaMetadata({ title: MEDIA_TITLE });
          media.playbackState = 'playing';
          try {
            media.setPositionState({ duration: Infinity, playbackRate: 1, position: 0 }); // a radio, not a record: the clock decides the second
          } catch {
            // not every browser takes a live position: the lock screen then shows its usual bar
          }
        }
      }),
    );
    tape.addEventListener(
      'timeupdate',
      mine(() => {
        const now = tape.currentTime;
        if (cameRound(last, now)) rejoin(tape);
        last = now;
      }),
    );
    // no tape (404), a tape that ran out, a band out of reach: silence, said quietly
    tape.addEventListener(
      'error',
      mine(() => {
        tape.removeAttribute('src');
        tape.load();
        tapeRef.current = null;
        const media = session();
        if (media) {
          media.metadata = null;
          media.playbackState = 'none';
        }
        setState('silent');
      }),
    );
    // the tape loops by itself, so this should not come; if a browser ends it all the same, it is asked for again, on the clock
    tape.addEventListener('ended', mine(tune));
    tune();
  }, []);

  const toggle = useCallback(() => {
    if (tapeRef.current) turnOff();
    else turnOn(); // from `off`, and from `silent`: pressing again listens for the band once more
  }, [turnOff, turnOn]);

  // the lock screen and the headphones: Pause is the radio's off, Play is its on while it is still held (one switch, one meaning)
  const held = state !== 'off' && state !== 'silent';
  useEffect(() => {
    const media = session();
    if (!media || !held) return;
    media.setActionHandler('play', () => void tapeRef.current?.play().catch(() => undefined));
    media.setActionHandler('pause', turnOff);
    media.setActionHandler('stop', turnOff);
    return () => {
      media.setActionHandler('play', null);
      media.setActionHandler('pause', null);
      media.setActionHandler('stop', null);
    };
  }, [held, turnOff]);

  // a safety net for phones: a tape the system paused while the page was away plays again when the visitor comes back, on the clock, which kept going
  useEffect(() => {
    const back = () => {
      const tape = tapeRef.current;
      if (document.visibilityState !== 'visible' || !tape || !tape.paused || !tape.getAttribute('src')) return;
      void tape
        .play()
        .then(() => rejoin(tape, START_DRIFT_S))
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);

  // the page goes (the visit ends, the tab closes): the tape is put down
  useEffect(() => () => {
    const tape = tapeRef.current;
    tapeRef.current = null;
    if (tape) {
      tape.pause();
      tape.removeAttribute('src');
    }
  }, []);

  return { state, toggle };
}
