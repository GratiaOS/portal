# RFC: Drop — a room of drops, answered by a frequency

**Status**: Draft
**Scope**: `portal` — a new room type `drop`; one ingest route; the Firegate view as the sender and the reader
**Depends on**: rooms and turns (`src/domain.ts`), bearer tokens (`src/tokens.ts`), the live stream (`/api/stream`), forgetting by time (`retention`, guests' `forgetAfterMinutes`)

---

## 1. Summary

A bottle thrown into the sea needs a way to be answered without a return address
on file. A `drop` room holds short-lived packets addressed to a **frequency**
(`36.9`). A packet may carry the frequency it came from; when it does, the
reader gets a Reply, which is one more packet sent to that frequency.

No thread, no registry. A reply is a packet. A packet fades.

Two worlds, one seam between them:

* **Who has a key is in the portal.** They write, read and answer on frequencies
  there. The key is their bearer token.
* **Who has none uses another channel.** Amigo seals a signal and hands over a
  **link** (`@garden`, as it does today). It never speaks to a portal.

```
 with a key                                          without one
 ──────────                                          ───────────
 Firegate view (write, read, Reply) ─┐               amigo.sh (SEAL)
 a CLI, later ───────────────────────┴─▶ POST /api/drops/ingest        │
                                              │                        ▼
                                              ▼               Share / Copy: a link,
                                        drop room (freq)      by any other channel
                                              │
                          quiet ping ◀────────┤
                          the list, opened one by one
                          Reply (only if the packet has `from`) ─▶ ingest
```

Amigo does not call the portal. The portal does not call Amigo.

---

## 2. Naming

| Word | Means |
| --- | --- |
| `freq` | the address: `36.9`. Where a packet is delivered. |
| `type: drop` | how a room behaves, and what a packet in it is: receive-only, a fade on every packet, a Reply only when there is a `from`. (`type: chat` is how `PlazaDelSol` behaves.) |
| `@garden` | the callsign Amigo already puts on every link. Not a frequency: *a link*. Unrelated to the portal. |
| the view | what a person opens to read a drop room: a list, one packet at a time. |

The room says *where*, the type says *how*. A third type later is a new type, not
a new route. The route is named for the type (`/api/drops`), not for the first
thing it was imagined to carry; `/api/rooms` is plural, so this is too.

---

## 3. Principles

| Principle | Consequence |
| --- | --- |
| No registry | Nothing remembers who wrote to whom. A reply creates no thread and no relation. |
| Fade by default | Every packet has a TTL; after it, nothing is left to recover. |
| Receive-only box | The view is a box, not a chat: no typing indicators, no read receipts, no "seen". |
| A key opens a door; no key leaves another | Who knows, knows. Without a key the signal goes by a link, outside the portal. |
| The ping is mute | The live stream says only *something arrived on this frequency*. Never the text, never the sender. |

---

## 4. The packet

Sent by a client with a key:

```json
{
  "to": "36.9",
  "fade": "7d",
  "payload": { "body": "Coffee tonight?" }
}
```

| Field | Rule |
| --- | --- |
| `to` | required; `^\d{1,3}\.\d$`; the frequency of the room it lands in |
| `fade` | optional; `^\d+(m\|h\|d)$`; default `7d`; capped by the portal (default maximum `30d`) |
| `payload.body` | required; a string, at most 32 KB, like a room message |
| `payload.kind` | optional; default `"note"` (text or markdown). Reserved for later (a patch, an invite, a JSON object) so the route does not change when something new is carried. A `kind` a client does not know is shown as plain text, and never blocks the room. |
| `answer` | optional `true`; set only by the view's own Reply (§8) |

The route is the `drop` type, so the body does not repeat it. A packet read back
carries `type: "drop"`, `from` (when it has one) and `fadesAt`, all set by the
portal.

`from` is **never taken from the client**. The portal sets it, from the
frequency the token's owner holds, and only when the packet is an `answer`. A
person cannot claim a frequency that is not theirs.

A packet to a frequency nobody holds is accepted and fades. The portal never
checks that anyone listens.

---

## 5. The key, and the one door

The key is a **bearer token** of a participant of the portal, the same one
`Authorization: Bearer <token>` already means in `docs/api.md`. There is no
second secret, no signature and no timestamp to check.

```
POST /api/drops/ingest
Authorization: Bearer <token>
Content-Type: application/json
```

* Refusals as everywhere in the API: `401` no good token, `400` bad input,
  `413` over 32 KB, `429` too many (the per-person message limit applies).
* **Same-origin only.** The route sends no CORS header, as nothing else in the
  API does. A page on another origin, `amigo.sh` included, cannot call it from a
  browser; this is on purpose, so that no token ever lives on a page that is not
  the portal's own, and no portal has to name outsiders.
* A person with no token sends nothing here. Their way out is the link (§9).

---

## 6. Storage

Drops live in the portal's own store (the Durable Object `Portal` with SQLite on
Cloudflare, SQLite on Node), as turns in a conversation of type `drop`, with one
addition: a `fadesAt` on each turn.

