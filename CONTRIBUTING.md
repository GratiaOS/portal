# Contributing

Thank you for being here. The portal grows through small, careful changes, and through what it chooses not to do.

## Before you open a pull request

Ask of your change:

- Does it take something away (a duplicate, code it replaces) rather than add?
- Does a person, or a step already named, need it now?
- Can it be undone in one pull request, with the core still small?
- Does it respect the people in a portal: does it keep from watching them, and make it easier, not harder, to leave?

If the answer to two of the first three is no, it belongs in an issue, as an idea, not yet in the code.

## What the portal does not do

- **No telemetry.** Nothing phones home; an update is pulled by whoever runs a portal, never pushed.
- **No watching.** Presence says who is here and never when; it is not stored. Nothing counts how long or how often anyone looks.
- **No engagement.** No streaks, no badges, no "come back" nudges, no metrics of attention.
- **No forms forced on talk.** A pad may be structured when the thing is (a list, a ledger); a conversation is never pushed
  through fields.
- **A companion's voice is the model's.** No canned personality in the code; what she may say as fact comes from the config.

A change that needs one of these will not be merged, however good it is otherwise.

## How

- Small pull requests, each with its reason in the description. One step at a time.
- Tests with every change: `pnpm -r test` runs the three suites. A change to what the page looks like is measured, before
  and after, for everything that must not move.
- `pnpm --filter portal traces` checks the 🗿 traces (it needs the network for the links).
- Agents are contributors too, whoever helps write the code (companions, mirrors, tools), and follow the same rules: they ask before a large change, a person reads every diff before
  it lands, and nothing is pushed straight to `main`.

## Commits

Every commit says what it does, why, and carries two lines the `commit-msg` hook checks (it is set up by `pnpm install`):

```text
feat(page): a third column of whispers

- what changed, for whoever reads the history
- why

🌬️ whisper: "a short line on what this is for."

Signed-off-by: Your Name <you@example.com>
```

- **The whisper** is one line starting with `whisper:` (the 🌬️ is welcome, not required). It keeps the history saying why,
  not only what.
- **The sign-off** is the [Developer Certificate of Origin](https://developercertificate.org): by adding it (`git commit -s`)
  you say you have the right to give this change under the project's licence. There is no CLA.

## Credit

Your name is on your commits. Work done together says so with `Co-authored-by:` lines, and a pull request may end with a
`Credits:` line naming everyone who shaped it. Many of our commits carry `Co-authored-by: Codex Vienna <contact@gratia.space>`:
that is not a person but all of us, the signal of the garden this grew in.

## Ideas from elsewhere

The portal is written new (MPL-2.0). When an idea comes from another project, it is welcome, and it is written new, never
copied, with a 🗿 trace at the top of the file: where the name came from, a link to the place it was seen, what is the same,
what is different, and that nothing was copied. See [TRACES.md](TRACES.md).

## Conduct and security

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). A vulnerability goes to the address in [SECURITY.md](SECURITY.md), never to a public issue.

<!--
🗿 trace
Name from:  M3's CONTRIBUTING and AGENTS, and the Contributing of gratia.space.
Path:       https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/CONTRIBUTING.md
Path:       https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/AGENTS.md
Path:       https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/ABUNDANCE_CHARTER.md
Same idea:  small changes with their reason; a whisper on every commit; a DCO sign-off; credit both individual and
            collective; agents as contributors who ask first; non-surveillance by design; the questions gratia.space asks before
            a pull request (agency, capture, the freedom to leave), kept in its history with no public copy.
Different:  the three questions of the portal's own way of working; no two-steward rule yet; the hook is the portal's own.
Not copied: written new (MPL-2.0); M3's documentation is CC BY-SA 4.0.
-->
