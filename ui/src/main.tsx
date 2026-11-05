import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { chosenSkin, showSkin } from './lib/skin.ts';

// the look this person chose last time, before the first paint (the page itself starts in the default one)
showSkin(chosenSkin());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
