import { useEffect, useState } from 'react';
import { DEFAULT_SKIN, SKINS, chooseSkin, chosenSkin, isBuiltIn, showSkin } from '../lib/skin.ts';
import type { Chosen } from '../lib/skin.ts';
import type { Strings } from '../lib/strings.ts';
import type { SkinInfo } from '../lib/types.ts';

/**
 * The looks the page can have, one button each: the ones it has built in, then those from the room's skins folder (`extra`,
 * which is `undefined` until the room has said). The one on is pressed. Someone's choice stays with their browser; one the room
 * no longer has is let go of, and the page goes back to the first.
 */
export default function SkinSwitch({ t, extra }: { t: Strings; extra: SkinInfo[] | undefined }) {
  const [current, setCurrent] = useState<Chosen>(chosenSkin);

  useEffect(() => {
    if (!extra || isBuiltIn(current.id)) return;
    const found = extra.find((skin) => skin.id === current.id);
    if (!found) {
      showSkin({ id: DEFAULT_SKIN });
      setCurrent({ id: DEFAULT_SKIN });
    } else if ((found.extends ?? undefined) !== current.base) {
      const next: Chosen = { id: found.id, ...(isBuiltIn(found.extends) ? { base: found.extends } : {}) };
      chooseSkin(next);
      setCurrent(next);
    }
  }, [extra, current]);

  const choose = (next: Chosen) => {
    chooseSkin(next);
    setCurrent(next);
  };

  return (
    <div role="group" aria-label={t.skin} data-part="skin-switch">
      {SKINS.map(({ id, emoji }) => (
        <button key={id} type="button" aria-pressed={current.id === id} aria-label={t.skinNames[id]} title={t.skinNames[id]} onClick={() => choose({ id })} data-part="skin-option">
          {emoji}
        </button>
      ))}
      {(extra ?? []).map((skin) => (
        <button
          key={skin.id}
          type="button"
          aria-pressed={current.id === skin.id}
          aria-label={skin.name}
          title={skin.name}
          onClick={() => choose({ id: skin.id, ...(isBuiltIn(skin.extends) ? { base: skin.extends } : {}) })}
          data-part="skin-option"
        >
          {skin.emoji ?? '◻︎'}
        </button>
      ))}
    </div>
  );
}
