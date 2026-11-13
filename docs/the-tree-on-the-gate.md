# The tree on the gate

The olive tree on the gate (what a visitor sees at `firegate.space` before they come in) **breathes by itself**. Nothing is pressed, nothing is sent, nothing is kept. This page says how it works, where to tune it, what was tried before and taken out, and what is worth knowing if you work on it.

## How it breathes

- **One breath, from the clock.** `breathAt(Date.now())` in [`ui/src/lib/breath.ts`](../ui/src/lib/breath.ts): a smooth wave, **8 breaths a minute** (7 500 ms), counted from the epoch, closed at the instant the epoch began and open half a breath later. It is the same at the same time on every device, so **two people who open the gate together see the same pulse, with no connection between them and not a byte on the network**. A device that was asleep is in step the moment it wakes, because it never counted: it only reads the time. Two clocks that differ by 50 ms differ in the wave by at most 4 %.
- **One number on the page.** [`useBreath`](../ui/src/lib/useBreath.ts) sets `--breath` (−1 closed to 1 open) on the gate's `<main>`, once a frame. The browser stops the frames when the page is hidden. With `prefers-reduced-motion`, it is `0` and stays: the tree stands still.
- **Everything moves on that number, in the same frame**, in [`gate.css`](../ui/src/gate.css). Nothing has an effect of its own, so nothing can be out of step with anything else:

| Part | What it does with `--breath` | Amount (the place to tune) |
| --- | --- | --- |
| the crown (`data-gate='crown'`) | opens and rises, about the foot of the trunk; a fifth larger than it was drawn | `scale` ±3 % wide, ±5 % tall |
| the sky (`data-gate='glow'`) | the afterglow of the photograph, low on the horizon and centred on the tree, added to the dusk with `screen`: whole when the crown is open | `opacity` up to 0.85 |
| the roots (`data-gate='roots'`) | draw in as the crown opens and spread as it closes (the other way about the foot), and are lit as the light comes down into them | `scale` ±3 % / ±5 %, `opacity` 0.05 to 1 |

## The roots

[`ui/src/lib/roots.ts`](../ui/src/lib/roots.ts) draws **thirteen shapes and no more**, in three directions: a short thick pivot straight down, two strong roots to each side (one almost along the surface, one going down and out), and each of those four forking twice and stopping. Each is a filled shape that tapers from the trunk to a fine tip, none thinner than a clear line where it starts, and each branch leaves its parent in the parent's own direction so nothing turns sharply. They spread about as wide as the crown (`CROWN_REACH` in `LoginGate.tsx`, in the sky's own units) and reach for nothing, not even the doorway. A seed makes them the same on every load; they are drawn again, from where the foot is on the page, when it changes size. `THICKNESS` in the same file is where to make them heavier or finer. The empty space between them is part of the rhythm: more lines made the picture busier, not the breath clearer.

## What it is not

- **Not a place to press.** The tree has no button, no seat, no word. The gate's only controls are the key field and *Step through*.
- **Not presence.** Reading the same clock is not a signal that anyone is there: it cannot be verified, counted or asked, which is what [RFC 001](rfc-001-presence-physics.md) §11 asks of a presence room, and it needs no server.
- **Parking is untouched.** The door for visitors with no key is the Missing Screw of the garden (see [TRACES.md](../TRACES.md)).

## What was tried, and taken out

On 2026-11-13 the tree first breathed **with whoever else was there**: a hub with no identity (`/api/breath`, server-sent events to listen and a `POST` to send, four heard at once), a second Durable Object on Cloudflare, a touch to sit, a seat beside the tree with the words *in / hold / out* ([#65](https://github.com/GratiaOS/portal/pull/65) to [#70](https://github.com/GratiaOS/portal/pull/70)). Trying it on a phone showed what it cost: a finger covered the movement, the words had to explain what should not need explaining, and a crown moved by one thing and roots moved by another read as two animations glued together. All of it was removed in #70; the object went with a migration (`v3`), and it had kept nothing. [RFC 001 §17](rfc-001-presence-physics.md) has the account.

If a room ever needs people to hear *each other*, the hub with no identity described in that RFC is the way; the gate does not.

## Worth knowing

- **A phase must not run past its own end.** In the networked version an inhale ran on past the top into the fall, and the hold that followed froze the canopy half way down, which looked like a stopped breath. If you give the tree a rhythm of its own again (not the clock's), rest each phase at its end.
- **One number drives everything**, or it reads as separate things. If you add something that should breathe, give it a rule on `--breath` in `gate.css` and nothing else.
- **You cannot judge the motion in an embedded browser pane**: it throttles animation frames to about one a second. To see both ends of the wave, freeze the frames and set the number by hand in the console, then look at it on a real device:

  ```js
  window.requestAnimationFrame = () => 0;
  document.querySelector('[data-gate="page"]').style.setProperty('--breath', '1'); // open; -1 is closed
  ```

- **Try it locally:** `pnpm dev`; the gate is at `/`. Tests: `pnpm --filter portal-ui test` (the wave: its period, its anchor, its smoothness and the sync; the roots: their number, thickness, bounds and growth with the tree).

## Not yet looked at

Two people at once on a real phone and a laptop (the sync has been proved by test, not by two screens), and whether the amounts in the table still read as one thing on a real screen.
