# El portal

A small team chat, self-hosted. A companion that answers from a folder, using the model you bring.

Run it on your own machine or Cloudflare account. Invite people with individual tokens. Keep conversations in your own portal, and choose which model receives them.

No central accounts. No telemetry. No presence tracking by time.

MPL-2.0. Written new, with its origins documented in [TRACES.md](TRACES.md).

Where it is and what comes next: [SIGNAL.md](SIGNAL.md). To run one, [INSTALL.md](INSTALL.md). To take part, [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, [SECURITY.md](SECURITY.md). The license is in [LICENSE](LICENSE).

## What you get

- **Rooms with a live page.** People and a companion in rooms; messages arrive as they are written, and a client that reconnects catches up on what it missed.
- **A companion, Nova.** Ask her with `@nova`: she answers from a folder of markdown and says which files she relied on.
- **A page** the portal serves itself, with skins that change how it looks without touching what it says.
- **Two homes.** A Node server with no runtime dependencies, or one Worker and one Durable Object on Cloudflare. See [INSTALL.md](INSTALL.md).

## What stays yours

- **Where it runs.** On your machine or in your Cloudflare account. Nothing phones home.
- **Who comes in.** One token per person, made from the command line. No passwords, no accounts.
- **What is kept.** Each room keeps the last 14 days or its last 999 messages, whichever ends first; the rest is gone. A portal that must keep more says so in its config, and its people are told.
- **Which model hears you.** Any OpenAI-compatible endpoint. When someone asks Nova, that model's server receives the last `contextTurns` messages of that room and the knowledge folder, less whatever `nova.exclude` names, so point it at a model you are willing to send them to.

More in [SECURITY.md](SECURITY.md).

## Run it

```bash
cp portal.example.json portal.local.json                                  # gitignored; the config, with no secrets in it
pnpm --filter portal build
pnpm --filter portal tokens portal.local.json new Zeus                    # a token for each human, kept in portal.tokens.local.json (chmod 600)
pnpm --filter portal tokens portal.local.json new Hera
pnpm --filter portal start                                              # or: node dist/main.js path/to/config.json
```

`pnpm --filter portal start` loads `.env` from the portal's folder if there is one. The example config is meant to fail until every human has a token (humans only; a companion speaks from inside the room). It listens on `127.0.0.1`: anything wider belongs behind a TLS proxy, because the token travels in a header. `node dist/main.js --version` says which room this is (the version of its `package.json`), and the first line it logs when it starts says it too.

### Tokens

A token is what a person sends to come in. The config says who is in the portal (`participants`) and where the tokens are kept (`"tokensFile": "portal.tokens.local.json"`); the tokens live in that file, `{ "Zeus": "…" }`, beside the config, so the config can be read and shared and the tokens kept to a few. If others can read the tokens file the room says so when it starts (`chmod 600`). A token may still be written inline in `participants` (`"token": "…"`), but not both for the same person.

```bash
pnpm --filter portal tokens <config>                  # who has a token, never the tokens themselves
pnpm --filter portal tokens <config> new <name>       # make one for a person who has none (24 characters at least is what the portal asks for; this makes 43)
pnpm --filter portal tokens <config> show <name> | pbcopy    # hand it over: it goes to a pipe, and not to a terminal unless you pass --reveal
pnpm --filter portal tokens <config> rotate <name>    # replace one; the old one stops working when the portal restarts
```

`new` and `rotate` do not print the token. A portal that cannot start because a human has no token says which one and what to run.

### Two portals on one machine

Keep one portal to try things on and one for the people who rely on it, so that a test, a restart or a mistake never reaches them. They are two configs and two databases, named for their role:

| | to try things on | for the team |
| --- | --- | --- |
| config | `portal.dev.local.json` | `portal.team.local.json` |
| tokens | `portal.dev.tokens.local.json` | `portal.team.tokens.local.json` |
| database | `data/dev.db` | `data/team.db` |
| port | 3100 | 3101 |

Both read the same `.env` (the model's key). Keep what they have in common in step by hand (`nova.llm`, `nova.exclude`, `knowledgeDir`): the test portal is only worth anything if it behaves like the other.

### Smoke test your endpoint

```bash
cp .env.example .env   # then set PORTAL_LLM_BASE_URL and PORTAL_LLM_API_KEY
node --env-file=.env scripts/smoke.mjs
```

Needs Node 22+. Any OpenAI-compatible chat-completions endpoint works. The script prints the shape of the response (message keys, stream delta keys, timings), never the key.

`.env` and `*.local.json` are gitignored: everything specific to one company stays in those files.

### See it work

```bash
pnpm --filter portal demo
```

Four people and a stand-in Nova chat in two rooms, in a real portal (in memory, a free port): a late arrival is handed what he missed, Nova answers an `@mention`, someone goes for coffee and is seen leaving. The script prints the wall as a LAN chat would (`[HH:MM] #room <Nick> text`) and then checks its own claims; it exits non-zero if one fails, and a test runs it.

Nova here is a script, not a model: she listens with `hub.on('turn')` and answers with `hub.publish`, the same two calls a companion backed by a real model will use. The names are invented on purpose; swap them freely.

## How it works

### The core

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

### The live stream

`Hub` is the one way a turn enters the portal (`hub.publish`) and the one place presence lives; `serveStream` puts a connection on it over server-sent events.

- `hello` comes first on every connection: who you are, who is here, the rooms, and `lastSeq`. It has no `id`.
- `message` carries a turn, with its `seq` as the event `id`. A client that reconnects sends `Last-Event-ID` and gets what it missed right after `hello`, across all rooms; with no id it gets nothing and reads history over REST. If `lastSeq` in `hello` is lower than the last id a client saw, the room's database was reset and the client should reload its history.
- `activity` says a companion is working on an answer in a conversation (`thinking`, then `idle`); `hello` carries who is thinking right now. Never stored.
- `presence` says someone is online or offline, **and never when**: the portal does not know when anyone came or went, so nothing on the wire could be made into a timecard. A human who is gone for less than the grace period (5 s) is not announced as gone, so a refresh does not blink; several tabs count as one person; a companion is always online.
- `hub.on('turn', …)` is where a companion listens.
- A comment line is sent every 25 s, and a client that falls 1 MB behind is cut off and resumes from its last id.

### The page

`ui/` is the portal's face: React, Vite and Tailwind, built to `ui/dist`. Put `"staticDir": "ui/dist"` in the config and the portal serves it next to its API, on the same origin, with a policy that lets it load only from the portal.

```bash
pnpm --filter portal-ui build        # or, while working on it: pnpm --filter portal-ui dev (on :5175, proxying /api to a room on :3100)
```

It is a light sky of blue leaning a little to violet, with a glow and bubbles of oxygen that rise behind the conversation (none for anyone who asks the system for less motion), chosen to be light on a grey day and checked for contrast. It lists the channels and the people of the room. Who is here is a dot, and **never when**: no clock time anywhere on presence, because the room does not have one to give. While a companion works on an answer, the channel says so ("Nova is thinking…") for everyone in it. Its logic is plain TypeScript, tested with node's own type stripping (`pnpm --filter room-ui test`).

**Skins.** What the page looks like, and where things sit, is not in the components: they say what each thing is (`data-part="message"`) and its state (`data-here`), and a stylesheet answers them. There are three: 🫧 (`bubbles.css`, the one the room starts in: a light sky, rounded glass, bubbles), 🏦 (`bank.css`: a ledger, where a message is a row of time, who and what, and every corner is square) and 🪖 (`radar.css`: the people are points on a round scope that pulse while someone works on an answer and ping when someone speaks, and the words are a plain log beside it). On a wide page every look has a third column at the right, with a few quiet lines that turn by themselves (`FieldWhispers`, from Firegate's `FieldCompanion`): one set while someone is here and another after a minute with nothing done, which the page asks of itself and keeps nowhere; they are not announced as they turn, and for anyone who asks for less motion the first stays. On a phone there is no column. They are not colour schemes of one layout, the way CSS Zen Garden had one HTML and many CSS. Each person chooses with the buttons in the side, and the browser remembers it. A room can also offer looks of its own: put a folder of skins next to the config and name it in `skinsDir`; the room checks that each keeps to its own scope and serves it. The parts and states a skin can rely on, and how a skin from a folder is made, are in `ui/src/skins/README.md`, and a test keeps that list, the page and every built-in skin in step.

### Nova

A colleague you talk to the way you talk to each other, who knows what is written in a folder of markdown. Add a `nova` section to the config (see `portal.example.json`): the model (any OpenAI-compatible endpoint, with the NAME of the environment variable that holds its key), and `knowledgeDir`, outside this repo if it belongs to a company. Without a folder yet she still talks, and says what is not written down for her.

- **She speaks in her own voice.** Her voice is the model's, guided by who she is in the prompt (a colleague, not a help desk; the language and register of whoever wrote; warm, direct, short by default). She says hello back, jokes, thinks out loud, says what she does not know in her own words. The portal writes none of her lines. The few fixed ones it does say, when the model is out of reach, came back empty, or when she is told to wait, are plain on purpose.
- Ask her with `@nova` in any room. She sees the last `contextTurns` messages of that room, nothing from the others. The model's server gets those messages and the knowledge, so point it at a model you are willing to send them to (a local one, for a company).
- The folder is read whole (markdown, and `.canvas` flows as their boxes, groups and arrows in text) and put at the start of the prompt, the same text every time, so the model server can keep it cached; it is looked at again before each question, so the knowledge can grow while the portal runs. (That is on Node. On Cloudflare the folder is bundled at deploy time, so a change to a file goes up with a new deploy.) It must fit in a prompt (400 KB); past that it needs retrieval.
- **What she leans on is checked.** She replies with `SAY` (hers), `SOURCES` (the files she relied on) and `GAP` (what the knowledge was missing), all optional, and with no labels at all the whole text is what she says. The portal checks the files she names exist, and that every figure she gives is in them or in the conversation (a fenced diagram, Mermaid and the like, is not read for figures: its labels are identifiers, not claims; a JSON block or a bare fence is read). If a figure is nowhere, she is shown what she wrote and asked once to say it again, in her own voice: name the file that has it, or leave it out. If it is still nowhere, she says plainly that she will not give those figures. A model that sounds sure and adds "probably 0.99%" is a known failure, and it was caught on a real one.
- When she reasons past what is written, the prompt asks her to say so plainly and to say what it rests on. The portal cannot check wording, only files and figures: a claim in plain words is only as good as the model and the knowledge, which is why her answers carry their sources.
- **What she reads, and what she must not.** She reads every `.md` and `.canvas` under `knowledgeDir`, whether or not git tracks it (a folder you keep out of git is not kept out of her prompt), and sends all of it to the model on each question. Dot-folders and `node_modules` are skipped. `nova.exclude` lists paths inside that folder she never reads, a folder taking everything under it, without regard to case: `"exclude": ["partners/interfaces", "offerings/tithes.md"]`. When the portal starts it says what she reads (`reads 34 files: altars (8), reference (6), 2 at the top`) and what is kept from her (`leaves out: partners/interfaces (nothing there now)`), and while it runs it says so once if a new folder shows up at the top of the knowledge, so that she does not start reading it unseen.
- **She knows the portal she is in.** The first thing a company asks is about the portal itself: how long are the messages kept, who is an administrator, which model is this, where do my questions go. The prompt carries `PORTAL FACTS`, made from the config each time, so they are true by construction: who is in the portal and its rooms; that every message is kept with no end date in one database file on the host (or only in memory, for `:memory:`), append-only, readable by whoever runs the machine; that nobody in the portal is an administrator; what she sees (the last `contextTurns` messages of the room, no memory, no tools, she only writes); the model's name and the host of the server her questions go to (never a path, a port or a key); how many files she reads, and that some are kept out (never which). About anything else concerning the portal she is told to say she does not know and that whoever runs it does. What only your company knows goes in `nova.facts`, a few lines she may say as fact: `"facts": ["The portal is run by the infrastructure team."]` (up to 10 of 300 characters). A figure she takes from the facts is not counted as invented; as with the conversation, the check vouches for the figure and not for the sentence it sits in (the portal checks figures, not wording).
- **Examples in the box.** The box where people write rotates slowly through a few lines that say how to call her, and through `nova.examples`: questions she is good at, in your company's own words, up to 8 of 120 characters (`"who guards the gates of Olympus?"`; the page puts `@nova, ` in front). The rotation stops when someone starts to write and when the system asks for less motion. Without examples, only the general lines remain.
- Questions go one at a time (a local model usually takes one); up to `maxQueue` wait, and the next is told so. While she works, clients are told `activity: thinking`, which with a reasoning model is 10 to 40 seconds, a hello included.
- **What the knowledge lacked is kept.** When she says something was missing (`GAP`), or her figures could not be backed, the question goes on a list: the question, why, how often it was asked (case, accents and the closing punctuation do not make it a new question), the day first and last, the room. **Not who asked, and not the hour:** it is a list of what the knowledge is missing, not of what people wondered. A hello is not on it. `pnpm --filter portal gaps` prints it for whoever keeps the knowledge (the portal may be running), `GET /api/gaps` serves it to anyone signed in.

### The API

Everything under `/api` except `health` needs `Authorization: Bearer <token>`; JSON in and out, `Cache-Control: no-store`.

| | |
| --- | --- |
| `GET /api/health` | `{ ok: true, version, contracts: { skins } }`, no token: which portal this is, and the version of each contract it keeps (the skins', see `ui/src/skins/README.md`) |
| `GET /api/me` | who the token says you are |
| `GET /api/rooms` | `{ rooms }` |
| `GET /api/rooms/:id/messages?before=&limit=` | `{ turns }`, oldest first; `before` is a `seq`, the page behind it |
| `POST /api/rooms/:id/messages` | `{ "text": "…" }` → `201 { turn }`; the speaker is the token's owner, whatever the body says |
| `GET /api/gaps?limit=` | `{ gaps }`: what the knowledge could not answer, most asked first |
| `GET /api/stream` | server-sent events, see above; `Last-Event-ID` resumes |

Refusals say why: `400` bad input, `401` no good token, `404` no such room, `409` room closed, `413` body over 32 KB, `415` not JSON, `429` too many messages (`Retry-After`, 10 per 10 s per person by default) or too many open streams (10 per person), `500` something inside (nothing about it in the answer, it is in the log).

## Further reading

- [INSTALL.md](INSTALL.md): running one, on Node or on Cloudflare.
- [SECURITY.md](SECURITY.md): what a portal keeps, what it does not, how to report a vulnerability.
- [CONTRIBUTING.md](CONTRIBUTING.md): taking part.
- [TRACES.md](TRACES.md): where the parts of El portal come from.


### Traces

Where parts of El portal come from (Firegate's components, M3's voices, the RFC's nouns) is left as 🗿 traces: a block at the top of each file that has a lineage, and the whole map in [TRACES.md](TRACES.md). Each place is a permalink into the public repository it is in, at the commit it was read at; `pnpm --filter portal traces` checks they still answer. Find them with `grep -rn "🗿 trace" src ui/src`.

> The portal forgets what was said. The garden remembers what was understood.
