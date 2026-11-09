# Install

For whoever runs a portal for their people: one process, one config, one database file, on a machine you choose.

## What it needs

- Node.js 22.18 or newer, and pnpm (`corepack enable` gives the version the repository names).
- An OpenAI-compatible chat-completions endpoint for the companion (a company gateway, LM Studio, vLLM, …), if you want one.
  Without it the portal is a plain chat.

## Build

```bash
git clone https://github.com/GratiaOS/portal && cd portal
corepack enable
pnpm install
pnpm -r build
```

## Configure

```bash
cp portal.example.json portal.local.json   # the config; gitignored, with no secrets in it
cp .env.example .env                       # the model's address and key: PORTAL_LLM_BASE_URL, PORTAL_LLM_API_KEY
```

In `portal.local.json`:

- `participants`: the people (`human`) and the companion (`companion`), by alias. A person may be given a `sign`, one emoji
  written after their name (`"sign": "🦁"`); each one can change their own in the page, and the one given shows again when they
  let theirs go.
- `rooms`: the rooms, each an `id` (a slug) and a `title`.
- `"staticDir": "ui/dist"`, so the portal serves its page next to its API.
- `dbPath`: where the database file lives (`data/portal.db`).
- `retention`: what the portal keeps. By default each room keeps the last 14 days or its last 999 messages, whichever ends first,
  and lets go of the rest (`{ "days": 14, "messages": 999 }`). A portal that must keep more says so here, up to `"forever"`; the
  companion then tells its people.
- `nova`: the companion, the model, and `knowledgeDir`, the folder of markdown she answers from (`nova.exclude` keeps parts of it
  from her). Without `knowledgeDir` she still talks, with nothing written down for her yet: about the portal from its facts, and
  about anything else she says she does not know yet. Leave the section out for a plain chat.

Then a token for each person, kept in a file of its own (`chmod 600`):

```bash
pnpm --filter portal tokens portal.local.json new Zeus
pnpm --filter portal tokens portal.local.json show Zeus | pbcopy   # hand it over in person or through a channel you trust
```

### Languages

The page and what the portal says in Nova's place come in Romanian, English and Spanish (`ro`, `en`, `es`), and Nova answers in
whatever language she is written to. A person's language is their `locale` in `participants` (`"es"`, `"ro"`, `"en-GB"`…); without it, the page follows
the browser, and what the portal says in her place follows nothing and is in English. A visitor's is the first of the three their browser asks for
(`Accept-Language`), or English, kept only as long as their name is. Any other language falls to English. Adding a fourth is a file of the page
(`ui/src/lib/strings.ts`) and one of the portal (`src/nova.ts`).

### A guest room (optional)

A portal can let visitors in without a key of their own, into one room. Declare a room of kind `guest` and name it in `guests`:

```json
"rooms": [
  { "id": "general", "title": "General" },
  { "id": "guests", "title": "Guests", "kind": "guest" }
],
"guests": { "room": "guests", "maxActive": 20, "minutes": 60, "forgetAfterMinutes": 5, "perCaller": { "count": 5, "perMinutes": 10 } }
```

A visitor who leaves (`POST /api/guest/leave`, with their key) ends their own time at once: the key stops opening anything, their stream closes, and the room has a slot free. What they said stays until the room ends by absence.

`POST /api/guest` (no key) then gives a visitor a name of the hour (`owl`, `fox`…), a key and the room, for `minutes`. What a guest may do is
what that binding gives them, in that room: they read and write there, and nothing else exists for them (no other room, none of your people,
not what the knowledge lacked), and they cannot ask the companion. `maxActive` is how many guests the portal hosts at once (past it the
door answers `503`); `perCaller` is how many one address may bring in per window (`429`), and counts by the address the connection has (see `clientIpHeader`).
The room **ends by absence**: `forgetAfterMinutes` (5) after the last guest's time is over, what was said there, the guests of it, their keys and
their bindings are let go, so the next visitors find an empty room and nothing of the last ones. A room with someone still in their time is never
touched, and the team's rooms never are. It is checked every few minutes (at most ten; on Cloudflare, at the object's alarm), so the end can come a little late.
Without `guests`, there is no door. Only the digest of a guest's key is kept.

**The page for a visitor.** When the portal has a door, its gate offers **Step through** under the field for a key. A link to `/guest` (on your own
site, in a mail) steps through by itself and asks for nothing: no key field, no name. The visitor lands in the one room, with no list of rooms and none of
your people; the page says only how many others are there, never who. Their key lives as long as the tab, and when their time is over the gate says so.

**The companion for guests** is off until you turn it on, and it is never the team's: she has an engine of her own, a folder of her own, and a
budget she keeps.

```json
"guests": {
  "room": "guests",
  "nova": {
    "enabled": true,
    "llm": { "baseUrl": "https://engine-for-guests.example/v1", "model": "…", "apiKeyEnv": "PORTAL_GUESTS_LLM_API_KEY" },
    "knowledgeDir": "public-docs",
    "questions": 5,
    "perHour": 60
  }
}
```

- **`llm` is required to turn her on**, and is not inherited from the team's `nova.llm`: the engine that answers strangers is chosen on purpose.
- **`knowledgeDir`** is a folder written for visitors, apart from the team's. The repository gives one to start from, `guest-docs/`: five short documents about the portal as a program (what it is, what a portal keeps, who Nova is, how to run your own, what a visit is), the same for anyone who runs one. Point at it (`"knowledgeDir": "guest-docs"`, beside a config at the root), extend it with what *your* visitors should know, or replace it; a test keeps its figures equal to the program's defaults, so if you change a default, change them. It is never a filter on the team's folder: what is not in what is sent
  to the model cannot be got out of it. What she may say about the portal is made for guests too (no name of the team, no server).
