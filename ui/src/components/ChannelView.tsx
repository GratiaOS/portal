/**
 * 🗿 trace
 * Name from:  Firegate `MemoryPool`, the whole surface: the stream of messages above, the place to write below.
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx
 * Same idea:  one calm surface with the conversation on top and the box at the bottom, nothing else asking for attention.
 * Different:  the surface is a channel of a room, with a title and the connection in its header; there is no
 *             ambient colour that follows the mood of the last answer. Named for what it is now: a channel.
 * Not copied: written new for Room (MPL-2.0); Firegate is AGPL-3.0.
 */
import MemoryStream from './MemoryStream.tsx';
import SeedPortal from './SeedPortal.tsx';
import SignalQuality from './SignalQuality.tsx';
import type { Connection } from '../lib/client.ts';
import type { Row } from '../lib/format.ts';
import type { Strings } from '../lib/strings.ts';

export default function ChannelView(props: {
  channelId: string;
  /** The names of all the channels, so that `#general` in a message is not taken for a tag. */
  channelIds: string[];
  title: string;
  rows: Row[];
  meId: string | undefined;
  hasMore: boolean;
  loading: boolean;
  onOlder: () => void;
  onSend: (text: string) => Promise<void>;
  note: string;
  /** Said under the box all the time: in the guest room, who reads what is written there. */
  notice?: string;
  /** In the guest room: the whisper of the place, said where the room is empty, in place of the plain note. */
  welcome?: string;
  /** What the box says while it is empty. */
  whispers: string[];
  /** Names of those working on an answer in this channel. */
  thinking: string[];
  connection: Connection;
  t: Strings;
}) {
  const { channelId, channelIds, title, rows, meId, hasMore, loading, onOlder, onSend, note, notice, welcome, whispers, thinking, connection, t } = props;
  return (
    <section aria-label={title} data-part="channel-view">
      <header data-part="channel-head">
        <h2 data-part="channel-title">
          <span data-part="hash">#</span> {title}
        </h2>
        <SignalQuality connection={connection} t={t} />
      </header>
      <MemoryStream rows={rows} meId={meId} channelIds={channelIds} hasMore={hasMore} loading={loading} onOlder={onOlder} thinking={thinking} welcome={welcome} t={t} />
      <SeedPortal key={channelId} channel={channelId} onSend={onSend} note={note} notice={notice} whispers={whispers} t={t} />
    </section>
  );
}
