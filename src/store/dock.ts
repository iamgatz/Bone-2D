/**
 * Where the side panels live and how tall they are: two columns, each a list from top to bottom, a height for the panels the person has
 * sized, and the ones folded to their title. Pure data and arithmetic (no store, no DOM), so it can be tested.
 */
import type { ViewId } from './layout';

export type PanelId = Exclude<ViewId, 'timeline'>;
export type Side = 'left' | 'right';

export interface Dock {
  /** Every panel is in exactly one of the two lists, open or not, so it comes back where it was. */
  left: PanelId[];
  right: PanelId[];
  /** Height in pixels of the panels that have one; the others share what is left. */
  size: Partial<Record<PanelId, number>>;
  /** Panels folded to their title bar. */
  folded: PanelId[];
}

/** The smallest height a panel is useful at. When a column cannot give every panel this much, the column scrolls. */
export const PANEL_MIN: Record<PanelId, number> = {
  tree: 220,
  animations: 110,
  skins: 160,
  playback: 160,
  tools: 200,
  poses: 160,
  metrics: 110,
  history: 110,
  comments: 110,
  preview: 120,
  images: 120,
  inspector: 160,
};

/** The height of a title bar, with the line under it. */
const HEAD = 35;

export const DEFAULT_SIZE: Dock['size'] = { images: 260 };

export const DEFAULT_DOCK: Dock = {
  left: ['tree', 'animations', 'skins', 'playback', 'tools', 'poses', 'metrics', 'history', 'comments', 'preview', 'images'],
  right: ['inspector'],
  size: DEFAULT_SIZE,
  folded: [],
};

const isPanel = (id: unknown): id is PanelId => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PANEL_MIN, id);

/** Takes a stored value for what it is worth: unknown panels are dropped, doubles count once, missing ones go to their usual place. */
export function readDock(raw: unknown): Dock {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<Dock>;
  const seen = new Set<PanelId>();
  const column = (list: unknown): PanelId[] => {
    const out: PanelId[] = [];
    for (const id of Array.isArray(list) ? list : []) {
      if (!isPanel(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };
  const left = column(data.left);
  const right = column(data.right);
  for (const side of ['left', 'right'] as const) {
    const target = side === 'left' ? left : right;
    DEFAULT_DOCK[side].forEach((id, i) => {
      if (seen.has(id)) return;
      seen.add(id);
      target.splice(Math.min(i, target.length), 0, id);
    });
  }
  let size: Dock['size'] = { ...DEFAULT_SIZE };
  if (data.size && typeof data.size === 'object') {
    size = {};
    for (const [id, h] of Object.entries(data.size)) if (isPanel(id) && typeof h === 'number' && h >= 40 && h <= 4000) size[id] = h;
  }
  const folded = Array.isArray(data.folded) ? [...new Set(data.folded.filter(isPanel))] : [];
  return { left, right, size, folded };
}

/** The panel moved into a column, in front of another one there, or to its end. */
export function movePanel(dock: Dock, id: PanelId, side: Side, before: PanelId | null): Dock {
  if (before === id) return dock;
  const left = dock.left.filter((x) => x !== id);
  const right = dock.right.filter((x) => x !== id);
  const target = side === 'left' ? left : right;
  const at = before ? target.indexOf(before) : -1;
  target.splice(at < 0 ? target.length : at, 0, id);
  // a height set in one column means nothing in the other
  const changed = !dock[side].includes(id);
  const size = { ...dock.size };
  if (changed) delete size[id];
  return { ...dock, left, right, size };
}

export function setFolded(dock: Dock, id: PanelId, folded: boolean): Dock {
  if (dock.folded.includes(id) === folded) return dock;
  return { ...dock, folded: folded ? [...dock.folded, id] : dock.folded.filter((x) => x !== id) };
}

/** Back to the usual height. */
export function resetSize(dock: Dock, id: PanelId): Dock {
  const size = { ...dock.size };
  const usual = DEFAULT_SIZE[id];
  if (usual === undefined) delete size[id];
  else size[id] = usual;
  return { ...dock, size };
}

/** A column is crowded when it cannot give every open panel its smallest height next to the title bars of the folded ones. */
export function isCrowded(height: number, open: readonly PanelId[], folded: number): boolean {
  return open.reduce((sum, id) => sum + PANEL_MIN[id], folded * HEAD) > height;
}

/**
 * The heights after the lower edge of panel `at` is dragged by `delta` pixels. Growing takes room from the panels below, down to their
 * smallest; in a column that scrolls anyway (`crowded`) the panel can go on growing after that. Shrinking first takes back what the column
 * had to scroll (`overflow`), then gives the room to the panel underneath.
 */
export function dragEdge(
  heights: readonly number[],
  mins: readonly number[],
  at: number,
  delta: number,
  overflow: number,
  crowded: boolean,
): number[] {
  const out = [...heights];
  if (delta >= 0) {
    let wanted = delta;
    for (let i = at + 1; i < out.length && wanted > 0; i++) {
      const give = Math.max(0, Math.min(wanted, out[i] - mins[i]));
      out[i] -= give;
      wanted -= give;
    }
    out[at] += crowded ? delta : delta - wanted;
  } else {
    const shrink = Math.max(0, Math.min(-delta, out[at] - mins[at]));
    out[at] -= shrink;
    if (at + 1 < out.length) out[at + 1] += Math.max(0, shrink - Math.max(0, overflow));
  }
  return out;
}
