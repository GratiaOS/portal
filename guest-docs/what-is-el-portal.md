# What El portal is

El portal is a small team chat that a team runs for itself, with a companion in it called Nova. It is self-hosted: one portal belongs to one team, on that team's own machine or Cloudflare account, and uses the model that team brings. There is no central service, no account to make with anyone, and nothing in it that phones home.

A portal has rooms. People come in with a token each, written to them by whoever runs the portal. They write, and the page shows what is written as it arrives. Anyone can ask Nova something by writing `@nova` in a message.

Nova is a companion, not an agent. She answers from a folder of documents and from the last few messages of the room she is asked in, and from nothing else. She has no tools, no memory of her own and no way to act: she reads, and she says.

It is free software under the MPL-2.0 licence and was written new. The code is public at https://github.com/GratiaOS/portal and anyone can run one of their own.

A portal can also open one room to visitors, with no token. That room is where you may be reading this: it is shared by every visitor who is in it, and it is separate from whatever else that portal's team keeps.
