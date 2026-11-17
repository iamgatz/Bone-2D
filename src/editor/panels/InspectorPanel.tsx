import { Bone as BoneIcon, BoxSelect, Crosshair, Image as ImageIcon, Layers, Link2, Scissors, Spline, Triangle } from 'lucide-react';
import { useState } from 'react';
import { createTransformConstraint, PRESET_LABEL } from '@/store/transformActions';
import type { TransformPreset } from '@/store/transformActions';
import { INHERIT_MODES } from '@/core/model';
import type { Animation, BlendMode, Id, Inherit, MeshAttachment, PathAttachment, PointAttachment, PolygonAttachment, RGBA, RegionAttachment } from '@/core/model';
import { BLEND_MODES, attachmentImage, pathNodeCount, polygonVertexCount } from '@/core/model';
import { findKeyIndex } from '@/core/curve';
import { deleteKeys, keySelectedBones, removeSkinImage, renameBone, renameSlot, setAnimationDuration, setAttachmentProps, setBonePose, setBoneProps, setFps, setSkinImage, setSlotAttachment, setSlotBone, setSlotColor, setSlotProps, setTool, currentAnimation } from '@/store/actions';
import type { PoseProps } from '@/store/actions';
import { docStore, useProject } from '@/store/doc';
import { bindPathToBones, setPathClosed, unbindPath } from '@/store/pathActions';
import { useUi } from '@/store/ui';
import { getScene } from '../scene';
import { Button, ColorSwatch, IconButton, NumberField, SelectField, TextField, Toggle } from '../ui/controls';
import { Field, KeyButton } from '../ui/Field';
import { Section } from '../ui/Section';
import { ConvertToMeshGroup, MeshGroup } from './MeshInspector';
import { SequenceSection } from './SequenceSection';
import { ConstraintInspector } from './ConstraintInspector';

function hasKeyAt(anim: Animation | undefined, boneId: Id, prop: 'rotate' | 'translate' | 'scale' | 'shear', time: number): boolean {
  const keys = anim?.bones[boneId]?.[prop];
  if (!keys || !keys.length) return false;
  const i = findKeyIndex(keys, time + 1e-4);
  return i >= 0 && Math.abs(keys[i].time - time) < 1e-4;
}

function BoneInspector({ id }: { id: Id }) {
  const project = useProject();
  const selectedIds = useUi((s) => s.selection.bones);
  const mode = useUi((s) => s.mode);
  const time = useUi((s) => s.time);
  useUi((s) => s.overrides);
  const doc = project.skeleton;
  const bone = doc.bones.find((b) => b.id === id);
  const anim = currentAnimation();
  if (!bone) return null;
  const animate = mode === 'animate';
  const sb = getScene().skeleton.boneById(id);
  const pose: Required<PoseProps> = animate && sb ? { x: sb.x, y: sb.y, rotation: sb.rotation, scaleX: sb.scaleX, scaleY: sb.scaleY, shearX: sb.shearX, shearY: sb.shearY } : { x: bone.x, y: bone.y, rotation: bone.rotation, scaleX: bone.scaleX, scaleY: bone.scaleY, shearX: bone.shearX, shearY: bone.shearY };
  const set = (props: PoseProps) => setBonePose([{ id, props }], 'Edit bone');
  const keyed = (p: 'rotate' | 'translate' | 'scale' | 'shear') => animate && hasKeyAt(anim, id, p, time);
  const keyButton = (p: 'rotate' | 'translate' | 'scale' | 'shear', label: string) => (
    <KeyButton on={keyed(p)} title={`${keyed(p) ? 'Remove' : 'Set'} ${label} key at the playhead`} onClick={() => (keyed(p) ? deleteKeys([{ kind: 'bone', target: id, prop: p, time }]) : keySelectedBones([p]))} />
  );

  return (
    <>
      <Section id="bone.name" title="Bone" icon={BoneIcon} collapsible={false} actions={animate && <span className="chip animate">animating</span>}>
        <TextField value={bone.name} onCommit={(v) => renameBone(id, v)} wide />
      </Section>
      <Section
        id="bone.transform"
        title="Transform"
        actions={
          animate && (
            <Button ghost small title="Key all transform channels" onClick={() => keySelectedBones()}>
              Key all
            </Button>
          )
        }
      >
        <Field label="Rotation" keyButton={keyButton('rotate', 'rotation')}>
          <NumberField label="°" value={pose.rotation} step={1} keyed={keyed('rotate')} onChange={(v) => set({ rotation: v })} />
        </Field>
        <Field label="Position" keyButton={keyButton('translate', 'translate')}>
          <NumberField label="X" value={pose.x} step={1} keyed={keyed('translate')} onChange={(v) => set({ x: v })} />
          <NumberField label="Y" value={pose.y} step={1} keyed={keyed('translate')} onChange={(v) => set({ y: v })} />
        </Field>
        <Field label="Scale" keyButton={keyButton('scale', 'scale')}>
          <NumberField label="X" value={pose.scaleX} step={0.01} precision={3} keyed={keyed('scale')} onChange={(v) => set({ scaleX: v })} />
          <NumberField label="Y" value={pose.scaleY} step={0.01} precision={3} keyed={keyed('scale')} onChange={(v) => set({ scaleY: v })} />
        </Field>
        <Field label="Shear" keyButton={keyButton('shear', 'shear')}>
          <NumberField label="X" value={pose.shearX} step={1} keyed={keyed('shear')} onChange={(v) => set({ shearX: v })} />
          <NumberField label="Y" value={pose.shearY} step={1} keyed={keyed('shear')} onChange={(v) => set({ shearY: v })} />
        </Field>
      </Section>
      <Section id="bone.setup" title="Bone setup">
        <Field label="Length">
          <NumberField label="L" value={bone.length} step={1} disabled={animate} onChange={(v) => setBoneProps(id, { length: Math.max(0, v) })} />
        </Field>
        <Field label="Inherit">
          <SelectField value={bone.inherit} options={INHERIT_MODES.map((m) => ({ value: m, label: m.replace(/([A-Z])/g, ' $1').toLowerCase() }))} onChange={(v: Inherit) => setBoneProps(id, { inherit: v })} />
        </Field>
        <Field label="Color">
          <div className="hstack">
            <ColorSwatch value={bone.color} onChange={(rgb) => setBoneProps(id, { color: [rgb[0], rgb[1], rgb[2], 1] }, 'Bone color')} />
            <span className="hint-text">editor only</span>
          </div>
        </Field>
      </Section>
      {!animate && <TransformCreate boneIds={selectedIds} />}
    </>
  );
}

