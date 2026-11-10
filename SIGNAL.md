# 📡 Signal

Where El portal is, for whoever starts work on it next. Short on purpose: what changed is in [CHANGELOG.md](CHANGELOG.md), how to run one is in [INSTALL.md](INSTALL.md), where the parts come from is in [TRACES.md](TRACES.md).

**Verified:** 2026-11-10, against `main@7d82ad5`. `pnpm signal` fetches `main` and says how many pull requests have merged since (not counting those that only move this file). It warns, it never blocks.

## Now

- **A first portal has opened its guest room**, on Cloudflare, without the companion for guests (it has no engine yet): visitors come in, read and write, see the whisper and the notice of who reads the room, and leave. It is the first time the door has been used by anyone but us.
- `v0.1.0` is out (2026-11-05). On `main` since, not released:
  - the guest room: a door with no key ([#4](https://github.com/GratiaOS/portal/pull/4)), Nova for guests, off until chosen ([#5](https://github.com/GratiaOS/portal/pull/5)), the page for a visitor ([#6](https://github.com/GratiaOS/portal/pull/6)), a room that ends by absence ([#7](https://github.com/GratiaOS/portal/pull/7));
  - three languages, Romanian, English and Spanish, and English for the rest ([#8](https://github.com/GratiaOS/portal/pull/8)).
- Nova gives one step when asked what is next ([#9](https://github.com/GratiaOS/portal/pull/9)).
- A starter folder of documents for the companion for guests, `guest-docs/`, the same for anyone who runs a portal ([#13](https://github.com/GratiaOS/portal/pull/13)).
- The page tells a visitor, under the box and in their language, who reads the room ([#16](https://github.com/GratiaOS/portal/pull/16)).
- The companion for guests on Cloudflare too: her own engine and secret, her own bundled folder ([#17](https://github.com/GratiaOS/portal/pull/17)).
- A visitor who leaves ends their own time at the portal: the key stops opening anything, the stream closes, the slot is free ([#19](https://github.com/GratiaOS/portal/pull/19)).
- Fixed on Cloudflare: a guest's stream and the leaving of a person failed because a timer there is a plain number ([#24](https://github.com/GratiaOS/portal/pull/24)); the Cloudflare check now opens a guest's stream.
- A whisper of the place for a visitor, *Many wings, same flight.*, in Romanian, English and Spanish ([#22](https://github.com/GratiaOS/portal/pull/22)); since [#29](https://github.com/GratiaOS/portal/pull/29) it is a bubble that is no one's at the foot of the room, with two lines under it (nothing follows you, everything fades; nothing is asked of you), made on the visitor's page and kept nowhere.
- **The guest room has a trail** ([#29](https://github.com/GratiaOS/portal/pull/29)): each message fades on the page and is let go after `guests.trailMinutes` (15), one at a time, in one statement at the check that already runs; a guest is not given a turn past it by history, replay or the companion's context. The end by absence stays for the guests, their keys and what is left.
- The gate: the doorway is as tall as what is in it, the key is in the field (`🗝️ your token`), and *Step through* goes by the field: a key goes in as the person, nothing is the door for visitors ([#20](https://github.com/GratiaOS/portal/pull/20)).

## Next

Nothing is lined up in the repository. Three things are worth doing when someone has the time, in this order:

1. **Make an object's errors visible on Cloudflare.** A guest's stream failed with a `500` that said only "internal error", and `wrangler tail` showed no line for it, though the same error is plain in the log of `wrangler dev`. The cause was found by running the same config locally, not from production. Find out why the log of the object does not come through (and whether `observability` in `cloudflare/wrangler.jsonc` is what is missing), so that the next one is read, not reproduced.
2. **Turn the companion for guests on, in a portal that has an engine.** Everything is built and checked with stand-in models: a `companion` in the participants, `guests.nova` with its own `llm` and `knowledgeDir` (`guest-docs/` is the starter), and its key as a secret (INSTALL.md). The first real run of it, with a real model, on Cloudflare, has not happened.
3. **Look at the visitor page where it was not looked at**: Spanish and Romanian by eye, a phone, the other skins, Safari and Firefox.

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
