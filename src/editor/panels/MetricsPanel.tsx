import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { MAX_INFLUENCES, projectStats, projectWarnings } from '@/core/stats';
import type { Warning } from '@/core/stats';
import { useProject } from '@/store/doc';

const WARNING_TEXT: Record<Warning['kind'], string> = {
  unusedImage: 'Image is not used by any attachment',
  emptyAnimation: 'Animation has no keys',
  emptySlot: 'Slot has no attachments in any skin',
  tooManyInfluences: `Mesh has vertices with more than ${MAX_INFLUENCES} bone influences`,
  duplicatePath: 'Two attachments use the same image',
  missingFrame: 'A picture of the sequence is missing: the export cannot be read by an engine',
};

/** The Metrics window: how big the skeleton is, and what looks forgotten before an export. */
export function MetricsPanel() {
  const project = useProject();
  const stats = useMemo(() => projectStats(project), [project]);
  const warnings = useMemo(() => projectWarnings(project), [project]);
  const constraintTotal = Object.values(stats.constraints).reduce((a, b) => a + b, 0);
  const rows: [string, string | number][] = [
    ['Bones', stats.bones],
    ['Slots', stats.slots],
    ['Images', stats.images],
    ['Meshes', stats.attachments.mesh ?? 0],
    ['Vertices', stats.vertices],
    ['Triangles', stats.triangles],
    ['Weighted vertices', stats.weightedVertices],
    ['Skins', stats.skins],
    ['Constraints', constraintTotal],
    ['Animations', stats.animations],
    ['Keys', stats.keys],
    ['Events', stats.events],
    ['Longest animation', `${stats.longest.toFixed(2)} s`],
  ];

  return (
    <div className="panel grow" style={{ minHeight: 110 }}>
      <div className="panel-head">
        <span className="title">Metrics</span>
      </div>
      <div className="panel-body metrics">
        <div className="metric-grid">
          {rows.map(([label, value]) => (
            <div key={label} className="metric">
              <span className="metric-value">{value}</span>
              <span className="metric-label">{label}</span>
            </div>
          ))}
        </div>
        <div className="section-label">Before export</div>
        {warnings.length === 0 ? (
          <div className="warn ok">
            <CheckCircle2 size={14} /> Nothing looks forgotten
          </div>
        ) : (
          warnings.slice(0, 40).map((w, i) => (
            <div key={i} className="warn">
              <AlertTriangle size={14} />
              <span className="warn-text">{WARNING_TEXT[w.kind]}</span>
              <b>{w.subject}</b>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
