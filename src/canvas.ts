type CanvasNode = {
  id?: unknown;
  type?: unknown;
  text?: unknown;
  file?: unknown;
  url?: unknown;
  label?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
};

type CanvasEdge = { fromNode?: unknown; toNode?: unknown; label?: unknown };

type Box = { name: string; detail: string; kind: 'text' | 'file' | 'link' | 'group'; bounds?: { x: number; y: number; w: number; h: number } };

const MAX_NAME = 80;
const MAX_DETAIL = 300;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** Markdown noise out, one line. */
const plain = (line: string): string => line.replace(/\[\[|\]\]/g, '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();

function describe(node: CanvasNode): { name: string; detail: string; kind: Box['kind'] } {
  const type = str(node.type);
  if (type === 'group') return { name: plain(str(node.label)), detail: '', kind: 'group' };
  if (type === 'file') return { name: plain(str(node.file)), detail: '', kind: 'file' };
  if (type === 'link') return { name: plain(str(node.url)), detail: '', kind: 'link' };
  const [first = '', ...rest] = str(node.text).split('\n').map(plain).filter(Boolean);
  return { name: first, detail: rest.join(' / ').slice(0, MAX_DETAIL), kind: 'text' };
}

/**
 * An Obsidian canvas as plain text: the boxes, which group each sits in, and the arrows between them.
 * A flow lives in the arrows, and a model cannot read coordinates. Returns `null` when the text is not a canvas.
 */
export function canvasToText(source: string): string | null {
  let canvas: unknown;
  try {
    canvas = JSON.parse(source);
  } catch {
    return null;
  }
  if (typeof canvas !== 'object' || canvas === null || !Array.isArray((canvas as { nodes?: unknown }).nodes)) return null;
  const { nodes, edges } = canvas as { nodes: CanvasNode[]; edges?: CanvasEdge[] };

  // every box gets a name of its own, so an arrow says which box it means
  const taken = new Map<string, number>();
  const byId = new Map<string, Box>();
  for (const node of nodes) {
    if (typeof node !== 'object' || node === null) continue;
    const { name: wanted, detail, kind } = describe(node);
    const base = (wanted || str(node.id) || 'box').slice(0, MAX_NAME);
    const seen = (taken.get(base) ?? 0) + 1;
    taken.set(base, seen);
    const x = num(node.x);
    const y = num(node.y);
    const w = num(node.width);
    const h = num(node.height);
    byId.set(str(node.id), {
      name: seen === 1 ? base : `${base} (${seen})`,
      detail,
      kind,
      ...(x !== undefined && y !== undefined && w !== undefined && h !== undefined ? { bounds: { x, y, w, h } } : {}),
    });
  }

  const boxes = [...byId.values()];
  const groups = boxes.filter((b) => b.kind === 'group');
  const inside = (box: Box, group: Box): boolean =>
    !!box.bounds && !!group.bounds && box.bounds.x >= group.bounds.x && box.bounds.y >= group.bounds.y && box.bounds.x + box.bounds.w <= group.bounds.x + group.bounds.w && box.bounds.y + box.bounds.h <= group.bounds.y + group.bounds.h;

  const sections: string[] = ['A flow diagram, as text: the boxes, the groups they sit in, and the arrows between them.'];

  const plainBoxes = boxes.filter((b) => b.kind !== 'group');
  if (plainBoxes.length) {
    sections.push(
      ['BOXES', ...plainBoxes.map((b) => `- ${b.name}${b.kind === 'text' ? '' : ` (${b.kind})`}${b.detail ? `: ${b.detail}` : ''}`)].join('\n'),
    );
  }

  const filled = groups.map((g) => ({ g, members: plainBoxes.filter((b) => inside(b, g)).map((b) => b.name) })).filter(({ members }) => members.length);
  if (filled.length) sections.push(['GROUPS', ...filled.map(({ g, members }) => `- ${g.name}: ${members.join(', ')}`)].join('\n'));

  const arrows = (Array.isArray(edges) ? edges : [])
    .map((edge) => ({ from: byId.get(str(edge?.fromNode)), to: byId.get(str(edge?.toNode)), label: plain(str(edge?.label)) }))
    .filter((a): a is { from: Box; to: Box; label: string } => !!a.from && !!a.to);
  if (arrows.length) sections.push(['ARROWS', ...arrows.map((a) => `- ${a.from.name} -> ${a.to.name}${a.label ? ` (${a.label})` : ''}`)].join('\n'));

  return sections.join('\n\n');
}
