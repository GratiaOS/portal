# Changelog

## Unreleased

- **A guest room, optional.** A room can be of kind `guest`, and `guests` in the config opens a door (`POST /api/guest`) where a visitor is given a
  name of the hour, a key and that room, for a while, with limits on how many at once and per address. A guest does what their binding gives
  them in that room and nothing else; the team is unchanged.
- **The page for a visitor.** The gate offers *Step through* when the portal has a door, and `/guest` steps through by itself, asking nothing. The visitor
  lands in the one room: no list of rooms, no team, no sign, no notifications, only how many others are there. `/api/health` says `guests: true` only when there
  is a door, and `/api/hints` gives a guest their companion's examples and never the team's.
- **The guest room ends by absence** (`guests.forgetAfterMinutes`, 5): once the last guest's time is over and those minutes have passed, what was said
  there, the guests, their keys and their bindings are let go, and the next visitors find an empty room. The questions' ledger stays, as the portal's ceiling per hour.
- **Nova for guests, off until chosen** (`guests.nova`): an engine of her own, a public folder of her own, facts made without the team's names, a
  budget of questions per guest and per hour counted before the model is called, and no entry in the list of what the knowledge lacked. Not on
  Cloudflare yet. The database moves to version 8 at the next start.

## 0.1.0 (2026-11-05)

The first version: a team chat with a companion who answers from a folder.

### For whoever runs a portal

- One process (Node.js 22.18+, no dependencies of its own but the model client), one config, one SQLite file. See [INSTALL.md](INSTALL.md).
- Sign-in by token, one per person, made and rotated with `pnpm --filter portal tokens`. No accounts, no passwords.
- `GET /api/health` and `--version` say the version and the contracts the portal keeps (`skins: 1`).
- Nothing phones home.

### What is in it

- Rooms, people and presence (who is here, never when), messages that are never edited, a live stream that resumes where it left off.
- **A portal forgets by default:** each room keeps the last 14 days or its last 999 messages, whichever ends first; what is let
  go is overwritten in the file. Keeping more is said openly in the config (`"retention"`, up to `"forever"`).
- A companion, Nova, who answers from a folder of markdown and `.canvas` flows, cites her sources, and is checked: the files she
  names must exist and every figure she gives must be in them. What she could not answer is kept as a list of what the knowledge
  lacks, with no person and no hour in it.
- She is told what is true of the portal she is in (who is in it, what is kept, which model answers as her), from the config.
- A page with three looks, and looks of your own from a folder (`skinsDir`, contract 1).
- Words inside a message: mentions, tags, inline code and code blocks; messages addressed to you stand out; drafts are kept per room.
