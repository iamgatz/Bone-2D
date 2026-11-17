/**
 * Which windows (views) are open. Spine lets you open and close every view and keeps the arrangement; so does this: the choice is remembered in the browser.
 * Pure data here (no store), so it can be read by the UI store at start-up and tested.
 */
export type ViewId = 'tree' | 'images' | 'animations' | 'metrics' | 'inspector' | 'timeline';
export type Views = Record<ViewId, boolean>;

/** The windows with the side of the screen they live on, in the order of the Windows menu. */
export const VIEW_LIST: { id: ViewId; label: string; side: 'left' | 'right' | 'bottom' }[] = [
  { id: 'tree', label: 'Hierarchy', side: 'left' },
  { id: 'images', label: 'Images', side: 'left' },
  { id: 'animations', label: 'Animations', side: 'left' },
  { id: 'metrics', label: 'Metrics', side: 'left' },
  { id: 'inspector', label: 'Inspector', side: 'right' },
  { id: 'timeline', label: 'Timeline', side: 'bottom' },
];

export const DEFAULT_VIEWS: Views = { tree: true, images: true, animations: false, metrics: false, inspector: true, timeline: true };

/** Ready arrangements, the first one is the default. */
export const LAYOUTS: { id: string; label: string; views: Views }[] = [
  { id: 'default', label: 'Default', views: DEFAULT_VIEWS },
  { id: 'rigging', label: 'Rigging', views: { tree: true, images: true, animations: false, metrics: false, inspector: true, timeline: false } },
  { id: 'animation', label: 'Animation', views: { tree: true, images: false, animations: true, metrics: false, inspector: true, timeline: true } },
  { id: 'viewport', label: 'Viewport only', views: { tree: false, images: false, animations: false, metrics: false, inspector: false, timeline: false } },
];

const KEY = 'bone2d.layout';

export interface SavedLayout {
  views: Views;
  panel: { left: number; right: number; bottom: number };
}

/** Takes a stored value for what it is worth: unknown or missing windows keep their defaults. */
export function readLayout(raw: string | null): Partial<SavedLayout> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as Partial<SavedLayout>;
    const out: Partial<SavedLayout> = {};
    if (data.views && typeof data.views === 'object') {
      const views = { ...DEFAULT_VIEWS };
      for (const v of VIEW_LIST) if (typeof data.views[v.id] === 'boolean') views[v.id] = data.views[v.id];
      out.views = views;
    }
    const p = data.panel;
    if (p && [p.left, p.right, p.bottom].every((n) => typeof n === 'number' && n >= 100 && n <= 1200)) out.panel = { left: p.left, right: p.right, bottom: p.bottom };
    return out;
  } catch {
    return {};
  }
}

export function loadLayout(): Partial<SavedLayout> {
  try {
    return readLayout(localStorage.getItem(KEY));
  } catch {
    return {};
  }
}

export function saveLayout(layout: SavedLayout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* storage can be blocked */
  }
}

/** True when the views are exactly this arrangement. */
export const sameViews = (a: Views, b: Views) => VIEW_LIST.every((v) => a[v.id] === b[v.id]);
