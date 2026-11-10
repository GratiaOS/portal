import type { Strings } from '../lib/strings.ts';

/**
 * What a visitor finds at the top of the room, three lines for someone who has just come in and knows nothing: the whisper of the place,
 * that nothing follows them (and that everything fades, when the portal says after how long), and that nothing is asked of them. No
 * instructions, no link, nothing about the companion: they find what they need when they are ready for it. It is made here, on the
 * visitor's page, and the portal knows nothing of it: it is no turn, it is kept nowhere, and it does not fade with the trail. As the
 * room fills it is left behind, above, where the log scrolls away from it.
 */
export default function GuestWelcome({ trailMinutes, t }: { trailMinutes: number | undefined; t: Strings }) {
  return (
    <section data-part="welcome" aria-label={t.guestWelcome}>
      <p data-part="welcome-whisper">{t.guestWelcome}</p>
      <ul data-part="welcome-map">
        <li>{t.guestFade(trailMinutes)}</li>
        <li>{t.guestRest}</li>
      </ul>
    </section>
  );
}
