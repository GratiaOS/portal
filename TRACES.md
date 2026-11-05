# 🗿 Traces

Where the parts of Room come from, for whoever works on it later.

Every line below that names a place elsewhere gives a permalink into the public repository it is in, at the commit it was
read at: `https://github.com/GratiaOS/<repository>/blob/<commit>/<path>`. Opening it shows what was meant, even after that part
has moved on, and `pnpm --filter portal traces` checks that each link still answers (it needs the network; without it, it says so
and does not fail).

**Where the roots were read, and where they are linked.** The places were read inside the private monorepo this came from, at
its commit `b821e91` (2026-10-29), where Firegate, M3 and Firecircle live as `apps/firegate`, `apps/m3` and
`services/firecircle`. The links point at the public copies of the three, as they were before they moved there:
<https://github.com/GratiaOS/firegate> at `e4f7912` (2026-03-09), <https://github.com/GratiaOS/m3> at `c76a3cb` (2026-05-05) and
<https://github.com/GratiaOS/firecircle> at `7e97c12` (2026-03-03). Fifteen of the twenty-one places are byte for byte what was
read. Four in Firegate differ only in names (`nova` there, `companion` where they were read) and in the choice of speaker, which
Room did not take. In M3, `db.rs` lacks one table and words one line differently, and the words `private`, `public` and `sealed`
are in it as before. The RFC 0000 of Firegate stops at section 6 in its public copy, so the nouns taken from section 7 are named
in words, with no link. The licences there are the ones named below, except that Firegate reads MIT in its public copy and
AGPL-3.0 where it was read; either way nothing is copied.

Nothing here says why a decision was taken. It says what was looked at, what is the same and what is different, as of the
commit named. The same blocks sit at the top of the files they belong to, under a `🗿 trace` heading, so a trace is
found where the work is: `grep -rn "🗿 trace" src ui/src`.

**A note on licences.** Room is MPL-2.0 and was written from scratch. Firegate and M3's server are AGPL-3.0, M3's UI is
Apache-2.0. Names and ideas are carried over; no code is. Where a trace says "Not copied", it means it. If you add a
component that comes from one of these, write it new, and leave a trace.

## The page (`ui/`)

| In Room | Name from | Where | Kept | Changed |
| --- | --- | --- | --- | --- |
| `MessageBubble` | `MessageBubble` | `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MessageBubble.tsx` | a message as a soft translucent shape that fades in, with a small time | many voices on the left, the name once per run, a colour that stays with a person; no layers, tags, translation or typewriter; Nova's sources set apart |
| `SeedPortal` | `SeedPortal` | `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/SeedPortal.tsx` | one box that grows; Enter sends, Shift+Enter breaks the line | no dice, no voice, no choice of speaker; refusals shown under the box, the words kept |
| `MemoryStream` | the stream inside `MemoryPool` | `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx` | the log scrolls to the newest message, smoothly | follows only while you are at the bottom, keeps its place when older messages arrive above, a `log` for screen readers |
| `ChannelView` | `MemoryPool`, the whole surface | `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx` | one calm surface: conversation above, box below | a channel with a title and the connection in its header; no ambient colour that follows the mood of an answer |
| `SignalQuality` | `SignalQuality` | `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/features/Firegate/components/SignalQuality.tsx` | a dot that breathes and a few words, in the corner | reports the stream to the room, not the tone of a message; no red, no percentage, no triple tap |
| `PresenceDot` | `PresenceDot` | `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/presence/PresenceDot.tsx` | presence is a dot that says someone is there | "here" or "not here" and never when; no pulse, no clock time, nothing to hover for one; "not here" is an empty ring, not grey or red |
| `PeopleList` | new | `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/presence/PresenceCounter.tsx` | who is in the room is told quietly, in the margin | names people instead of counting them, in an order that does not move when someone comes or goes |
| `ThinkingPill` | the pulsing bar of `MemoryPool` | `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx` | something soft breathes where the answer will be, so the page is never silent and never in a hurry | names who is thinking and where, from the room's `activity` event, so everyone in the channel sees it |
| `ParticleField` | `ParticleField` | `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/MemoryPool.tsx` | round, soft things rise slowly behind the page, so it is alive without asking for attention | bubbles of oxygen in one colour of life, not dots coloured by the mood of the last answer; placed once, behind everything; none at all for anyone who asks for less motion |
| `FieldWhispers` | `FieldCompanion` | `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/FieldCompanion.tsx` | a few quiet lines that turn slowly by themselves, one set while someone is here and another after a minute with nothing done | a column of its own at the right on a wide page (none on a phone), not a panel in the stream; the lines come with the language of the page; they are not announced as they turn, stop while the pointer is over them, and for anyone who asks for less motion the first stays; whether someone is idle is asked of the page only and kept nowhere |
| `LoginGate` | `MembraneGate` | `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/features/Firegate/components/MembraneGate.tsx` | a quiet card on an empty page; you cross on purpose | a token instead of a hold of four and a half seconds; a refusal is a calm sentence; the gate of lights, the portal's own in every look (`gate.css`), drawn from the photograph: a fence lit at dusk is the doorway, the key is given inside it, no card; Enter in the field sends |
| `ChannelList` | new | `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ui/src/flows/communication/FamJamPad.tsx` | a place is a room you step into | channels come from the room's config; they hold what is said |

