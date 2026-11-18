import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DEFAULT_TOLERANCE, DEFAULT_BAKE, countSimplifiable, scaleTolerance } from '@/core/bake';
import { DEFAULT_SLIDE, footSlides } from '@/core/animtools';
import type { Slide, SlideOptions } from '@/core/animtools';
import { markersOf } from '@/core/markers';
import { hideUnkeyedBones, mirrorCurrentCycle, tweenSelected, wiggleSelected } from '@/store/animToolActions';
import { docStore } from '@/store/doc';
import type { Animation } from '@/core/model';
import { bakeCurrentAnimation, closeCurrentLoop, currentAnimation, setTime, simplifyCurrentAnimation } from '@/store/actions';
import { useProject } from '@/store/doc';
import { addMarkerAtPlayhead, deleteMarker, openMarkerDialog, splitAtMarkersAction } from '@/store/markerActions';
import { uiStore, useUi } from '@/store/ui';
import { Field } from '../ui/Field';
import { MARKER_TOKENS } from '../ui/tokens';
import { Button, IconButton, NumberField, SelectField, Toggle } from '../ui/controls';

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
  const { animationId, selection, skinId, mode, reference } = useUi((s) => ({ animationId: s.animationId, selection: s.selection, skinId: s.skinId, mode: s.mode, reference: s.reference }));
  const anim = doc.animations.find((a) => a.id === animationId) ?? currentAnimation();

  const [strength, setStrength] = useState(1);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [bones, setBones] = useState<BakeBones>('constrained');
  const [step, setStep] = useState(1);
  const [mute, setMute] = useState(DEFAULT_BAKE.mute);
  const [simplify, setSimplify] = useState(true);
  const [loopKeep, setLoopKeep] = useState<'first' | 'last'>('first');
  const [loopSelected, setLoopSelected] = useState(false);

  const [wiggle, setWiggle] = useState({ amount: 3, every: 4, seed: 1, smooth: true, keepEnds: true });
  const [flipCentre, setFlipCentre] = useState(true);
  const [tween, setTween] = useState(50);
  const [slide, setSlide] = useState<SlideOptions>(DEFAULT_SLIDE);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const markers = markersOf(anim);
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

        <div className="section-label flush">Reference</div>
        <p className="hint-text">Draws another animation, or the setup pose, faded green under the pose you edit, at the same time, to compare with. Nothing is saved or exported.</p>
        <SelectField
          value={reference === 'setup' || doc.animations.some((a) => a.id === reference && a.id !== anim?.id) ? reference! : ''}
          options={[
            { value: '', label: 'None' },
            { value: 'setup', label: 'Setup pose' },
            ...doc.animations.filter((a) => a.id !== anim?.id).map((a) => ({ value: a.id, label: a.name })),
          ]}
          onChange={(v) => uiStore.patch({ reference: v || null })}
          wide
        />

        <div className="section-label">Markers</div>
        <p className="hint-text">Flags on the timeline for a beat, a sound cue or a note. Double-click one on the ruler to edit it. Cut the animation into clips at the markers.</p>
        {markers.map((m) => (
          <div key={m.id} className="marker-row">
            <span className="dot" style={{ background: `var(${MARKER_TOKENS[m.color]})` }} />
            <button type="button" className="btn ghost sm grow" data-tip={m.text || undefined} onClick={() => setTime(m.time)}>
              {`${m.name || 'marker'} · ${Math.round(m.time * doc.fps)}`}
            </button>
            <IconButton icon={Pencil} title="Edit marker" small onClick={() => openMarkerDialog(m.id)} />
            <IconButton icon={Trash2} title="Delete marker" small onClick={() => deleteMarker(m.id)} />
          </div>
        ))}
        <div className="hstack wrap">
          <Button small primary disabled={!anim} onClick={() => addMarkerAtPlayhead()}>
            Add marker at playhead
          </Button>
          <Button small disabled={!anim || markers.filter((m) => m.time > 0 && m.time < (anim?.duration ?? 0)).length === 0} onClick={() => splitAtMarkersAction()}>
            Split at markers
          </Button>
        </div>

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

        <div className="section-label">Tween</div>
        <p className="hint-text">Puts the selected bones between the keys before and after the playhead and keys them there: 0% is the previous key, 100% the next, below 0 or above 100 overshoots. Drag the slider; it is one undo step.</p>
        <div className="hstack">
          <input
            type="range"
            className="tween-slider"
            min={-25}
            max={125}
            step={1}
            value={tween}
            disabled={!anim || mode !== 'animate' || selection.bones.length === 0}
            aria-label="Tween"
            onPointerDown={() => docStore.beginGesture('Tween')}
            onChange={(e) => {
              setTween(Number(e.target.value));
              tweenSelected(Number(e.target.value) / 100);
            }}
            onPointerUp={() => docStore.endGesture()}
            onPointerCancel={() => docStore.endGesture()}
          />
          <span className="dim" style={{ minWidth: 40, textAlign: 'right' }}>{`${tween}%`}</span>
        </div>
        <div className="hstack wrap">
          {[0, 25, 50, 75, 100].map((p) => (
            <Button
              key={p}
              small
              disabled={!anim || mode !== 'animate' || selection.bones.length === 0}
              onClick={() => {
                setTween(p);
                tweenSelected(p / 100);
              }}
            >
              {`${p}%`}
            </Button>
          ))}
        </div>

        <div className="section-label">Wiggle</div>
        <p className="hint-text">Shakes the selected keys' timelines with random noise: a key every few frames, each moved a little from the curve. Select keys in the timeline first (click a row's name to take all its keys).</p>
        <Field label="Amount" title="How far a value strays, in its own unit: degrees for rotation, units for position, a factor for scale">
          <NumberField label="±" value={wiggle.amount} step={0.5} precision={2} min={0} disabled={!anim} onChange={(v) => setWiggle({ ...wiggle, amount: v })} />
        </Field>
        <Field label="Every" title="A key every N frames">
          <NumberField label="fr" value={wiggle.every} step={1} precision={0} min={1} max={60} disabled={!anim} onChange={(v) => setWiggle({ ...wiggle, every: Math.round(v) })} />
        </Field>
        <Field label="Seed" title="The same seed gives the same shake; change it for another one">
          <NumberField label="#" value={wiggle.seed} step={1} precision={0} min={0} disabled={!anim} onChange={(v) => setWiggle({ ...wiggle, seed: Math.round(v) })} />
        </Field>
        <Field label="Smooth" title="Ease between the keys instead of straight lines">
          <Toggle on={wiggle.smooth} onChange={(v) => setWiggle({ ...wiggle, smooth: v })} title="Smooth" />
        </Field>
        <Field label="Keep the ends" title="The first and last key keep their value, so a loop still closes">
          <Toggle on={wiggle.keepEnds} onChange={(v) => setWiggle({ ...wiggle, keepEnds: v })} title="Keep the ends" />
        </Field>
        <Button small primary disabled={!anim || wiggle.amount <= 0} onClick={() => wiggleSelected(wiggle)}>
          Wiggle the selected keys
        </Button>

        <div className="section-label">Mirror a half cycle</div>
        <p className="hint-text">Animate one step, then make the whole cycle: the second half is the first with the two sides swapped (arm near ⇄ arm far, Leg_L ⇄ Leg_R). The result is a new animation twice as long.</p>
        <Field label="Turn the centre" title="Bones without a side repeat their motion with the rotation turned the other way, like a hip twist on the next step">
          <Toggle on={flipCentre} onChange={setFlipCentre} title="Turn the centre" />
        </Field>
        <Button small primary disabled={!anim} onClick={() => mirrorCurrentCycle({ flipCentre })}>
          Make the full cycle
        </Button>

        <div className="section-label">Foot slide</div>
        <p className="hint-text">Finds where a planted foot drags along the ground. Select the foot bones (or IK targets), then check. A foot is planted while it is near its lowest point.</p>
        <Field label="Body speed" title="How fast the character travels, in units a second. 0 when the movement is in the root bone; for a walk in place a planted foot should move back by this much">
          <NumberField label="u/s" value={slide.bodySpeed} step={5} precision={1} disabled={!anim} onChange={(v) => setSlide({ ...slide, bodySpeed: v })} />
        </Field>
        <Field label="Ground" title="A foot counts as planted within this many units of its lowest point">
          <NumberField label="u" value={slide.ground} step={0.5} precision={1} min={0} disabled={!anim} onChange={(v) => setSlide({ ...slide, ground: v })} />
        </Field>
        <Field label="Allowed" title="How many units a second a planted foot may drag before it counts as sliding">
          <NumberField label="u/s" value={slide.tolerance} step={1} precision={1} min={0} disabled={!anim} onChange={(v) => setSlide({ ...slide, tolerance: v })} />
        </Field>
        <Button small primary disabled={!anim || selection.bones.length === 0} onClick={() => setSlides(anim ? footSlides(doc, anim, selection.bones, slide) : [])}>
          Check the selected bones
        </Button>
        {slides && (slides.length ? slides.map((s, i) => (
          <div key={i} className="marker-row">
            <button type="button" className="btn ghost sm grow" onClick={() => setTime(s.from / doc.fps)}>
              {`${doc.bones.find((b) => b.id === s.bone)?.name ?? '?'} · ${s.from}–${s.to} · ${Math.round(s.worst)} u/s`}
            </button>
          </div>
        )) : <p className="hint-text">No sliding found.</p>)}

        <div className="section-label">Bones with keys</div>
        <p className="hint-text">Hides the bones this animation does not touch, so a big rig shows only what moves. Show all (Windows menu or the palette) brings them back.</p>
        <Button small disabled={!anim} onClick={() => hideUnkeyedBones()}>
          Hide bones without keys
        </Button>

        <div className="section-label">Close the loop</div>
        <p className="hint-text">Makes the end of the animation the same as its start, so a cycle repeats without a jump. A timeline that ends before the end of the animation gets a key there.</p>
        <Field label="Which end wins" title="Which end wins: the value of the first key goes to the last key, or the other way round">
          <SelectField<'first' | 'last'> value={loopKeep} options={[{ value: 'first', label: 'The start' }, { value: 'last', label: 'The end' }]} onChange={setLoopKeep} />
        </Field>
        <Field label="Selected only" title="Only the timelines of the bones that are selected">
          <Toggle on={loopSelected} onChange={setLoopSelected} title="Selected bones only" />
        </Field>
        <Button small primary disabled={!anim || (loopSelected && selection.bones.length === 0)} onClick={() => closeCurrentLoop(loopKeep, loopSelected)}>
          Close the loop
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
