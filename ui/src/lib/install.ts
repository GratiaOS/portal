import { useEffect, useState } from 'react';
import { isStandalone } from './session.ts';

/** The event a browser (Chrome, Edge, Android) gives when the portal can be offered as an app; it holds the question to ask. */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/** An iPhone or an iPad (the iPad says it is a Mac), where an app is added by the Share sheet and no event is given. */
export function isIosDevice(userAgent: string, platform: string, touchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1);
}

export type Install = {
  /** The browser can ask now: show the button. */
  canPrompt: boolean;
  ask: () => Promise<void>;
  /** On iOS Safari, in a tab: say how to add it. */
  showIosHint: boolean;
  /** Running as the installed app already. */
  installed: boolean;
};

export function useInstall(): Install {
  const [prompt, setPrompt] = useState<InstallPrompt | undefined>(undefined);
  const [installed, setInstalled] = useState(isStandalone);
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault(); // the browser's own bar is not shown: the button is
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setPrompt(undefined);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const ios = typeof navigator !== 'undefined' && isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  return {
    canPrompt: prompt !== undefined && !installed,
    ask: async () => {
      if (!prompt) return;
      await prompt.prompt();
      await prompt.userChoice.catch(() => undefined);
      setPrompt(undefined); // an event can be used once
    },
    showIosHint: ios && !installed,
    installed,
  };
}
