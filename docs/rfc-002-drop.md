# RFC: Drop — a one-way box on a frequency

**Status**: Built, unreleased (the portal's side is in `main`: config, store, ingest, read, stream, the page; Amigo's side is a pull request in GratiaOS/gratiaos)
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
| `payload.sigil` | optional; one emoji (a flag, a skin tone or a joined pair is one), at most 16 bytes of UTF-8; `400` otherwise, so a joiner cannot make a bomb. The seal the packet was sealed with in Amigo: it says how it was sealed, never who sealed it. A packet without one is shown with the page's own (the same Amigo puts on a signal that has none, 🐲) |
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
| body (`payload.body`) | 8 KB of UTF-8, and the whole request that and 512 bytes for its envelope | `413` |
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
* **The order**, so that nothing says which frequencies exist: the origin (below);
  the kind and size of the request (`415`, `413`); whether `to` is a frequency (`400`,
  and this is the only refusal that counts against no one, since it has no
  frequency to count against); the limits, counted from here on even if the rest of
  the packet is wrong, so a flood of bad packets is limited too; what the payload
  and the fade say (`400`, `413`); and only then the holder.
* **The limiter for an address** is a token bucket (`TokenBucket` in
  `src/limiter.ts`): 3 at once, then one every 4 seconds, for each (address,
  frequency). The one for a frequency is a sliding window of 60 a minute. **Both are
  kept in memory and nowhere else, and both begin again, for every frequency alike,
  when the handler does** (when the object wakes, or the portal restarts). They are
  not counted again from the store, on purpose: the store keeps only what was taken
  for a held frequency, so counting again would make the number of answers before
  the first `429` say whether a frequency is held, which is what the same `204` is
  there not to say. The cost is plain: after a restart a writer has a fresh minute,
  and one who waits for the object to sleep may get a few more than the numbers
  above.
* **The address** is what the home says it is: the socket's, or the header
  `clientIpHeader` names behind a proxy. Without a proxy that names it, every caller
  has the proxy's address and shares one bucket.
* **A fade** longer than the longest the config allows is cut to it, not refused;
  one that is not a fade (`7w`) is `400`.
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
  or none, no CORS header and a plain `403`.
* A `POST` that carries an `Origin` not in the list gets the same `403`, and is
  counted against no one; one with no `Origin` (from `curl`, a script) goes through
  as any other. With an empty list, a browser is turned away and `curl` is not.
* Every answer to a `POST` from an allowed origin, a refusal too, carries
  `Access-Control-Allow-Origin`, `Vary: Origin` and `Access-Control-Expose-Headers:
  Retry-After`, so that the page can read why and for how long.
* No credentials, no cookies, no `Authorization`: the request has none to carry.
  CORS is a convenience for a page, not a defence: the door is open to anything
  that is not a browser, and the limits above are what holds.
* Every other route of the API stays same-origin.

### Reading: the key

`GET /api/drops?freq=99.6` needs `Authorization: Bearer <token>`, the token a
participant of the portal already has (`docs/api.md`). Only the participant that
holds the frequency (§8) reads it; anyone else gets `403`: a frequency held by
someone else and one held by no one are told alike, so the answer does not say
which exist. `400` for a `freq` that is not one; `404` when the portal has no
`drops` block; `405` for anything but `GET`.

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
* **Passive sweep.** When nobody reads, the box still empties. On Node, the timer
  that lets go of what is past (every ten minutes; every minute at most when there
  is a `drops` block, since a fade is at least a minute) lets go of what has faded,
  and so does the start. On Cloudflare, the object's alarm is set to the nearest of
  its pace and the nearest `fades_at`, brought forward when a drop is taken whose
  fade is before it, and set again after each; a portal that keeps for ever and has
  no guests has no pace, and then only a fade wakes it. What is let go leaves the
  file too, as with everything the portal forgets.
* **A full room lets the oldest go**, in the same step that keeps the new one: first
  what has faded on that frequency, then, past the capacity, the oldest alive.
* **Global retention does not keep drops.** `retention.days` and
  `retention.messages` apply to what is said; a drop lives for its own `fade` and no
  longer, and is not let go by retention before it.

---

## 7. The quiet ping

When a packet is accepted into a held frequency, the live stream (`/api/stream`)
emits one event, to the holder, on every connection they have and to no one else:

```
event: drop
data: { "freq": "99.6" }
```

Nothing else: no text, no count, and no `id`, so it is not part of the cursor of
what is said and is not given again to a connection that comes later (the view
lists what is there; the pulse is only for now). Nothing is kept of it. Nothing is
told for a frequency nobody holds, nor for a packet that was refused. The client
lights a small mark beside the view. Opening the view and reading is what makes it
go out; nothing is recorded about it having been seen.

---

## 8. The view

A frequency is **held** by a participant: the config's `drops.frequencies` names
it, with its holder (a human) and, if it wants one, a title (`🎁 CTT`). The view is read-only: a list of the packets still alive, each
opened on its own. There is nothing to write in it and no Reply.

The view is `GET /api/drops?freq=…` (§5), and it answers:

```json
{ "freq": "99.6", "title": "🎁 CTT", "drops": [
  { "id": "12", "type": "drop", "payload": { "body": "…", "format": "note", "sigil": "🦁" }, "fadesAt": 1794945480000 }
] }
```

The newest first. A packet has no sender and no time it was left (`fadesAt` is for
the page to show a fade as a rhythm, not a date). A read lets go of what has faded
before it answers, which writes, on a Durable Object too, and takes nothing else
away: a packet can be read again until it fades.

### On the page

The page learns which frequency a person holds from `hello`, in a field of its own, `heldFrequency: { freq, title }`: the identity of the box, never what is
in it, and never another person's. It is `null` when the portal has drops and this person holds none, absent when the portal has no `drops` block, and
absent for a visitor, who is told nothing of drops. The box is one more entry after the rooms, apart from them: a place one steps into, asked for by a
hash no room can have (`#~drops`, since a room's id starts with a letter or a digit), and it is not a room. Opened, it asks for the list and asks again
each time the stream says something came; left, the page lets go of it (it keeps no copy). When something comes while the box is not open, the entry
shows a dot: no count, no sound, no notice, and nothing in the title of the tab; it goes when the box is looked at.

A packet is shown as Amigo shows a signal whose seal is still to be broken, and one is open at a time. Sealed, it says SEALED, shows the closed letter (faint
writing, the same whatever it says) with the wax seal over its lower edge and the sigil it was sealed with gilded in it (the page's own when it came with
none), the title *Incoming transmission* and a button, 🔓 *Break seal*. The wax is drawn the same in every look, so that it is the same object in Amigo and in
the portal; the looks dress what is around it. Broken, the letter goes, the packet says OPEN, and its words settle out of noise in about a second (at once for
someone who asks for less motion; a screen reader is given the words once they have settled, not the noise), and the button becomes 🔒 *Close*, which seals it
again on this page only, as it keeps nothing. There is no reply, no copy and no burn: a block of code in a packet has no button to copy it either (the text can still be
selected, as in any page). The words are put in a polite live region when they have settled, so that a screen reader says them without being moved.
While the first answer is awaited the page says it is tuning, as Amigo's Room does; an empty box is not told as empty (it is only quiet, since an absent thing is
not a fact to show); and a box that could not be opened says so, with a button to try again. Its words are shown as a message's are (prose, an address, `#tag`,
code), and a `format` the page does not know is shown as the words it holds. A packet whose fade is reached leaves the list the next time the page counts,
open or not. How much is left of a packet is a line that thins, on a scale of time (a week or more is full, a minute is a trace): a rhythm, never a date or a
number.

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
