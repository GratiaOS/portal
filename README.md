# El portal

![Heartware: states first, silence allowed](docs/heartware-badge.svg)

A small team chat, self-hosted, with a companion who answers from a folder, on the model you bring. A room for visitors that forgets as it goes. An app you can install.

Written new, [MPL-2.0](LICENSE), with where its parts come from in [TRACES.md](TRACES.md). No central accounts, no telemetry, no presence tracking by time.

## 🗺️ MAP

You are at the start. This is the road, and where to read more at each stop.

```
 🗺️ here ─► ⛰️ where you are going
              │
              ├─ 📍 1  See it         a portal on your machine in a minute      pnpm dev
              ├─ 📍 2  Keep one       your people, your tokens, your database   INSTALL.md
              ├─ 📍 3  Give it a companion   Nova, from a folder, on your model docs/nova.md
              ├─ 📍 4  Open a door    a room for visitors, that forgets         INSTALL.md › A guest room
              ├─ 📍 5  Put it online  Cloudflare or Node, and an app            INSTALL.md › On Cloudflare
              ├─ 📍 6  Make it yours  a new look in two minutes                 skins/template
              └─ 🏕️ rest              what you can rely on, and what is not yet
```

| If you want to… | read |
| --- | --- |
| know where the project is and what comes next | [SIGNAL.md](SIGNAL.md) |
| run one, step by step | [INSTALL.md](INSTALL.md) |
| understand how it is made | [docs/how-it-works.md](docs/how-it-works.md) |
| talk to it from code | [docs/api.md](docs/api.md) |
| change how it looks | [ui/src/skins/README.md](ui/src/skins/README.md) |
| take part | [CONTRIBUTING.md](CONTRIBUTING.md) · report a vulnerability: [SECURITY.md](SECURITY.md) |

**For companions** (an agent reading this to work on the repo, or to run one): read [SIGNAL.md](SIGNAL.md) first, then [docs/how-it-works.md](docs/how-it-works.md). The code is `src/` (the portal, TypeScript, no runtime dependencies), `ui/` (the page), `cloudflare/` (the second home), `test/` (`pnpm test` runs it all). What not to break, and why:

- **A turn is never changed**, and the database enforces it. Forgetting removes; nothing edits.
- **Presence never says when.** Not on the wire, not on the page.
- **Nothing a visitor says is kept past its trail** (a visitor is not given it once it has passed, and the portal lets it go at its next check, a few minutes at most), in the store or on their device (`sessionStorage` for their key, memory for what they read). The service worker (`ui/public/sw.js`) never touches `/api`.
- **The page names what a thing is (`data-part`), never how it looks.** A new part is a change to `ui/src/skins/README.md` and to every look, together; a test keeps them in step.
- **Say what was and was not checked.** A change that is not looked at where it matters is not done; write the commit and the PR so that the next one can tell which is which. Commits carry a whisper line and a DCO sign-off ([CONTRIBUTING.md](CONTRIBUTING.md)).

## ⛰️ Destination

A portal of your own, that you can hand to people:

- **Rooms with a live page.** People and a companion; messages arrive as they are written, and a client that reconnects catches up on what it missed.
- **A companion, Nova.** Ask her with `@nova`: she answers from a folder of markdown, says which files she relied on, and is checked on the figures she gives.
- **A room for visitors**, open with no key: a name of the hour, one room, and what is said there fades and is let go.
- **An app**, installed from the browser, on a phone or a PC, with a look you chose (three built in, and yours in a folder).
- **Two homes.** A Node server with no runtime dependencies, or one Worker and one Durable Object on Cloudflare.

## 📍 Checkpoint 1: see it

