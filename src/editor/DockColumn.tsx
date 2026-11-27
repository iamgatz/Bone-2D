/**
 * One column of side panels. It never grows past the window: the panels share its height, each one can be dragged taller or shorter by
 * its lower edge, and when they cannot all have their smallest height the column scrolls.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType, PointerEvent as ReactPointerEvent } from 'react';
import { DEFAULT_SIZE, PANEL_MIN, dragEdge, isCrowded } from '@/store/dock';
import type { PanelId, Side } from '@/store/dock';
import { resetColumnSizes, sizePanels } from '@/store/dockActions';
import { useUi } from '@/store/ui';
import { setFocusArea } from './focus';
import { AnimationToolsPanel } from './panels/AnimationToolsPanel';
import { AnimationsPanel } from './panels/AnimationsPanel';
import { AssetsPanel } from './panels/AssetsPanel';
import { CommentsPanel } from './panels/CommentsPanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { MetricsPanel } from './panels/MetricsPanel';
import { PlaybackPanel } from './panels/PlaybackPanel';
import { PosesPanel } from './panels/PosesPanel';
import { PreviewPanel } from './panels/PreviewPanel';
import { SkinsPanel } from './panels/SkinsPanel';
import { TreePanel } from './panels/TreePanel';
import { PanelContext } from './ui/PanelTitle';
import { usePanelDrag } from './ui/panelDrag';

const PANELS: Record<PanelId, ComponentType> = {
  tree: TreePanel,
  animations: AnimationsPanel,
  skins: SkinsPanel,
  playback: PlaybackPanel,
  tools: AnimationToolsPanel,
  poses: PosesPanel,
  metrics: MetricsPanel,
  history: HistoryPanel,
  comments: CommentsPanel,
  preview: PreviewPanel,
  images: AssetsPanel,
  inspector: InspectorPanel,
};

/** The lower edge of a panel: drag it to make the panel taller or shorter, double-click to give the column its usual heights back. */
function Edge(props: { side: Side; id: PanelId; crowded: boolean }) {
  const start = useRef<{ y: number; ids: PanelId[]; heights: number[]; overflow: number } | null>(null);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    const column = e.currentTarget.parentElement!;
    const slots = [...column.querySelectorAll<HTMLElement>('.dock-slot[data-open]')];
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = {
      y: e.clientY,
      ids: slots.map((el) => el.dataset.panel as PanelId),
      heights: slots.map((el) => el.getBoundingClientRect().height),
      overflow: column.scrollHeight - column.clientHeight,
    };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || e.clientY === s.y) return;
    const mins = s.ids.map((id) => PANEL_MIN[id]);
    const heights = dragEdge(s.heights, mins, s.ids.indexOf(props.id), e.clientY - s.y, s.overflow, props.crowded);
    sizePanels(Object.fromEntries(s.ids.map((id, i) => [id, Math.round(heights[i])])));
  };
  const end = () => (start.current = null);
  return (
    <div
      className="dock-edge"
      data-edge={props.id}
      title="Drag to resize the panel, double-click for the usual heights"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => resetColumnSizes(props.side)}
    />
  );
}

export function DockColumn(props: { side: Side; width: number }) {
  const { side } = props;
  const dock = useUi((s) => s.dock);
  const views = useUi((s) => s.views);
  const drag = usePanelDrag();
  const box = useRef<HTMLElement>(null);
  const ids = dock[side].filter((id) => views[id]);
  const open = ids.filter((id) => !dock.folded.includes(id));
  // somebody has to take the room that is left: the panels without a height of their own, else those whose usual height is not fixed
  const shared = open.some((id) => dock.size[id] === undefined);
  const flexible = open.filter((id) => DEFAULT_SIZE[id] === undefined);
  const takesRest = (id: PanelId) => !shared && (flexible.length ? flexible.includes(id) : true);

  // while every panel can have its smallest height, given heights bend to the window; in a crowded column they are kept and it scrolls
  const [height, setHeight] = useState(Infinity);
  const shown = ids.length > 0;
  useLayoutEffect(() => {
    const column = box.current;
    if (!column) return;
    const look = () => setHeight(column.clientHeight);
    look();
    const watch = new ResizeObserver(look);
    watch.observe(column);
    return () => watch.disconnect();
  }, [shown]);
  const crowded = isCrowded(height, open, ids.length - open.length);

  // a panel that has just been opened or moved here is brought into view when the column scrolls
  const list = ids.join(' ');
  const before = useRef<string | null>(null);
  useEffect(() => {
    const old = before.current?.split(' ');
    before.current = list;
    const column = box.current;
    if (!old || !column) return;
    const fresh = list.split(' ').find((id) => id && !old.includes(id));
    const el = fresh ? column.querySelector<HTMLElement>(`.dock-slot[data-panel="${fresh}"]`) : null;
    if (!el) return;
    const frame = column.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.bottom > frame.bottom) column.scrollTop += Math.min(r.bottom - frame.bottom, r.top - frame.top);
    else if (r.top < frame.top) column.scrollTop -= frame.top - r.top;
  }, [list]);

  const label = side === 'left' ? 'Left panels' : 'Right panels';
  if (!ids.length)
    return (
      <aside ref={box} className={`${side} dock-nothing${drag?.side === side ? ' drop' : ''}`} aria-label={label} data-side={side}>
        <span>Drop the panel here</span>
      </aside>
    );
  return (
    <aside
      ref={box}
      className={`${side}${drag?.side === side && drag.before === null ? ' drop-end' : ''}`}
      aria-label={label}
      data-side={side}
      style={{ width: props.width }}
    >
      {ids.map((id) => {
        const Panel = PANELS[id];
        const folded = dock.folded.includes(id);
        const size = dock.size[id];
        const style = folded
          ? { flex: '0 0 auto' }
          : size === undefined
            ? { flex: '1 1 0px', minHeight: PANEL_MIN[id] }
            : { flex: `${takesRest(id) ? 1 : 0} ${crowded ? 0 : 1} ${size}px`, minHeight: PANEL_MIN[id] };
        const mark = `${drag?.side === side && drag.before === id ? ' drop-before' : ''}${drag?.id === id ? ' dragged' : ''}`;
        return (
          <Fragment key={id}>
            <div
              className={`dock-slot${folded ? ' folded' : ''}${mark}`}
              data-panel={id}
              data-open={folded ? undefined : ''}
              style={style}
              onPointerDownCapture={() => setFocusArea(id === 'inspector' ? 'viewport' : 'tree')}
            >
              <PanelContext.Provider value={id}>
                <Panel />
              </PanelContext.Provider>
            </div>
            {!folded && <Edge side={side} id={id} crowded={crowded} />}
          </Fragment>
        );
      })}
    </aside>
  );
}
