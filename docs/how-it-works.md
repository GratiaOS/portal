# How it works

Where the parts are and how they fit. The map to the rest is in the [README](../README.md); running one is in [INSTALL.md](../INSTALL.md).

## The core

Zero runtime dependencies: Node 22.13+ (`node:sqlite`), TypeScript compiled with `tsc`.

```bash
pnpm --filter portal test
```

The nouns follow RFC 0000 §7:

- **Participant**: id is `kind:alias` in lowercase (`human:zeus`, `companion:nova`); the alias is what people type after `@` and belongs to one participant.
- **Conversation**: a room, with `visibility` (`private` by default, M3's vocabulary) and `status` (`open` / `closed`). Everyone configured is in every room for now.
- **Turn**: one message, with `text` (the RFC's `input`/`output` is a request-response shape), the `mentions` it names and a global `seq` that is the cursor for history and for resuming a stream.
- **Presence**: lives in the hub, not in the database.

A turn is never changed, which the database itself enforces. A portal forgets by default: each room keeps the last 14 days or its last 999 messages, whichever ends first (`"retention"` in the config; `"forever"` keeps everything, and its people are told). What is let go is overwritten in the file, and the gaps forget on the same days.

## The live stream

`Hub` is the one way a turn enters the portal (`hub.publish`) and the one place presence lives; `serveStream` puts a connection on it over server-sent events.

- `hello` comes first on every connection: who you are, who is here, the rooms, and `lastSeq`. It has no `id`.
- `message` carries a turn, with its `seq` as the event `id`. A client that reconnects sends `Last-Event-ID` and gets what it missed right after `hello`, across all rooms; with no id it gets nothing and reads history over REST. If `lastSeq` in `hello` is lower than the last id a client saw, the room's database was reset and the client should reload its history.
- `activity` says a companion is working on an answer in a conversation (`thinking`, then `idle`); `hello` carries who is thinking right now. Never stored.
- `presence` says someone is online or offline, **and never when**: the portal does not know when anyone came or went, so nothing on the wire could be made into a timecard. A human who is gone for less than the grace period (5 s) is not announced as gone, so a refresh does not blink; several tabs count as one person; a companion is always online.
- `hub.on('turn', …)` is where a companion listens.
- A comment line is sent every 25 s, and a client that falls 1 MB behind is cut off and resumes from its last id.

## The page

`ui/` is the portal's face: React, Vite and Tailwind, built to `ui/dist`. Put `"staticDir": "ui/dist"` in the config and the portal serves it next to its API, on the same origin, with a policy that lets it load only from the portal.

```bash
pnpm --filter portal-ui build        # or, while working on it: pnpm --filter portal-ui dev (on :5175, proxying /api to a room on :3100)
```

It is a light sky of blue leaning a little to violet, with a glow and bubbles of oxygen that rise behind the conversation (none for anyone who asks the system for less motion), chosen to be light on a grey day and checked for contrast. It lists the channels and the people of the room. Who is here is a dot, and **never when**: no clock time anywhere on presence, because the room does not have one to give. While a companion works on an answer, the channel says so ("Nova is thinking…") for everyone in it. Its logic is plain TypeScript, tested with node's own type stripping (`pnpm --filter room-ui test`).

**Skins.** What the page looks like, and where things sit, is not in the components: they say what each thing is (`data-part="message"`) and its state (`data-here`), and a stylesheet answers them. There are three: 🫧 (`bubbles.css`, the one the room starts in: a light sky, rounded glass, bubbles), 🏦 (`bank.css`: a ledger, where a message is a row of time, who and what, and every corner is square) and 🪖 (`radar.css`: the people are points on a round scope that pulse while someone works on an answer and ping when someone speaks, and the words are a plain log beside it). On a wide page every look has a third column at the right, with a few quiet lines that turn by themselves (`FieldWhispers`, from Firegate's `FieldCompanion`): one set while someone is here and another after a minute with nothing done, which the page asks of itself and keeps nowhere; they are not announced as they turn, and for anyone who asks for less motion the first stays. On a phone there is no column. They are not colour schemes of one layout, the way CSS Zen Garden had one HTML and many CSS. Each person chooses with the buttons in the side, and the browser remembers it. A room can also offer looks of its own: put a folder of skins next to the config and name it in `skinsDir`; the room checks that each keeps to its own scope and serves it. The parts and states a skin can rely on, and how a skin from a folder is made, are in `ui/src/skins/README.md`, and a test keeps that list, the page and every built-in skin in step.


## Rooms: what is true today, and where another kind would go

A **room** is a conversation (`src/domain.ts`): an `id`, a `title`, a `kind`, a `visibility`, a `status` and some `tags`. A **turn** in it is text: `text`, the `mentions` it names, a global `seq` and a `createdAt`. That is the whole payload today.

- **`kind` is `team` or `guest`, and nothing else.** A team room keeps what is said by `retention` (the last 14 days or 999 messages, by default). A guest room keeps each message for `guests.trailMinutes` (15), lets the guests and their keys go some minutes after the last one is gone, and is the one room a visitor may be in. Everything a visitor may do is what a *binding* gives them (`src/authority.ts`, `src/access.ts`), default-deny.
- **What is not built:** a room of voice, of a canvas or of a stream; any other payload than text; a participant that is not a person or a companion and that can come in from outside (the `service` kind is in the model, and has no way in). `.canvas` files exist only as something Nova reads.
- **If you add a kind of room, these are the places it touches, in this order:** `src/domain.ts` (the kind), `src/store.ts` (its column, and what is forgotten and when), `src/access.ts` and `src/authority.ts` (who may read and write), `src/hub.ts` (what travels on the stream), `ui/src/components/ChannelView.tsx` and the skins (what the page shows; a new part is a change to `ui/src/skins/README.md` too). A test in each place keeps it honest: `pnpm test`.
- **Where a companion or a bridge listens today:** `hub.on('turn', …)` and `hub.publish(…)`, inside the process. Nova and `scripts/demo.mjs` are written with these two calls. Nothing outside the process can listen except a signed-in person, on `/api/stream`.

## The page, in the order it is read

`ui/src/App.tsx` (the gate and the choice between a person and a visitor) → `ui/src/Room.tsx` (the top bar, the sheet and the room) → `ui/src/components/` (one part each, named by `data-part`) → `ui/src/skins/` (what each part looks like). The portal serves the built page itself, and it is an installable app (`ui/public/sw.js` keeps only the shell, never `/api`).
