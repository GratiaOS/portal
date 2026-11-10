import { RUN_YOUR_OWN } from '../lib/links.ts';
import type { Strings } from '../lib/strings.ts';

/**
 * What a visitor finds at the top of the room: the whisper of the place and a little map for the first step. It is made here, on the
 * visitor's page, and the portal knows nothing of it: it is no turn, it is kept nowhere, and it does not fade with the trail. As the
 * room fills it is left behind, above, where the log scrolls away from it. What it says about the companion is only what the portal
 * told (her name, a question of the company's), and nothing when there is no companion.
 */
export default function GuestWelcome({ companion, example, trailMinutes, t }: { companion: string | null | undefined; example: string | undefined; trailMinutes: number | undefined; t: Strings }) {
  return (
    <section data-part="welcome" aria-label={t.guestWelcome}>
      <p data-part="welcome-whisper">{t.guestWelcome}</p>
      <ul data-part="welcome-map">
        <li>{t.guestMapSay}</li>
        {companion && <li>{t.guestMapAsk(companion, example)}</li>}
        {trailMinutes !== undefined && <li>{t.guestMapTrail(trailMinutes)}</li>}
        <li>
          {t.guestMapOwn}{' '}
          <a href={RUN_YOUR_OWN} target="_blank" rel="noreferrer noopener">
            {t.runYourOwn} ↗
          </a>
        </li>
      </ul>
    </section>
  );
}
