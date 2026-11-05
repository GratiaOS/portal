import { randomBytes } from 'node:crypto';
import { chmodSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigError, MIN_TOKEN_LENGTH, readConfigFile, readTokensFile } from './config.js';

// Who may come in. `pnpm --filter portal tokens <config> [list | show <name> | new <name> | rotate <name>]`.
// Reads the config as a file, not through `loadConfig`: it has to work for a room that cannot start yet because a human has no token.

const USAGE = `usage: pnpm --filter portal tokens <config> [command]

  list            who has a token (never the tokens themselves)          (the default)
  show <name>     the token of one person, on stdout: pipe it, \`| pbcopy\`
  new <name>      make a token for a person who has none
  rotate <name>   replace a person's token; the old one stops working when the room restarts

The config must name a "tokensFile", a file of its own for the tokens, so that the config can be shared and the tokens kept to a few.`;

const fail = (message: string): never => {
  throw new ConfigError(message);
};

function humans(raw: unknown): { alias: string; inline: string | undefined }[] {
  const list = typeof raw === 'object' && raw !== null && Array.isArray((raw as { participants?: unknown }).participants) ? ((raw as { participants: unknown[] }).participants) : [];
  return list
    .filter((p): p is { kind: string; alias: string; token?: unknown } => typeof p === 'object' && p !== null && (p as { kind?: unknown }).kind === 'human' && typeof (p as { alias?: unknown }).alias === 'string')
    .map((p) => ({ alias: p.alias, inline: typeof p.token === 'string' ? p.token : undefined }));
}

/** Written to a temporary file next to it and put in place, so a reader never sees half of it; readable by the owner only. */
function writeTokens(file: string, tokens: Record<string, string>): void {
  const temporary = join(dirname(file), `.${Math.random().toString(36).slice(2)}.tokens.tmp`);
  writeFileSync(temporary, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
}

export function runTokens(argv: string[], io: { out: (text: string) => void; isTTY: boolean }): void {
  const [config, command = 'list', name] = argv.filter((arg) => arg !== '--reveal');
  const reveal = argv.includes('--reveal');
  if (!config || config === '--help' || config === '-h' || !['list', 'show', 'new', 'rotate'].includes(command)) return io.out(`${USAGE}\n`);

  const { raw, baseDir } = readConfigFile(config);
  const people = humans(raw);
  const tokensFileName = typeof (raw as { tokensFile?: unknown }).tokensFile === 'string' ? ((raw as { tokensFile: string }).tokensFile) : undefined;
  const file = tokensFileName ? resolve(baseDir, tokensFileName) : undefined;
  const kept = file ? readTokensFile(file, { missingOk: true }) : {};
  const tokenOf = (alias: string, inline: string | undefined) => Object.entries(kept).find(([key]) => key.toLowerCase() === alias.toLowerCase())?.[1] ?? inline;

  if (command === 'list') {
    io.out(`${file ? `tokens in ${file}` : 'tokens inside the config (no "tokensFile")'}\n`);
    for (const { alias, inline } of people) io.out(`  ${tokenOf(alias, inline) ? 'has a token' : 'NO token   '}  ${alias}\n`);
    return;
  }

  const person = people.find((p) => p.alias.toLowerCase() === (name ?? '').toLowerCase());
  if (!name) fail(`${command} needs a name`);
  if (!person) fail(`"${name}" is not a human in ${config}; the humans are: ${people.map((p) => p.alias).join(', ') || 'none'}`);
  const who = person!;
  const current = tokenOf(who.alias, who.inline);

  if (command === 'show') {
    if (!current) fail(`${who.alias} has no token; make one with: pnpm --filter portal tokens ${config} new ${who.alias}`);
    if (io.isTTY && !reveal) fail('not printing a token to a terminal, where it stays on screen and in the scrollback: pipe it (| pbcopy), or pass --reveal');
    io.out(`${current}\n`);
    return;
  }

  // new and rotate write; they need a place of their own for the tokens
  if (!file) fail(`${config} keeps its tokens inside it; add "tokensFile": "<a name>.tokens.local.json" to it and move them there, then ${command} can be used`);
  if (who.inline !== undefined) fail(`${who.alias} has a token inside the config; move it to ${file} first, so that it lives in one place`);
  if (command === 'new' && current) fail(`${who.alias} already has a token; \`rotate\` replaces it`);
  if (command === 'rotate' && !current) fail(`${who.alias} has no token to replace; \`new\` makes one`);

  const alias = Object.keys(kept).find((key) => key.toLowerCase() === who.alias.toLowerCase()) ?? who.alias;
  const token = randomBytes(32).toString('base64url');
  if (token.length < MIN_TOKEN_LENGTH) fail('could not make a token of the length the portal asks for');
  writeTokens(file!, { ...kept, [alias]: token });
  io.out(`${command === 'new' ? 'made' : 'replaced'} the token of ${who.alias} in ${file}\n`);
  io.out(`give it to them:  pnpm --filter portal tokens ${config} show ${who.alias} | pbcopy\n`);
  if (command === 'rotate') io.out('the old token stops working when the portal restarts\n');
  else io.out('the portal reads it when it starts\n');
}

// run as a command, not when it is imported
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runTokens(process.argv.slice(2), { out: (text) => process.stdout.write(text), isTTY: Boolean(process.stdout.isTTY) });
  } catch (err) {
    console.error(`portal tokens: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
