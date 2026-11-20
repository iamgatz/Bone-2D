import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';
import { estimatePages, poseMetrics } from '@/core/drawstats';
import { canFix, isSafeFix } from '@/core/problems';
import { MAX_INFLUENCES, projectStats, projectWarnings } from '@/core/stats';
import type { Warning } from '@/core/stats';
import { fixAllSafeWarnings, fixWarning, revealWarning } from '@/store/problemActions';
import { useProject } from '@/store/doc';
import { useUi } from '@/store/ui';
import { getScene } from '@/store/scene';

const WARNING_TEXT: Record<Warning['kind'], string> = {
  unusedImage: 'Image is not used by any attachment',
  emptyAnimation: 'Animation has no keys',
  emptySlot: 'Slot has no attachments in any skin',
  tooManyInfluences: `Mesh has vertices with more than ${MAX_INFLUENCES} bone influences`,
  duplicatePath: 'Two attachments use the same image',
  missingFrame: 'A picture of the sequence is missing: the export cannot be read by an engine',
  ignoredDeform: 'Deform keys on a linked mesh that shares the deform of its source: the keys are not exported, move the source instead',
};

/** What the fix button of each warning does, shown as its tooltip. */
const FIX_TEXT: Partial<Record<Warning['kind'], string>> = {
  unusedImage: 'Remove this image from the project',
  tooManyInfluences: 'Keep the 4 strongest bones of each vertex that has more: the pose does not change',
  ignoredDeform: 'Delete these deform keys: the export ignores them',
  emptyAnimation: 'Delete this animation',
  emptySlot: 'Delete this slot',
};

/** The Metrics window: how big the skeleton is, and what looks forgotten before an export. */
export function MetricsPanel() {
  const project = useProject();
  const stats = useMemo(() => projectStats(project), [project]);
  const warnings = useMemo(() => projectWarnings(project), [project]);
  // the pose on screen: the numbers follow the playhead (the scene is the one the viewport draws)
  const time = useUi((s) => s.time);
  const mode = useUi((s) => s.mode);
  const animationId = useUi((s) => s.animationId);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the pages depend on the images and skins only
  const pageOf = useMemo(() => estimatePages(project), [project.images, project.skeleton.skins]);
  const pose = useMemo(() => {
    const scene = getScene();
    const hidden = new Set(project.skeleton.slots.filter((s) => s.hidden).map((s) => s.id));
    return poseMetrics(scene.skeleton, { pageOf, skip: (s) => hidden.has(s.data.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the scene is outside React: the playhead, mode and animation say when it moved
  }, [project, time, mode, animationId, pageOf]);
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
    ['Timelines', stats.timelines],
    ['Clipping polygons', stats.attachments.clipping ?? 0],
    ['Texture area', stats.area >= 1e6 ? `${(stats.area / 1e6).toFixed(2)} Mpx` : `${Math.round(stats.area / 1000)} kpx`],
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
        <div className="section-label">This pose</div>
        <div className="metric-grid">
          {(
            [
              [
                'Draw calls',
                pose.drawCalls,
                'Batches in the draw order: a new one starts when the texture page (of an export with the default atlas options), the blend mode or the clipping changes',
              ],
              ['Pictures drawn', pose.drawn, 'Slots that show a picture now'],
              ['Triangles drawn', pose.triangles, 'Triangles of the pictures shown now'],
              [
                'Clipped triangles',
                pose.clippedTriangles,
                'Triangles that cross the outline of a clipping polygon: the ones a runtime has to cut',
              ],
            ] as const
          ).map(([label, value, tip]) => (
            <div key={label} className="metric" title={tip}>
              <span className="metric-value">{value}</span>
              <span className="metric-label">{label}</span>
            </div>
          ))}
        </div>
        <div className="section-label">
          Before export
          {warnings.some(isSafeFix) && (
            <button
              className="btn sm"
              style={{ marginLeft: 8 }}
              title="Fix every problem that loses nothing: unused images, surplus influences, ignored deform keys"
              onClick={() => fixAllSafeWarnings()}
            >
              <Wrench size={12} /> Fix all that are safe
            </button>
          )}
        </div>
        {warnings.length === 0 ? (
          <div className="warn ok">
            <CheckCircle2 size={14} /> Nothing looks forgotten
          </div>
        ) : (
          warnings.slice(0, 40).map((w, i) => (
            <div key={i} className="warn">
              <AlertTriangle size={14} />
              <span className="warn-text">{WARNING_TEXT[w.kind]}</span>
              <b style={w.ref?.slot || w.ref?.animation ? { cursor: 'pointer' } : undefined} onClick={() => revealWarning(w)}>
                {w.subject}
              </b>
              {canFix(w) && (
                <button className="btn sm" title={FIX_TEXT[w.kind]} onClick={() => fixWarning(w)}>
                  <Wrench size={12} /> Fix
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