function TransformCreate({ boneIds }: { boneIds: Id[] }) {
  const project = useProject();
  const [source, setSource] = useState<Id>('');
  const [preset, setPreset] = useState<TransformPreset>('rotation');
  const bones = project.skeleton.bones.filter((b) => !boneIds.includes(b.id));
  const src = bones.some((b) => b.id === source) ? source : (bones[0]?.id ?? '');
  return (
    <Section id="bone.constraint" title="Transform constraint" icon={Link2} kind="transform">
      <p className="hint-text mb">{`Make ${boneIds.length > 1 ? 'these bones' : 'this bone'} follow another bone's rotation, position or scale (Spine 4.3 mappings).`}</p>
      <Field label="Follow">
        <SelectField value={src} options={bones.map((b) => ({ value: b.id, label: b.name }))} onChange={setSource} />
      </Field>
      <Field label="Preset">
        <SelectField value={preset} options={(Object.keys(PRESET_LABEL) as TransformPreset[]).map((p) => ({ value: p, label: PRESET_LABEL[p] }))} onChange={setPreset} />
      </Field>
      <Button icon={Link2} onClick={() => createTransformConstraint(boneIds, src, preset)} disabled={!src}>
        Create constraint
      </Button>
    </Section>
  );
}

function SlotInspector({ slotId, attachmentName }: { slotId: Id; attachmentName: string | null }) {
  const project = useProject();
  const mode = useUi((s) => s.mode);
  const skinId = useUi((s) => s.skinId); // every hook goes above the early return: undo can remove the selected slot between two renders
  useUi((s) => (s.mode === 'animate' ? s.time : 0)); // the animated tint follows the playhead
  const doc = project.skeleton;
  const slot = doc.slots.find((s) => s.id === slotId);
  if (!slot) return null;
  const atts = doc.skins[0]?.attachments[slotId] ?? {};
  const att = attachmentName ? atts[attachmentName] : undefined;
  const animate = mode === 'animate';
  const sk = getScene().skeleton.slotById(slotId);
  const color = animate && sk ? sk.color : slot.color;
  const dark = animate && sk?.dark ? sk.dark : slot.dark; // the animated dark color in Animate mode
  const darkNow = animate && dark ? dark : undefined; // keyed together with the light color
  const current = animate && sk ? sk.attachmentName : slot.attachment;
  const attOptions = [{ value: '', label: '— none —' }, ...Object.keys(atts).map((n) => ({ value: n, label: n }))];
  const activeSkin = skinId && skinId !== doc.skins[0]?.id ? doc.skins.find((s) => s.id === skinId) : undefined;

  return (
    <>
      <Section id="slot.name" title="Slot" icon={Layers} collapsible={false}>
        <TextField value={slot.name} onCommit={(v) => renameSlot(slotId, v)} wide />
      </Section>
      <div className="group">
        <Field label="Bone">
          <SelectField value={slot.bone} options={doc.bones.map((b) => ({ value: b.id, label: b.name }))} onChange={(v) => setSlotBone(slotId, v)} />
        </Field>
        <Field label={att && attachmentImage(att) === null ? 'Shape' : 'Image'} keyButton={<KeyButton on={false} title="Key attachment" onClick={() => setSlotAttachment(slotId, current)} />}>
          <SelectField value={current ?? ''} options={attOptions} onChange={(v) => setSlotAttachment(slotId, v || null)} />
        </Field>
        {activeSkin && att && attachmentImage(att) !== null && (
          <Field label="In skin">
            <SelectField
              value={(activeSkin.attachments[slotId]?.[att.name] && attachmentImage(activeSkin.attachments[slotId][att.name])) || ''}
              options={[{ value: '', label: `default (${attachmentImage(att)})` }, ...project.images.map((i) => ({ value: i.name, label: i.name }))]}
              onChange={(v) => (v ? setSkinImage(activeSkin.id, slotId, att.name, v) : removeSkinImage(activeSkin.id, slotId, att.name))}
            />
          </Field>
        )}
        <Field label="Blend">
          <SelectField value={slot.blend} options={BLEND_MODES.map((b) => ({ value: b, label: b }))} onChange={(v: BlendMode) => setSlotProps(slotId, { blend: v }, 'Blend mode')} />
        </Field>
        <Field label="Tint" keyButton={<KeyButton on={false} title="Key color" onClick={() => setSlotColor(slotId, [color[0], color[1], color[2], color[3]], darkNow)} />}>
          <div className="hstack">
            <ColorSwatch value={color} onChange={(rgb) => setSlotColor(slotId, [rgb[0], rgb[1], rgb[2], color[3]], darkNow)} />
            <NumberField label="A" value={color[3]} step={0.01} precision={2} min={0} max={1} onChange={(v) => setSlotColor(slotId, [color[0], color[1], color[2], v], darkNow)} />
          </div>
        </Field>
        {(!animate || dark) && (
          <Field label="Dark tint">
            <div className="hstack">
              {!animate && <Toggle on={!!slot.dark} onChange={(on) => setSlotProps(slotId, { dark: on ? [0, 0, 0] : null }, 'Dark tint')} title="Two-color tint: a dark color that fills in where the image is dark (glow, hit flash)" />}
              {dark && (
                <ColorSwatch
                  value={dark}
                  title="Dark color"
                  onChange={(rgb) => (animate ? setSlotColor(slotId, [color[0], color[1], color[2], color[3]], rgb) : setSlotProps(slotId, { dark: rgb }, 'Dark color'))}
                />
              )}
            </div>
          </Field>
        )}
      </div>
      {att && att.type === 'region' && <RegionInspector slotId={slotId} att={att} disabled={animate} />}
      {att && att.type === 'region' && !animate && <ConvertToMeshGroup slotId={slotId} name={att.name} />}
      {att && att.type === 'mesh' && <MeshGroup slotId={slotId} att={att} />}
      {att && (att.type === 'region' || att.type === 'mesh') && <SequenceSection slotId={slotId} att={att} />}
      {att && (att.type === 'clipping' || att.type === 'boundingbox') && <PolygonInspector slotId={slotId} att={att} disabled={animate} />}
      {att && att.type === 'path' && <PathAttachmentInspector slotId={slotId} att={att} disabled={animate} />}
      {att && att.type === 'point' && <PointInspector slotId={slotId} att={att} disabled={animate} />}
    </>
  );
}

