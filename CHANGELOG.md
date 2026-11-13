# Changelog

## Unreleased

- **The tree on the gate has a door: `/api/breath`, off until the config has a `breath` block.** `BreathHub` (no identity, four seats, ten seconds of silence, a knock that carries nothing) and its door over HTTP (`GET` to listen with server-sent events, `POST /api/breath/<id>` to send, always `204`), in Node and, as a second Durable Object (`Breath`, migration `v2`), on Cloudflare. The page does not draw it yet. docs/rfc-001-presence-physics.md §17 says why and what it leaves out.
- **A visitor is told that someone else is here, not how many.** "3 others are here" is now "Someone else is here", in the three languages (the line the top bar lost in 0.3.0, for a visitor's sheet); INSTALL.md and the starter `guest-docs/` say the same.
- **In the image, the token messages name what is there.** The image sets `PORTAL_IMAGE`, and the messages that told how to make or show a token (`pnpm --filter portal tokens … | pbcopy`) say `node dist/tokens.js …` there, with no clipboard: the image has neither pnpm nor `pbcopy`. From a clone nothing changes.

## 0.3.1 (2026-11-12)

Nothing changes in what a running portal does: this is a way to run one, as a container image, and a fix to INSTALL.md.

- **The portal as a container image.** A `Dockerfile` (the server and its page, run as `node`, config from outside, `/data` the only thing written, a health check), an example config and compose file in `container/`, and a workflow that builds it and asks it for its health on every change to them, and publishes `ghcr.io/gratiaos/portal` on a tag (`linux/amd64`). INSTALL.md has a section for it. Nothing changes for a portal run from a clone.
- **INSTALL.md built the page and not the server.** `pnpm -r build` leaves out the root of the workspace, so `dist/` was never made from it; the two places now say `pnpm run build && pnpm --filter portal-ui build`.

## 0.3.0 (2026-11-12)

Notifications are quiet by design (decision 13 of the plan), the guest room has its snails, and the top bar no longer counts. Nothing changes for whoever runs a portal in what it must set: there is no new config, no new secret and nothing new stored. A look of your own that styled `topbar-people` loses nothing else: that part is no more (`contract` stays `1`; `snails`, `snail` and `snail-shell` are new parts).

- **Only a mention is news.** A turn that names the person notifies them; everything else only moves the number in the tab's title, as before. A visitor never gets a notification.
- **A signal, not the content.** A notice says where and how many ("You were mentioned in General"), never the words or the speaker, so what is said does not go to the notification layer of the system.
- **It shows on Android.** The page shows a notice through the service worker's registration (Android Chrome throws on `new Notification()`, and the page used to swallow that and show nothing); the worker only answers a click, by bringing the app forward on that channel. There is no Web Push: the portal keeps no endpoint and no subscription of any device, and when the stream ends there is silence.
- **A count on the app's icon** for the mentions not yet looked at, where the browser has one (`setAppBadge`); looking clears it.
- **The answer of the browser stays in view.** Once the browser has answered, the sheet says what the notices are for, or that they are blocked and where to turn them on; the button used to vanish without a word.
- **Snails in the guest room.** A visitor's visit is shown as snails, one after the other: each walks one trail's length (`guests.trailMinutes`) along a path right under the channel's head, and a visit holds as many as it holds trails (four for an hour). Each has a colour two visitors can say aloud and as many holes in its shell (one to four), so the colour is not the only way; a screen reader is told in words. Where the snail is comes from the clock and the end of the key: nothing is kept, and there is no timer per snail. The guest's hello now also says `visitMinutes` (`guests.minutes`). New skin parts `snails`, `snail` and `snail-shell` (an addition: the contract stays `1`), answered in all three looks.
- **No count of who is here in the top bar.** "3 here" is gone: a count is a thing to watch and to compare ("we were 4, now 3"), which [RFC 001](docs/rfc-001-presence-physics.md) removes (§11). The dot beside each person stays, and a visitor still reads in the sheet how many others are here. The skin part `topbar-people` is no more (a skin that styled it loses nothing else).
- **Words and space, in the three languages and the three looks.** The section above your sign reads *Token*; the way out of the portal reads *Leave the portal* (a visitor's button was already *Leave*); on a wide page the groups in the foot of the side have a rest between them and the foot scrolls where the page is short.

## 0.2.1 (2026-11-10)

Nothing changes in what a running portal does: this is the documentation and the tools around it. If you run 0.2.0, there is nothing to upgrade for.

- **`pnpm dev` and `pnpm dev:lan`**: a portal to try things on from a fresh clone, with nothing to set up. The room is in memory, the keys are made at the start and printed (a different one for each person, new at every start), the door for visitors is open at `/guest`, and `dev:lan` also listens on the network and prints the addresses the others can open, with a note that the keys travel in plain HTTP there. Run for real by a test.
- **A template look** (`skins/template`): a folder the portal accepts as it is, with five colours to change, how to copy it and the rules in its first lines; a test keeps it good. `pnpm dev` offers the folder.
- **The documentation as a map.** The README is now a short road (the signal, 🗺️ the map, 📍 six checkpoints, 🏕️ what you can rely on and what is still taking shape), with the Heartware badge and a few lines for a companion that reads it to work on the repo; the long parts moved, whole, to `docs/` (how it works, Nova, the API, running one), the API table was brought up to what the portal answers, and `docs/how-it-works.md` says what a room is today, what is not built and where another kind of room would touch.

## 0.2.0 (2026-11-10)

A room that is open to visitors, the page on a phone, and the portal as an app. Whoever runs a portal: the database moves to version 8 at the next start (and does not go back), and what is new in the config is all optional (`name`, `guests` with its `trailMinutes`, `forgetAfterMinutes`, `minutes`, `maxActive`, `perCaller` and `nova`, and `renamedFrom` on a person); a portal that does not use them is as it was. The contract for skins is still `1`; the parts that were added are listed in `ui/src/skins/README.md`, and a look that does not answer them still works. Running one: [INSTALL.md](INSTALL.md).

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
- **A clearer sheet on a narrow page, the same in every look.** A head (a handle and a close button), then titled sections: rooms (a row each, 56 px), who is here (in the radar, the scope, which is that look's way of saying it), you (the sign, ▲ and ▼ in a row of 56 px presses, the grid under them), the look (one big button each, with its name), the app (when the browser has anything to say), and the way out last, apart. A look gives colour, edge and type; it does not change the order or the size. Every press is 48 px or more. The grid of signs fills the width it is given (five in a row on a phone) with room between, and the keys move by the columns it has; on a wide page the steps are a tidy pair as high as the slot. Parts for skins: `sheet-head`, `sheet-handle`, `sheet-close`, `self-group` (`data-group`), `skin-emoji`, `skin-name`.
- **The portal can be installed as an app.** `name` in the config (`El portal` without it) names it on the tab and under the icon; a manifest made from the config when asked (`/manifest.webmanifest`, no key), icons drawn in the repository (a brush stroke that goes round and curls inward), and a service worker that keeps only the shell of the page and never what goes through `/api`, `/skins` or the manifest. ⚙ offers *Install the app* where the browser gives the means, and says how to add it by hand on iOS. In the installed app a person of the team stays signed in on the device until they sign out; in a tab, and always for a visitor, the key still lives as long as the tab. The Worker sends the manifest to the object. Checked with the worker run in a sandbox, in `cloudflare:check` and in the browser of the app (which does not let a worker register: a real phone has not tried it).
- **Your own sign works on a phone.** A keyboard of emoji has no Enter, so a sign typed there was never taken. One emoji is now taken once the typing stops for a moment (a flag or a family arrives in pieces, so not at the first one), anything else is said not to be one, and there is a ✓ to keep it at once. The box takes the focus in the same breath as the press (which is what lets a phone raise its keyboard), is 16 px so that iOS does not zoom the page, and is brought into view when the keyboard rises. On a touch screen the tiles of the grid are 44 px. Checked with touch sizes in the browser of the app; a real phone's keyboard was not.
- **A reading column on a wide page** (48 rem and up). What is said, the title above it and the box below it keep to about 44 rem and sit in the middle of the room, so that on a large screen a line does not run from one end to the other; the title, the times and the box start at the same edge. The column on the right, with the whisper, is narrower (10.5 rem). The side on the left is as it was. Measured at 1440, 1024 and 800 px; nothing moves below 48 rem.
- **A top bar and a sheet on a narrow page** (under 48 rem). The rooms, the people and the settings, which took a third of a phone's screen above the room, are behind a bar (the room's name, how many are here, the line as a dot, a ⚙) and come up as a sheet from the foot, closed by the cover, Escape or choosing a room. A visitor's sheet says who they write as and how long the visit has left; the bar says the minutes only in the last ten. The visit's end is kept for the tab (`portal.guest.until`) and counted on the visitor's own clock, with nothing asked of the portal. Ten new parts for skins, listed in the contract and answered by the three looks; with a wide page nothing changes. Measured at 375 px in the three looks; not on a real phone.
- **An address in a message is a link.** `http://` and `https://` addresses open in another tab (`noopener noreferrer nofollow ugc`); the text is the address itself, so what is shown is where it goes, nothing is fetched, and nothing inside it is read as a tag or a mention. Other schemes (`javascript:`, `data:`, `ftp:`) and an address in a code span stay text. A new part for skins, `link`. A title that begins with a picture no longer has a `#` before it.
- **Usability on a touch screen, in the three looks.** What is pressed is at least 44 px (the switch of looks, the channels, sign out, copy, the sign and its steps, send), the box for writing is 16 px so that iOS does not zoom the page at the focus, and the small lines are 13 px; all only where the pointer is coarse, so with a mouse the look is as it was. The pressed look in bank no longer sets dark on dark, the welcome text has the contrast of the soft ink, and the arrows beside a sign are no longer 9.6 px. Measured at 375 px on the guest page and on the team's, with no target under 44 px and no text under the contrast it needs; not measured: a real phone, Safari, Firefox, a tablet, desktop.
- **A person can be renamed** (`renamedFrom` in `participants`): what they said, the mentions of them, their sign and their place move to the new alias and the old one is gone, once, inside the start; a turn is still never changed in what it says, and the trigger that refuses an update is put back at once. Checked on a Durable Object's storage by stopping and starting the dev object with the same files.
- **The guest room has a trail** (`guests.trailMinutes`, 15): what a guest says fades on the page by its age and is let go by the portal after those minutes, one message at a time, in
  one statement at the check that already runs. The page does the fading and the counting, and keeps the turns only in the tab's memory (no storage). A guest is not given a turn past
  the trail, even before it is let go. The end by absence stays for the guests, their keys and what is left.
- **A welcome for a visitor, three lines.** Above the room, for someone who has just come in and knows nothing: the whisper of the place, that no history follows them and everything fades (after `trailMinutes`, when the portal says), and that nothing is asked of them. No instructions, no link, nothing about the companion. It is made on the visitor's page: no turn, no row in the database, nothing kept, and it does not fade with the trail. Three new parts for skins (`welcome`, `welcome-whisper`, `welcome-map`), listed in the contract; the contract number is unchanged, since a skin that does not answer them still works.
- **Nova for guests, off until chosen** (`guests.nova`): an engine of her own, a public folder of her own, facts made without the team's names, a
  budget of questions per guest and per hour counted before the model is called, and no entry in the list of what the knowledge lacked. On Cloudflare too
  (see above). The database moves to version 8 at the next start.

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