You need Node 22.18+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev            # this machine only; pnpm dev:lan opens it to your network
```

It prints a link and a key for each person, and nothing else is needed: the room lives in memory, the keys are made at the start, and the door for visitors is open at `/guest`. Stop it and everything is gone. With `pnpm dev:lan` it also prints the address the rest of your network can open (the keys travel in plain HTTP there, so only on a network you trust). No companion yet: she needs a model, at checkpoint 3.

A look at the whole thing played out, with a stand-in Nova: `pnpm demo`.

## 📍 Checkpoint 2: keep one

```bash
cp portal.example.json portal.local.json                      # your config; gitignored
pnpm build
pnpm --filter portal tokens portal.local.json new Zeus        # a token for each person, in portal.tokens.local.json
pnpm start
```

You should see the version and the address it listens on (`127.0.0.1`: anything wider belongs behind TLS). The config says who is in, in which rooms and for how long things are kept (`"retention"`); the tokens are kept apart so the config can be shared. More, and two portals on one machine (one to try things on): [docs/running.md](docs/running.md) and [INSTALL.md](INSTALL.md).

## 📍 Checkpoint 3: give it a companion

Add a `nova` section to the config: the model (any OpenAI-compatible endpoint, with the *name* of the variable that holds its key) and `knowledgeDir`, a folder of markdown outside this repo. She says what she read, what she left out, and what she did not know. When someone asks her, that model's server receives the last messages of that room and the folder, less what `nova.exclude` names, so point it at a model you are willing to send them to. All of it: [docs/nova.md](docs/nova.md). To try your endpoint first: `node --env-file=.env scripts/smoke.mjs`.

## 📍 Checkpoint 4: open a door

```json
"rooms": [{ "id": "general", "title": "General" }, { "id": "guests", "title": "Guests", "kind": "guest" }],
"guests": { "room": "guests" }
```

A visitor at `/guest` is given a name, a key and that room, for 60 minutes, and does only what that gives them. What is said fades on the page and is let go after 15 minutes, one message at a time; when the last visitor has gone, the visitors and their keys go too. Limits (how many at once, how many per address), a companion of their own and the starter documents for her (`guest-docs/`) are in [INSTALL.md](INSTALL.md).

## 📍 Checkpoint 5: put it online

On Cloudflare, `pnpm cloudflare:deploy` puts the page on the Worker's assets and the portal in one Durable Object (the config and the tokens are secrets; the steps are in [INSTALL.md](INSTALL.md#on-cloudflare)). On Node, behind a TLS proxy you choose. Either way, `name` in the config is what the portal is called, and the page can be installed as an app: ⚙ offers it where the browser gives the means, and says how on iOS. A person of the team who signs in *in the installed app* stays signed in on that device until they sign out; a visitor never does. A deploy or a new secret can take five minutes to reach a running object.

## 📍 Checkpoint 6: make it yours

A look is a folder: [`skins/template`](skins/template) is one, with five colours to change.

```bash
cp -r skins/template skins/mine     # then say `mine` in skin.json and in the first line of skin.css, and change the five colours
# in your config: "skinsDir": "skins"        (pnpm dev already offers the folder)
```

It keeps the ledger layout of a built-in look and changes only what you say; take away `extends` to lay the page out another way. The parts you can rely on are listed, with the rules of the contract, in [ui/src/skins/README.md](ui/src/skins/README.md).

## 🏕️ Rest and enjoy

**What you can rely on**, and a test or the code says so:

- **Your portal runs where you put it.** Nothing phones home. The model is the one you named, and it hears only what is said above.
- **A turn is never edited.** A team room keeps the last 14 days or 999 messages, whichever ends first, and what is let go is overwritten in the file; a portal that keeps more says so in its config, and its people are told.
- **A visitor leaves no trace on their device** beyond the tab, and none in the room past the trail (give or take the few minutes between two checks).
- **Who is here is a dot, and never when.**
- **Whoever runs the machine can read the room** while it is kept. Visitors are told so, under the box where they write.

**What is not yet:** other kinds of room than a team's and a visitors' (voice, a canvas), a way for a program outside the process to listen to a room, taking a message out sooner on request, and a look at it in Safari and Firefox, and in Spanish and Romanian by eye. The honest list is in [SIGNAL.md](SIGNAL.md), kept true by whoever changes something.

*The portal forgets what was said. The garden remembers what was understood.*
