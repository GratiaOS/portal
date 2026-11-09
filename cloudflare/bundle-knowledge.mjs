// Makes cloudflare/knowledge.json, what Nova reads on Cloudflare: read from the folder the config names, by the same rules as in
// Node (KnowledgeBase: what is excluded left out, canvases as text, no more than fits in a prompt), and the folder of the companion for
// guests, apart from hers and never a filter on it. The Worker carries it; it is
// made again before each `pnpm cloudflare:dev` and `pnpm cloudflare:deploy`, and kept out of git.
// Usage: node cloudflare/bundle-knowledge.mjs [config]     (default: $PORTAL_CONFIG_FILE, else portal.cloudflare.local.json)

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KnowledgeBase, parseConfig, readConfigFile } from '../dist/index.js';

const out = join(dirname(fileURLToPath(import.meta.url)), 'knowledge.json');
const config = process.argv[2] ?? process.env.PORTAL_CONFIG_FILE ?? 'portal.cloudflare.local.json';

let files = {};
let guestFiles = {};
if (!existsSync(config)) {
  console.log(`portal: no ${config}, so no knowledge for Nova on Cloudflare`);
} else {
  const { raw, baseDir } = readConfigFile(config);
  // The config is read as the Worker will read it, so that nothing is bundled from a config it would refuse: an exclude that is
  // not a list would otherwise leave out nothing. The tokens are not here (they are a secret of their own), so each human gets a
  // stand-in for this reading only; it is never written anywhere.
  const people = Array.isArray(raw?.participants) ? raw.participants : [];
  const standIn = people.map((p, i) => (p && typeof p === 'object' && p.kind === 'human' ? { ...p, token: `stand-in-${i}-${'x'.repeat(24)}` } : p));
  const { nova, guests } = parseConfig({ ...raw, participants: standIn }, baseDir);
  if (nova && !nova.knowledgeDir) {
    console.log(`portal: ${nova.alias} has no knowledgeDir, so nothing is bundled: she talks without knowledge`);
  } else if (nova) {
    const knowledge = new KnowledgeBase(nova.knowledgeDir, undefined, { exclude: nova.exclude });
    files = Object.fromEntries(knowledge.files);
    for (const line of knowledge.describe()) console.log(`portal: on Cloudflare, ${nova.alias} ${line}`);
  } else {
    console.log(`portal: ${config} has no nova, so no knowledge on Cloudflare`);
  }
  // the companion for guests: her own folder, read by the same rules, and nothing of the team's
  const novaForGuests = guests?.nova.enabled ? guests.nova.nova : undefined;
  if (novaForGuests?.knowledgeDir) {
    const knowledge = new KnowledgeBase(novaForGuests.knowledgeDir, undefined, { exclude: novaForGuests.exclude });
    guestFiles = Object.fromEntries(knowledge.files);
    for (const line of knowledge.describe()) console.log(`portal: on Cloudflare, ${novaForGuests.alias} for guests ${line}`);
  } else if (novaForGuests) {
    console.log(`portal: ${novaForGuests.alias} for guests has no knowledgeDir, so nothing is bundled for her: she talks without documents`);
  }
}
writeFileSync(out, `${JSON.stringify({ files, guestFiles })}\n`, { mode: 0o600 });
