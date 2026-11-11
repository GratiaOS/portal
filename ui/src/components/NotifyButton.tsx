import { useState } from 'react';
import type { Strings } from '../lib/strings.ts';

const supported = () => typeof Notification !== 'undefined';

/**
 * Asks once to be allowed to notify. The browser's answer stays in view, not gone: yes says what the notices are for (a
 * mention), and no says where to turn them on, since the browser will not ask again. Where there is no way to notify, nothing.
 */
export default function NotifyButton({ t }: { t: Strings }) {
  const [permission, setPermission] = useState(() => (supported() ? Notification.permission : undefined));
  if (permission === undefined) return null;
  if (permission === 'granted') return <p data-part="install-hint">{t.notifyAbout}</p>;
  if (permission === 'denied') return <p data-part="install-hint">{t.notifyDenied}</p>;
  return (
    <button
      type="button"
      onClick={() => void Notification.requestPermission().then(setPermission, () => setPermission('denied'))}
      data-part="notify"
    >
      {t.notifyOn}
    </button>
  );
}
