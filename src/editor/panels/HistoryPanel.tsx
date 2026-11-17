import { useEffect, useState } from 'react';
import { CircleDot, Undo2 } from 'lucide-react';
import { docStore } from '@/store/doc';
import { IconButton } from '../ui/controls';

/** The History window: every step that can be undone, and the ones that were undone; a click goes to that point. Spine has only Ctrl+Z. */
export function HistoryPanel() {
  const [, force] = useState(0);
  useEffect(() => {
    const stop = docStore.subscribe(() => force((n) => n + 1));
    return () => void stop();
  }, []);
  const { past, future } = docStore.history;
  return (
    <div className="panel grow" style={{ minHeight: 110 }}>
      <div className="panel-head">
        <span className="title">History</span>
        <IconButton icon={Undo2} title="Undo" small disabled={!docStore.canUndo} onClick={() => docStore.undo()} />
      </div>
      <div className="panel-body">
        <div className="row" onClick={() => docStore.jumpTo(-1)}>
          <span className="ico">
            <CircleDot size={12} />
          </span>
          <span className="label dim">Opened</span>
        </div>
        {past.map((label, i) => (
          <div key={`p${i}`} className={`row${i === past.length - 1 ? ' selected' : ''}`} onClick={() => docStore.jumpTo(i)}>
            <span className="ico row-meta">{i + 1}</span>
            <span className="label">{label}</span>
          </div>
        ))}
        {future.map((label, i) => (
          <div key={`f${i}`} className="row undone" onClick={() => docStore.jumpTo(past.length + i)}>
            <span className="ico row-meta">{past.length + i + 1}</span>
            <span className="label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