function ColorRow({ label, color, disabled, onChange }: { label: string; color: RGBA; disabled?: boolean; onChange: (c: RGBA) => void }) {
  return (
    <Field label={label}>
      <div className="hstack">
        <ColorSwatch value={color} onChange={(rgb) => onChange([rgb[0], rgb[1], rgb[2], color[3]])} />
        <NumberField label="A" value={color[3]} step={0.01} precision={2} min={0} max={1} disabled={disabled} onChange={(v) => onChange([color[0], color[1], color[2], v])} />
      </div>
    </Field>
  );
}

/** Clipping polygons and bounding boxes: they are data for the runtime (a mask / a hit area), not images. */
function PolygonInspector({ slotId, att, disabled }: { slotId: Id; att: PolygonAttachment; disabled: boolean }) {
  const project = useProject();
  const tool = useUi((s) => s.tool);
  const doc = project.skeleton;
  const set = (patch: Record<string, unknown>, label: string) => setAttachmentProps(slotId, att.name, patch, label);
  const clip = att.type === 'clipping' ? att : null;
  const slotOptions = [{ value: '', label: '— to the end of the draw order —' }, ...doc.slots.map((s) => ({ value: s.id, label: s.name }))];
  const index = doc.slots.findIndex((s) => s.id === slotId);
  const endIndex = clip?.end ? doc.slots.findIndex((s) => s.id === clip.end) : -1;
  const clipHint = clip ? `Clips the slots below this one in the list${clip.end ? (endIndex >= 0 && endIndex <= index ? ' — the end slot is above this slot, so it has no effect' : '') : ' up to the end of the draw order'}.` : '';
  return (
    <Section id={clip ? 'slot.clipping' : 'slot.boundingbox'} title={clip ? 'Clipping' : 'Bounding box'} icon={clip ? Scissors : BoxSelect}>
      <div className="hstack wrap mb">
        <span className="chip">{`${polygonVertexCount(att)} vertices`}</span>
        {att.weights && <span className="chip accent">weighted</span>}
      </div>
      {clip && (
        <>
          <Field label="End slot">
            <SelectField value={clip.end ?? ''} options={slotOptions} onChange={(v) => !disabled && set({ end: v || null }, 'Clipping end slot')} />
          </Field>
          <Field label="Convex">
            <Toggle on={clip.convex} onChange={(v) => !disabled && set({ convex: v }, 'Clipping convex')} title="Treat the polygon as convex (its convex hull is used when it is not)" />
          </Field>
          <Field label="Inverse">
            <Toggle on={clip.inverse} onChange={(v) => !disabled && set({ inverse: v }, 'Clipping inverse')} title="Show everything outside the polygon instead of the inside" />
          </Field>
          <p className="hint-text mb">{clipHint}</p>
        </>
      )}
      <ColorRow label="Color" color={att.color} disabled={disabled} onChange={(c) => set({ color: c }, 'Attachment color')} />
      {!disabled && (
        <Button primary={tool === 'mesh'} icon={Triangle} onClick={() => setTool('mesh')} title="Edit vertices (M)">
          Edit vertices
        </Button>
      )}
      <p className="hint-text mt">Drag vertices · Ctrl-click or double-click an edge adds one · Del removes the selected vertices.</p>
    </Section>
  );
}

