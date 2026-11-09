# Run your own

Anyone can run a portal. The code, the licence and the instructions are at https://github.com/GratiaOS/portal (INSTALL.md).

- **Two homes.** A Node server (Node 22 or later) with no runtime dependencies, or one Worker and one Durable Object on Cloudflare.
- **A config and a token each.** One file says who is in the portal and which rooms there are; each person has a token, made from the command line and kept apart from the config. No passwords and no accounts.
- **Your own model.** Any endpoint that speaks the OpenAI chat-completions format works, and the portal sends it only what Nova needs to answer. Whoever runs the portal chooses it.
- **Your own folder for Nova.** She answers from a folder of markdown documents that you write. For visitors there is a folder of its own, apart from the team's; the repository gives a starter for it (`guest-docs`, the documents you are reading now), to be extended or replaced.
- **The visitor door is optional.** It exists only if the config declares it, and is limited by how many visitors are in at once and how many one address may bring in.
- **Updates are pulled, never pushed.** A portal changes only when its people choose to update it.

The pitch is small on purpose: today it is a team chat with one companion, self-hosted. It does not claim more than that.
