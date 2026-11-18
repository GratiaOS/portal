# RFC: Mailpost — a room of mail, answered by a frequency

**Status**: Draft
**Scope**: `portal` — a new room type `mail`; one ingest endpoint; clients: Amigo web, Amigo CLI, the Reply button
**Depends on**: rooms and turns (`src/domain.ts`), the live stream (`/api/stream`), forgetting by time (`retention`, guests' `forgetAfterMinutes`)

---

## 1. Summary

A bottle thrown into the sea needs a way to be answered without a return address
on file. Mailpost is a room type, `mail`, that holds short-lived messages
addressed to a **frequency** (`99.9`). A message may carry an optional
`return_freq`; when it does, the receiver gets a Reply that is nothing more than
one more message sent to that frequency.

No account, no thread, no registry. A reply is a message. A message fades.

One endpoint, three clients:

```
Amigo web ─┐
Amigo CLI ─┼─▶ POST /api/mailpost/ingest ─▶ room (type mail, freq) ─▶ Mailpost view
Reply     ─┘                                       │
   ▲                                               └─▶ quiet ping (no text, no sender)
   └──────────── POST to return_freq ◀── Mailpost view
```

---

## 2. Naming

| Word | Means |
| --- | --- |
| `freq` | the address: `99.9`, `36.9`. Where a message is delivered. |
| `type: mail` | how a room behaves: receive-only, per-message TTL, Reply only when there is a `return_freq`. (`type: chat` is how `PlazaDelSol` behaves.) |
| Mailpost 📫 | the name of the view a person opens to read a room of type `mail`. Not a room, not a type. |

The room says *where*; the type says *how*; the view is what a person sees. A
third type later (a bulletin, say) is a new type, not a new endpoint.

> Open: in code the portal's room field is `kind` (`'team' | 'guest'`, `src/authority.ts`). `mail` joins that list, or the field is renamed `type`. See §10.

---

## 3. Principles

| Principle | Consequence |
| --- | --- |
| No registry | Nothing remembers who wrote to whom. A reply creates no thread and no relation. |
| Fade by default | Every message has a TTL (`fade`); after it, nothing is left to recover. |
| Receive-only box | The view is a mailbox, not a chat: no typing indicators, no read receipts, no "seen". |
| One contract | The endpoint is the protocol; Amigo web, CLI and Reply are three interfaces on it. One sending logic, not three. |
| The ping is mute | The live stream says only *something arrived on this frequency*. Never the text, never the sender. |

---

## 4. The packet

```json
{
  "freq": "36.9",
  "return_freq": "99.9",
  "text": "Coffee tonight?",
  "fade": "7d",
  "ts": 1794945480,
  "sig": "<hex hmac-sha256>"
}
```

| Field | Rule |
| --- | --- |
| `freq` | required; `^\d{1,3}\.\d$`; where it lands |
| `return_freq` | optional; same pattern; absent means pure broadcast, and the receiver sees no Reply |
| `text` | required; at most 32 KB, like a room message |
| `fade` | optional; `^\d+(m\|h\|d)$`; default `7d`; capped by the portal (default maximum `30d`) |
| `ts` | required; seconds since epoch |
| `sig` | required on the HMAC path (§5) |

`return_freq` is only a hint about where an answer may go. The portal never
checks that anyone listens there, and an answer to a frequency nobody holds
fades like anything else.

---

## 5. Authentication

Two doors, one handler.

1. **Bearer token** (what the portal already has): a participant of the portal
   posts with `Authorization: Bearer <token>`. This is the path of the Reply
   button, which is just the signed-in person sending a message.
2. **HMAC** (for clients with no token in this portal: Amigo web's Worker, the
   CLI): the packet carries `sig`, computed with the portal's mail secret:

```
sig = hmac_sha256(secret, `${freq}:${return_freq ?? ''}:${fade ?? ''}:${ts}:${text}`)
```

Rules:

* The comparison is constant-time.
* `|now - ts| <= 300` seconds, else `401`.
* **Replay inside the window.** A timestamp alone leaves five minutes in which an
  intercepted packet could be sent again. The portal keeps the `sig` of accepted
  packets for the length of the window (in memory, no table), and refuses a
  repeat with `409`. The memory is the window; it forgets with it.
* `text` is last in the signed string and the other fields have fixed shapes, so
  the fields cannot be shifted into one another.
* The secret belongs to the **portal**, not to a client. Whoever has it can post;
  the CLI keeps it in `~/.amigo/config`, a Worker keeps it as a secret. Rotating
  it is changing one value.

---

## 6. Storage

Mail lives in the portal's own store (the Durable Object `Portal` with SQLite on
Cloudflare, SQLite on Node), as turns in a conversation of type `mail`, with one
addition: a `fadesAt` on each turn.

