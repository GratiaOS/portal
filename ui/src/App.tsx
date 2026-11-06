import { useCallback, useEffect, useRef, useState } from 'react';
import LoginGate from './components/LoginGate.tsx';
import type { GuestDoor } from './components/LoginGate.tsx';
import ParticleField from './components/ParticleField.tsx';
import { Room } from './Room.tsx';
import { forgetDrafts } from './lib/drafts.ts';
import { isGuestPath, opensToGuests, stepThrough } from './lib/guest.ts';
import { forgetGuest, forgetToken, keepGuest, keepToken, readGuest, readToken } from './lib/session.ts';

export default function App() {
  const [token, setToken] = useState(readToken);
  // a visit that ends is told as ending, on the gate it returns to; a key that is wrong is not
  const [ended, setEnded] = useState(false);

  // the door for visitors: the link `/guest` steps through by itself and asks for nothing; elsewhere the gate offers it only if the portal has one
  const byLink = isGuestPath(location.pathname);
  const [opens, setOpens] = useState(byLink);
  const [door, setDoor] = useState<GuestDoor['state']>('idle');
  useEffect(() => {
    if (token || byLink) return;
    let cancelled = false;
    void opensToGuests().then((found) => !cancelled && setOpens(found));
    return () => {
      cancelled = true;
    };
  }, [token, byLink]);

  const step = useCallback(async () => {
    setDoor('stepping');
    setEnded(false);
    const result = await stepThrough();
    if (!result.ok) {
      setDoor(result.reason);
      return;
    }
    keepToken(result.entered.token);
    keepGuest();
    // the visit goes on at the root: a reload there reuses the key and does not make another guest
    if (byLink) history.replaceState(null, '', '/');
    setDoor('idle');
    setToken(result.entered.token);
  }, [byLink]);

  // arriving by the link opens the door once (a second run of the effect, in development, must not bring in a second guest)
  const arrived = useRef(false);
  useEffect(() => {
    if (!byLink || token || arrived.current) return;
    arrived.current = true;
    void step();
  }, [byLink, token, step]);

  const leave = (refused = false) => {
    setEnded(refused && readGuest());
    forgetToken();
    forgetGuest();
    forgetDrafts(); // what was being written goes with the person who was writing it
    setToken(undefined);
  };

  return (
    <div data-part="app">
      <ParticleField />
      <div data-part="stage">
        {token ? (
          <Room token={token} onSignOut={leave} />
        ) : (
          <LoginGate
            ended={ended}
            door={opens ? { state: door, onStep: () => void step(), only: byLink } : undefined}
            onEnter={(entered) => {
              keepToken(entered);
              setEnded(false);
              setToken(entered);
            }}
          />
        )}
      </div>
    </div>
  );
}
