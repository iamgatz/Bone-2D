import { ArrowDown, ArrowUp, SlidersHorizontal, Trash2 } from 'lucide-react';
import { findKeyIndex } from '@/core/curve';
import { TRANSFORM_PROPS } from '@/core/model';
import type { Id } from '@/core/model';
import { currentAnimation, deleteKeys } from '@/store/actions';
import { useProject } from '@/store/doc';
import { deleteConstraint, moveConstraint, renameConstraint } from '@/store/ikActions';
import { currentSliderValues, setSliderValues, updateSlider } from '@/store/sliderActions';
import { useUi } from '@/store/ui';
import { Button, IconButton, NumberField, SelectField, TextField, Toggle } from '../ui/controls';

function Row(props: { label: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '62px 1fr 24px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
      <span style={{ color: 'var(--muted)' }}>{props.label}</span>
      <div>{props.children}</div>
      <span>{props.right}</span>
    </div>
  );
}

const PROPERTY_LABEL: Record<string, string> = { rotate: 'Rotation', x: 'X', y: 'Y', scaleX: 'Scale X', scaleY: 'Scale Y', shearY: 'Shear Y' };

/** Spine 4.3 slider: applies an animation at a hand-set (keyable) time, or at a time driven by a bone property. */
export function SliderInspector({ id }: { id: Id }) {
  const project = useProject();
  const mode = useUi((s) => s.mode);
  const time = useUi((s) => s.time);
  useUi((s) => s.overrides);
  const doc = project.skeleton;
  const c = doc.constraints.find((x) => x.id === id);
  if (!c || c.type !== 'slider') return null;
  const animate = mode === 'animate';
  const anim = currentAnimation();
  const keyedAt = (prop: 'time' | 'mix') => {
    const keys = anim?.slider[id]?.[prop];
    if (!keys?.length) return false;
    const i = findKeyIndex(keys, time + 1e-4);
    return i >= 0 && Math.abs(keys[i].time - time) < 1e-4;
  };
  const v = (animate ? currentSliderValues(id) : null) ?? { time: c.time, mix: c.mix };
  const index = doc.constraints.findIndex((x) => x.id === id);
  const applied = c.animation ? doc.animations.find((a) => a.id === c.animation) : undefined;
  const keyButton = (prop: 'time' | 'mix') =>
    animate ? (
      <button
        className={`key-btn${keyedAt(prop) ? ' on' : ''}`}
        title={keyedAt(prop) ? `Remove the ${prop} key at the playhead` : `Key the ${prop} at the playhead`}
        onClick={() => (keyedAt(prop) ? deleteKeys([{ kind: 'slider', target: id, prop, time }]) : setSliderValues(id, { [prop]: v[prop] }))}
      >
        ◆
      </button>
    ) : null;

  return (
    <>
      <div className="group">
        <div className="group-title">
          <SlidersHorizontal size={14} />
          <span>Slider</span>
          <span className="spacer" />
          <IconButton icon={ArrowUp} title="Apply earlier" small disabled={index <= 0} onClick={() => moveConstraint(id, -1)} />
          <IconButton icon={ArrowDown} title="Apply later" small disabled={index >= doc.constraints.length - 1} onClick={() => moveConstraint(id, 1)} />
          <IconButton icon={Trash2} title="Delete slider" small onClick={() => deleteConstraint(id)} />
        </div>
        <TextField value={c.name} onCommit={(n) => renameConstraint(id, n)} wide />
      </div>

      <div className="group">
        <div className="group-title">
          <span>Animation</span>
        </div>
        <Row label="Applies">
          <SelectField value={c.animation ?? ''} options={[{ value: '', label: '— choose —' }, ...doc.animations.map((a) => ({ value: a.id, label: a.name }))]} onChange={(a) => updateSlider(id, { animation: a || null })} />
        </Row>
        {!applied && <div style={{ color: 'var(--muted)', marginBottom: 6 }}>Without an animation the slider does nothing and is left out of the export.</div>}
        <Row label="Mix" right={keyButton('mix')}>
          <NumberField label="%" value={v.mix * 100} step={1} precision={0} min={0} keyed={animate && keyedAt('mix')} onChange={(x) => setSliderValues(id, { mix: Math.max(0, x) / 100 })} />
        </Row>
        <div className="row-between">
          <label title="Add the animation's values to the current pose instead of replacing them">Additive</label>
          <Toggle on={c.additive} onChange={(x) => updateSlider(id, { additive: x })} />
        </div>
        <div className="row-between">
          <label title="Wrap the time around the animation's length instead of clamping it">Loop</label>
          <Toggle on={c.loop} onChange={(x) => updateSlider(id, { loop: x })} />
        </div>
      </div>

      <div className="group">
        <div className="group-title">
          <span>Time</span>
        </div>
        <Row label="Driver">
          <SelectField value={c.bone ?? ''} options={[{ value: '', label: '— manual time —' }, ...doc.bones.map((b) => ({ value: b.id, label: b.name }))]} onChange={(b) => updateSlider(id, { bone: b || null })} />
        </Row>
        {c.bone ? (
          <>
            <Row label="Property">
              <SelectField value={c.property} options={TRANSFORM_PROPS.map((p) => ({ value: p, label: PROPERTY_LABEL[p] ?? p }))} onChange={(p) => updateSlider(id, { property: p })} />
            </Row>
            <Row label="From">
              <NumberField label={c.property === 'rotate' || c.property === 'shearY' ? '°' : ''} value={c.from} step={1} precision={2} onChange={(x) => updateSlider(id, { from: x })} />
            </Row>
            <Row label="To">
              <NumberField label="s" value={c.to} step={0.05} precision={3} onChange={(x) => updateSlider(id, { to: x })} />
            </Row>
            <Row label="Scale">
              <NumberField label="s/unit" value={c.scale} step={0.001} precision={4} onChange={(x) => updateSlider(id, { scale: x })} />
            </Row>
            <div className="row-between">
              <label title="Read the bone's local transform instead of its world transform">Local</label>
              <Toggle on={c.local} onChange={(x) => updateSlider(id, { local: x })} />
            </div>
            <div style={{ color: 'var(--muted)' }}>time = to + (value − from) × scale</div>
          </>
        ) : (
          <Row label="Time" right={keyButton('time')}>
            <NumberField label="s" value={v.time} step={0.05} precision={3} min={0} keyed={animate && keyedAt('time')} onChange={(x) => setSliderValues(id, { time: Math.max(0, x) })} />
          </Row>
        )}
        {applied && <div style={{ color: 'var(--muted)', marginTop: 4 }}>"{applied.name}" is {applied.duration.toFixed(2)} s long</div>}
      </div>

      <div className="group">
        <Button danger icon={Trash2} onClick={() => deleteConstraint(id)}>
          Delete slider
        </Button>
      </div>
    </>
  );
}
