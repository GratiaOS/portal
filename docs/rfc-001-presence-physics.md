# RFC: Breathe Room & Presence Physics

**Status**: Draft
**Scope**: `portal` — room types `breath`, `quiet`, `practical`, `open`
**Depends on**: WebSocket room infrastructure, zero-retention policy

---

## 1. Summary

A set of room types where presence is expressed as **rhythm and space**, not
timestamps, counts, or status indicators. The core room type (`breath`)
reduces presence to a single shared circle that dilates and contracts.

When a participant leaves, their breath disappears. When the room empties,
the room ceases to exist.

Zero memory. Zero retention. Zero score. Zero attribution.

This is not a feature. It is a **physics** for digital space.

---

## 2. Motivation

Presence in digital spaces is typically expressed as:

* a timestamp ("last seen 14:32")
* a status indicator (green dot)
* a message count
* a read receipt
* a "typing..." indicator

All five create **residue**. They say: *you were here, and that fact persists.*
Residue is the substrate of digital co-dependence: you cannot miss what
cannot be referenced.

This RFC eliminates residue at the protocol level. Not at the UI level.
Not at the policy level. At the **physics** level.

### Anti-co-dependence principle

> Co-dependence requires a **persistent fact** to attach to.
> Breathe Room produces no facts. It produces only *now*. And *now* disappears.

| Mechanism | What it blocks |
|---|---|
| Zero memory | "Was here yesterday" does not exist. |
| Zero attribution | "X joined / left" does not exist. |
| Room ceases | Empty room is *absent*, not "empty." |
| Fire-and-forget | "Did they get my signal?" is not a valid question. |
| No reconnect UX | "Are they ok?" has no answer. The circle froze. That's it. |
| No score | You have nothing to lose, nothing to protect. |

---

## 3. Design Principles

| Principle | Consequence |
|---|---|
| Zero memory | No storage. No log. No history. Room state = current signals only. |
| Zero attribution | No "X joined." No "X left." The circle changes. That's it. |
| Zero score | No counter. No duration. No "you breathed for 12 minutes." |
| Fire-and-forget | Signals are not acknowledged, not buffered, not retransmitted. |
| Degradation = depth | Network instability makes the breath slower, not the connection "worse." |
| No reconnect UX | No "Reconnecting..." UI. The circle freezes or resumes. |
| Broadcast, not query | You can announce presence. You cannot verify absence. |
| Physics, not settings | Room type = geography. You choose the space, not the config. |

---

## 4. Room Types (Physics Spectrum)

| Room type | Status | Query | Knock | Prezență | Fizică |
|---|---|---|---|---|---|
| **Breathe** | ✗ | ✗ | ✗ | Doar cercul | Respirație |
| **Quiet** | ✗ | ✗ | ✓ | E cineva sau nu (fără nume) | Tăcere |
| **Practical** | ✓ (broadcast, opțional) | ✗ | ✓ | „E cineva" (fără timestamp) | Coordonare |
| **Open** | ✓ (broadcast) | ✓ (binar, cu decay) | ✓ | „A fost recent" → „a fost" → dispari | Deschidere |

Utilizatorul **alege camera**. Nu e un setare globală. E ca să alegi
să intri într-o sală de concert vs într-o bucătărie unde gătesc.
Fiecare are altă fizică.

### The Knock

For practical coordination (not anxiety):

```json
{ "type": "knock" }
```

* No payload. No text.
* Broadcast to all connected clients in the room.
* Recipients may send `{ "type": "knock-ack" }` or ignore.
* No ack is logged. No "X responded in 2s."
* If no ack within 15s: the knock simply... was.

---

## 5. Protocol

### 5.1 Breath signal

```json
{ "type": "breath", "rate": 12.4, "phase": "inhale" }
```

* `rate`: breaths per minute (float, 1 decimal). Range: 1–30.
* `phase`: `"inhale"` | `"exhale"` | `"hold"`.
* Sent every ~2s (one per phase transition).
* No sequence number. No timestamp. No sender ID beyond the WebSocket connection.

