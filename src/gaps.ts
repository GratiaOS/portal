import { existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import type { GapReason } from './domain.js';
import { nodeSqlite } from './sqlite-node.js';
import { RoomStore } from './store.js';

// What the knowledge did not answer, for whoever keeps the knowledge. Reads the room's database; the room may be running.

const WHY: Record<GapReason, string> = {
  model_found_nothing: 'not in the knowledge',
  no_real_source: 'the model cited no file that exists',
  empty_answer: 'the model gave no answer',
  figures_unverified: 'figures that are in none of the sources',
};

const path = process.argv[2] ?? process.env.PORTAL_CONFIG ?? 'portal.local.json';

try {
  const config = loadConfig(path);
  if (config.dbPath === ':memory:' || !existsSync(config.dbPath)) {
    console.log(`portal: no database at ${config.dbPath} yet, so nothing has been asked.`);
  } else {
    const store = new RoomStore(nodeSqlite(config.dbPath));
    const gaps = store.listGaps(200);
    store.close();

    if (!gaps.length) {
      console.log('Every question Nova was asked was answered from the knowledge.');
    } else {
      console.log('# What the knowledge did not answer\n');
      for (const gap of gaps) {
        const when = gap.firstDay === gap.lastDay ? gap.lastDay : `${gap.firstDay} to ${gap.lastDay}`;
        console.log(`- ${gap.asked > 1 ? `${gap.asked}× ` : ''}${gap.question}`);
        console.log(`  ${WHY[gap.why]}${gap.sources.length ? ` (cited: ${gap.sources.join(', ')})` : ''}; #${gap.conversationId}, ${when}`);
      }
    }
  }
} catch (err) {
  console.error(`portal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
