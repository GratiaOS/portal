import { useState } from 'react';
import type { Strings } from '../lib/strings.ts';

const supported = () => typeof Notification !== 'undefined';

/** Asks once to be allowed to notify. Once the browser has an answer, yes or no, the button is gone. */
export default function NotifyButton({ t }: { t: Strings }) {
  const [permission, setPermission] = useState(() => (supported() ? Notification.permission : 'denied'));
  if (permission !== 'default') return null;
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
