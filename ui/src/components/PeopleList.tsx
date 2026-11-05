/**
 * 🗿 trace
 * Name from:  new. Firegate's `PresenceCounter` ("N souls present") is the nearest thing it has.
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/presence/PresenceCounter.tsx
 * Same idea:  who is in the room is told quietly, in the margin, and a room with only you in it says nothing about it.
 * Different:  it names people instead of counting them, in an order that does not move when someone comes or goes
 *             (only their dot changes), and it never says when.
 * Not copied: written new for Room (MPL-2.0); Firegate is AGPL-3.0.
 */
import PresenceDot from './PresenceDot.tsx';
import type { CSSProperties } from 'react';
import { bearingOf } from '../lib/people.ts';
import type { Person } from '../lib/people.ts';
import type { Strings } from '../lib/strings.ts';

export default function PeopleList({ people, meId, thinking, spoke, arrived, t }: { people: Person[]; meId: string | undefined; thinking: ReadonlySet<string>; spoke: ReadonlySet<string>; arrived: ReadonlySet<string>; t: Strings }) {
  return (
    <section aria-label={t.people} data-part="people">
      <h3 data-part="label">
        {t.people}
      </h3>
      <ul data-part="people-list">
        {people.map(({ participant, here }) => (
          <li
            key={participant.id}
            data-part="person"
            data-here={here ? '' : undefined}
            data-thinking={thinking.has(participant.id) ? '' : undefined}
            data-spoke={spoke.has(participant.id) ? '' : undefined}
            data-arrived={arrived.has(participant.id) ? '' : undefined}
            style={{ '--angle': bearingOf(participant.id).angle, '--ring': bearingOf(participant.id).ring } as CSSProperties}
          >
            <PresenceDot here={here} label={`${participant.alias} ${here ? t.here : t.notHere}`} />
            <span data-part="person-name">
              {participant.alias}
              {participant.sign && <span data-part="sign">{participant.sign}</span>}
            </span>
            {participant.id === meId && <span data-part="sr-only"> ({t.here})</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
