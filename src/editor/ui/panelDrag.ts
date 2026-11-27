/** Moving a panel by its name: where it would land follows the pointer; letting go puts it there, Esc leaves it where it was. */
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PanelId, Side } from '@/store/dock';
import { movePanelTo } from '@/store/dockActions';
import { createStore, useStore } from '@/store/store';

export interface PanelDrag {
  id: PanelId;
  /** Null while the pointer is over neither column. */
  side: Side | null;
  /** The panel it would go in front of; null is the end of the column. */
  before: PanelId | null;
}

const dragStore = createStore<{ drag: PanelDrag | null }>({ drag: null });
export const usePanelDrag = (): PanelDrag | null => useStore(dragStore, (s) => s.drag);

/** How far the pointer has to travel before a press on the name counts as a drag. */
const SLACK = 6;

function target(id: PanelId, x: number, y: number): PanelDrag {
  const column = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-side]');
  if (!column) return { id, side: null, before: null };
  const next = [...column.querySelectorAll<HTMLElement>('.dock-slot')].find((el) => {
    const box = el.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
  return { id, side: column.dataset.side as Side, before: (next?.dataset.panel as PanelId | undefined) ?? null };
}

export function startPanelDrag(id: PanelId, down: ReactPointerEvent) {
  if (down.button !== 0) return;
  const from = { x: down.clientX, y: down.clientY };
  let moving = false;
  const move = (e: PointerEvent) => {
    if (!moving && Math.hypot(e.clientX - from.x, e.clientY - from.y) < SLACK) return;
    moving = true;
    document.body.classList.add('moving-panel');
    dragStore.set({ drag: target(id, e.clientX, e.clientY) });
  };
  const stop = (drop: boolean) => {
    const drag = dragStore.get().drag;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    document.body.classList.remove('moving-panel');
    dragStore.set({ drag: null });
    if (drop && moving && drag?.side) movePanelTo(drag.id, drag.side, drag.before);
  };
  const up = () => stop(true);
  const cancel = () => stop(false);
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); // ends the drag, keeps the selection
    stop(false);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
}
