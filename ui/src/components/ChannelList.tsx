/**
 * 🗿 trace
 * Name from:  new. The rooms of the family's Fam Jam ("Car", "Kitchen", "Firecircle") are the doorways it came from.
 * Path:       https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ui/src/flows/communication/FamJamPad.tsx
 * Same idea:  a place is a room you step into; which one you are in is the only thing that changes how the page reads.
 * Different:  channels come from the room's config, not from a list in the code, and they hold what is said, not pulses.
 * Not copied: written new for Room (MPL-2.0); M3's UI is Apache-2.0.
 */
import { startsWithPicture } from '../lib/format.ts';
import type { Conversation } from '../lib/types.ts';

/** The box of drops one holds, as one more entry after the rooms: it is a place to step into, and it is not a room. `fresh` is the quiet mark that something came. */
export type DropEntry = { title: string; current: boolean; fresh: boolean; freshLabel: string; onSelect: () => void };

export default function ChannelList({ channels, selected, onSelect, label, drops }: { channels: Conversation[]; selected: string | undefined; onSelect: (id: string) => void; label: string; drops?: DropEntry }) {
  return (
    <nav aria-label={label} data-part="channel-list">
      {channels.map((channel) => {
        const here = channel.id === selected;
        return (
          <button
            key={channel.id}
            type="button"
            aria-current={here ? 'true' : undefined}
            onClick={() => onSelect(channel.id)}
            data-part="channel"
          >
            {!startsWithPicture(channel.title) && (
              <>
                <span data-part="hash">#</span>{' '}
              </>
            )}
            {channel.title}
          </button>
        );
      })}
      {drops && (
        <button type="button" aria-current={drops.current ? 'true' : undefined} onClick={drops.onSelect} data-part="channel">
          {drops.title}
          {drops.fresh && <span role="img" aria-label={drops.freshLabel} data-part="channel-new" />}
        </button>
      )}
    </nav>
  );
}