The yellow of the page, field and glow, is the yellow of Firegate's `ambient-4D` (`https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/index.css`, from `#facc15` to `#fef9c3`) and its gold (`--color-firegold-500` in `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/styles/theme.css`), written in OKLCH and checked for contrast: the text is at least 7 to 1 on the field and on the glass, the quiet and the time stamps at least 4.5 to 1, the focus ring a deep blue (an amber one would vanish on yellow).

The look comes from `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/UIStyleGuide.md`: motion 200 to 400 ms with easing, no red alerts, animations
optional, whitespace as breath. As of that commit its `usePresence` (`https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/presence/usePresence.ts`)
returns a count of 1 and listens only to the tab's own visibility, so Room's presence is written new.

### Left in Firegate

Not brought into Room, and left where they are:

- the ambient layers that follow the mood of an answer (`ambient-*` in `https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/index.css`); the particles came back as bubbles, see `ParticleField`
- the rotating whispers (`https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/components/FieldCompanion.tsx`)
- the read of shouting as "static" (`https://github.com/GratiaOS/firegate/blob/e4f7912db5f4314acd3d26ab80096f92a7258e3f/packages/ui/src/features/Firegate/lib/somatic.ts`)
- the dice, the voice and the choice of speaker, inside `SeedPortal`

## The room (`src/`)

| In Room | From | Where | Kept | Changed |
| --- | --- | --- | --- | --- |
| `Participant`, `Conversation`, `Turn`, `Presence` | RFC 0000 section 7 | RFC 0000 §7, no public copy | the nouns, and `Participant.kind` of human, companion or service | a message is `text`, not the RFC's `input` and `output`; the RFC's `participants` of a conversation is not used yet |
| ids as `kind:alias` | the voices of the towns | `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ui/src/flows/communication/TownPad.tsx` | `species:name`, as in `cat:all` | `kind` is the RFC's, not a species |
| Nova's voice | M3's joy helpers | `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ui/src/utils/joy.ts` | joy as a way of being talked to: "joy is a feature, not a bug" (`https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/Whisper.md`) | joy is not a table of phrases: it is her own voice, so a hello is a hello and "I don't know" is said in her words; the room's few fixed lines are plain, because a canned personality reads as a help desk |
| `visibility` | the privacy of a message | `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/server/src/db.rs` | the words `private`, `public`, `sealed` | on a conversation, not on each message; `sealed` is not encrypted yet |
| turns are never rewritten | the guard on memory | `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/docs/privacy.md` | raw records are kept, not edited | enforced by the database itself |
| `Presence` | RFC 0000 section 7 | RFC 0000 §7, no public copy | who is here, as `participantId` and `state` | no `lastSeen` and no `channel`: the room says who is here, never when they came or went, and keeps none of it |
| the line between Room and Firecircle | Firecircle | `https://github.com/GratiaOS/firecircle/blob/7e97c1230e4fd7d57e8a0250be3d2eb61733bda3/README.md` | presence as something quiet, not harvested | Room keeps what is said, which Firecircle declares it does not; presence is never stored |
| channels | the doors of Fam Jam | `https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ui/src/flows/communication/FamJamPad.tsx` | a place you step into | not pulses, and not local to one browser |

As of that commit, the RFC gives `Firecircle` the "shared presence and room state". Room now keeps conversations, turns
and presence; the RFC has not been amended to say so.