- **`questions`** is how many each guest may ask in their visit (5), and **`perHour`** how many all the guests together may ask in an hour (60).
  Both are counted when the question is asked, before the model is called, so a model that fails still costs one; past either, the portal says so
  in a plain line. What a visitor asks is never put on the list of what the knowledge lacked.
- On Cloudflare she is the same, with her own secret for the engine's key (the name `guests.nova.llm.apiKeyEnv` gives; set it with `wrangler secret put`, as for the team's) and her folder bundled apart from the team's at each `pnpm cloudflare:deploy`. Without the secret she does not answer guests, and the log says so; a folder changed after the deploy waits for the next one.

## Run

```bash
pnpm --filter portal start                 # reads .env and portal.local.json; logs "portal 0.1.0: listening on …"
curl -s http://127.0.0.1:3100/api/health   # { "ok": true, "version": "0.1.0", "contracts": { "skins": 1 } }
```

Keep it running under whatever keeps a process alive on that machine (systemd, launchd, a container).

The portal listens on `127.0.0.1`. To let people in from elsewhere, put it behind a TLS proxy, since the token travels in a header,
and turn buffering off for `/api/stream` (server-sent events), so that messages arrive as they are written.

Wrong keys are counted for each caller, and a caller who tries ten in a minute is asked to wait (`429`, with `Retry-After`).
The caller is the address of the connection. Behind a proxy that is the proxy's, so everyone would count as one: name the header
your proxy sets with the real address in the config, `"clientIpHeader": "x-forwarded-for"` (the last entry is used, the one your
nearest proxy added). Name it only for a proxy that sets it, since otherwise a caller could choose its own address.

## Back up

The database is one SQLite file with its write-ahead log beside it. While the portal runs, back it up with SQLite itself:

```bash
sqlite3 data/portal.db ".backup 'portal-backup.db'"
```

or stop the portal and copy `data/portal.db` with its `-wal` and `-shm` files. The config, the tokens file and `.env` are yours to
keep too; none of them is in git. A backup keeps what the portal later forgets: keep backups no longer than the portal keeps
messages, unless you must.

## Update

```bash
git pull && pnpm install && pnpm -r build
```

Restart the portal, and check the version in `/api/health`. Updates are pulled by you; nothing phones home. What changes from one
version to the next, for whoever runs a portal, is in [CHANGELOG.md](CHANGELOG.md).

## On Cloudflare

A portal can also live on Cloudflare: one Worker in front, and one Durable Object that is the whole portal, its database
included. The Workers Free plan is enough for a small team. It is the same portal (the same handler, the same store and the same
page), with these differences, for now:

- **Nova's knowledge is a bundle, not a folder.** It is read from `nova.knowledgeDir` with the same rules as in Node (what
  `nova.exclude` names left out), and goes up with the Worker to your Cloudflare account; a change to the folder needs a new
  deploy. The folder of the companion for guests is a bundle of its own, made the same way, and goes up beside it: nothing of the team's is in it.
- **No skins from a folder**: the looks built into the page only.
- **Forgetting overwrites less.** A forgotten message is deleted, but whether its old bytes are overwritten in Cloudflare's
  storage is Cloudflare's to say: `secure_delete` is refused there.
- **No backup command.** What the object keeps stays on Cloudflare.

The config and the tokens are two secrets, never files in the repository: `PORTAL_CONFIG`, the config as in
`portal.example.json` without `tokensFile`, `dbPath`, `staticDir` and `skinsDir`; and `PORTAL_TOKENS`, `{ "<alias>": "<token>" }`,
as `pnpm tokens` writes its tokens file. With `wrangler` signed in to your account (`npx wrangler@4.136.2 login`; the version is pinned on purpose, the same one the scripts in `package.json` run, so that what was checked is what you use):

```bash
npx wrangler@4.136.2 secret put PORTAL_CONFIG -c cloudflare/wrangler.jsonc < portal.cloudflare.local.json
npx wrangler@4.136.2 secret put PORTAL_TOKENS -c cloudflare/wrangler.jsonc < portal.tokens.local.json
npx wrangler@4.136.2 secret put PORTAL_LLM_API_KEY -c cloudflare/wrangler.jsonc
pnpm cloudflare:deploy
```

The third is the model's key, under the name the config gives in `nova.llm.apiKeyEnv`, typed when asked; without a `nova`
section it is not needed. `pnpm cloudflare:deploy` (and `:dev`) first bundles Nova's knowledge from the config in
`portal.cloudflare.local.json`, or the file `PORTAL_CONFIG_FILE` names, into `cloudflare/knowledge.json` (kept out of git).

After a deploy the previous version of the object can keep answering for a few minutes: look again before concluding that a change did not arrive.

Give it a domain of your own in the Cloudflare dashboard (the Worker, Settings, Domains). To try it on this machine first, put
both secrets in `cloudflare/.dev.vars` (`PORTAL_CONFIG='…'` and `PORTAL_TOKENS='…'`, kept out of git) and run
`pnpm cloudflare:dev`; `pnpm cloudflare:check` checks it all on this machine, with its own people. Nothing is deployed by either.
