import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { nameThePage } from './lib/identity.ts';
import { chosenSkin, showSkin } from './lib/skin.ts';

// the look this person chose last time, before the first paint (the page itself starts in the default one)
showSkin(chosenSkin());

// the name of this portal, where the tab and the home screen say it
void nameThePage();

// the installed app keeps the shell of the page (public/sw.js); not while developing, where a kept file would hide a change
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
