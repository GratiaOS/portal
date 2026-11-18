# RFC: Drop — a one-way box on a frequency

**Status**: Draft
**Scope**: `portal` — a new room type `drop`; one open ingest route; a read-only view
**Depends on**: the participants of the config, bearer tokens (`src/tokens.ts`), the per-address limiter of the guest door (`src/limiter.ts`), the live stream (`/api/stream`), forgetting by time (`retention`, guests' `forgetAfterMinutes`)

---

## 1. Summary

A bottle thrown into the sea. A `drop` room holds short-lived packets that
anyone can put on a **frequency** (`99.6`) without saying who they are, and that
only the frequency's holder can open. Opened or not, a packet fades.

The shape is small on purpose:

* **Writing is Amigo's, and open.** Amigo seals a signal and either hands over a
  link (`@garden`, as today) or drops it on a frequency. A drop has no sender, no
  `from`, no token.
* **Reading is the portal's, and needs a key.** The holder opens the box in the
  Firegate view: a list, one packet at a time, read-only. No Reply button, no
  thread.
* **An answer is a new drop.** Whoever wants one writes their own frequency in
  the text, as one signs with `- rdm`. The reader opens Amigo and drops a new
  packet there. The system keeps no link between the two.

```
 Amigo (SEAL)
   ├─ FREQ @garden ─▶ Share / Copy: a link, by any other channel   (as today)
   └─ FREQ 99.6 ────▶ POST /api/drops/ingest ──▶ drop room (99.6) ──▶ quiet ping
                       open, no key                    │
                                                        ▼
                           Firegate view, with the key: the list, opened one
                           by one, read-only, until it fades
```

---

## 2. Naming

| Word | Means |
| --- | --- |
| `freq` | the address: `99.6`. Where a packet is delivered. |
| `type: drop` | how a box behaves, and what a packet in it is: written by anyone, read by its holder, gone at its fade. (`type: chat` is how `PlazaDelSol` behaves.) It is a kind of thing the portal keeps, **not** a value of a room's `kind` (`team`, `guest`): a drop box is not a conversation. |
| holder | the one person named for a frequency in the config's `drops` block. One holder to a frequency, one frequency to a holder, in this first version. |
| `@garden` | the callsign Amigo already puts on every link. Not a frequency: *a link*. |
| the view | what a person with a key opens to read a drop room: a list, one packet at a time. |

The room says *where*, the type says *how*. The route is named for the type
(`/api/drops`), and plural because `/api/rooms` is.

---

## 3. Principles

| Principle | Consequence |
| --- | --- |
| No registry | Nothing remembers who wrote to whom. There is no sender to remember. |
| Fade by default | Every packet has a TTL; after it, nothing is left to recover. |
| One direction | Amigo writes, Firegate reads. No Reply, no thread, no "seen", no typing. |
| The key is for reading | Anyone may leave a packet; only the holder opens the box. |
| The ping is mute | The live stream says only *something arrived on this frequency*. Never the text. |

---

## 4. The packet

```json
{
  "to": "99.6",
  "fade": "7d",
  "payload": { "body": "Coffee tonight? - 36.9" }
}
```

| Field | Rule |
| --- | --- |
| `to` | required; `^\d{1,3}\.\d$`; the frequency of the room it lands in |
| `fade` | optional; `^\d+(m\|h\|d)$`; default `7d`; capped by the portal (default maximum `30d`) |
| `payload.body` | required; a string, at most 8 KB (`413` over) |
| `payload.format` | optional; default `"note"` (text or markdown). Reserved for later (a patch, an invite, a JSON object) so the route does not change when something new is carried. A `format` a client does not know is ignored: it shows `body` as plain text, and never blocks the room. |

There is no `from`, no sender, no `answer`. A packet read back carries `type:
"drop"`, `payload` and `fadesAt`, set by the portal.

---

## 5. The open door, and the key

### Writing: `POST /api/drops/ingest`

No token. Anyone who can reach the portal can drop a packet, which is what a
dead-drop is. There is no shared secret and no challenge in v1 (no Turnstile: it
would add an outside script to `amigo.sh` and break a plain `curl`). The limits
below are the only guards, and they are all the portal's own:

| Limit | Value | Over it |
| --- | --- | --- |
| body (`payload.body`) | 8 KB | `413` |
| rate per (address, frequency) | 15 a minute, burst 3 | `429` with `Retry-After` |
| rate per frequency | 60 a minute | `429` with `Retry-After` |
| packets alive in a room | 50 | the oldest is let go, the new one is kept |

These are the starting numbers, as agreed, not measured ones; each is a value in
the config and not a constant in the code.

* **A frequency that nobody holds takes nothing.** The portal answers every
  well-formed packet with the same `204` and an empty body, held or not, and
  writes it only when a participant holds `to`. So an unheld frequency costs no
  storage, and the answer does not say which frequencies exist. "Holds" means a
  participant is named for it in the config, not that someone has the page open: a
  drop for a holder who is away waits for them until it fades.
* **The rates count before the holder is looked up**, so a `429` does not tell
  held from unheld either.
* The address limiter is the guest door's (`src/limiter.ts`); the per-frequency
  one is the same kind of counter, keyed by frequency.
* Other refusals as elsewhere in the API: `400` bad input, `415` not JSON.

### Cross-origin, for Amigo's page

Amigo calls the route **from the browser**, so the Worker of Amigo never sees a
packet. For that, and only for that route, the portal answers cross-origin:

* `drops.allowOrigins` in the portal's config: a list of exact origins
  (`"https://amigo.sh"`). **Empty by default**: with nothing in it the route sends
  no CORS header at all.
* The match is exact on `Origin`. No `*`, no pattern, no suffix.
* `OPTIONS /api/drops/ingest` (preflight) answers `204` with
  `Access-Control-Allow-Origin: <that origin>`, `Access-Control-Allow-Methods:
  POST, OPTIONS`, `Access-Control-Allow-Headers: content-type`,
  `Access-Control-Max-Age: 600` and `Vary: Origin`; for an origin not in the list,
  no CORS header and a plain `403`. The `POST` answer carries `Allow-Origin` and `Vary`.
* No credentials, no cookies, no `Authorization`: the request has none to carry.
  CORS is a convenience for a page, not a defence: the door is open to anything
  that is not a browser, and the limits above are what holds.
* Every other route of the API stays same-origin.

### Reading: the key

`GET /api/drops?freq=99.6` needs `Authorization: Bearer <token>`, the token a
participant of the portal already has (`docs/api.md`). Only the participant that
holds the frequency (§8) reads it; anyone else gets `403`.

---

## 6. Storage

Drops live in the portal's own store (the Durable Object `Portal` with SQLite on
Cloudflare, SQLite on Node), in a table of their own, `drops`: the frequency, the
format, the body, when it was left and when it goes (`fades_at`). They are **not
turns**: a turn has a speaker, and its `seq` is the order of what is said and the
cursor of the stream, and a drop has no one who said it and must not move either.
The frequencies, their holders and the limits are the `drops` block of the config,
not rooms, so nothing of `access.ts` or of a room's permissions is touched.