### 5.2 Knock signal

```json
{ "type": "knock" }
```

* No payload. No text.
* Broadcast to all connected clients in the room.
* Recipients may send `{ "type": "knock-ack" }` or ignore.
* No ack is logged. No "X responded in 2s."
* If no ack within 15s: the knock simply... was.

### 5.3 Server behavior

* On message receipt: broadcast to all other connected clients in the room.
* No persistence. No in-memory history beyond the current broadcast set.
* If no signal received from a connection for **10s**, remove from broadcast set.
* If broadcast set is empty → close room. No "empty room" state.
* Max occupants: **12** (configurable, default 12).

### 5.4 Client behavior

* On send: `ws.send(...)`. If socket is closed, do nothing. No queue. No retry.
* On receive: update shared circle. If a source stops for 10s, its contribution
  fades from the circle. No notification.
* On reconnect: simply start sending again. No handshake. No "catch-up."
  The circle was without you. Now it isn't.

### 5.5 Room config

```json
{
  "rooms": {
    "breathe": {
      "type": "breath",
      "maxOccupants": 12,
      "retention": 0,
      "signalIntervalMs": 2000,
      "timeoutMs": 10000
    },
    "quiet": {
      "type": "quiet",
      "maxOccupants": 20,
      "retention": 0,
      "knock": true,
      "timeoutMs": 10000
    },
    "practical": {
      "type": "practical",
      "maxOccupants": 30,
      "retention": 0,
      "broadcast": true,
      "knock": true,
      "query": false,
      "timeoutMs": 10000
    },
    "open": {
      "type": "open",
      "maxOccupants": 50,
      "retention": 0,
      "broadcast": true,
      "knock": true,
      "query": "binary",
      "decayMs": 300000,
      "timeoutMs": 10000
    }
  }
}
```

---

## 6. UX

### 6.1 Breathe

**Entering**: Screen clears. No sidebar. No room list. No text input.
A single circle, small, center-screen. Breathing at ~6 bpm (neutral).
One word: *"Respiră."* (localized).

**Solo**: The circle is yours. You breathe, it dilates. You stop, it contracts.
No timer. No counter. No "session."

**With others**: The circle's rhythm becomes **composite**. Not an average —
a superposition. No names. No avatars. No "2 people here."
You simply feel: *someone else is breathing here.*

**Leaving**: Your breath stops contributing. The circle shifts. No "X left."
If you were the last → room closes. Screen goes blank. Zero.

**Empty room**: Does not exist. There is no "room with 0 people."
There is only: the room, or the absence of the room.

### 6.2 Quiet

**Entering**: Screen clears. A single static circle, small, center.
No breath animation. No pulse. Just: a presence.
If someone else is there, the circle is slightly larger. That's it.

**Knock**: A small tap animation on the circle. No text. No "X knocked."
If someone acks, the circle pulses once. If not, nothing.

### 6.3 Practical

**Entering**: Screen shows a slightly larger circle. If broadcast is active
for any participant, the circle is "full" (warm tone). If not, "empty" (cool tone).
No count. No names.

**Broadcast**: Implicit. You are broadcasting as long as you are in the room.
Leaving = off. No toggle. The room IS the toggle.

**Knock**: Same as Quiet.

**Query**: Not available. If you need to know if someone is there, knock.

### 6.4 Open

**Entering**: Larger circle. Multiple concentric rings.
Participants appear as subtle density (not dots, not names).
Decay: if you stop broadcasting, your density fades over 5 min. Then: gone.

**Query**: Binary. "E cineva?" → "Da" / "Nu." No "cine." No "când."

---

## 7. Transitions Between Room Types

### Principle

Transition is not "navigation." It is a **change of physics.**
Not a tab. Not a link. It is leaving a concert hall and entering a kitchen.

### Exit

