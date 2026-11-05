import { useState } from 'react';
import LoginGate from './components/LoginGate.tsx';
import ParticleField from './components/ParticleField.tsx';
import { Room } from './Room.tsx';
import { forgetDrafts } from './lib/drafts.ts';
import { forgetToken, keepToken, readToken } from './lib/session.ts';

export default function App() {
  const [token, setToken] = useState(readToken);

  return (
    <div data-part="app">
      <ParticleField />
      <div data-part="stage">
        {token ? (
          <Room
            token={token}
            onSignOut={() => {
              forgetToken();
              forgetDrafts(); // what was being written goes with the person who was writing it
              setToken(undefined);
            }}
          />
        ) : (
          <LoginGate
            onEnter={(entered) => {
              keepToken(entered);
              setToken(entered);
            }}
          />
        )}
      </div>
    </div>
  );
}
