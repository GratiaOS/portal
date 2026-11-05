// The portal's commit-msg hook, written new for it (MPL-2.0): a commit says why in a whisper, and is signed off (the DCO).
// Lines git leaves as comments (`#`) do not count. Usable on its own: `node commit-msg.cjs <file with a message>`.
const { readFileSync } = require('node:fs');

/** What a message lacks, as lines to show; empty when it is whole. */
function lacks(message) {
  const lines = message.split('\n').filter((line) => !line.startsWith('#'));
  const missing = [];
  if (!lines.some((line) => /^\s*(?:🌬️?\s*)?whisper:\s*\S/i.test(line))) missing.push('a whisper line, such as  🌬️ whisper: "what this is for."');
  if (!lines.some((line) => /^Signed-off-by: .+ <[^<>\s]+>\s*$/.test(line))) missing.push('a sign-off, the Developer Certificate of Origin: commit with  git commit -s');
  return missing;
}

if (require.main === module) {
  const missing = lacks(readFileSync(process.argv[2], 'utf8'));
  if (missing.length) {
    console.error(`commit-msg: this commit needs\n${missing.map((line) => `  - ${line}`).join('\n')}\n(see CONTRIBUTING.md)`);
    process.exit(1);
  }
}

module.exports = { lacks };
