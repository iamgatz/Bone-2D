import type { Id } from '@/core/model';
import { createStore, useStore } from './store';
import { DEFAULT_VIEWS, loadLayout } from './layout';
import type { Views } from './layout';

export type Mode = 'setup' | 'animate';
export type Tool = 'select' | 'create' | 'translate' | 'rotate' | 'scale' | 'mesh' | 'weights' | 'ik' | 'clipping' | 'boundingbox' | 'point' | 'path';
/** Tools that draw clipping polygons, bounding boxes and points. */
export const POLYGON_TOOLS: readonly Tool[] = ['clipping', 'boundingbox', 'point'];
/** Tools that create attachments in the viewport (Setup mode only). */
export const ATTACHMENT_TOOLS: readonly Tool[] = [...POLYGON_TOOLS, 'path'];
export type CurveKind = 'linear' | 'bezier' | 'stepped';

export interface Selection {
  bones: Id[];
  slot: Id | null;
  /** Attachment name inside the selected slot. */
  attachment: string | null;
  constraint: Id | null;
  /** Selected mesh vertices (indices) while in mesh/weights tools. */
  vertices: number[];
}

export interface PoseOverride {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  shearX?: number;
  shearY?: number;
}

export interface ViewOptions {
  grid: boolean;
  images: boolean;
  bones: boolean;
  meshes: boolean;
  names: boolean;
  constraints: boolean;
  /** Outlines of clipping polygons, bounding boxes and point attachments. */
  outlines: boolean;
  /** Draw bones over images (otherwise behind). */
  bonesOnTop: boolean;
}

export interface Camera {
  x: number;
  y: number;
  /** CSS pixels per world unit. */
  zoom: number;
}

export interface WeightBrush {
  size: number;
  strength: number;
  mode: 'add' | 'subtract' | 'smooth' | 'replace';
  bone: Id | null;
}

export interface UiState {
  mode: Mode;
  tool: Tool;
  selection: Selection;
  animationId: Id | null;
  time: number;
  playing: boolean;
  loop: boolean;
  speed: number;
  autoKey: boolean;
  defaultCurve: CurveKind;
  camera: Camera;
  skinId: Id | null;
  view: ViewOptions;
  overrides: Record<Id, PoseOverride>;
  timelineView: 'dopesheet' | 'graph';
  /** Timeline horizontal zoom (pixels per second) and scroll (seconds at left edge). */
  tlZoom: number;
  tlScroll: number;
  /** Selected keyframes (encoded refs, see timeline/keys.ts). */
  selectedKeys: string[];
  /** Expanded entity rows in the dopesheet. */
  expanded: Record<string, boolean>;
  brush: WeightBrush;
  toast: { id: number; text: string; kind: 'info' | 'error' | 'ok' } | null;
  panel: { left: number; right: number; bottom: number };
  /** Which windows are open (see layout.ts). */
  views: Views;
  exportOpen: boolean;
  helpOpen: boolean;
  updatesOpen: boolean;
  feedbackOpen: boolean;
}

export const emptySelection: Selection = { bones: [], slot: null, attachment: null, constraint: null, vertices: [] };

const saved = loadLayout();

export const uiStore = createStore<UiState>({
  mode: 'setup',
  tool: 'select',
  selection: emptySelection,
  animationId: null,
  time: 0,
  playing: false,
  loop: true,
  speed: 1,
  autoKey: true,
  defaultCurve: 'bezier',
  camera: { x: 0, y: 120, zoom: 1.2 },
  skinId: null,
  view: { grid: true, images: true, bones: true, meshes: true, names: false, constraints: true, outlines: true, bonesOnTop: true },
  overrides: {},
  timelineView: 'dopesheet',
  tlZoom: 220,
  tlScroll: -0.05,
  selectedKeys: [],
  expanded: {},
  brush: { size: 40, strength: 0.5, mode: 'add', bone: null },
  toast: null,
  panel: saved.panel ?? (typeof window !== 'undefined' && window.innerWidth < 1150 ? { left: 210, right: 240, bottom: 250 } : { left: 270, right: 300, bottom: 300 }),
  views: saved.views ?? DEFAULT_VIEWS,
  exportOpen: false,
  helpOpen: false,
  updatesOpen: false,
  feedbackOpen: false,
});

export function useUi<S>(selector: (s: UiState) => S, equals?: (a: S, b: S) => boolean): S {
  return useStore(uiStore, selector, equals);
}

let toastId = 1;
export function toast(text: string, kind: 'info' | 'error' | 'ok' = 'info') {
  const id = toastId++;
  uiStore.patch({ toast: { id, text, kind } });
  setTimeout(() => {
    if (uiStore.get().toast?.id === id) uiStore.patch({ toast: null });
  }, kind === 'error' ? 6000 : 2600);
}
