/** A message is prose and fenced code, in the order they were written. */
export type Block = { kind: 'text'; text: string } | { kind: 'code'; /** The name after the fence, lower case: `mermaid`, `json`, or empty. */ lang: string; code: string };

// three backticks or more at the start of a line, then the name of the language; backticks after that make it inline code
const OPEN = /^ {0,3}(`{3,})[ \t]*([^\s`]*)[^`]*$/;

/**
 * The message cut into prose and fenced blocks. A fence closes with at least as many backticks as opened it, so a block
 * of four can hold a block of three; one never closed runs to the end, as the writer most likely meant it.
 */
export function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  let prose: string[] = [];
  let code: string[] | undefined;
  let lang = '';
  let ticks = 3;

  const endProse = () => {
    const said = prose.join('\n').replace(/^\n+|\n+$/g, '');
    if (said) blocks.push({ kind: 'text', text: said });
    prose = [];
  };
  const endCode = () => {
    blocks.push({ kind: 'code', lang, code: (code ?? []).join('\n') });
    code = undefined;
  };

  // a message pasted from Windows ends its lines in CRLF; the fences must still be seen
  for (const line of text.split(/\r?\n/)) {
    if (code === undefined) {
      const open = OPEN.exec(line);
      if (open) {
        endProse();
        code = [];
        ticks = open[1]!.length;
        lang = open[2]!.toLowerCase();
      } else prose.push(line);
    } else if (new RegExp(`^ {0,3}\`{${ticks},}[ \\t]*$`).test(line)) endCode();
    else code.push(line);
  }
  if (code !== undefined) endCode();
  else endProse();
  return blocks;
}
