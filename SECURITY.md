# Security

## Reporting a vulnerability

Write to **contact@gratia.space**, never to a public issue. Say what you found, which version (`GET /api/health` or
`node dist/main.js --version` tells it), and how to see it happen. You will hear back within 72 hours, and we will
agree together when it is said in public, once there is a fix.

## Versions

| Version | Fixes |
| --- | --- |
| 0.1.x | yes |

## What a portal keeps, and what it does not

What is not collected cannot leak. A portal is one process, one config and one database file on a machine its people choose.

- **Tokens.** One per person, made from the command line and kept in a file apart from the config (the portal warns if others can read
  it). They are compared by digest in memory. No passwords, no accounts.
- **Messages.** A portal forgets by default: each room keeps the last 14 days or its last 999 messages, whichever ends first,
  and the rest is overwritten in the file (`secure_delete`). A portal that must keep more says so in its config, up to
  `"forever"`, and the companion tells its people. Until then, messages are in one SQLite file that whoever runs the machine can
  read; it is not encrypted at rest yet. A backup keeps what was in the file when it was made, also after the portal forgets.
- **On Cloudflare**, messages are in the portal's Durable Object, which whoever runs the Cloudflare account can read. A forgotten
  message is deleted there too, but whether its old bytes are overwritten in Cloudflare's storage is Cloudflare's to say:
  `secure_delete` is refused there. The companion's knowledge goes up with the Worker, to the same account.
- **Presence.** Who is here, and never when. It is not stored, and not logged.
- **A sign.** The one emoji after a name, which a person may change: only the current one is kept, never when it changed or what
  it was. Everyone in the portal sees it; the companion is not given it.
- **The model.** For each question, the companion sends the last messages of that room and the knowledge folder to the model the
  config names. Nothing else leaves, and nothing phones home.
- **What a person wrote** cannot be edited, and leaves by itself when the portal forgets it. Taking one out sooner, when the law or
  a person asks, is still to be decided.
- **The page** loads only from the portal (a content security policy refuses everything else).
- **Limits.** Messages and open streams per person are limited, with a calm refusal.

## What is not done for you

- **TLS.** The portal listens on `127.0.0.1`. Anything wider belongs behind a TLS proxy, because the token travels in a header.
- **Guessing keys** is slowed, not forbidden: ten wrong keys in a minute from one address and that address waits (`429`). Keys are long and random (`pnpm tokens`); the count is in memory, so a restart empties it. Behind a proxy, name its address header in the config (`clientIpHeader`, see INSTALL.md), or everyone counts as one address.
- **Sign-in through your company's SSO** does not exist yet.
- **Backups** are yours: see [INSTALL.md](INSTALL.md).

<!--
🗿 trace
Name from:  M3's Security Policy and its privacy notes; gratia.space's "Quiet by Design".
Path:       https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/SECURITY.md
Path:       https://github.com/GratiaOS/m3/blob/c76a3cba25335e122434990b40dd9656f495a0a9/docs/privacy.md
Same idea:  report privately, an answer within days, supported versions said plainly; from gratia.space, kept in its history
            with no public copy: what is not collected cannot be leaked.
Different:  the facts are the portal's own, read from its code and its PORTAL FACTS; the address is contact@gratia.space.
Not copied: written new (MPL-2.0); M3's documentation is CC BY-SA 4.0.
-->
