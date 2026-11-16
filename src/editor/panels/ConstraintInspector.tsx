import { ArrowDown, ArrowUp, Link2, Trash2 } from 'lucide-react';
import { findKeyIndex } from '@/core/curve';
import type { Id } from '@/core/model';
import { currentAnimation, deleteKeys } from '@/store/actions';
import { useProject } from '@/store/doc';
import { currentIkValues, deleteConstraint, moveConstraint, renameConstraint, setConstraintSetup, setIkValues } from '@/store/ikActions';
import { useUi } from '@/store/ui';
import { Button, IconButton, NumberField, SelectField, TextField, Toggle } from '../ui/controls';
import { SliderInspector } from './SliderInspector';
import { TransformInspector } from './TransformInspector';

function Row(props: { label: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '62px 1fr 24px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
      <span style={{ color: 'var(--muted)' }}>{props.label}</span>
      <div>{props.children}</div>
      <span>{props.right}</span>
    </div>
  );
}

export function ConstraintInspector({ id }: { id: Id }) {
  const project = useProject();
  const c0 = project.skeleton.constraints.find((x) => x.id === id);
  if (!c0) return null;
  if (c0.type === 'transform') return <TransformInspector id={id} />;
  if (c0.type === 'slider') return <SliderInspector id={id} />;
  return <IkInspector id={id} />;
}

function IkInspector({ id }: { id: Id }) {
  const project = useProject();
  const mode = useUi((s) => s.mode);
  const time = useUi((s) => s.time);
  useUi((s) => s.overrides);
  const doc = project.skeleton;
  const c = doc.constraints.find((x) => x.id === id);
  if (!c || c.type !== 'ik') return null;
  const animate = mode === 'animate';
  const anim = currentAnimation();
  const keys = anim?.ik[id];
  const keyed = !!keys && (() => {
    const i = findKeyIndex(keys, time + 1e-4);
    return i >= 0 && Math.abs(keys[i].time - time) < 1e-4;
  })();
  const v = (animate ? currentIkValues(id) : null) ?? { mix: c.mix, softness: c.softness, bendPositive: c.bendPositive, compress: c.compress, stretch: c.stretch };
  const boneName = (b: Id) => doc.bones.find((x) => x.id === b)?.name ?? '?';
  const index = doc.constraints.findIndex((x) => x.id === id);

  return (
    <>
      <div className="group">
        <div className="group-title">
          <Link2 size={14} />
          <span>IK constraint</span>
          <span className="spacer" />
          <IconButton icon={ArrowUp} title="Apply earlier" small disabled={index <= 0} onClick={() => moveConstraint(id, -1)} />
          <IconButton icon={ArrowDown} title="Apply later" small disabled={index >= doc.constraints.length - 1} onClick={() => moveConstraint(id, 1)} />
          <IconButton icon={Trash2} title="Delete constraint" small onClick={() => deleteConstraint(id)} />
        </div>
        <TextField value={c.name} onCommit={(n) => renameConstraint(id, n)} wide />
      </div>
      <div className="group">
        <div className="group-title">
          <span>Chain</span>
          {animate && (
            <>
              <span className="spacer" />
              <button
                className={`key-btn${keyed ? ' on' : ''}`}
                title={keyed ? 'Remove the IK key at the playhead' : 'Key the IK values at the playhead'}
                onClick={() => (keyed ? deleteKeys([{ kind: 'ik', target: id, prop: '', time }]) : setIkValues(id, {}))}
              >
                ◆
              </button>
            </>
          )}
        </div>
        <Row label="Bones">
          <span style={{ color: 'var(--text-dim)' }}>{c.bones.map(boneName).join(' → ')}</span>
        </Row>
        <Row label="Target">
          <SelectField value={c.target} options={doc.bones.filter((b) => !c.bones.includes(b.id)).map((b) => ({ value: b.id, label: b.name }))} onChange={(t) => setConstraintSetup(id, { target: t })} />
        </Row>
        <Row label="Mix">
          <NumberField label="%" value={v.mix * 100} step={1} precision={0} min={0} max={100} keyed={animate && keyed} onChange={(x) => setIkValues(id, { mix: x / 100 })} />
        </Row>
        {c.bones.length === 2 && (
          <Row label="Softness">
            <NumberField label="px" value={v.softness} step={0.5} precision={1} min={0} keyed={animate && keyed} onChange={(x) => setIkValues(id, { softness: Math.max(0, x) })} />
          </Row>
        )}
        {c.bones.length === 2 && (
          <div className="row-between">
            <label>Bend positive</label>
            <Toggle on={v.bendPositive} onChange={(x) => setIkValues(id, { bendPositive: x })} />
          </div>
        )}
        <div className="row-between">
          <label>Stretch</label>
          <Toggle on={v.stretch} onChange={(x) => setIkValues(id, { stretch: x })} />
        </div>
        {c.bones.length === 1 && (
          <div className="row-between">
            <label>Compress</label>
            <Toggle on={v.compress} onChange={(x) => setIkValues(id, { compress: x })} />
          </div>
        )}
        {(v.stretch || v.compress) && (
          <Row label="Scale Y">
            <SelectField value={c.scaleY} options={[{ value: 'none', label: 'Keep' }, { value: 'uniform', label: 'Uniform' }, { value: 'volume', label: 'Preserve volume' }]} onChange={(x) => setConstraintSetup(id, { scaleY: x })} />
          </Row>
        )}
      </div>
      <div className="group">
        <Button danger icon={Trash2} onClick={() => deleteConstraint(id)}>
          Delete constraint
        </Button>
      </div>
    </>
  );
}
