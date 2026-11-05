import { readFileSync } from 'node:fs';

/** The room's version, as its `package.json` says. `/api/health` and `--version` tell it, so whoever runs a room knows which one it is. */
export const VERSION: string = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
