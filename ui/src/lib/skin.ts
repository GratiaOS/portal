/** The looks the page has built in. Each is a stylesheet in `skins/`, answering the parts of the page; see `skins/README.md`. */
export const SKINS = [
  { id: 'bubbles', emoji: '🫧' },
  { id: 'bank', emoji: '🏦' },
  { id: 'radar', emoji: '🪖' },
] as const;

export type BuiltInSkin = (typeof SKINS)[number]['id'];

/** A built-in look, or one from the room's skins folder (named by the folder). */
export type SkinId = string;

/** A look, and the built-in one whose layout it keeps (a skin from a folder may build on one, and say only what is different). */
export type Chosen = { id: SkinId; base?: BuiltInSkin };

export const DEFAULT_SKIN: BuiltInSkin = 'bubbles';

const KEY = 'portal.skin';
const BASE_KEY = 'portal.skin.base';

export const isBuiltIn = (value: unknown): value is BuiltInSkin => SKINS.some((skin) => skin.id === value);

/** What a skin may be called: the name of its folder in the room's skins folder. */
export const isSkinId = (value: unknown): value is SkinId => typeof value === 'string' && /^[a-z][a-z0-9-]{1,31}$/.test(value);

type Memory = Pick<Storage, 'getItem' | 'setItem'>;

// storage can be missing, full or forbidden (a private window): the page must look right without it
const memory = (): Memory | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/** The look this person chose last time, or the first one. A skin from a folder is taken on trust here and checked once the room has said which it has. */
export function chosenSkin(storage: Memory | undefined = memory()): Chosen {
  try {
    const id = storage?.getItem(KEY);
    if (!isSkinId(id)) return { id: DEFAULT_SKIN };
    const base = storage?.getItem(BASE_KEY);
    return isBuiltIn(id) || !isBuiltIn(base) ? { id } : { id, base };
  } catch {
    return { id: DEFAULT_SKIN };
  }
}

// the stylesheet of a skin from a folder, once, when it is first wanted
function sheetOf(id: SkinId, root: HTMLElement): void {
  const page = root.ownerDocument;
  if (!page?.head || page.querySelector(`link[data-skin-sheet="${id}"]`)) return;
  const link = page.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/skins/${id}/skin.css`;
  link.dataset.skinSheet = id;
  page.head.append(link);
}

/** Puts a look on the page. The only place that does: nothing else writes `data-skin`. */
export function showSkin(skin: Chosen, root: HTMLElement = document.documentElement): void {
  const id = isSkinId(skin.id) ? skin.id : DEFAULT_SKIN;
  root.dataset.skin = id;
  if (skin.base && !isBuiltIn(id)) root.dataset.skinBase = skin.base;
  else delete root.dataset.skinBase;
  if (!isBuiltIn(id)) sheetOf(id, root);
}

/** The person's choice: shown now, and remembered by this browser for next time. */
export function chooseSkin(skin: Chosen, root: HTMLElement = document.documentElement, storage: Memory | undefined = memory()): void {
  showSkin(skin, root);
  try {
    storage?.setItem(KEY, isSkinId(skin.id) ? skin.id : DEFAULT_SKIN);
    storage?.setItem(BASE_KEY, skin.base ?? '');
  } catch {
    // not remembered; the page has the look all the same
  }
}
