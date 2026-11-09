# 📡 Signal

Where El portal is, for whoever starts work on it next. Short on purpose: what changed is in [CHANGELOG.md](CHANGELOG.md), how to run one is in [INSTALL.md](INSTALL.md), where the parts come from is in [TRACES.md](TRACES.md).

**Verified:** 2026-11-09, against `main@0f7dea3`. `pnpm signal` says how far `main` has moved since. It warns, it never blocks.

## Now

- `v0.1.0` is out (2026-11-05). On `main` since, not released:
  - the guest room: a door with no key ([#4](https://github.com/GratiaOS/portal/pull/4)), Nova for guests, off until chosen ([#5](https://github.com/GratiaOS/portal/pull/5)), the page for a visitor ([#6](https://github.com/GratiaOS/portal/pull/6)), a room that ends by absence ([#7](https://github.com/GratiaOS/portal/pull/7));
  - three languages, Romanian, English and Spanish, and English for the rest ([#8](https://github.com/GratiaOS/portal/pull/8)).
- Open: [#9](https://github.com/GratiaOS/portal/pull/9), Nova gives one step when asked what is next.

## Next, in this order

1. **A folder of public documents for Nova for guests.** She is off for guests until one engine is chosen, and has no public folder shipped yet: when she is on, she talks and says what she does not know.
2. **A welcome for visitors** that is a whisper of the place, never a line in Nova's mouth.
3. **`Leave` ends a visitor's time.** Today "the last one to leave" is counted by the binding's time, so a guest who left stays on the roster until it ends.

## Known limits

- Taking a message out sooner, on request, is not built: messages are kept until the portal forgets them, and nothing else removes one.
- A person with no `locale` gets the page in their browser's language and Nova's fixed sentences in English; there is no language for the portal as a whole.
- It is not decided whether the gate at `/` offers *Step through* beside the key, or only `/guest` does.
- Not measured: Spanish by eye, in the page and on a phone; Nova's one-step habit with a real model; contrast of the faint text by skin; Android Chrome notifications.

## How this stays true

Whoever merges something that changes what the portal does or what comes next updates this file in the same sitting, or the next session does before anything else, and moves the stamp. This file keeps three kinds of things only: where we are, what is next, what is open. History goes to the changelog, procedures to their own pages.

> Say what she can see, and let the room look the way its people need it to.
