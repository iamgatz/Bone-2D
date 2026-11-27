import { describe, expect, it } from 'vitest';
import { DEFAULT_DOCK, PANEL_MIN, dragEdge, isCrowded, movePanel, readDock, resetSize, setFolded } from '@/store/dock';
import type { Dock, PanelId } from '@/store/dock';
import { VIEW_LIST, readLayout, readNamedLayouts } from '@/store/layout';
import { resetColumnSizes, resetDock, sizePanels } from '@/store/dockActions';
import { applySavedLayout, saveLayoutAs } from '@/store/layoutActions';
import { uiStore } from '@/store/ui';
import { toggleView } from '@/store/viewActions';

const everyPanel = VIEW_LIST.map((v) => v.id).filter((id): id is PanelId => id !== 'timeline');
const all = (d: Dock) => [...d.left, ...d.right].sort();

describe('the places of the side panels', () => {
  it('has every panel once from the start', () => {
    expect(all(DEFAULT_DOCK)).toEqual([...everyPanel].sort());
    expect(Object.keys(PANEL_MIN).sort()).toEqual([...everyPanel].sort());
  });

  it('takes a stored value for what it is worth', () => {
    expect(readDock(null)).toEqual(DEFAULT_DOCK);
    const odd = readDock({
      left: ['inspector', 'ghost', 'tree', 'tree', 'constructor'],
      right: ['tree', 'skins'],
      size: { tree: 300, skins: 'tall', images: 5, ghost: 100 },
      folded: ['tree', 'tree', 'ghost'],
    });
    expect(all(odd)).toEqual([...everyPanel].sort());
    expect(odd.left).toContain('inspector');
    expect(odd.right).toEqual(['skins']);
    expect(odd.size).toEqual({ tree: 300 });
    expect(odd.folded).toEqual(['tree']);
  });

  it('moves a panel up, down and into the other column', () => {
    const up = movePanel(DEFAULT_DOCK, 'images', 'left', 'tree');
    expect(up.left.slice(0, 2)).toEqual(['images', 'tree']);
    expect(up.size.images).toBe(260); // the same column keeps its height
    const over = movePanel(up, 'images', 'right', null);
    expect(over.right).toEqual(['inspector', 'images']);
    expect(over.left).not.toContain('images');
    expect(over.size.images).toBeUndefined();
    expect(all(over)).toEqual([...everyPanel].sort());
    expect(movePanel(over, 'inspector', 'right', 'inspector')).toBe(over);
  });

  it('folds, unfolds and gives usual heights back', () => {
    const folded = setFolded(DEFAULT_DOCK, 'tree', true);
    expect(folded.folded).toEqual(['tree']);
    expect(setFolded(folded, 'tree', true)).toBe(folded);
    expect(setFolded(folded, 'tree', false).folded).toEqual([]);
    const sized = { ...DEFAULT_DOCK, size: { tree: 400, images: 500 } };
    expect(resetSize(resetSize(sized, 'tree'), 'images').size).toEqual({ images: 260 });
  });

  it('knows when a column cannot give every panel its smallest height', () => {
    expect(isCrowded(600, ['tree', 'images'], 0)).toBe(false);
    expect(isCrowded(300, ['tree', 'images'], 0)).toBe(true);
    // two panels fit into 400, the title bars of two folded ones next to them do not
    expect(isCrowded(400, ['tree', 'images'], 0)).toBe(false);
    expect(isCrowded(400, ['tree', 'images'], 2)).toBe(true);
  });
});

describe('dragging the lower edge of a panel', () => {
  const mins = [100, 100, 100];

  it('takes room from the panels below and stops when they are at their smallest', () => {
    expect(dragEdge([200, 200, 200], mins, 0, 50, 0, false)).toEqual([250, 150, 200]);
    expect(dragEdge([200, 200, 200], mins, 0, 150, 0, false)).toEqual([350, 100, 150]);
    expect(dragEdge([200, 200, 200], mins, 0, 900, 0, false)).toEqual([400, 100, 100]);
    expect(dragEdge([200, 200, 200], mins, 2, 90, 0, false)).toEqual([200, 200, 200]);
  });

  it('goes on growing in a column that scrolls', () => {
    expect(dragEdge([100, 100, 100], mins, 0, 80, 40, true)).toEqual([180, 100, 100]);
    expect(dragEdge([100, 100, 100], mins, 2, 80, 40, true)).toEqual([100, 100, 180]);
  });

  it('gives what it loses to the panel underneath, after taking back the scrolling', () => {
    expect(dragEdge([300, 100, 100], mins, 0, -50, 0, false)).toEqual([250, 150, 100]);
    expect(dragEdge([300, 100, 100], mins, 0, -900, 0, false)).toEqual([100, 300, 100]);
    expect(dragEdge([300, 100, 100], mins, 0, -150, 120, true)).toEqual([150, 130, 100]);
  });
});

describe('the arrangement is remembered', () => {
  const start = () => {
    uiStore.patch({ views: Object.fromEntries(VIEW_LIST.map((v) => [v.id, true])) as ReturnType<typeof uiStore.get>['views'] });
    resetDock();
  };

  it('reads places, heights and the width of the timeline names back', () => {
    const dock = movePanel(setFolded(DEFAULT_DOCK, 'tree', true), 'skins', 'right', null);
    const got = readLayout(JSON.stringify({ panel: { left: 300, right: 300, bottom: 300, labels: 320 }, dock }));
    expect(got.dock).toEqual(dock);
    expect(got.panel?.labels).toBe(320);
    expect(readLayout(JSON.stringify({ panel: { left: 300, right: 300, bottom: 300, labels: 'wide' } })).panel).toEqual({
      left: 300,
      right: 300,
      bottom: 300,
    });
  });

  it('keeps the places in a saved arrangement, and an old one without them changes none', () => {
    start();
    uiStore.patch({ dock: movePanel(uiStore.get().dock, 'skins', 'right', null) });
    const mine = saveLayoutAs('Two columns')!;
    resetDock();
    expect(uiStore.get().dock.right).toEqual(['inspector']);
    applySavedLayout(mine.id);
    expect(uiStore.get().dock.right).toEqual(['inspector', 'skins']);
    const old = readNamedLayouts(JSON.stringify([{ id: 'x', name: 'Old', views: {}, panel: { left: 300, right: 300, bottom: 300 } }]));
    expect(old[0].dock).toBeUndefined();
  });

  it('opens a window unfolded, and gives one column its usual heights back', () => {
    start();
    uiStore.patch({ dock: setFolded(uiStore.get().dock, 'skins', true) });
    toggleView('skins');
    expect(uiStore.get().dock.folded).toEqual(['skins']); // closing leaves it as it was
    toggleView('skins');
    expect(uiStore.get().dock.folded).toEqual([]);
    sizePanels({ tree: 500, images: 400, inspector: 300 });
    resetColumnSizes('left');
    expect(uiStore.get().dock.size).toEqual({ images: 260, inspector: 300 });
  });
});
