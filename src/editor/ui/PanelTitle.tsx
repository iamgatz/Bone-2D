/**
 * The name of a side panel in its title bar: the arrow folds the panel to this bar, a double click does the same, and dragging the name
 * moves the panel up, down or into the other column. The column (see DockColumn) tells the title which panel it belongs to.
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { foldPanel } from '@/store/dockActions';
import type { PanelId } from '@/store/dock';
import { useUi } from '@/store/ui';
import { startPanelDrag } from './panelDrag';

export const PanelContext = createContext<PanelId | null>(null);

export function PanelTitle(props: { children: ReactNode }) {
  const id = useContext(PanelContext);
  const folded = useUi((s) => id !== null && s.dock.folded.includes(id));
  if (!id) return <span className="title">{props.children}</span>;
  const label = folded ? 'Unfold the panel' : 'Fold the panel';
  return (
    <>
      <button
        type="button"
        className="panel-fold"
        title={label}
        aria-label={label}
        aria-expanded={!folded}
        onClick={() => foldPanel(id, !folded)}
      >
        {folded ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
      </button>
      <span
        className="title drag"
        title="Drag to move the panel, double-click to fold it"
        onPointerDown={(e) => startPanelDrag(id, e)}
        onDoubleClick={() => foldPanel(id, !folded)}
      >
        {props.children}
      </span>
    </>
  );
}
