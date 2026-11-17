import { useMemo, useState } from 'react';
import { DEFAULT_TOLERANCE, DEFAULT_BAKE, countSimplifiable, scaleTolerance } from '@/core/bake';
import type { Animation } from '@/core/model';
import { bakeCurrentAnimation, currentAnimation, simplifyCurrentAnimation } from '@/store/actions';
import { useProject } from '@/store/doc';
import { useUi } from '@/store/ui';
import { Field } from '../ui/Field';
import { Button, NumberField, SelectField, Toggle } from '../ui/controls';

/** Keys in the bone timelines of an animation. */
function boneKeyCount(anim: Animation): number {
  let n = 0;
  for (const id in anim.bones) for (const keys of Object.values(anim.bones[id])) n += keys?.length ?? 0;
  return n;
}

type BakeBones = 'constrained' | 'all' | 'selected';

/**
 * Animation tools: work on the finished motion. Simplify takes out the keys a curve does not need (an animation keyed on every
 * frame, or baked); Bake writes what IK, physics, sliders and the other constraints do into ordinary bone keys.
 */
export function AnimationToolsPanel() {
  const project = useProject();
  const doc = project.skeleton;
  const { animationId, selection, skinId } = useUi((s) => ({ animationId: s.animationId, selection: s.selection, skinId: s.skinId }));
  const anim = doc.animations.find((a) => a.id === animationId) ?? currentAnimation();

  const [strength, setStrength] = useState(1);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [bones, setBones] = useState<BakeBones>('constrained');
  const [step, setStep] = useState(1);
  const [mute, setMute] = useState(DEFAULT_BAKE.mute);
  const [simplify, setSimplify] = useState(true);

  const picked = selectedOnly ? selection.bones : undefined;
  const total = anim ? boneKeyCount(anim) : 0;
  const removable = useMemo(() => (anim ? countSimplifiable(anim, scaleTolerance(DEFAULT_TOLERANCE, strength), doc.fps, picked) : 0), [anim, strength, doc.fps, picked]);
  const hasConstraints = doc.constraints.length > 0;

  return (
    <div className="panel grow" style={{ minHeight: 200 }}>
      <div className="panel-head">
        <span className="title">Animation tools</span>
      </div>
      <div className="panel-body pad">
        {!anim && <p className="hint-text">Select an animation to work on it.</p>}

        <div className="section-label flush">Simplify keys</div>
        <p className="hint-text">Takes out the keys a curve does not need: a straight run of keys becomes two, a smooth swing keeps a few. The motion stays within the tolerance.</p>
        <Field label="Strength" title="1 keeps a quarter of a degree and a quarter of a unit; more takes out more keys">
          <NumberField label="×" value={strength} step={0.25} precision={2} min={0.25} max={8} disabled={!anim} onChange={setStrength} />
        </Field>
        <Field label="Selected only" title="Only the timelines of the bones that are selected">
          <Toggle on={selectedOnly} onChange={setSelectedOnly} title="Selected bones only" />
        </Field>
        <p className="hint-text">{anim ? `${removable} of ${total} keys can go.` : ''}</p>
        <Button small primary disabled={!anim || removable === 0 || (selectedOnly && selection.bones.length === 0)} onClick={() => simplifyCurrentAnimation(strength, selectedOnly)}>
          Simplify
        </Button>

        <div className="section-label">Bake constraints</div>
        <p className="hint-text">{hasConstraints ? 'Writes what the constraints do into plain bone keys, in a new animation. It plays the same without IK, physics or sliders.' : 'This skeleton has no constraints to bake.'}</p>
        <Field label="Bones" title="Which bones get keys">
          <SelectField<BakeBones>
            value={bones}
            options={[
              { value: 'constrained', label: 'Constrained' },
              { value: 'all', label: 'All' },
              { value: 'selected', label: 'Selected' },
            ]}
            onChange={setBones}
          />
        </Field>
        <Field label="Key every" title="A key on every N-th frame; the physics still runs every frame">
          <NumberField label="fr" value={step} step={1} precision={0} min={1} max={12} disabled={!anim} onChange={(v) => setStep(Math.round(v))} />
        </Field>
        <Field label="Constraints off" title="Turn the constraints off in the new animation so they do not act twice">
          <Toggle on={mute} onChange={setMute} title="Constraints off" />
        </Field>
        <Field label="Simplify" title="Take out the keys the curves do not need">
          <Toggle on={simplify} onChange={setSimplify} title="Simplify" />
        </Field>
        <Button
          small
          primary
          disabled={!anim || (bones === 'selected' && selection.bones.length === 0)}
          onClick={() =>
            bakeCurrentAnimation({
              bones: bones === 'selected' ? selection.bones : bones,
              step,
              mute,
              simplify: simplify ? scaleTolerance(DEFAULT_TOLERANCE, 1) : null,
              skinId,
            })
          }
        >
          Bake to a new animation
        </Button>
      </div>
    </div>
  );
}
