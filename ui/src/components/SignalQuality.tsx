/**
 * 🗿 trace
 * Name from:  Firegate `SignalQuality`, a small pulsing dot and a few words about how clear the line is.
 * Path:       https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/features/Firegate/components/SignalQuality.tsx
 * Same idea:  the state of the connection is told quietly, in the corner, by a dot that breathes.
 * Different:  it reports the stream to the room (connected, reconnecting, session ended), not the tone of a message,
 *             and it has no red: a connection that drops is a pause, not a fault. No percentage, no triple tap.
 * Not copied: written new for Room (MPL-2.0); Firegate is AGPL-3.0.
 */
import type { Connection } from '../lib/client.ts';
import type { Strings } from '../lib/strings.ts';

export default function SignalQuality({ connection, t }: { connection: Connection; t: Strings }) {
  const words = connection === 'live' ? t.live : connection === 'refused' ? t.refused : t.reconnecting;
  return (
    <span role="status" data-part="signal" data-connection={connection}>
      <span aria-hidden data-part="signal-dot" />
      {words}
    </span>
  );
}
