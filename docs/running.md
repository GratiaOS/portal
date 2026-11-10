# Running one, in more detail

The short way is in the [README](../README.md), and the whole way in [INSTALL.md](../INSTALL.md). These are the parts that come up after.

## Tokens

A token is what a person sends to come in. The config says who is in the portal (`participants`) and where the tokens are kept (`"tokensFile": "portal.tokens.local.json"`); the tokens live in that file, `{ "Zeus": "…" }`, beside the config, so the config can be read and shared and the tokens kept to a few. If others can read the tokens file the room says so when it starts (`chmod 600`). A token may still be written inline in `participants` (`"token": "…"`), but not both for the same person.

```bash
pnpm --filter portal tokens <config>                  # who has a token, never the tokens themselves
pnpm --filter portal tokens <config> new <name>       # make one for a person who has none (24 characters at least is what the portal asks for; this makes 43)
pnpm --filter portal tokens <config> show <name> | pbcopy    # hand it over: it goes to a pipe, and not to a terminal unless you pass --reveal
pnpm --filter portal tokens <config> rotate <name>    # replace one; the old one stops working when the portal restarts
```

`new` and `rotate` do not print the token. A portal that cannot start because a human has no token says which one and what to run.

## Two portals on one machine

Keep one portal to try things on and one for the people who rely on it, so that a test, a restart or a mistake never reaches them. They are two configs and two databases, named for their role:

| | to try things on | for the team |
| --- | --- | --- |
| config | `portal.dev.local.json` | `portal.team.local.json` |
| tokens | `portal.dev.tokens.local.json` | `portal.team.tokens.local.json` |
| database | `data/dev.db` | `data/team.db` |
| port | 3100 | 3101 |

Both read the same `.env` (the model's key). Keep what they have in common in step by hand (`nova.llm`, `nova.exclude`, `knowledgeDir`): the test portal is only worth anything if it behaves like the other.

## Smoke test your endpoint

```bash
cp .env.example .env   # then set PORTAL_LLM_BASE_URL and PORTAL_LLM_API_KEY
node --env-file=.env scripts/smoke.mjs
```

Needs Node 22+. Any OpenAI-compatible chat-completions endpoint works. The script prints the shape of the response (message keys, stream delta keys, timings), never the key.

`.env` and `*.local.json` are gitignored: everything specific to one company stays in those files.

## See it work

```bash
pnpm --filter portal demo
```

Four people and a stand-in Nova chat in two rooms, in a real portal (in memory, a free port): a late arrival is handed what he missed, Nova answers an `@mention`, someone goes for coffee and is seen leaving. The script prints the wall as a LAN chat would (`[HH:MM] #room <Nick> text`) and then checks its own claims; it exits non-zero if one fails, and a test runs it.

Nova here is a script, not a model: she listens with `hub.on('turn')` and answers with `hub.publish`, the same two calls a companion backed by a real model will use. The names are invented on purpose; swap them freely.