/** A Bezier path: bones follow it through a path constraint (Constraints list in the tree). */
function PathAttachmentInspector({ slotId, att, disabled }: { slotId: Id; att: PathAttachment; disabled: boolean }) {
  const tool = useUi((s) => s.tool);
  const selectedBones = useUi((s) => s.selection.bones);
  const set = (patch: Record<string, unknown>, label: string) => setAttachmentProps(slotId, att.name, patch, label);
  return (
    <Section id="slot.path" title="Path" icon={Spline} kind="path">
      <div className="hstack wrap mb">
        <span className="chip">{`${pathNodeCount(att)} nodes`}</span>
        <span className="chip">{att.closed ? 'closed' : 'open'}</span>
        {att.weights && <span className="chip accent">weighted</span>}
      </div>
      <Field label="Closed">
        <Toggle on={att.closed} onChange={(v) => !disabled && setPathClosed(slotId, att.name, v)} title="Join the last node to the first one" />
      </Field>
      <Field label="Constant speed">
        <Toggle on={att.constantSpeed} onChange={(v) => !disabled && set({ constantSpeed: v }, 'Path constant speed')} title="Measure the curves every frame so bones move at a constant speed; otherwise the lengths of the setup pose are used (cheaper)" />
      </Field>
      <ColorRow label="Color" color={att.color} disabled={disabled} onChange={(c) => set({ color: c }, 'Attachment color')} />
      <Button primary={tool === 'mesh'} icon={Triangle} onClick={() => setTool('mesh')} title="Edit nodes (M)">
        Edit nodes
      </Button>
      {!disabled && (
        <div className="hstack mt">
          <Button ghost disabled={!selectedBones.length} onClick={() => bindPathToBones(slotId, att.name, selectedBones)} title="Let the selected bones move the path (automatic weights)">
            Bind to the selected bones
          </Button>
          {att.weights && (
            <Button ghost onClick={() => unbindPath(slotId, att.name)} title="Back to a plain path: the points stay where they are">
              Unbind
            </Button>
          )}
        </div>
      )}
      <p className="hint-text mt">Drag nodes and handles · Alt-drag a handle mirrors the other one · Ctrl-click or double-click the curve adds a node · Del removes the selected nodes · in Animate mode dragging keys a deform.</p>
    </Section>
  );
}

