import { loadConfig } from './config.js';
import { startRoom } from './server.js';
import { VERSION } from './version.js';

if (process.argv[2] === '--version') {
  console.log(`portal ${VERSION}`);
  process.exit(0);
}

const path = process.argv[2] ?? process.env.PORTAL_CONFIG ?? 'portal.local.json';

try {
  const config = loadConfig(path);
  const room = await startRoom(config);
  console.log(`portal ${VERSION}: listening on http://${config.host}:${room.port} (${config.rooms.length} rooms, ${config.participants.length} participants)`);
  if (config.nova && room.knowledge) {
    console.log(`portal: ${config.nova.alias} answers from ${room.knowledge.files.size} files (${Math.round(room.knowledge.bytes / 1000)} KB) through ${config.nova.llm.model}`);
    for (const line of room.knowledge.describe()) console.log(`portal: ${config.nova.alias} ${line}`);
  }

  if (room.skins) {
    const { skins, problems } = room.skins.scan();
    console.log(`portal: skins from a folder: ${skins.map((skin) => skin.id).join(', ') || 'none'}`);
    for (const problem of problems) console.warn(`portal: skin left out, ${problem}`);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void room.close().then(() => process.exit(0)));
  }
} catch (err) {
  console.error(`portal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