| From | What stops | What disappears |
|---|---|---|
| Breathe | Your breath signal | Circle loses one contribution. No "X left." |
| Quiet | Your ephemeral presence | Room is emptier. No event. |
| Practical | Your broadcast | Circle empties. No "X left." |
| Open | Your broadcast + decay | You fade from "recent." Zero. |

**Universal rule**: exit is instantaneous and residue-free.
No "I left Breathe 2 min ago." You were, or you weren't.

### Entry

| Into | What activates | What you feel |
|---|---|---|
| Breathe | Circle resumes. You are a contribution. | Exhale. Screen clears. One circle. |
| Quiet | Your presence is active. You can knock. | Silence. Someone is, or isn't. |
| Practical | Broadcast implicit. You can knock. | Structure. A place with rules. |
| Open | You are visible (decay). You can be found. | Opening. More space. |

**Universal rule**: entry is without handshake. No "connecting."
You are, or you aren't.

### Transition UX

```
[You are in Breathe. Circle pulses. You breathe.]
[You tap "Quiet" from the room list]
  → Screen goes blank. (0.5s)
  → Circle disappears.
  → Blank screen. Silence.
  → A single static circle, small.
  → Not "connecting to Quiet." Just: you are here now.
[Transition lasts 0.5s. No loading. No spinner. A pause.]
```

**No**:

* ✗ "Connecting to Quiet room..."
* ✗ "Leaving Breathe room"
* ✗ Confirmation: "Are you sure you want to leave Breathe?"
* ✗ Fade / animated transition (max 0.5s blank screen)
* ✗ "You were in Breathe for 12 min"

### Tension

Going from Breathe (zero attribution, zero names) to Practical (broadcast,
knock, "is someone?") is a jump in **intimacy**. The body is in "breath" mode
and suddenly switches to "coordinate" mode.

**Resolution**: the transition is **abrupt**. Not a gradient. It is like
stepping out of water onto land — you feel weight again. The 0.5s blank
screen is the *pause* between two physics. Not "loading." Just:
*you breathe once, and you are in another room.*

### No state carryover

Nothing is carried between rooms. Your breath rate in Breathe is not
"context" in Practical. Who was in the room: zero. How long you stayed: zero.
Each room is a universe with its own gravity.

---

## 8. Input Methods

| Method | Description | Privacy |
|---|---|---|
| **Manual** (default) | Tap/hold = inhale. Release = exhale. | Zero. No sensor. |
| **Camera** (optional) | Client-side chest expansion detection via video. Only the computed `rate` is sent. Frames never leave the device. | Opt-in. No frames transmitted. |

---

## 9. Audio / Haptics (optional, off by default)

| State | Audio | Haptics |
|---|---|---|
| Synchronized (±1 bpm) | Sub-bass tone, near-inaudible. | — |
| Desynchronized | Silence. | — |
| Network degradation | Background tone shifts. No alarm. | — |
| Breath cycle (if enabled) | — | Micro-vibration on inhale, release on exhale. |

---

## 10. Network Degradation

| Condition | Visual | Interpretation |
|---|---|---|
| Good connection (~6 bpm) | Normal rhythm | Calm |
| High latency (300–800ms) | Slower, deeper breath | Depth |
| Packet loss (1–2 signals) | Micro-pause in circle | Hold |
| Intermittent connection | Irregular pulse | Agitation |
| Connection lost | Circle freezes | Silence |
| Reconnect | Circle resumes | Inspiration |

**No error states. No "reconnecting" UI. No latency display.**
The room does not "connect." The room *breathes.*

---

## 11. What Is Removed from Normal Portal UX

Elements that create **residue** (and thus co-dependence) are removed:

