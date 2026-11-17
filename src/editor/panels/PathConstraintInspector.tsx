import { ArrowDown, ArrowUp, Spline, Trash2 } from 'lucide-react';
import { findKeyIndex } from '@/core/curve';
import { PATH_POSITION_MODES, PATH_ROTATE_MODES, PATH_SPACING_MODES } from '@/core/model';
import type { Id, PathPositionMode, PathRotateMode, PathSpacingMode } from '@/core/model';
import { currentAnimation, deleteKeys } from '@/store/actions';
import { useProject } from '@/store/doc';
import { deleteConstraint, moveConstraint, renameConstraint } from '@/store/ikActions';
import { currentPathValues, setPathValues, updatePathConstraint } from '@/store/pathConstraintActions';
import { useUi } from '@/store/ui';
import { Button, IconButton, NumberField, SelectField, TextField } from '../ui/controls';

function Row(props: { label: string; children: React.ReactNode; right?: React.ReactNode; title?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 24px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
      <span style={{ color: 'var(--muted)' }} title={props.title}>
        {props.label}
      </span>
      <div>{props.children}</div>
      <span>{props.right}</span>
    </div>
  );
}

const POSITION_LABEL: Record<PathPositionMode, string> = { fixed: 'Fixed (distance)', percent: 'Percent of the path' };
const SPACING_LABEL: Record<PathSpacingMode, string> = { length: 'Bone length + spacing', fixed: 'Fixed distance', percent: 'Percent of the path', proportional: 'Proportional to the bones' };
const ROTATE_LABEL: Record<PathRotateMode, string> = { tangent: 'Tangent (follow the curve)', chain: 'Chain (point at the next bone)', chainScale: 'Chain + scale (stretch to reach)' };