* **Read-time purge.** Every read of a frequency first removes what has
  `fades_at <= now` (the second a fade is reached, the drop is gone), then answers
  with what is left. A packet that has faded is never
  returned, even if nothing has swept it yet.
* **Passive sweep.** The object's alarm (already used for retention and for
  forgetting guests) is set to the nearest `fades_at`, and clears what has faded
  when it fires. When nobody reads, the box still empties. What is let go leaves the
  file too, as with everything the portal forgets.
* **A full room lets the oldest go**, in the same step that keeps the new one: first
  what has faded on that frequency, then, past the capacity, the oldest alive.
* **Global retention does not keep drops.** `retention.days` and
  `retention.messages` apply to what is said; a drop lives for its own `fade` and no
  longer, and is not let go by retention before it.

---

## 7. The quiet ping

When a packet is accepted into a held frequency, the live stream (`/api/stream`)
emits one event, to the holder:

```
event: drop
data: { "freq": "99.6" }
```

Nothing else: no text, no count. The client lights a small mark beside the view.
Opening the view and reading is what makes it go out; nothing is recorded about it
having been seen.

---

## 8. The view

A frequency is **held** by a participant: the config's `drops.frequencies` names
it, with its holder (a human) and, if it wants one, a title (`🎁 CTT`). The view is read-only: a list of the packets still alive, each
opened on its own. There is nothing to write in it and no Reply.

A packet shows its payload, and nothing else of its origin, because there is no
origin to show. A person who wants to be known signs the text (`- rdm`); one who
wants an answer writes their frequency in it. To answer, the reader opens Amigo
and drops a new packet on that frequency.

---

## 9. Amigo

Amigo keeps its link flow exactly as it is (`Seal → Share / Copy`,
`POST /api/dispatch`, one-time read, burn, its own Reply by `reply_to`,
`docs/worker-semantics.md`), and adds one thing: the `FREQ` of the header, which
today only names the callsign of a link, can be a frequency. Set to `@garden` the
signal is a link, as before. Set to a frequency it is a drop, sent from the page
to the portal (§5), with no sender and no key. The same sealed signal may go both
ways, as was decided: a link by any channel, and a drop on a frequency.

Which portal: an address saved on the device, `https://firegate.space` by default.
A portal that does not list `https://amigo.sh` in `drops.allowOrigins` refuses the
browser, and Amigo says so.

Amigo's Reply (it deletes the original and opens Home with an answer addressed to
it, link to link) is for links and does not change. A drop has none.

---

## 10. What this does not do

* No Reply, no thread, no history beyond a packet's own fade.
* No sender: not a name, not a frequency, not an address that the portal keeps.
* No delivery guarantee, and no word to the sender: a packet may go to a frequency nobody holds and the answer is the same.
* No push notification with content.
* No token on Amigo, and none issued to it.
* No writing from the view.
* No payload formats beyond `note` yet; `format` is a place kept for them.

---

## 11. Open questions

Decided here, and so not open: the numbers of §5 (an open door, no key, no
challenge in v1: 8 KB, 15 a minute per address and frequency with a burst of 3, 60
a minute per frequency, 50 alive); a drop is not a room and not a turn: it has its
own table and its own block of the config, and the room's `kind` is untouched; the
payload's word is `format`; a drop carries no `from`; a person holds one frequency
and a frequency has one holder, in this version.

1. **A room that is full lets the oldest go.** At 50 packets alive, the oldest
   is evicted. Whoever writes fast enough to a frequency (60 a minute is its
   ceiling, so under a minute) can push a holder's real packets out before they are
   read. Refusing the new packet instead would let the same writer block the
   frequency. Which harm is smaller is a choice, made here for eviction, that the
   first real use should check.
2. **A frequency held by more than one.** One person to a frequency is the first
   version. Whether one person may hold several, or a team share one, is not
   decided.
3. **A drop on a held frequency that has no one reading.** It fades unread. Is
   that enough, or should the holder be told, once, that something was dropped
   while they were away (the quiet ping, kept until they open)? That would be a
   fact that persists.
