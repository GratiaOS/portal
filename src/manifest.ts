// The portal as an app on a home screen: what the browser reads to offer to install it. It is made when asked, from the config, so that
// each portal has its own name and two on one phone are two apps (they are two origins, and the manifest of each says its own).

export const DEFAULT_NAME = 'El portal';

/** The ground and the bar of the installed app, until the page tells the browser what the look in use is. */
export const THEME = '#0d1b22';

export type Manifest = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

export function manifestFor(name: string | undefined): Manifest {
  const full = name ?? DEFAULT_NAME;
  return {
    id: '/',
    name: full,
    // a name under an icon is cut by the phone at about twelve characters: say it short ourselves
    short_name: full.length > 12 ? full.slice(0, 12).trimEnd() : full,
    description: `${full}: a calm room for talking`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME,
    theme_color: THEME,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
