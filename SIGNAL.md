# 📡 Signal

Where El portal is, for whoever starts work on it next. Short on purpose: what changed is in [CHANGELOG.md](CHANGELOG.md), how to run one is in [INSTALL.md](INSTALL.md), where the parts come from is in [TRACES.md](TRACES.md).

**Verified:** 2026-11-23, against `main@1a76312`. `pnpm signal` fetches `main` and says how many pull requests have merged since (not counting those that touch this file: a pull request that changes the signal has kept it true). It warns, it never blocks.

## Now

- **The gate's tree is the picture's tree** (this change): a crown of forking limbs with leaves and sky between, and its roots as the mirror, grown from one seed ([docs/the-tree-on-the-gate.md](docs/the-tree-on-the-gate.md)). **A person of the team speaks to guests as an animal** ([#102](https://github.com/GratiaOS/portal/pull/102)): the guests never read their name, nor does the companion for guests say it. Both are in `main`; `firegate.space` has #102 and runs the new tree after its next deploy.
- **`v0.6.0`, *Tierra Firme 🐘*, is out** (2026-11-22: tag, image on GHCR, the GitHub Release, `firegate.space` deployed from it). It carries the mushroom, Burn, the gate's *key* and the ground and the flow; nothing must be set. The image `ghcr.io/gratiaos/portal` is public: it pulls with no login. How a version goes out: [docs/releasing.md](docs/releasing.md).
- **Live on `firegate.space`** (no migration; after a deploy the object can answer with the old code for a few minutes): the mushroom and tuner of Amigo FM in every room ([#92](https://github.com/GratiaOS/portal/pull/92), [#93](https://github.com/GratiaOS/portal/pull/93); nothing starts by itself, nothing is sent, nothing is counted); **Burn** beside Close in the box of drops ([#95](https://github.com/GratiaOS/portal/pull/95), [#96](https://github.com/GratiaOS/portal/pull/96); Close keeps the packet, Burn deletes it for everyone who holds the frequency, no way back; [RFC 002](docs/rfc-002-drop.md)); writing and reading on a phone ([#80](https://github.com/GratiaOS/portal/pull/80)); rooms renamed with `renamedFrom` ([#78](https://github.com/GratiaOS/portal/pull/78)); the breathing tree on the gate, from the clock ([#70](https://github.com/GratiaOS/portal/pull/70); [docs/the-tree-on-the-gate.md](docs/the-tree-on-the-gate.md) says what it is and the three rules a guard test keeps).
- **The ground and the flow** ([#98](https://github.com/GratiaOS/portal/pull/98)): `src/experience.ts`, a pure module in the shape of `authority.ts`. `GROUND` is frozen with no start or stop; `enterFlow(ground, { activity }, onClose?)` returns a frozen, bounded flow that keeps its ground and closes once, and `close()` never touches the ground. No shared state, no persistence, no observation; `matched` and `active` describe the protocol, there is no matching engine. Nothing in the portal uses it yet.
- **The gate says *key*** (*cheie*, *llave*) instead of *token*; the label above your name in the side still says *Token* ([#47](https://github.com/GratiaOS/portal/pull/47)).
- **The guest room**: a door with no key, a name of the hour, a key for a while, a trail that fades, an end by absence, snails for the visit ([#4](https://github.com/GratiaOS/portal/pull/4), [#48](https://github.com/GratiaOS/portal/pull/48)). Nova for guests is built and off until chosen, on an engine and a folder of her own (`guest-docs/` is the starter). Quiet notifications, no Web Push ([#46](https://github.com/GratiaOS/portal/pull/46)). On a phone the rooms, the people and the settings are a sheet behind a top bar. What came in each version is in [CHANGELOG.md](CHANGELOG.md).
- **To try one:** `pnpm dev` or `pnpm dev:lan` boots a portal in memory with a key for each person ([#43](https://github.com/GratiaOS/portal/pull/43)); `skins/template` is a look to copy. As an app: a manifest made from `name`, a worker that keeps only the shell and never `/api`.
- **Looked at:** the phone at 375 px in the three looks and by hand on one phone; the mushroom against the real tape, with a visitor's and a team key; Burn on a local portal and a burn with no key (`401`) live; a drop from amigo.sh to a person's box. **Not looked at:** a burn of a real packet (irreversible); the keyboard on iOS and Android, the installed app, safe areas of a notched phone; the mushroom's sound on a phone with the screen off; two listeners hearing the same second; the gate's amounts and the new tree on a real screen of each size; Spanish and Romanian by eye; Bank and Radar by eye; a screen reader on the sheet, the box and the tuner.

## Next

Nothing is lined up in the repository. Three things are worth doing when someone has the time, in this order:

1. **Make an object's errors visible on Cloudflare.** A guest's stream failed with a `500` that said only "internal error", and `wrangler tail` showed no line for it, though the error is plain in `wrangler dev`. Find out why the object's log does not come through (is `observability` in `cloudflare/wrangler.jsonc` what is missing?), so the next one is read, not reproduced.
2. **Turn the companion for guests on, in a portal that has an engine.** Built and checked with stand-in models: a `companion` in the participants, `guests.nova` with its own `llm` and `knowledgeDir`, and its key as a secret (INSTALL.md). The first real run, with a real model, on Cloudflare, has not happened.
3. **Look at what was not looked at** (the last item of Now), starting with the gate, a real phone's keyboard, and Spanish and Romanian.

Written, not built: [RFC 001](docs/rfc-001-presence-physics.md), a draft of rooms where presence is rhythm and space and leaves no residue; for discussion, nothing in it is implemented (its section 17 says where our rooms lean). Only talked about: other kinds of room (voice, a canvas), a way for a program outside the process to listen to a room, and a signal that each portal says of itself.

A portal that opens a guest room needs its own config for it (and an engine, if the companion is on): that is the config of whoever runs it, not a matter of this repository.

## Known limits

- On Cloudflare, after a deploy or a change of a secret, the object can answer with the previous code or config for up to five minutes (the default deferred update): look once, after the minutes.
- Closing the tab is not leaving: a visit runs out its time. A landscape phone puts "Run your own" below the fold.
- Taking a message out sooner, on request, is not built: messages are kept until the portal forgets them.
- A person with no `locale` gets the page in their browser's language and Nova's fixed sentences in English.
- It is not decided whether the gate at `/` offers *Step through* beside the key, or only `/guest` does.
- The guest room on Cloudflare is checked locally with stand-in models (`pnpm cloudflare:check`); its first real opening found a defect the check had not looked for (#24), so what the check does not open is not known to work.
- A turn past a guest's trail stays in the object's storage until the next check (about ten minutes, later by the alarm's own delay): guests are not given it, but the team's readers of the guest room are, in that window.
- The numbers of drops (8 KB, 15 a minute per address and frequency with a burst of 3, 60 a minute per frequency, 50 alive) are starting values, not measured.

## How this stays true

Whoever merges something that changes what the portal does or what comes next updates this file in the same sitting, or the next session does before anything else, and moves the stamp. This file keeps three kinds of things only: where we are, what is next, what is open. History goes to the changelog, procedures to their own pages.

> Say what she can see, and let the room look the way its people need it to.
