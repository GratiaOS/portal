# The API

Everything under `/api` except `health` (and `guest`, the door for visitors, and `drops/ingest`, the door for packets, when a portal has them) needs `Authorization: Bearer <token>`; JSON in and out, `Cache-Control: no-store`. The map to the rest is in the [README](../README.md).

| | |
| --- | --- |
| `GET /api/health` | `{ ok, version, contracts: { skins }, name?, guests? }`, no token: which portal this is, what it is called (`name`, when the config says), the version of each contract it keeps (the skins', see `ui/src/skins/README.md`), and `guests: true` only when it has a door for visitors |
| `GET /manifest.webmanifest` | no token: the portal as an app on a home screen, made from the config |
| `POST /api/guest` | no token, only when the config has `guests`: a visitor is given `{ token, participant, room, expiresAt }`; limited by how many at once (`503`) and per address (`429`) |
| `POST /api/guest/leave` | a visitor ends their own time at once |
| `GET /api/me` | who the token says you are |
| `POST /api/me/sign` | the sign after your name (one emoji), or none |
| `GET /api/hints` | what the box where people write may say: the companion's name and examples (a visitor gets their companion's, never the team's) |
| `GET /api/skins` | the looks the portal offers from its folder |
| `GET /api/rooms` | `{ rooms }` (a visitor is told of their room and no other) |
| `GET /api/rooms/:id/messages?before=&limit=` | `{ turns }`, oldest first; `before` is a `seq`, the page behind it (a visitor is not given what has outlived the trail) |
| `POST /api/rooms/:id/messages` | `{ "text": "…" }` → `201 { turn }`; the speaker is the token's owner, whatever the body says |
| `GET /api/gaps?limit=` | `{ gaps }`: what the knowledge could not answer, most asked first (not for a visitor) |
| `POST /api/drops/ingest` | no token, only when the config has `drops`: `{ "to": "99.6", "fade": "7d", "payload": { "body": "…", "format": "note", "sigil": "🦁" } }` (`fade`, `format` and `sigil` are optional; `sigil` is one emoji of at most 16 bytes) → `204` with nothing in it, **the same for a frequency that is held and one that is not**. `400` bad input, `413` a body over `drops.maxBytes` (8 KB), `415` not JSON, `429` too many (`Retry-After`; counted per address and frequency, and per frequency), `403` for a request from a browser origin that `drops.allowOrigins` does not list. `OPTIONS` answers a preflight for a listed origin (`204`), and for any other, or none, `403`; no other route answers across origins |
| `GET /api/drops?freq=99.6` | the one who holds the frequency only: `{ freq, title, drops: [{ id, type: "drop", payload: { body, format, sigil? }, fadesAt }] }`, the newest first, with no sender and no time it was left. `403` for anyone else and for a frequency nobody holds, alike; `400` for a `freq` that is not one; `404` without a `drops` block. A read lets go of what has faded before it answers |
| `GET /api/stream` | server-sent events, see [how it works](how-it-works.md#the-live-stream); `Last-Event-ID` resumes |

Refusals say why: `400` bad input, `401` no good token, `403` not for you (a visitor outside their room), `404` no such room, `409` room closed, `413` body over 32 KB, `415` not JSON, `429` too many messages (`Retry-After`, 10 per 10 s per person by default) or too many open streams (10 per person), `500` something inside (nothing about it in the answer, it is in the log), `503` the guest room is full.
