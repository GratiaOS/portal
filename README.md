# El portal

![Heartware: states first, silence allowed](docs/heartware-badge.svg)

A small team chat, self-hosted, with live rooms and a companion who answers from a folder, on the model you bring. It has a room for visitors that forgets as it goes, and a page you can install as an app on your phone or PC.

Written from scratch, [MPL-2.0](LICENSE). Where its parts come from is recorded in [TRACES.md](TRACES.md). No central accounts, no telemetry, no presence tracking by time.

## 📡 Follow the signal

Where the project stands, what is moving, and what comes next: **[SIGNAL.md](SIGNAL.md)**, the project's living status note. Short on purpose, and kept true by whoever changes something.

## 🗺️ MAP

Your way into the portal. Start on your machine, make it your own, then open a door for others. Each stop is a checkpoint below.

1. **[See it](#-checkpoint-1-see-it).** Run the portal locally with `pnpm dev`.
2. **[Run your own](#-checkpoint-2-run-your-own).** Set up your people, their tokens and your database.
3. **[Add a companion](#-checkpoint-3-add-a-companion).** Meet Nova: give her a folder and connect your model.
4. **[Invite visitors](#-checkpoint-4-invite-visitors).** Open a guest room that forgets when they are gone.
5. **[Put it online](#-checkpoint-5-put-it-online).** Deploy it on Cloudflare or Node, then install it as an app.
6. **[Make it yours](#-checkpoint-6-make-it-yours).** Give it another look, with a skin.
7. **[Rest](#rest).** What you can rely on, and what is still taking shape.

⛰️ **Where it leads:** a portal of your own, that you can hand to people.

## 📍 Checkpoint 1: see it

You need Node 22.18+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev            # this machine only; pnpm dev:lan opens it to your network
```

It prints a link and a key for each person. Nothing else is needed: the room lives in memory, the keys are made at the start, and the door for visitors is open at `/guest`.

Stop it and everything is gone. With `pnpm dev:lan` the rest of your network can open it too; the keys travel in plain HTTP there, so use it only on a network you trust.

No companion yet: she needs a model, at checkpoint 3. To see the whole thing played out first, with a stand-in Nova: `pnpm demo`.

## 📍 Checkpoint 2: run your own

```bash
cp portal.example.json portal.local.json                      # your config; gitignored
pnpm build
pnpm --filter portal tokens portal.local.json new Zeus        # a token for each person, in portal.tokens.local.json
pnpm start
```

You should see the version and the address it listens on (`127.0.0.1`: anything wider belongs behind TLS).

The config says who is in, which rooms there are, and how long things are kept (`"retention"`). Tokens live apart, so the config can be shared.

More, including two portals on one machine (one to try things on): [docs/running.md](docs/running.md) and [INSTALL.md](INSTALL.md).

## 📍 Checkpoint 3: add a companion

Add a `nova` section to the config: the model (any OpenAI-compatible endpoint, with the *name* of the variable that holds its key) and `knowledgeDir`, a folder of markdown outside this repo.

Nova says what she read, what she left out, and what she did not know.

When someone asks her, that model's server receives the last messages of that room and the folder, less what `nova.exclude` names. Point it at a model you are willing to send them to.

All of it: [docs/nova.md](docs/nova.md). To try your endpoint first: `node --env-file=.env scripts/smoke.mjs`.

## 📍 Checkpoint 4: invite visitors

Add a room for them to your config:

```json
"rooms": [{ "id": "general", "title": "General" }, { "id": "guests", "title": "Guests", "kind": "guest" }],
"guests": { "room": "guests" }
```

A visitor at `/guest` is given a name, a key and that room, for 60 minutes, and does only what that gives them.

What is said fades from the page and is let go after 15 minutes, one message at a time (the portal checks every few minutes, and a visitor is not given a message past its time in the meantime). When the last visitor has gone, the visitors and their keys go too.

You can limit how many come in at once and per address, give them a companion of their own, and point her at the starter documents in `guest-docs/`. The whole of it is in [INSTALL.md](INSTALL.md), under *A guest room*.

## 📍 Checkpoint 5: put it online

On Cloudflare, `pnpm cloudflare:deploy` puts the page on the Worker's assets and the portal in one Durable Object. The config and the tokens are secrets; the steps are in [INSTALL.md](INSTALL.md#on-cloudflare). On Node, run it behind a TLS proxy you choose.

Either way, `name` in the config is what the portal is called.

There is no separate app to build or configure: the portal's own page can be installed from the browser, on a phone or a PC. ⚙ offers it where the browser gives the means, and says how on iOS.

A person of the team who signs in *in the installed app* stays signed in on that device until they leave the portal. A visitor never does.

A deploy or a new secret can take five minutes to reach a running object.

## 📍 Checkpoint 6: make it yours

A look is a folder. [`skins/template`](skins/template) is one, with five colours to change.

```bash
cp -r skins/template skins/mine     # then say `mine` in skin.json and in the first line of skin.css, and change the five colours
# in your config: "skinsDir": "skins"        (pnpm dev already offers the folder)
```

It keeps the ledger layout of a built-in look and changes only what you say. Take away `extends` to lay the page out another way.

The parts you can rely on, and the rules of the contract, are in [ui/src/skins/README.md](ui/src/skins/README.md).

<a id="rest"></a>

## 🏕️ Rest and enjoy

You do not need to understand every moving part to use the portal.

### What you can rely on

Each of these is backed by a test or by the code:

- **Your portal runs where you put it.** Nothing phones home. The model is the one you named, and it hears only what is described in checkpoint 3.
- **A turn is never edited.** A team room keeps the last 14 days or 999 messages, whichever ends first, and what is let go is overwritten in the file. A portal that keeps more says so in its config, and its people are told.
- **A visitor leaves no trace on their device** beyond the tab. And a visitor cannot read a message once its trail has passed; the stored turn is removed at a later check (a few minutes at most), and whoever runs the portal, or reads the guest room as one of its team, can still read it in that interval.
- **Who is here is a dot, and never when.**
- **Whoever runs the machine can read the room** while it is kept. Visitors are told so, under the box where they write.

### What is still taking shape

- Other kinds of room than a team's and a visitors' (voice, a canvas).
- A way for a program outside the process to listen to a room.
- Taking a message out sooner, on request.
- A look at the page in Safari and Firefox, and a read by people of the Romanian and Spanish (both are in the page; neither has been reviewed yet by native readers).

The current list is in [SIGNAL.md](SIGNAL.md).

### Looking for something specific?

| If you want to… | read |
| --- | --- |
| run one, step by step | [INSTALL.md](INSTALL.md) |
| understand how it is made | [docs/how-it-works.md](docs/how-it-works.md) |
| talk to it from code | [docs/api.md](docs/api.md) |
| change how it looks | [ui/src/skins/README.md](ui/src/skins/README.md) |
| take part | [CONTRIBUTING.md](CONTRIBUTING.md) |
| report a vulnerability | [SECURITY.md](SECURITY.md) |

## For companions

If you are an agent reading this to work on the repo, or to run a portal: read [SIGNAL.md](SIGNAL.md) first, then [docs/how-it-works.md](docs/how-it-works.md).

The code is organised so:

- `src/`: the portal, TypeScript, no runtime dependencies
- `ui/`: the page
- `cloudflare/`: the second home
- `test/`: `pnpm test` runs it all

What not to break, and why:

- **A turn is never changed**, and the database enforces it. Forgetting removes; nothing edits.
- **Presence never says when.** Not on the wire, not on the page.
- **A visitor is never given what has outlived its trail**, and the portal lets it go at its next check, a few minutes at most; until then it is still in the store, and whoever runs the portal can read it. On the visitor's device nothing is kept past the tab (`sessionStorage` for their key, memory for what they read). The service worker (`ui/public/sw.js`) never touches `/api`.
- **The page names what a thing is (`data-part`), never how it looks.** A new part is a change to `ui/src/skins/README.md` and to every look, together; a test keeps them in step.
- **Say what was and was not checked.** A change that is not looked at where it matters is not done. Write the commit and the PR so that the next one can tell which is which. Commits carry a whisper line and a DCO sign-off ([CONTRIBUTING.md](CONTRIBUTING.md)).

🌬️ whisper: _"the portal forgets what was said; the garden remembers what was understood."_