function PointInspector({ slotId, att, disabled }: { slotId: Id; att: PointAttachment; disabled: boolean }) {
  const set = (patch: Partial<PointAttachment>) => setAttachmentProps(slotId, att.name, patch);
  return (
    <Section id="slot.point" title="Point" icon={Crosshair}>
      <Field label="Position">
        <NumberField label="X" value={att.x} disabled={disabled} onChange={(v) => set({ x: v })} />
        <NumberField label="Y" value={att.y} disabled={disabled} onChange={(v) => set({ y: v })} />
      </Field>
      <Field label="Rotation">
        <NumberField label="°" value={att.rotation} disabled={disabled} onChange={(v) => set({ rotation: v })} />
      </Field>
      <ColorRow label="Color" color={att.color} disabled={disabled} onChange={(c) => set({ color: c })} />
    </Section>
  );
}

function RegionInspector({ slotId, att, disabled }: { slotId: Id; att: RegionAttachment; disabled: boolean }) {
  const set = (patch: Partial<RegionAttachment>) => setAttachmentProps(slotId, att.name, patch);
  return (
    <Section id="slot.region" title={`Region · ${att.path}`} icon={ImageIcon}>
      <Field label="Position">
        <NumberField label="X" value={att.x} disabled={disabled} onChange={(v) => set({ x: v })} />
        <NumberField label="Y" value={att.y} disabled={disabled} onChange={(v) => set({ y: v })} />
      </Field>
      <Field label="Rotation">
        <NumberField label="°" value={att.rotation} disabled={disabled} onChange={(v) => set({ rotation: v })} />
      </Field>
      <Field label="Scale">
        <NumberField label="X" value={att.scaleX} step={0.01} precision={3} disabled={disabled} onChange={(v) => set({ scaleX: v })} />
        <NumberField label="Y" value={att.scaleY} step={0.01} precision={3} disabled={disabled} onChange={(v) => set({ scaleY: v })} />
      </Field>
      <Field label="Size">
        <NumberField label="W" value={att.width} disabled={disabled} onChange={(v) => set({ width: Math.max(1, v) })} />
        <NumberField label="H" value={att.height} disabled={disabled} onChange={(v) => set({ height: Math.max(1, v) })} />
      </Field>
      <Field label="Color">
        <div className="hstack">
          <ColorSwatch value={att.color} onChange={(rgb) => set({ color: [rgb[0], rgb[1], rgb[2], att.color[3]] })} />
          <NumberField label="A" value={att.color[3]} step={0.01} min={0} max={1} onChange={(v) => set({ color: [att.color[0], att.color[1], att.color[2], v] })} />
        </div>
      </Field>
    </Section>
  );
}

export function InspectorPanel() {
  const selection = useUi((s) => s.selection);
  const project = useProject();
  const mode = useUi((s) => s.mode);
  const doc = project.skeleton;
  const anim = currentAnimation();
  const showBone = selection.bones.length > 0 && !(selection.slot && selection.attachment) && !selection.constraint;

  return (
    <div className="panel grow">
      <div className="panel-head">
        <span className="title">Inspector</span>
        {selection.bones.length > 1 && <span className="chip">{selection.bones.length} bones</span>}
      </div>
      <div className="panel-body">
        {selection.constraint && <ConstraintInspector id={selection.constraint} />}
        {showBone && <BoneInspector id={selection.bones[0]} />}
        {selection.slot && <SlotInspector slotId={selection.slot} attachmentName={selection.attachment} />}
        {!showBone && !selection.slot && !selection.constraint && (
          <>
            <Section id="skeleton" title="Skeleton" collapsible={false}>
              <div className="mb">
                <TextField value={doc.name} onCommit={(v) => docStore.update('Rename skeleton', (d) => void (d.skeleton.name = v.trim() || d.skeleton.name))} wide />
              </div>
              <Field label="FPS">
                <NumberField label="fps" value={doc.fps} step={1} precision={0} min={1} max={240} onChange={(v) => setFps(v)} />
              </Field>
            </Section>
            {mode === 'animate' && anim && (
              <Section id="skeleton.animation" title={`Animation · ${anim.name}`}>
                <Field label="Length">
                  <NumberField label="s" value={anim.duration} step={0.05} precision={3} min={0.05} onChange={(v) => setAnimationDuration(anim.id, v)} />
                </Field>
              </Section>
            )}
            <div className="empty">
              Select a bone or an image in the viewport
              <br />
              to edit its properties.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { IconButton, Toggle };
