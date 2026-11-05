import type { RoomConfig } from './config.js';

/**
 * What Nova may say about the portal she is in, as fact: who is in it, what is kept and for how long, what she sees, which model
 * answers as her, where her questions go. Made from the config, so it is true by construction and nobody writes it by hand;
 * a company adds what only it knows (who runs the portal) with `nova.facts`. No token, no path, no name of a folder: it is read
 * by everyone in the portal.
 */
export function roomFacts(
  config: Pick<RoomConfig, 'participants' | 'rooms' | 'dbPath' | 'retention'> & { nova: NonNullable<RoomConfig['nova']> },
  knowledgeFiles: number,
  /** Where what is said is kept: a file on a machine (Node), or Cloudflare's storage (the second home). */
  home: 'machine' | 'cloudflare' = 'machine',
): string {
  const { nova } = config;
  const aliases = (kind: string) => config.participants.filter((p) => p.kind === kind).map((p) => p.alias);
  const humans = aliases('human');
  const services = aliases('service');
  const others = aliases('companion').filter((alias) => alias !== nova.alias);

  let gateway = 'its server';
  try {
    gateway = `the server at ${new URL(nova.llm.baseUrl).hostname}`;
  } catch {
    // a base URL that is not one would have been refused by the config; nothing to add
  }

  const { retention } = config;
  const how =
    retention === 'forever'
      ? 'Every message is kept, with no end date, because whoever runs the portal chose so.'
      : `A message is kept for ${retention.days} days, and each room keeps at most its last ${retention.messages}, whichever ends first; then it is gone for good, and nobody can bring it back.`;
  const kept =
    home === 'cloudflare'
      ? `${how} Until then they are in the portal's storage on Cloudflare, and whoever runs the portal's Cloudflare account can read it.`
      : config.dbPath === ':memory:'
        ? 'Messages are kept in memory only: they are gone when the portal stops.'
        : `${how} Until then they are in one database file on the machine that runs the portal, and whoever runs that machine can read it.`;

  return [
    `- In the portal: ${humans.length} people (${humans.join(', ')}), and you${others.length ? `, with ${others.join(', ')}` : ''}${services.length ? `; also services: ${services.join(', ')}` : ''}.`,
    `- Rooms: ${config.rooms.map((room) => room.id).join(', ')}.`,
    `- ${kept} Nobody can edit a message, and nobody in the portal can delete one: the portal only lets go of the old ones. Nobody in the portal is an administrator, everyone signed in can do the same things; who runs the portal is whoever keeps the machine (or the account), the config and the tokens, and the portal does not know who that is: they are the ones to ask about backups, about deleting the database, or about who can read it.`,
    `- You answer only when someone writes @${nova.alias}. You see the last ${nova.contextTurns} messages of that room and the knowledge, nothing from the other rooms, no memory from one question to the next beyond what is in the log, no tools, and you do not act on anything: you only write.`,
    `- You run on the model "${nova.llm.model}"${nova.llm.model.toLowerCase() === 'auto' ? ' (a name that the server resolves to a model of its own choosing, so not a name to call yourself by)' : ''}, through ${gateway}. You do not know more about that model than its name. Each question goes to it with those messages and the knowledge, and the portal itself sends nothing else anywhere.`,
    knowledgeFiles
      ? `- You read ${knowledgeFiles} files${nova.exclude.length ? ', and some parts of the folder are kept out of what you read' : ''}. You can name the files you used; you only know who wrote one if the file says so.`
      : '- Nothing is written down for you yet: you have no knowledge files. What you say of this place comes from these facts and from the conversation.',
    ...nova.facts.map((fact) => `- ${fact}`),
  ].join('\n');
}