| Element | What it creates | Replacement |
|---|---|---|
| Green dot / "online" | "Is it home?" → repeated checking | Absent. Circle breathes or not. |
| "Last seen 14:32" | Retroactive anxiety. "3 hours no reply." | Zero. No "last time." |
| Read receipts (✓✓) | "Saw it and didn't reply" → judgment | Nothing. Message is sent. Period. |
| "X is typing..." | Immediate expectation. "I must reply now." | Absent. Or: subtle background pulse, no text. |
| Badge / count (• 3) | FOMO. "I missed something." | Absent. No "you missed." |
| "X joined the room" | Event to monitor. "Who else came in?" | Absent. Room is fuller or not. No names. |
| "X left the room" | Loss. "They left." | Absent. Room is emptier or not. |
| Occupancy count ("4 people") | Counting object. "We were 4, now 3." | Absent. You feel density (circle is more complex), you don't count. |
| Visible retention (14 days / 999) | "This will disappear" → artificial urgency. Or: "this stays" → weight. | Retention is a server parameter. Not displayed. You don't know. Doesn't matter. |
| Push: "X mentioned you" | Obligation to reply immediately. | Absent in rooms. In DMs: optional, but without "seen." |
| Streak / activity log | "12 days in a row" → obligation to continue. | Zero. No "in a row." |

### What remains

| Element | Why |
|---|---|
| The message itself | It is the signal. Disappears after retention. Not "archive." It is "now." |
| The room | The shared space. It is *here* or it isn't. |
| One circle (breath mode) | The only "presence" — rhythm, not identity. |
| Local notification (optional, off by default) | "Someone is in your room." No name. No "who." Just: someone is. |

### The test

For every UI element, ask:

> **"If I remove this, can someone verify whether another person is home?"**

If yes → **remove it.**
If no → it stays.

---

## 12. Conflict Resolution: Status vs No-Status

### The fundamental distinction

| | **Broadcast** | **Query** |
|---|---|---|
| What it is | "I am here." (I decide) | "Are you there?" (you verify) |
| Who controls | The one present | The one *absent* |
| Creates | Presence | Anxiety |
| Analogy | A light in the window | Peering through the window |

**Rule**: the portal allows broadcast. Blocks query.

### Resolution: geography, not settings

The conflict is not resolved by a per-user setting (which creates asymmetry:
"you see my status, I don't see yours"). It is resolved by **choice of space**.
You choose the room. Each room has its own physics. It is not "config."
It is *geography.*

> You don't set "I want status." You walk into the Practical room.
> You don't set "I don't want status." You walk into Breathe.
> The room IS the setting.

---

## 13. Non-Goals

* ✗ No breath history or analytics
* ✗ No "streak" or "session count"
* ✗ No admin controls (mute, kick, pin)
* ✗ No chat, reactions, or text overlay (in Breathe/Quiet)
* ✗ No recording or replay
* ✗ No "spectator" mode
* ✗ No per-user attribution of breath
* ✗ No QoS, FEC, or retransmission
* ✗ No "breath score" or "sync percentage"
* ✗ No "last seen" in any form
* ✗ No read receipts
* ✗ No typing indicators
* ✗ No badge counts
* ✗ No occupancy numbers
* ✗ No visible retention policy
* ✗ No streaks or activity logs

---

## 14. Security & Privacy

* No PII in the signal. The payload is a number and a phase (or nothing, for knock).
* No camera frames transmitted. Detection is entirely client-side.
* No log of who was in the room. The WebSocket connection ID is the only
  identifier, and it is discarded on disconnect.
* Self-hosted: the signal never leaves the operator's server.
* TLS on the WebSocket. No additional auth beyond the portal's existing
  room token.
* Knock is unattributable. You cannot trace who knocked.

---

## 15. Open Questions

* Should the composite circle be a true superposition (all breaths as
  independent oscillators) or a weighted average? *Leaning: superposition.
  The irregularity IS the point.*
* Max occupants: 12 feels right for "a room." 8 for "a circle." 16 for
  "a field." Configurable, but what's the default?
* Should the circle have a maximum size? (i.e., does the room "suffocate"
  at 12 people, or does it just get more complex?) *Leaning: no max size.
  Complexity is the ceiling, not suffocation.*
* Nova (companion): should it "breathe" in the room as a background rhythm?
  *Probably. A fourth circle that is no one. A metronome that doesn't count.*
