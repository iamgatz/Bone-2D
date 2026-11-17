import { ArrowDown, ArrowUp, RotateCcw, Trash2, Waves } from 'lucide-react';
import { findKeyIndex } from '@/core/curve';
import { GLOBAL_PHYSICS, PHYSICS_PARAMS } from '@/core/model';
import type { Id, PhysicsParam } from '@/core/model';
import { currentAnimation, deleteKeys } from '@/store/actions';
import { useProject } from '@/store/doc';
import { deleteConstraint, moveConstraint, renameConstraint } from '@/store/ikActions';
import { addPhysicsReset, currentPhysicsValue, restartPhysics, setPhysicsValue, updatePhysicsConstraint } from '@/store/physicsActions';
import { useUi } from '@/store/ui';
import { Button, IconButton, NumberField, SelectField, TextField, Toggle } from '../ui/controls';

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

interface ParamSpec {
  label: string;
  title: string;
  step: number;
  precision: number;
  /** Shown as a percentage (the stored value is 0..1). */
  percent?: boolean;
  min?: number;
  max?: number;
}

const PARAMS: Record<PhysicsParam, ParamSpec> = {
  inertia: { label: 'Inertia', title: 'How much of the bone\'s own movement the simulation takes over (0 = none, 100 = all of it)', step: 1, precision: 0, percent: true, min: 0 },
  strength: { label: 'Strength', title: 'The force that pulls the bone back to where it would be without physics', step: 1, precision: 1, min: 0 },
  damping: { label: 'Damping', title: 'How quickly the swinging dies down (100 = it never does)', step: 1, precision: 0, percent: true, min: 0, max: 1 },
  mass: { label: 'Mass', title: 'The heavier it is, the slower it reacts to forces', step: 0.1, precision: 2, min: 0.01 },
  wind: { label: 'Wind', title: 'A constant force along the wind direction (right)', step: 1, precision: 1 },
  gravity: { label: 'Gravity', title: 'A constant force along the gravity direction (down)', step: 1, precision: 1 },
  mix: { label: 'Mix', title: 'How much of the simulation shows (0 = none, 100 = all of it)', step: 1, precision: 0, percent: true, min: 0 },
};

const SCALE_Y_LABEL = { none: 'Unchanged', uniform: 'Same as scale X', volume: 'Keep the volume' } as const;