* **Read-time purge.** Every `GET` of a mail room first removes what has
  `fadesAt < now`, then answers with what is left. A message that has faded is
  never returned, even if nothing has swept it yet.
* **Passive sweep.** The object's alarm (already used for retention and for
  forgetting guests) is set to the nearest `fadesAt`, and clears the room when it
  fires. When nobody reads, the box still empties.
* **Global retention does not keep mail.** `retention.days` and
  `retention.messages` apply to `chat`; a `mail` turn lives for its own `fade` and
  no longer.

---

## 7. The quiet ping

When a message is accepted, the live stream (`/api/stream`) emits one event:

```
event: mailpost
data: { "freq": "99.9" }
```

Nothing else: no text, no sender, no count. The client lights a small mark beside
Mailpost 📫. Opening the view and reading is what makes it go out; nothing is
recorded about it having been seen.

---

## 8. Reading

`GET /api/mailpost?freq=99.9` (bearer) → `{ mail: [{ id, text, return_freq?, fadesAt }] }`.

A frequency is **held** by a participant: the config names it (`freq` on a
participant). Only a holder reads that frequency's mail; a person who is not its
holder gets `403`. Without this, an address would be a public board.

A message shows its text and, if present, its `return_freq`. It shows no
sender: a person who wants to be known signs the text, as in `PlazaDelSol`
(`- rdm`).

### Reply

The Reply button appears on a message only when it has a `return_freq`. A click
opens a small box; sending posts to `/api/mailpost/ingest` with
`freq = return_freq` and `return_freq` set to the frequency the reader holds, so
the answer can be answered, as long as both want to. Nothing links the two
messages after they are sent.

---

## 9. Clients

### Amigo web

SEAL on a chosen frequency; the Worker signs the packet and posts it. If the
person has a frequency set locally, it is offered as `return_freq`; if not, the
message is a broadcast.

### Amigo CLI

`~/.amigo/config`, one flat file:

```ini
endpoint=https://firegate.space/api/mailpost/ingest
secret=...
freq=99.9
fade=7d
```

```bash
amigo send 36.9 "Got to the park"
cat note.md | amigo send 99.6 --fade 24h
```

`freq` in the config is the `return_freq` of what is sent. `amigo tune 99.9`
changes it.

### Reply

Not a client of Amigo. It is the portal's own page posting to its own endpoint
with the signed-in person's token.

---

## 10. Open questions

1. **`kind` or `type`.** The portal's field is `kind`; a message header and this
   RFC say `type`. Decide one word before the first line of code.
2. **Where a frequency is held.** A `freq` on a participant is the least that
   works. Whether one person may hold several, and whether a frequency may be
   shared by a team, is not decided.
3. **Anonymous reading.** Someone with `amigo.sh` and no token can send but not
   read. Is that enough, or is a one-time read link (the earlier `drop_id` idea)
   worth having? It would add exactly one thing that fades and nothing that
   persists.
4. **Replay memory on Cloudflare.** The in-memory set of `sig`s does not survive
   the object sleeping; a replay across a wake inside five minutes would pass. If
   that matters, keep the `sig`s in the object's storage with `fadesAt` like mail.
5. **Rate.** Ingest by HMAC bypasses the per-participant limit. It needs its own
   (per address, per frequency).

---

## 11. What this does not do

* No threads, no "conversation with X", no history beyond a message's own fade.
* No delivery guarantee: a message to a frequency nobody holds is accepted and fades.
* No sender identity beyond what the text says.
* No push notification with content.