* Should Knock be rate-limited? (e.g., max 1 per 30s per client)
  *Probably. To prevent knock-spam. But no "X knocked 5 times" counter.*
* In Practical rooms, should broadcast have a visible "on/off" toggle
  or should it be implicit (you're broadcasting as long as you're in the room)?
  *Leaning: implicit. "You are here" = broadcasting. Leaving = off.
  No toggle. The room IS the toggle.*

---

## 16. One-liner

> When you leave, your breath is gone. The room was never here.
> You can announce you are. You cannot verify if someone is.
> If you need verification, you chose the wrong room. Or you need a knock, not a status.

---

## 17. Where our rooms sit, and what stands in the way

Written after reading the code, so that nothing is claimed that the portal does not do. Nothing here is decided, and nothing in it is implemented.

### The two rooms we have

* **⛲ PlazaDelSol** (`general`, the team's room). It leans **Open**: the public square of a tribe, where a presence may leave a faint density that fades. Today it shows a named dot for each person (the count in the top bar is gone since 0.3.0); by §11 the names are residue, and `Open` would replace them with density and decay.
* **🅿️ Parking** (`guests`, the visitors' room). It leans **Quiet** or **Breathe**, and may be the more open of the two in spirit: a visitor arrives with no agenda, leaves a greeting, and goes. It already keeps almost nothing (a trail that fades, an end by absence). Which physics fits is open.

Both are open questions, to be settled before any type is written into a config.

### Why no `type` is in the config yet

A field the server does not act on would say something false: whoever runs a portal would believe the room has a physics it does not. The types are added when the hub can honour them, not before.

### The blocker: transport and identity

* The RFC assumes a **WebSocket** and a signal with no identity.
* The portal today streams over **SSE, through `fetch`** (so the token travels in a header), and its hub keeps presence by `participantId`.
* So `breath`, `quiet` and `open` cannot be had by changing a config string. One of two ways has to be chosen first: a **separate hub**, without identity, for these rooms only, or **taking identity out of the existing hub** where a room's physics asks for it.

### Decided for the gate (2026-11-13): the tree breathes, and Parking stays as it is

Nothing here is built yet. It settles the order, so the blocker above is crossed on purpose:

* **Where.** The gate's own tree (`data-gate="tree"`) is the breathing surface, for anyone who opens `firegate.space`, with no token and no room to enter. **Parking is left exactly as it is**: the door with no key is the Missing Screw of the garden (see TRACES), and it is not changed to carry this.
* **Transport and identity.** A **separate hub with no identity**, for this only (the first way out in "The blocker"): a stream by SSE to listen and a `POST` to send, both with no token. The hub gives each stream an id that lives in memory for as long as the stream does, so that each person is one oscillator; it is never shown, never written, never counted out loud. The existing hub and its `participantId` are not touched. No WebSocket.
* **What it keeps of §5.** At most **4** at once (the fifth sees a still tree, with no message); a source that is silent for 10 s is let go; a room with no one in it does not exist; the tree contracts to a neutral of 8 bpm over 10 s once the last one leaves; composite as independent oscillators, not an average; no text, names, count, "joined" or "left", history or log; no reconnecting state shown.
* **What it leaves for later.** `knock-ack` (a knock is received or not, and that is all); the camera; audio and haptics; any `type` in a config (this is a small block that asks for the gate, not a room type, until the hub can keep types).
* **How a person takes part.** One touch on the tree sits them down (the Missing Screw: the tree stands a hair off, a touch sets it right, and the breath begins). Held, the touch is their own rhythm; let go, the tree goes back to 8 bpm. Reduced motion: the tree does not move, and is still there.

The order: the hub as a pure class with tests; its two adapters (Node, and a Durable Object on Cloudflare); the page; the sun; the knock.

### What can be done sooner, as words and no new physics

The points of §11 that the present rooms already touch (the named dots, the count in the tab's title, the clock on a message) can each be weighed on their own, and none needs a WebSocket.

---

*Draft — for discussion. Not yet implemented.*