/** Spine 4.3 path constraint: bones follow a path; position, spacing and the three mixes can be keyed. */
export function PathConstraintInspector({ id }: { id: Id }) {
  const project = useProject();
  const mode = useUi((s) => s.mode);
  const time = useUi((s) => s.time);
  const selectedBones = useUi((s) => s.selection.bones);
  useUi((s) => s.overrides);
  const doc = project.skeleton;
  const c = doc.constraints.find((x) => x.id === id);
  if (!c || c.type !== 'path') return null;
  const animate = mode === 'animate';
  const anim = currentAnimation();
  const keyedAt = (prop: 'position' | 'spacing' | 'mix') => {
    const keys = anim?.path?.[id]?.[prop];
    if (!keys?.length) return false;
    const i = findKeyIndex(keys, time + 1e-4);
    return i >= 0 && Math.abs(keys[i].time - time) < 1e-4;
  };
  const cur = (animate ? currentPathValues(id) : null) ?? { position: c.position, spacing: c.spacing, mix: [c.mix.rotate, c.mix.x, c.mix.y] as [number, number, number] };
  const index = doc.constraints.findIndex((x) => x.id === id);
  const boneName = (b: Id) => doc.bones.find((x) => x.id === b)?.name ?? '?';
  const skin = doc.skins[0];
  const holdsPath = (slotId: Id) => Object.values(skin?.attachments[slotId] ?? {}).some((a) => a.type === 'path');
  const slotOptions = doc.slots.filter((s) => s.id === c.target || holdsPath(s.id)).map((s) => ({ value: s.id, label: s.name }));
  const keyButton = (prop: 'position' | 'spacing' | 'mix', write: () => void) =>
    animate ? (
      <button className={`key-btn${keyedAt(prop) ? ' on' : ''}`} title={keyedAt(prop) ? `Remove the ${prop} key at the playhead` : `Key the ${prop} at the playhead`} onClick={() => (keyedAt(prop) ? deleteKeys([{ kind: 'path', target: id, prop, time }]) : write())}>
        ◆
      </button>
    ) : null;

  // percent values are shown as 0..100
  const posPercent = c.positionMode === 'percent';
  const spacePercent = c.spacingMode === 'percent';
  const mixOf = (i: 0 | 1 | 2) => cur.mix[i] * 100;
  const setMix = (patch: Partial<{ rotate: number; x: number; y: number }>) => setPathValues(id, { mix: patch });
  const mixKeyed = keyedAt('mix');

  return (
    <>
      <div className="group">
        <div className="group-title">
          <Spline size={14} className="k-path" />
          <span>Path constraint</span>
          <span className="spacer" />
          <IconButton icon={ArrowUp} title="Apply earlier" small disabled={index <= 0} onClick={() => moveConstraint(id, -1)} />
          <IconButton icon={ArrowDown} title="Apply later" small disabled={index >= doc.constraints.length - 1} onClick={() => moveConstraint(id, 1)} />
          <IconButton icon={Trash2} title="Delete constraint" small onClick={() => deleteConstraint(id)} />
        </div>
        <TextField value={c.name} onCommit={(n) => renameConstraint(id, n)} wide />
      </div>

      <div className="group">
        <div className="group-title">Path and bones</div>
        <Row label="Path in slot" title="The bones follow the path attachment that this slot shows">
          <SelectField value={c.target} options={slotOptions} onChange={(v) => updatePathConstraint(id, (x) => void (x.target = v), 'Path constraint slot')} />
        </Row>
        <Row label="Bones">
          <span style={{ color: 'var(--text-dim)' }}>{c.bones.map(boneName).join(', ')}</span>
        </Row>
        {!animate && (
          <Button
            ghost
            disabled={!selectedBones.length}
            title="Make the bones that are selected in the tree follow the path"
            onClick={() => {
              const ids = doc.bones.filter((b) => selectedBones.includes(b.id)).map((b) => b.id);
              if (ids.length) updatePathConstraint(id, (x) => void (x.bones = ids), 'Path constraint bones');
            }}
          >
            Use the selected bones
          </Button>
        )}
      </div>

      <div className="group">
        <div className="group-title">Modes</div>
        <Row label="Position">
          <SelectField value={c.positionMode} options={PATH_POSITION_MODES.map((m) => ({ value: m, label: POSITION_LABEL[m] }))} onChange={(v) => !animate && updatePathConstraint(id, (x) => void (x.positionMode = v), 'Path position mode')} />
        </Row>
        <Row label="Spacing">
          <SelectField value={c.spacingMode} options={PATH_SPACING_MODES.map((m) => ({ value: m, label: SPACING_LABEL[m] }))} onChange={(v) => !animate && updatePathConstraint(id, (x) => void (x.spacingMode = v), 'Path spacing mode')} />
        </Row>
        <Row label="Rotate">
          <SelectField value={c.rotateMode} options={PATH_ROTATE_MODES.map((m) => ({ value: m, label: ROTATE_LABEL[m] }))} onChange={(v) => !animate && updatePathConstraint(id, (x) => void (x.rotateMode = v), 'Path rotate mode')} />
        </Row>
        <Row label="Offset" title="Degrees added to the rotation of the bones">
          <NumberField label="°" value={c.offsetRotation} step={1} disabled={animate} onChange={(v) => updatePathConstraint(id, (x) => void (x.offsetRotation = v), 'Path rotation offset')} />
        </Row>
      </div>

      <div className="group">
        <div className="group-title">Position and spacing</div>
        <Row label="Position" title="Where the first bone sits on the path" right={keyButton('position', () => setPathValues(id, { position: cur.position }))}>
          <NumberField
            label={posPercent ? '%' : 'px'}
            value={posPercent ? cur.position * 100 : cur.position}
            step={posPercent ? 1 : 5}
            precision={posPercent ? 1 : 2}
            keyed={animate && keyedAt('position')}
            onChange={(v) => setPathValues(id, { position: posPercent ? v / 100 : v })}
          />
        </Row>
        <Row label="Spacing" title="Distance between the bones" right={keyButton('spacing', () => setPathValues(id, { spacing: cur.spacing }))}>
          <NumberField
            label={spacePercent ? '%' : c.spacingMode === 'proportional' ? '×' : 'px'}
            value={spacePercent ? cur.spacing * 100 : cur.spacing}
            step={spacePercent ? 1 : c.spacingMode === 'proportional' ? 0.05 : 1}
            precision={spacePercent ? 1 : 2}
            keyed={animate && keyedAt('spacing')}
            onChange={(v) => setPathValues(id, { spacing: spacePercent ? v / 100 : v })}
          />
        </Row>
      </div>

      <div className="group">
        <div className="group-title">
          <span>Mix</span>
          <span className="spacer" />
          {animate && (
            <button className={`key-btn${mixKeyed ? ' on' : ''}`} title={mixKeyed ? 'Remove the mix key at the playhead' : 'Key the mixes at the playhead'} onClick={() => (mixKeyed ? deleteKeys([{ kind: 'path', target: id, prop: 'mix', time }]) : setMix({}))}>
              ◆
            </button>
          )}
        </div>
        <Row label="Rotation">
          <NumberField label="%" value={mixOf(0)} step={1} precision={0} min={0} max={100} keyed={animate && mixKeyed} onChange={(v) => setMix({ rotate: v / 100 })} />
        </Row>
        <Row label="X">
          <NumberField label="%" value={mixOf(1)} step={1} precision={0} min={0} max={100} keyed={animate && mixKeyed} onChange={(v) => setMix({ x: v / 100 })} />
        </Row>
        <Row label="Y">
          <NumberField label="%" value={mixOf(2)} step={1} precision={0} min={0} max={100} keyed={animate && mixKeyed} onChange={(v) => setMix({ y: v / 100 })} />
        </Row>
      </div>
    </>
  );
}
