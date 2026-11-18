# RFC: Drop — a room of drops, answered by a frequency

**Status**: Draft
**Scope**: `portal` — a new room type `drop`; one ingest route; Amigo web as the sender
**Depends on**: rooms and turns (`src/domain.ts`), bearer tokens (`src/tokens.ts`), the live stream (`/api/stream`), forgetting by time (`retention`, guests' `forgetAfterMinutes`)

---

## 1. Summary

A bottle thrown into the sea needs a way to be answered without a return address
on file. A `drop` room holds short-lived packets addressed to a **frequency**
(`36.9`). A packet may carry the frequency it came from; when it does, the
reader gets a Reply, which is one more packet sent to that frequency.

No thread, no registry. A reply is a packet. A packet fades.

Amigo is where a signal is written. It has two channels, and they are an AND, not
an OR:

* **a link** (`@garden`, what Amigo does today): the signal is handed over
  outside, by any other channel (a message app, a note). No key needed.
* **a frequency** (`36.9`): the same sealed signal goes into a drop room of a
  portal. Needs a key (§5).

```
Amigo web (SEAL) ─┬─ Share / Copy ─▶ a link, as today (@garden)
                  └─ Send to 36.9 ─▶ POST /api/mailpost/ingest ─▶ drop room ─▶ quiet ping
                                                                       │
                       Firegate: the list, opened one by one ◀─────────┘
                                 Reply (only if the packet has `from`) ─▶ ingest
```

Amigo does not read, hold a frequency, or listen. Reading and answering happen
only in the portal.

---

## 2. Naming

| Word | Means |
| --- | --- |
| `freq` | the address: `36.9`. Where a packet is delivered. |
| `type: drop` | how a room behaves: receive-only, a fade on every packet, a Reply only when there is a `from`. (`type: chat` is how `PlazaDelSol` behaves.) |
| `@garden` | the callsign Amigo already puts on every link. Here it means: *no frequency, a link*. |
| the view | what a person opens to read a drop room (a list, one packet at a time). |

The room says *where*, the type says *how*. A third type later is a new type, not
a new route.

> Open: in code the portal's room field is `kind` (`'team' | 'guest'`, `src/authority.ts`). `drop` joins that list, or the field is renamed `type`. The route is still named `mailpost`; whether it follows the type (`/api/drop`) is open too. See §11.

---

## 3. Principles

| Principle | Consequence |
| --- | --- |
| No registry | Nothing remembers who wrote to whom. A reply creates no thread and no relation. |
| Fade by default | Every packet has a TTL; after it, nothing is left to recover. |
| Receive-only box | The view is a box, not a chat: no typing indicators, no read receipts, no "seen". |
| A key opens a door; no key leaves another | Without a key the signal goes by a link. With one, both. |
| The ping is mute | The live stream says only *something arrived on this frequency*. Never the text, never the sender. |

---

## 4. The packet

Sent by the client:

```json
{ "to": "36.9", "text": "Coffee tonight?", "fade": "7d" }
```

| Field | Rule |
| --- | --- |
| `to` | required; `^\d{1,3}\.\d$`; the frequency of the room it lands in |
| `text` | required; at most 32 KB, like a room message |
| `fade` | optional; `^\d+(m\|h\|d)$`; default `7d`; capped by the portal (default maximum `30d`) |
| `answer` | optional `true`; set only by the portal's own Reply button (§8) |

Kept by the portal on the packet: `from` and `fadesAt`.

`from` is **never taken from the client**. The portal sets it, from the
frequency the token's owner holds, and only when the packet is an `answer`. A
packet written in Amigo has no `from`, so it has no Reply. A person cannot claim
a frequency that is not theirs.

A packet to a frequency nobody holds is accepted and fades. The portal never
checks that anyone listens.

---

## 5. The key, and the one door

The key is a **bearer token** of a participant of the portal, the same one
`Authorization: Bearer <token>` already means in `docs/api.md`. There is no
second secret, no signature and no timestamp to check: a token is the person's,
it is held on their device, and it is what they would use to open the portal
itself.

```
POST /api/mailpost/ingest
Authorization: Bearer <token>
Content-Type: application/json
```

* Refusals as everywhere in the API: `401` no good token, `400` bad input,
  `413` over 32 KB, `429` too many (the per-person message limit applies).
* A person with no token sends nothing here. Their way out is the link (§9).

### CORS: one route, nothing wider

Amigo web calls the portal **from the browser**, so the token stays on the
device and the Amigo Worker never sees it or the packet. For that, and only for
that, the route answers cross-origin:

* `mail.allowOrigins` in the portal's config: a list of exact origins
  (`"https://amigo.sh"`). **Empty by default**: with nothing in it the route
  sends no CORS header at all, and the portal behaves as it does today.
* The match is exact on `Origin`. No `*`, no pattern, no suffix.
* `OPTIONS /api/mailpost/ingest` (preflight) answers `204` with
  `Access-Control-Allow-Origin: <that origin>`, `Access-Control-Allow-Methods:
  POST, OPTIONS`, `Access-Control-Allow-Headers: authorization, content-type`,
  `Access-Control-Max-Age: 600` and `Vary: Origin`; for an origin not in the
  list, no CORS header and no more than a plain `403`.
* The `POST` answer carries the same two headers (`Allow-Origin`, `Vary`).
* No `Access-Control-Allow-Credentials`: the token goes in the header, never in a
  cookie.
* Every other route of the API stays same-origin. This list belongs to this
  route and is not a policy of the portal.

What this costs, said plainly: the token lives in `amigo.sh`'s page storage, so a
script injected into `amigo.sh` could read it. That is the price of the Worker
never holding it; the key is the person's own, and it can be changed.

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

## 8. Reading and Reply: only in the portal

`GET /api/mailpost?freq=36.9` (bearer) → `{ drops: [{ id, text, from?, fadesAt }] }`.

A frequency is **held** by a participant: the config names it (`freq` on a
participant). Only its holder reads it; anyone else gets `403`. Without this, an
address would be a public board.

The view is a list, and a packet is opened one at a time. A packet shows its text
and no sender: a person who wants to be known signs the text, as in `PlazaDelSol`
(`- rdm`). It shows no `from` either, only whether a Reply exists.

### Reply

Reply appears on a packet only when it has a `from`. A click opens the same box a
person writes in, with the destination already filled; sending posts to
`/api/mailpost/ingest` with `to = from` and `answer: true`. The portal then sets
the new packet's `from` to the frequency the replier holds, so the answer can be
answered, as long as both want to. Nothing links the two packets after they are
sent.

A packet with no `from` is read and fades. That is the whole of it.

---

## 9. Amigo

Amigo keeps its link flow as it is (`Seal → Share / Copy`, `POST /api/dispatch`,
one-time read, burn, its own Reply by `reply_to`, `docs/worker-semantics.md`). Two
things are added, both in the page:

* **The channel is the `FREQ` of the header.** Today it shows `@garden` and means
  nothing but the callsign of the link. Changed to a frequency, it names the
  portal's room the signal goes to.
* **Send to a frequency**, next to `Share` and `Copy`, on the same sealed signal.
  It exists only when a key is saved on the device (`app/lib/saved.ts`): the page
  posts directly to the portal (§5). With no key, only the link exists.

Which portal: an endpoint saved with the key (default `https://firegate.space`). A
portal that does not list `https://amigo.sh` in `mail.allowOrigins` refuses the
browser, and Amigo says so.

The two Replies are different things and stay apart. Amigo's deletes the original
and opens Home with an answer addressed to it, link to link. The portal's sends a
packet to a frequency. They share no code and no state.

An Amigo-only sender (no key) cannot be answered through a portal. They are
answered by whatever channel the link went on.

There is no Amigo CLI in the repositories today (`amigo-fm` is the FM band). If
one comes, it is one more client of §5 with a token in its config.

---

## 10. What this does not do

* No threads, no "conversation with X", no history beyond a packet's own fade.
* No delivery guarantee: a packet to a frequency nobody holds is accepted and fades.
* No sender identity beyond what the text says and what `from` allows.
* No push notification with content.
* No reading from Amigo, and no token issued to Amigo by a portal.
* No payload kinds beyond text yet. A `kind` and an opaque body can be added later
  without changing the route; it is left out until something needs it.

---

## 11. Open questions

1. **`kind` or `type`, and the route's name.** The portal's field is `kind`; the
   messages and this RFC say `type`. The route is `mailpost`, the type is `drop`.
   Decide the words before the first line of code.
2. **Where a frequency is held.** A `freq` on a participant is the least that
   works. Whether one person holds several, and whether a team may share one, is
   not decided.
3. **A `from` for a packet that Amigo sends with a key.** With a token the
   portal could attach the holder's frequency, and Amigo would send answerable
   packets. This RFC does not: `from` is only for a Reply from the portal. It
   should be decided as a choice, not found by accident.
4. **How the token reaches `amigo.sh`.** Pasted once and saved on the device is
   the least. A portal that offers a way to make a sending-only token (it
   writes, it cannot read) would make a stolen one worth much less. Not designed.
5. **Rate.** The per-person message limit applies. A frequency that receives from
   many people may need its own ceiling.
