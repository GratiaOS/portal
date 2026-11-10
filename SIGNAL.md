# 📡 Signal

Where El portal is, for whoever starts work on it next. Short on purpose: what changed is in [CHANGELOG.md](CHANGELOG.md), how to run one is in [INSTALL.md](INSTALL.md), where the parts come from is in [TRACES.md](TRACES.md).

**Verified:** 2026-11-10, against `main@58dde1b` (after v0.2.0). `pnpm signal` fetches `main` and says how many pull requests have merged since (not counting those that only move this file). It warns, it never blocks.

## Now

- **`v0.2.0` is out** (2026-11-10), after `v0.1.0` (2026-11-05). Nothing is on `main` that it does not carry; what it brought is in [CHANGELOG.md](CHANGELOG.md).
- **A first portal is open**, on Cloudflare at `firegate.space`, with a guest room (⛲ PlazaDelSol for the team, 🅿️ Parking for visitors; titles only, the ids are `general` and `guests`), its people, and no companion for guests yet (it has no engine). It is installed as an app on a phone and on a PC, and a person of the team stays signed in there.
- **The guest room** is a door with no key, a name of the hour and a key for a while ([#4](https://github.com/GratiaOS/portal/pull/4)); a trail on what is said (each message fades and is let go after `guests.trailMinutes`, 15, one at a time), an end by absence for the guests and their keys ([#7](https://github.com/GratiaOS/portal/pull/7), [#29](https://github.com/GratiaOS/portal/pull/29)); a visitor who leaves ends their own time ([#19](https://github.com/GratiaOS/portal/pull/19)). A visitor is welcomed by three lines made on their page and kept nowhere: the whisper, that nothing follows them and everything fades, that nothing is asked.
- **Nova for guests**, off until chosen, on an engine and a folder of her own (`guest-docs/` is the starter), in Node and on Cloudflare ([#5](https://github.com/GratiaOS/portal/pull/5), [#13](https://github.com/GratiaOS/portal/pull/13), [#17](https://github.com/GratiaOS/portal/pull/17)). Asked what is next, she gives one step ([#9](https://github.com/GratiaOS/portal/pull/9)). Three languages, Romanian, English and Spanish, and English for the rest ([#8](https://github.com/GratiaOS/portal/pull/8)).
- **On a phone** the rooms, the people and the settings are a sheet behind a top bar, the same in every look (titled sections, presses of 48 px or more, the scope kept in the radar), and a visitor's sheet says who they write as and how long the visit has left ([#35](https://github.com/GratiaOS/portal/pull/35), [#40](https://github.com/GratiaOS/portal/pull/40)); your own sign can be typed from a keyboard of emoji ([#37](https://github.com/GratiaOS/portal/pull/37)); an address in a message is a link ([#33](https://github.com/GratiaOS/portal/pull/33)). On a wide page what is said keeps to a reading column of about 44 rem, and the side on the left is the anchor ([#36](https://github.com/GratiaOS/portal/pull/36)). A rail was weighed and left out: it would add state for little.
- **To try one, with nothing to set up:** `pnpm dev` (this machine) or `pnpm dev:lan` (the network too; the keys travel in plain HTTP there) boots a portal in memory with a key for each person and the door for visitors open ([#43](https://github.com/GratiaOS/portal/pull/43)); `skins/template` is a look to copy, with five colours to change. The README is now a map (the signal, six checkpoints, the camp, and what a companion must not break), and its long parts are in `docs/` (how it works, Nova, the API, running one).
- **As an app:** `name` in the config, a manifest made from it, icons drawn in the repository (a brush stroke, in the manner of the Gratia mark but not it), a worker that keeps only the shell and never `/api` ([#38](https://github.com/GratiaOS/portal/pull/38)). A person can be renamed with `renamedFrom` ([#31](https://github.com/GratiaOS/portal/pull/31)).

## Next

Nothing is lined up in the repository. Three things are worth doing when someone has the time, in this order:

1. **Make an object's errors visible on Cloudflare.** A guest's stream failed with a `500` that said only "internal error", and `wrangler tail` showed no line for it, though the same error is plain in the log of `wrangler dev`. The cause was found by running the same config locally, not from production. Find out why the log of the object does not come through (and whether `observability` in `cloudflare/wrangler.jsonc` is what is missing), so that the next one is read, not reproduced.
2. **Turn the companion for guests on, in a portal that has an engine.** Everything is built and checked with stand-in models: a `companion` in the participants, `guests.nova` with its own `llm` and `knowledgeDir` (`guest-docs/` is the starter), and its key as a secret (INSTALL.md). The first real run of it, with a real model, on Cloudflare, has not happened.
3. **Look at the visitor page where it was not looked at**: Spanish and Romanian by eye, Safari and Firefox, and a screen reader on the sheet. A phone and the three looks have been looked at (measured at 375 px, and by hand on a phone and a PC).

Only talked about, not lined up: other kinds of room than a team's and a visitors' (voice, a canvas), a way for a program outside the process to listen to a room (`docs/how-it-works.md` says where it would touch), and a signal that each portal says of itself rather than one for the repository.

A portal that opens a guest room needs its own config for it (and an engine, if the companion is on): that is the config of whoever runs it, not a matter of this repository.

## Known limits

- On Cloudflare, after a deploy or a change of a secret, the object that is the portal can answer with the previous code or config for up to five minutes (Cloudflare's default deferred update, 300 seconds): look once, after the minutes. The `wrangler` pinned here has no flag to apply a code update at once; a newer one does (INSTALL.md).
- Closing the tab is not leaving: a visit runs out its time, as before. A landscape phone (375 px high) puts "Run your own" below the fold.
- Taking a message out sooner, on request, is not built: messages are kept until the portal forgets them, and nothing else removes one.
- A person with no `locale` gets the page in their browser's language and Nova's fixed sentences in English; there is no language for the portal as a whole.
- It is not decided whether the gate at `/` offers *Step through* beside the key, or only `/guest` does.
- The guest room on Cloudflare is checked locally with stand-in models (`pnpm cloudflare:check`); its first real opening found a defect the check had not looked for (#24), so what the check does not open is not known to work.
- Measured once, not enough: `guest-docs/` with a real model (eight questions, three languages, one run); not measured: Spanish by eye, in the page and on a phone; Nova's one-step habit with a real model (it is only a line of her prompt); contrast of the faint text by skin; Android Chrome notifications.

- A turn past the trail stays in the object's storage until the next check (about the least of ten minutes, `trailMinutes` and `forgetAfterMinutes`, and later by the delay of the alarm itself, which Cloudflare says can be a minute during maintenance or failover: a guide, not a ceiling): guests are not given it, but the team's readers of the guest room are, in that window.

## How this stays true

Whoever merges something that changes what the portal does or what comes next updates this file in the same sitting, or the next session does before anything else, and moves the stamp. This file keeps three kinds of things only: where we are, what is next, what is open. History goes to the changelog, procedures to their own pages.

> Say what she can see, and let the room look the way its people need it to.
