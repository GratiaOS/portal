# 📡 Signal

Where El portal is, for whoever starts work on it next. Short on purpose: what changed is in [CHANGELOG.md](CHANGELOG.md), how to run one is in [INSTALL.md](INSTALL.md), where the parts come from is in [TRACES.md](TRACES.md).

**Verified:** 2026-11-09, against `main@24c3e79`. `pnpm signal` fetches `main` and says how many pull requests have merged since (not counting those that only move this file). It warns, it never blocks.

## Now

- `v0.1.0` is out (2026-11-05). On `main` since, not released:
  - the guest room: a door with no key ([#4](https://github.com/GratiaOS/portal/pull/4)), Nova for guests, off until chosen ([#5](https://github.com/GratiaOS/portal/pull/5)), the page for a visitor ([#6](https://github.com/GratiaOS/portal/pull/6)), a room that ends by absence ([#7](https://github.com/GratiaOS/portal/pull/7));
  - three languages, Romanian, English and Spanish, and English for the rest ([#8](https://github.com/GratiaOS/portal/pull/8)).
- Nova gives one step when asked what is next ([#9](https://github.com/GratiaOS/portal/pull/9)).
- A starter folder of documents for the companion for guests, `guest-docs/`, the same for anyone who runs a portal ([#13](https://github.com/GratiaOS/portal/pull/13)).
- The page tells a visitor, under the box and in their language, who reads the room ([#16](https://github.com/GratiaOS/portal/pull/16)).
- The companion for guests on Cloudflare too: her own engine and secret, her own bundled folder ([#17](https://github.com/GratiaOS/portal/pull/17)).
- A visitor who leaves ends their own time at the portal: the key stops opening anything, the stream closes, the slot is free ([#19](https://github.com/GratiaOS/portal/pull/19)).
- A whisper of the place for a visitor in the empty room, *Many wings, same flight.*, in Romanian, English and Spanish ([#22](https://github.com/GratiaOS/portal/pull/22)).
- The gate: the doorway is as tall as what is in it, the key is in the field (`🗝️ your token`), and *Step through* goes by the field: a key goes in as the person, nothing is the door for visitors ([#20](https://github.com/GratiaOS/portal/pull/20)).

## Next

Nothing is lined up in the repository. What is left is a deploy: a portal that opens a guest room needs its own engine for guests, its secret and its folder (`guest-docs/` or one's own) in its config, which is the config of whoever runs it and not a matter of this repository (INSTALL.md says how).

## Known limits

- Closing the tab is not leaving: a visit runs out its time, as before. A landscape phone (375 px high) puts "Run your own" below the fold.
- Taking a message out sooner, on request, is not built: messages are kept until the portal forgets them, and nothing else removes one.
- A person with no `locale` gets the page in their browser's language and Nova's fixed sentences in English; there is no language for the portal as a whole.
- It is not decided whether the gate at `/` offers *Step through* beside the key, or only `/guest` does.
- The companion for guests on Cloudflare was checked locally with stand-in models (`pnpm cloudflare:check`), not on a deployed Worker.
- Measured once, not enough: `guest-docs/` with a real model (eight questions, three languages, one run); not measured: Spanish by eye, in the page and on a phone; Nova's one-step habit with a real model (it is only a line of her prompt); contrast of the faint text by skin; Android Chrome notifications.

## How this stays true

Whoever merges something that changes what the portal does or what comes next updates this file in the same sitting, or the next session does before anything else, and moves the stamp. This file keeps three kinds of things only: where we are, what is next, what is open. History goes to the changelog, procedures to their own pages.

> Say what she can see, and let the room look the way its people need it to.