* **Read-time purge.** Every read of a drop room first removes what has
  `fadesAt < now`, then answers with what is left. A packet that has faded is never
  returned, even if nothing has swept it yet.
* **Passive sweep.** The object's alarm (already used for retention and for
  forgetting guests) is set to the nearest `fadesAt`, and clears the room when it
  fires. When nobody reads, the box still empties.
* **Global retention does not keep drops.** `retention.days` and
  `retention.messages` apply to `chat`; a `drop` turn lives for its own `fade` and
  no longer.

---

## 7. The quiet ping

When a packet is accepted, the live stream (`/api/stream`) emits one event:

```
event: drop
data: { "freq": "36.9" }
```

Nothing else: no text, no sender, no count. The client lights a small mark beside
the view. Opening the view and reading is what makes it go out; nothing is
recorded about it having been seen.

---

## 8. Reading and Reply

`GET /api/drops?freq=36.9` (bearer) → `{ drops: [{ id, type, payload, from?, fadesAt }] }`.

A frequency is **held** by a participant: the config names it (`freq` on a
participant). Only its holder reads it; anyone else gets `403`. Without this, an
address would be a public board.

The view is a list, and a packet is opened one at a time. A packet shows its
payload and no sender: a person who wants to be known signs the text, as in
`PlazaDelSol` (`- rdm`). It shows no `from` either, only whether a Reply exists.

### Reply

Reply appears on a packet only when it has a `from`. A click opens the same box a
person writes in, with the destination already filled; sending posts to
`/api/drops/ingest` with `to = from` and `answer: true`. The portal then sets the
new packet's `from` to the frequency the replier holds, so the answer can be
answered, as long as both want to. Nothing links the two packets after they are
sent.

A packet with no `from` is read and fades. That is the whole of it.

---

## 9. Amigo

Amigo is not part of this protocol. It keeps its link flow exactly as it is
(`Seal → Share / Copy`, `POST /api/dispatch`, one-time read, burn, its own Reply
by `reply_to`, `docs/worker-semantics.md`), and its `FREQ: @garden` stays the
callsign of a link.

* A signal reaches a person with a key the way it reaches anyone else: they are
  handed the link, on any channel, and open it.
* Amigo has no key, holds no frequency, sends nothing to a portal and reads
  nothing from one. There is no Amigo code in this RFC to build.
* Amigo's Reply and the portal's are different things and stay apart. Amigo's
  deletes the original and opens Home with an answer addressed to it, link to link.
  The portal's sends a packet to a frequency. They share no code and no state.

Someone who writes only in Amigo is answered by whatever channel their link went
on.

---

## 10. What this does not do

* No threads, no "conversation with X", no history beyond a packet's own fade.
* No delivery guarantee: a packet to a frequency nobody holds is accepted and fades.
* No sender identity beyond what the text says and what `from` allows.
* No push notification with content.
* No path from Amigo to a portal: not a browser call, not a Worker proxy, not a token issued to Amigo.
* No payload kinds beyond `note` yet; `kind` is a place kept for them.

---

## 11. Open questions

1. **`kind` and `type` in code.** The portal's room field is `kind` (`'team' | 'guest'`, `src/authority.ts`), and this RFC puts a `kind` in the payload. Two things with one name in one codebase. Either the room field is renamed `type` and `drop` joins it, or the payload's word changes. Decide before the first line of code.
2. **Where a frequency is held.** A `freq` on a participant is the least that
   works. Whether one person holds several, and whether a team may share one, is
   not decided.
3. **A `from` on a new drop.** Here `from` is set only for a Reply. A new drop
   written in the view by someone with a key would have none, so the first
   packet between two people with keys could not be answered. Whether anything
   sent from the view should carry `from` is a choice to make, not to find later.
4. **A token for a CLI.** There is no CLI in the repositories (`amigo-fm` is the
   FM band, not a sender). If one comes it is another client of §5 with a token in
   its config; a token that may write and may not read would make a stolen one
   worth much less. Not designed.
5. **Rate.** The per-person message limit applies. A frequency that receives from
   many people may need its own ceiling.