/** Spine 4.2+ physics constraint: a spring simulation on one bone. The animatable parameters can be keyed. */
export function PhysicsConstraintInspector({ id }: { id: Id }) {
  const project = useProject();
  const mode = useUi((s) => s.mode);
  const time = useUi((s) => s.time);
  useUi((s) => s.overrides);
  const doc = project.skeleton;
  const c = doc.constraints.find((x) => x.id === id);
  if (!c || c.type !== 'physics') return null;
  const animate = mode === 'animate';
  const anim = currentAnimation();
  const index = doc.constraints.findIndex((x) => x.id === id);
  const keysOf = (param: PhysicsParam | 'reset') => anim?.physics?.[param !== 'reset' && c.global[param] ? GLOBAL_PHYSICS : id]?.[param];
  const keyedAt = (param: PhysicsParam | 'reset') => {
    const keys = keysOf(param);
    if (!keys?.length) return false;
    const i = findKeyIndex(keys, time + 1e-4);
    return i >= 0 && Math.abs(keys[i].time - time) < 1e-4;
  };
  const value = (p: PhysicsParam) => (animate ? currentPhysicsValue(id, p) : null) ?? c[p];
  const shown = (p: PhysicsParam) => (PARAMS[p].percent ? value(p) * 100 : value(p));
  const keyTarget = (p: PhysicsParam) => (c.global[p] ? GLOBAL_PHYSICS : id);

  const paramRow = (p: PhysicsParam) => {
    const spec = PARAMS[p];
    const keyed = keyedAt(p);
    return (
      <Row
        key={p}
        label={spec.label}
        title={spec.title}
        right={
          animate ? (
            <button className={`key-btn${keyed ? ' on' : ''}`} title={keyed ? `Remove the ${p} key at the playhead` : `Key the ${p} at the playhead`} onClick={() => (keyed ? deleteKeys([{ kind: 'physics', target: keyTarget(p), prop: p, time }]) : setPhysicsValue(id, p, value(p)))}>
              ◆
            </button>
          ) : null
        }
      >
        <NumberField label={spec.percent ? '%' : ''} value={shown(p)} step={spec.step} precision={spec.precision} min={spec.min !== undefined && spec.percent ? spec.min * 100 : spec.min} max={spec.max !== undefined && spec.percent ? spec.max * 100 : spec.max} keyed={animate && keyed} onChange={(v) => setPhysicsValue(id, p, spec.percent ? v / 100 : v)} />
      </Row>
    );
  };

  const influence = (label: string, prop: 'x' | 'y' | 'rotate' | 'scaleX' | 'shearX', title: string) => (
    <Row label={label} title={title}>
      <NumberField label="%" value={c[prop] * 100} step={5} precision={0} min={0} max={100} disabled={animate} onChange={(v) => updatePhysicsConstraint(id, (x) => void (x[prop] = Math.min(1, Math.max(0, v / 100))), `Physics ${label}`)} />
    </Row>
  );
  const resetKeyed = keyedAt('reset');

  return (
    <>
      <div className="group">
        <div className="group-title">
          <Waves size={14} className="k-physics" />
          <span>Physics constraint</span>
          <span className="spacer" />
          <IconButton icon={ArrowUp} title="Apply earlier" small disabled={index <= 0} onClick={() => moveConstraint(id, -1)} />
          <IconButton icon={ArrowDown} title="Apply later" small disabled={index >= doc.constraints.length - 1} onClick={() => moveConstraint(id, 1)} />
          <IconButton icon={Trash2} title="Delete constraint" small onClick={() => deleteConstraint(id)} />
        </div>
        <TextField value={c.name} onCommit={(n) => renameConstraint(id, n)} wide />
      </div>

      <div className="group">
        <div className="group-title">Bone</div>
        <Row label="Bone" title="The bone that is moved by the simulation">
          <SelectField value={c.bone} options={doc.bones.filter((b) => b.parent !== null || b.id === c.bone).map((b) => ({ value: b.id, label: b.name }))} onChange={(v) => !animate && updatePhysicsConstraint(id, (x) => void (x.bone = v), 'Physics bone')} />
        </Row>
      </div>

      <div className="group">
        <div className="group-title">Affects</div>
        {influence('Move X', 'x', 'How much the bone is pushed along x')}
        {influence('Move Y', 'y', 'How much the bone is pushed along y')}
        {influence('Rotate', 'rotate', 'How much the bone swings around its origin')}
        {influence('Scale X', 'scaleX', 'How much the bone stretches along its length')}
        {influence('Shear X', 'shearX', 'How much the bone shears along x')}
        <Row label="Scale Y" title="How the thickness follows the stretch">
          <SelectField value={c.scaleY} options={(['none', 'uniform', 'volume'] as const).map((m) => ({ value: m, label: SCALE_Y_LABEL[m] }))} onChange={(v) => !animate && updatePhysicsConstraint(id, (x) => void (x.scaleY = v), 'Physics scale Y')} />
        </Row>
      </div>

      <div className="group">
        <div className="group-title">Simulation</div>
        <Row label="Steps / s" title="How many simulation steps run per second (a higher number is smoother and costs more)">
          <NumberField label="" value={c.fps} step={5} precision={0} min={1} disabled={animate} onChange={(v) => updatePhysicsConstraint(id, (x) => void (x.fps = Math.max(1, Math.round(v))), 'Physics steps')} />
        </Row>
        <Row label="Limit" title="Movement beyond this many units per second makes no more effect">
          <NumberField label="px/s" value={c.limit} step={50} precision={0} min={0} disabled={animate} onChange={(v) => updatePhysicsConstraint(id, (x) => void (x.limit = Math.max(0, v)), 'Physics limit')} />
        </Row>
        {PHYSICS_PARAMS.map(paramRow)}
      </div>

      {!animate && (
        <div className="group">
          <div className="group-title" title="Parameters that the animation's global physics timelines drive for every constraint that opts in">
            Global timelines
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: '4px 8px', alignItems: 'center' }}>
            {PHYSICS_PARAMS.map((p) => (
              <span key={p} style={{ display: 'contents' }}>
                <span style={{ color: 'var(--muted)' }}>{PARAMS[p].label}</span>
                <Toggle on={c.global[p]} onChange={(v) => updatePhysicsConstraint(id, (x) => void (x.global[p] = v), `Physics ${p} is ${v ? 'global' : 'its own'}`)} title={c.global[p] ? 'Taken from the global timelines' : 'Its own value'} />
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="group">
        <div className="group-title">Playback</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button ghost icon={RotateCcw} title="Forget what the simulation has learned: it starts again from rest" onClick={() => restartPhysics()}>
            Restart simulation
          </Button>
          {animate && (
            <Button ghost title="A reset key restarts the simulation when the animation reaches it (useful for a jump cut)" onClick={() => (resetKeyed ? deleteKeys([{ kind: 'physics', target: id, prop: 'reset', time }]) : addPhysicsReset(id))}>
              {resetKeyed ? 'Remove the reset key' : 'Key a reset here'}
            </Button>
          )}
        </div>
        <div style={{ color: 'var(--text-dim)', marginTop: 8 }}>The simulation runs while an animation plays. Scrubbing shows the pose without physics.</div>
      </div>
    </>
  );
}
