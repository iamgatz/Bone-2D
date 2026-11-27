/** What a person does with the side panels: fold, size, move, and put everything back. */
import { DEFAULT_DOCK, movePanel, resetSize, setFolded } from './dock';
import type { PanelId, Side } from './dock';
import { uiStore } from './ui';

export function foldPanel(id: PanelId, folded: boolean) {
  uiStore.patch({ dock: setFolded(uiStore.get().dock, id, folded) });
}

export function movePanelTo(id: PanelId, side: Side, before: PanelId | null) {
  uiStore.patch({ dock: movePanel(uiStore.get().dock, id, side, before) });
}

export function sizePanels(sizes: Partial<Record<PanelId, number>>) {
  const dock = uiStore.get().dock;
  uiStore.patch({ dock: { ...dock, size: { ...dock.size, ...sizes } } });
}

/** The open panels of a column get their usual heights again. */
export function resetColumnSizes(side: Side) {
  const { dock, views } = uiStore.get();
  uiStore.patch({ dock: dock[side].filter((id) => views[id]).reduce(resetSize, dock) });
}

/** Places, heights, folded panels and the widths of the columns and the timeline as they were at the start. */
export function resetDock() {
  const wide = typeof window === 'undefined' || window.innerWidth >= 1150;
  uiStore.patch({ dock: DEFAULT_DOCK, panel: wide ? { left: 270, right: 300, bottom: 300 } : { left: 210, right: 240, bottom: 250 } });
}
