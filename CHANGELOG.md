# Changelog

## Unreleased

- **A starter folder for the companion for guests** (`guest-docs/`): five short documents about the portal as a program, written for visitors and the same for anyone who runs one, to point `guests.nova.knowledgeDir` at, extend or replace. A test keeps the figures they give equal to the defaults in the code.
- **A visitor who leaves ends their time** (`POST /api/guest/leave`, and the page's *Leave* does it): the key stops opening anything, the stream closes, the guest is not shown as here, and the slot is free for the next one. What was said stays until the room ends by absence, counted from the leaving.
- **The companion for guests on Cloudflare.** The Worker wakes her as Node does, on her own engine (a secret of her own) and from her own bundle (`guestFiles` in `cloudflare/knowledge.json`, made by `bundle-knowledge.mjs` from `guests.nova.knowledgeDir`, apart from the team's); a portal there no longer refuses to open with her turned on. The Cloudflare check runs a guest through it with two stand-in models.
- **Asked what is next, Nova gives one step.** A line of her prompt, no new code and no state: the smallest honest step and what it rests on, never a plan or a list, and she does not decide for them (the habit of One True Next in `gratia.space`).
- **Three languages, everywhere** (`ro`, `en`, `es`, in no order): the page, the sentences the portal says in Nova's place, her prompt, `<html lang>`. One rule
  picks the language (`src/locale.ts`, the same in `ui/src/lib/strings.ts`), and what it does not know falls to English, no longer to Romanian. A visitor gets the
  first of the three their browser asks for, and keeps it only as long as their name.
- **A guest room, optional.** A room can be of kind `guest`, and `guests` in the config opens a door (`POST /api/guest`) where a visitor is given a
  name of the hour, a key and that room, for a while, with limits on how many at once and per address. A guest does what their binding gives
  them in that room and nothing else; the team is unchanged.
- **The page for a visitor.** The gate offers *Step through* when the portal has a door, and `/guest` steps through by itself, asking nothing. The visitor
  lands in the one room: no list of rooms, no team, no sign, no notifications, only how many others are there. `/api/health` says `guests: true` only when there
  is a door, and `/api/hints` gives a guest their companion's examples and never the team's.
- **The guest room ends by absence** (`guests.forgetAfterMinutes`, 5): once the last guest's time is over and those minutes have passed, what was said
  there, the guests, their keys and their bindings are let go, and the next visitors find an empty room. The questions' ledger stays, as the portal's ceiling per hour.
- **An address in a message is a link.** `http://` and `https://` addresses open in another tab (`noopener noreferrer nofollow ugc`); the text is the address itself, so what is shown is where it goes, nothing is fetched, and nothing inside it is read as a tag or a mention. Other schemes (`javascript:`, `data:`, `ftp:`) and an address in a code span stay text. A new part for skins, `link`. A title that begins with a picture no longer has a `#` before it.
- **Usability on a touch screen, in the three looks.** What is pressed is at least 44 px (the switch of looks, the channels, sign out, copy, the sign and its steps, send), the box for writing is 16 px so that iOS does not zoom the page at the focus, and the small lines are 13 px; all only where the pointer is coarse, so with a mouse the look is as it was. The pressed look in bank no longer sets dark on dark, the welcome text has the contrast of the soft ink, and the arrows beside a sign are no longer 9.6 px. Measured at 375 px on the guest page and on the team's, with no target under 44 px and no text under the contrast it needs; not measured: a real phone, Safari, Firefox, a tablet, desktop.
- **A person can be renamed** (`renamedFrom` in `participants`): what they said, the mentions of them, their sign and their place move to the new alias and the old one is gone, once, inside the start; a turn is still never changed in what it says, and the trigger that refuses an update is put back at once. Checked on a Durable Object's storage by stopping and starting the dev object with the same files.
- **The guest room has a trail** (`guests.trailMinutes`, 15): what a guest says fades on the page by its age and is let go by the portal after those minutes, one message at a time, in
  one statement at the check that already runs. The page does the fading and the counting, and keeps the turns only in the tab's memory (no storage). A guest is not given a turn past
  the trail, even before it is let go. The end by absence stays for the guests, their keys and what is left.
- **A welcome for a visitor, three lines.** Above the room, for someone who has just come in and knows nothing: the whisper of the place, that no history follows them and everything fades (after `trailMinutes`, when the portal says), and that nothing is asked of them. No instructions, no link, nothing about the companion. It is made on the visitor's page: no turn, no row in the database, nothing kept, and it does not fade with the trail. Three new parts for skins (`welcome`, `welcome-whisper`, `welcome-map`), listed in the contract; the contract number is unchanged, since a skin that does not answer them still works.
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
