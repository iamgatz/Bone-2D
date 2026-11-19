/** Every user-level operation on the document / UI. Components and tools call these; they never mutate state directly. */
import { current } from 'immer';
import type { Draft } from 'immer';
import { animationEndTime } from '@/core/animate';
import { DEFAULT_TOLERANCE, bakeAnimation, bakeSkips, scaleTolerance, simplifyAnimation } from '@/core/bake';
import { compensateEdit } from '@/core/compensate';
import { applyCrossfade, fadeRefusal } from '@/core/crossfade';
import type { Crossfade } from '@/core/crossfade';
import { layerBones, stackLayer } from '@/core/layers';
import type { LayerOptions } from '@/core/layers';
import type { BakeOptions } from '@/core/bake';
import { cleanUpAnimation } from '@/core/cleanup';
import { closeLoop } from '@/core/loops';
import { folderOrderAfterMove } from '@/core/folders';
import { linkedTo, makeLink } from '@/core/links';
import { KEY_EPS, findAnimation, freshName, sameKeyValue, makeCurve, normalizeBoneOrder, pruneSequences, purgeAttachment, removeBones, removeSlots, rgba2ToRgba, rgbaToRgba2, setSlotDarkColor, snapTime, upsertKey, decompose } from '@/core/edit';
import type { BoneMats } from '@/core/mesh';
import { moveKeys, removeKeys, resolveKeys, retargetClip } from '@/core/keyrefs';
import { duplicateSkin, mergeSkin, repointSkinPictures, setSkinRequired, setSkinScope, toggleOverride } from '@/core/skins';
import type { DuplicateSkinOptions, MergeSkinOptions } from '@/core/skins';
import type { ScopeKind } from '@/core/skins';
import type { KeyRef } from '@/core/keyrefs';
import { RAD2DEG, atan2Deg, matInvert, matMul } from '@/core/math';
import type { Mat } from '@/core/math';
import { AXIS_GROUPS, newAnimation, newBone, newSkin, newSlot } from '@/core/model';
import { cleanPlay, playOf, playSpan, samePlay } from '@/core/playback';
import { removeAnimation } from '@/core/problems';
import { commonShift, isPsd, layerCenter, readPsdFile } from '@/core/import/psd';
import type { PsdLayer, PsdPixels } from '@/core/import/psd';
import { fitRegion, planPsdSync } from '@/core/import/psdSync';
import { cleanImageName, renameImage, sequenceFrameOwner, unusedImages } from '@/core/images';
import { applySkinPicks, planSkinImages, putSkinImage } from '@/core/skinImages';
import { skeletonList } from '@/core/skeletons';
import { rotationLimitOf } from '@/core/limits';
import type { Animation, AxisGroup, Bone, BoneProp, Id, ImageRef, Inherit, Key, PlaySettings, Project, RGB, RGBA, SkeletonDoc, Slot } from '@/core/model';
import { getScene, getSetupSkeleton } from '@/editor/scene';
import { assets } from './assets';
import type { ImageAsset } from './assets';
import { entriesOf, pathedFromInput, readEntries } from './dropped';
import { docStore } from './doc';
import { settingsStore } from './settings';
import { ATTACHMENT_TOOLS, emptySelection, toast, uiStore } from './ui';
import type { PoseOverride, Selection, Tool } from './ui';

// ------------------------------------------------------------------ small accessors

const project = () => docStore.get();
const skeletonDoc = () => docStore.get().skeleton;
export const boneById = (id: Id) => skeletonDoc().bones.find((b) => b.id === id);
export const slotById = (id: Id) => skeletonDoc().slots.find((s) => s.id === id);

export function currentAnimation(): Animation | undefined {
  return findAnimation(skeletonDoc(), uiStore.get().animationId);
}

/**
 * Changes how the current animation plays (loop, ping-pong, play range). It is kept on the animation, so every animation has its own
 * settings and they are saved with the project; the playback loop and the timeline read them back through `ui`.
 */
export function setPlay(patch: Partial<PlaySettings>) {
  const anim = currentAnimation();
  if (!anim) return;
  const next = cleanPlay({ ...playOf(anim), ...patch }, anim.duration);
  if (samePlay(next, playOf(anim))) return;
  docStore.update('Playback settings', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (a) a.play = next;
  });
}

// ------------------------------------------------------------------ mode / tool / selection

export function setMode(mode: 'setup' | 'animate') {
  const ui = uiStore.get();
  if (ui.mode === mode) return;
  if (mode === 'animate') {
    const doc = skeletonDoc();
    let animId = ui.animationId;
    if (!animId || !doc.animations.some((a) => a.id === animId)) animId = doc.animations[0]?.id ?? null;
    if (!animId) animId = createAnimation('animation');
    uiStore.patch({ mode, animationId: animId, overrides: {}, tool: ui.tool === 'create' || ui.tool === 'mesh' || ui.tool === 'weights' || ATTACHMENT_TOOLS.includes(ui.tool) ? 'select' : ui.tool });
  } else {
    uiStore.patch({ mode, playing: false, overrides: {} });
  }
}

export function setTool(tool: Tool) {
  const ui = uiStore.get();
  if (ui.mode === 'animate' && (tool === 'create' || tool === 'weights' || ATTACHMENT_TOOLS.includes(tool))) {
    toast(tool === 'create' ? 'Switch to Setup mode to create bones' : tool === 'weights' ? 'Switch to Setup mode to edit weights' : 'Switch to Setup mode to create attachments');
    return;
  }
  uiStore.patch({ tool });
}

export function setSelection(sel: Partial<Selection>) {
  uiStore.patch({ selection: { ...emptySelection, ...sel } });
}

export function clearSelection() {
  uiStore.patch({ selection: emptySelection });
}

/**
 * Drops selected bones / slot / attachment / constraint that no longer exist (undo of their creation, a deletion …),
 * so no panel or tool is ever asked about an entity that is gone.
 */
export function sanitizeSelection() {
  const doc = skeletonDoc();
  const sel = uiStore.get().selection;
  const bones = sel.bones.filter((id) => doc.bones.some((b) => b.id === id));
  const slotOk = sel.slot === null || doc.slots.some((s) => s.id === sel.slot);
  const attOk = slotOk && (sel.attachment === null || (sel.slot !== null && !!doc.skins[0]?.attachments[sel.slot]?.[sel.attachment]));
  const constraintOk = sel.constraint === null || doc.constraints.some((c) => c.id === sel.constraint);
  if (bones.length === sel.bones.length && slotOk && attOk && constraintOk) return;
  uiStore.patch({
    selection: {
      bones,
      slot: slotOk ? sel.slot : null,
      attachment: attOk ? sel.attachment : null,
      constraint: constraintOk ? sel.constraint : null,
      vertices: attOk ? sel.vertices : [],
    },
  });
}

export function selectBone(id: Id, additive = false) {
  const cur = uiStore.get().selection;
  if (additive) {
    const bones = cur.bones.includes(id) ? cur.bones.filter((b) => b !== id) : [...cur.bones, id];
    setSelection({ bones });
  } else setSelection({ bones: [id] });
}

export function selectSlot(slotId: Id, attachment?: string | null) {
  const slot = slotById(slotId);
  setSelection({ slot: slotId, attachment: attachment === undefined ? (slot?.attachment ?? null) : attachment, bones: slot ? [slot.bone] : [] });
}

// ------------------------------------------------------------------ time / playback

export function setTime(t: number, snap = true) {
  const ui = uiStore.get();
  const anim = currentAnimation();
  const fps = skeletonDoc().fps;
  let time = snap ? snapTime(t, fps) : Math.max(0, t);
  if (anim) time = Math.min(time, anim.duration);
  uiStore.patch({ time, overrides: Object.keys(ui.overrides).length ? {} : ui.overrides });
}

export function togglePlay() {
  const ui = uiStore.get();
  if (ui.mode !== 'animate') setMode('animate');
  const anim = currentAnimation();
  if (!anim) return;
  const now = uiStore.get();
  if (!now.playing) {
    // start inside the play range, and from its beginning when a single play already reached the end
    const [lo, hi] = playSpan(anim.duration, now.range);
    if (now.time < lo || (now.time >= hi - 1e-6 && !now.loop)) uiStore.patch({ time: lo });
  }
  uiStore.patch({ playing: !uiStore.get().playing, overrides: {} });
}

// ------------------------------------------------------------------ bones

export interface CreateBoneInput {
  parent: Id | null;
  /** World position of the bone origin (setup pose). */
  x: number;
  y: number;
  /** World position of the bone tip. */
  tipX: number;
  tipY: number;
  name?: string;
}

/** Creates a bone from world coordinates in the setup pose. Returns its id. */
export function createBoneWorld(input: CreateBoneInput): Id | null {
  const doc = skeletonDoc();
  const parentId = input.parent ?? doc.bones[0]?.id ?? null;
  const setup = getSetupSkeleton();
  const pb = parentId ? setup.boneById(parentId) : undefined;
  let lx = input.x;
  let ly = input.y;
  const worldLen = Math.hypot(input.tipX - input.x, input.tipY - input.y);
  const worldAngle = Math.atan2(input.tipY - input.y, input.tipX - input.x);
  let rotation = worldAngle * RAD2DEG;
  let length = worldLen;
  if (pb) {
    [lx, ly] = pb.worldToLocal(input.x, input.y);
    // express the desired world direction in the parent's local frame (works for scaled / flipped / sheared parents)
    const det = pb.a * pb.d - pb.b * pb.c || 1e-9;
    const ux = Math.cos(worldAngle);
    const uy = Math.sin(worldAngle);
    const vx = (ux * pb.d - uy * pb.b) / det;
    const vy = (uy * pb.a - ux * pb.c) / det;
    rotation = atan2Deg(vy, vx);
    const r = rotation / RAD2DEG;
    const wx = pb.a * Math.cos(r) + pb.b * Math.sin(r);
    const wy = pb.c * Math.cos(r) + pb.d * Math.sin(r);
    length = worldLen / Math.max(1e-6, Math.hypot(wx, wy));
  }
  const b = newBone({ name: input.name?.trim() ? freshName(input.name.trim(), doc.bones) : freshName('bone', doc.bones), parent: parentId, x: lx, y: ly, rotation, length });
  docStore.update('Create bone', (d) => {
    d.skeleton.bones.push(b);
  });
  return b.id;
}

export function setBoneProps(id: Id, patch: Partial<Bone>, label = 'Edit bone') {
  docStore.update(label, (d) => {
    const b = d.skeleton.bones.find((x) => x.id === id);
    if (b) Object.assign(b, patch);
  });
}

export function renameBone(id: Id, name: string) {
  const doc = skeletonDoc();
  const clean = name.trim();
  if (!clean) return;
  const unique = freshName(clean, doc.bones.filter((b) => b.id !== id));
  setBoneProps(id, { name: unique }, 'Rename bone');
}

export function deleteBones(ids: Id[]) {
  const doc = skeletonDoc();
  const roots = doc.bones.filter((b) => !b.parent).map((b) => b.id);
  const targets = ids.filter((id) => !(roots.length === 1 && roots[0] === id));
  if (!targets.length) {
    toast('The root bone cannot be deleted');
    return;
  }
  // setup-pose placement of every bone, so weighted vertices that lose all their bones stay where they are
  const bindPose: BoneMats = new Map(getSetupSkeleton().bones.map((b) => [b.data.id, { a: b.a, b: b.b, c: b.c, d: b.d, x: b.worldX, y: b.worldY }] as const));
  docStore.update('Delete bones', (d) => {
    removeBones(d.skeleton, targets, bindPose);
  });
  const doc2 = skeletonDoc();
  const sel = uiStore.get().selection;
  setSelection({
    bones: sel.bones.filter((b) => doc2.bones.some((x) => x.id === b)),
    slot: sel.slot && doc2.slots.some((s) => s.id === sel.slot) ? sel.slot : null,
    attachment: sel.slot && doc2.slots.some((s) => s.id === sel.slot) ? sel.attachment : null,
  });
}

/** Reparents keeping the setup pose world transform. */
export function reparentBone(id: Id, newParent: Id | null) {
  const doc = skeletonDoc();
  const bone = doc.bones.find((b) => b.id === id);
  if (!bone || bone.parent === newParent) return;
  // the second bone of a two-bone IK must stay a child of the first one
  const chain = doc.constraints.find((c) => c.type === 'ik' && c.bones.length === 2 && c.bones[1] === id);
  if (chain) {
    toast(`"${bone.name}" is part of the IK constraint "${chain.name}" — remove the constraint to move it`, 'error');
    return;
  }
  if (newParent === null && doc.bones.some((b) => !b.parent && b.id !== id)) newParent = doc.bones.find((b) => !b.parent && b.id !== id)!.id;
  // cycles
  if (newParent) {
    let p: Bone | undefined = doc.bones.find((b) => b.id === newParent);
    while (p) {
      if (p.id === id) {
        toast('A bone cannot become its own descendant', 'error');
        return;
      }
      p = p.parent ? doc.bones.find((b) => b.id === p!.parent) : undefined;
    }
  }
  const setup = getSetupSkeleton();
  const sb = setup.boneById(id);
  const sp = newParent ? setup.boneById(newParent) : undefined;
  if (!sb) return;
  const world: Mat = { a: sb.a, b: sb.b, c: sb.c, d: sb.d, x: sb.worldX, y: sb.worldY };
  const parent: Mat = sp ? { a: sp.a, b: sp.b, c: sp.c, d: sp.d, x: sp.worldX, y: sp.worldY } : { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 };
  const local = matMul(matInvert(parent), world);
  const dec = decompose(local.a, local.b, local.c, local.d);
  docStore.update('Reparent bone', (d) => {
    const b = d.skeleton.bones.find((x) => x.id === id)!;
    b.parent = newParent;
    b.x = local.x;
    b.y = local.y;
    b.rotation = dec.rotation;
    b.scaleX = dec.scaleX;
    b.scaleY = dec.scaleY;
    b.shearX = dec.shearX;
    b.shearY = dec.shearY;
    b.inherit = 'normal' as Inherit;
    normalizeBoneOrder(d.skeleton);
  });
}

// ------------------------------------------------------------------ pose editing (setup / animate aware)

export type PoseProps = PoseOverride;

/** The timeline a pose property is keyed on: one axis each, which a bone with a combined timeline keys together with the other axis. */
const POSE_TIMELINE: Record<keyof PoseProps, BoneProp> = {
  rotation: 'rotate',
  x: 'translatex',
  y: 'translatey',
  scaleX: 'scalex',
  scaleY: 'scaley',
  shearX: 'shearx',
  shearY: 'sheary',
};

function ensureBoneTimelines(a: Draft<Animation>, id: Id) {
  return (a.bones[id] ??= {});
}

/** Writes keys for the given bone pose props at `time` into an animation draft. */
function keyBoneInDraft(d: Draft<Project>, anim: Draft<Animation>, boneId: Id, pose: Required<PoseProps>, touched: Set<BoneProp>, time: number, curveKind: 'linear' | 'bezier' | 'stepped') {
  const setup = d.skeleton.bones.find((b) => b.id === boneId);
  if (!setup) return;
  // a bone with a rotation limit is rotated by its control bone: the key goes there (the limited bone's own rotation is overwritten by the constraint)
  const limit = touched.has('rotate') ? rotationLimitOf(d.skeleton, boneId) : null;
  if (limit) {
    const cp = currentPose(limit.control);
    if (cp) keyBoneInDraft(d, anim, limit.control, { ...cp, ...uiStore.get().overrides[limit.control] }, new Set<BoneProp>(['rotate']), time, curveKind);
    touched = new Set([...touched].filter((t) => t !== 'rotate'));
    if (!touched.size) return;
  }
  const tl = ensureBoneTimelines(anim, boneId);
  const key = (channels: number, value: number[]) => ({ time, value, ...(makeCurve(curveKind, channels) !== undefined ? { curve: makeCurve(curveKind, channels) } : {}) });
  const put = (prop: BoneProp, value: number[]) => {
    const keys = (tl[prop] ??= []);
    const k = key(value.length, value);
    const exist = keys.find((x) => Math.abs(x.time - time) < 1e-4);
    if (exist) exist.value = value;
    else upsertKey(keys, k);
  };
  if (touched.has('rotate')) put('rotate', [pose.rotation - setup.rotation]);
  const values: Record<AxisGroup, [number, number]> = {
    translate: [pose.x - setup.x, pose.y - setup.y],
    scale: [setup.scaleX !== 0 ? pose.scaleX / setup.scaleX : 1, setup.scaleY !== 0 ? pose.scaleY / setup.scaleY : 1],
    shear: [pose.shearX - setup.shearX, pose.shearY - setup.shearY],
  };
  for (const g of Object.keys(AXIS_GROUPS) as AxisGroup[]) {
    const [ax, ay] = AXIS_GROUPS[g];
    const all = touched.has(g);
    const wantX = all || touched.has(ax);
    const wantY = all || touched.has(ay);
    if (!wantX && !wantY) continue;
    // a bone whose group was split keys the axes on their own timelines; otherwise the combined timeline takes both values
    if (tl[ax]?.length || tl[ay]?.length) {
      if (wantX) put(ax, [values[g][0]]);
      if (wantY) put(ay, [values[g][1]]);
    } else put(g, values[g]);
  }
}

/**
 * The rotation of a bone with a rotation limit is the control bone's, clamped by the constraint: an edit of that rotation is applied to the control
 * bone, so dragging past the sector keeps turning the control (the bone waits at the end of its sector and follows as soon as the control is back).
 */
function routeLimited(updates: { id: Id; props: PoseProps }[]): { id: Id; props: PoseProps }[] {
  const doc = skeletonDoc();
  if (!updates.some((u) => u.props.rotation !== undefined)) return updates;
  const out: { id: Id; props: PoseProps }[] = [];
  for (const u of updates) {
    const limit = u.props.rotation !== undefined ? rotationLimitOf(doc, u.id) : null;
    if (!limit) {
      out.push(u);
      continue;
    }
    const { rotation, ...rest } = u.props;
    if (Object.keys(rest).length) out.push({ id: u.id, props: rest });
    const existing = out.find((x) => x.id === limit.control);
    if (existing) existing.props = { ...existing.props, rotation };
    else out.push({ id: limit.control, props: { rotation } });
  }
  return out;
}

/** Current local pose of a bone (setup + animation + overrides). */
export function currentPose(id: Id): Required<PoseProps> | null {
  const b = getScene().skeleton.boneById(id);
  if (!b) return null;
  return { x: b.x, y: b.y, rotation: b.rotation, scaleX: b.scaleX, scaleY: b.scaleY, shearX: b.shearX, shearY: b.shearY };
}

/**
 * Sets local pose values of bones. In Setup mode edits the setup pose; in Animate mode writes keyframes at the playhead
 * (auto-key) or holds a temporary override until keyed.
 */
export function setBonePose(updates: { id: Id; props: PoseProps }[], label = 'Edit pose') {
  const ui = uiStore.get();
  if (!updates.length) return;
  updates = routeLimited(updates);
  if (ui.mode === 'setup') {
    const before = skeletonDoc();
    const comp = ui.compensate;
    docStore.update(label, (d) => {
      for (const u of updates) {
        const b = d.skeleton.bones.find((x) => x.id === u.id);
        if (b) Object.assign(b, u.props);
      }
      // Compensation: the children and the pictures that were asked to stay in place get new local values
      if (comp.bones || comp.images) compensateEdit(before, d.skeleton, updates.map((u) => u.id), comp);
    });
    return;
  }
  const anim = currentAnimation();
  if (!anim) {
    toast('Create an animation first');
    return;
  }
  if (!ui.autoKey) {
    const overrides = { ...ui.overrides };
    for (const u of updates) overrides[u.id] = { ...overrides[u.id], ...u.props };
    uiStore.patch({ overrides });
    return;
  }
  const time = ui.time;
  const prepared = updates
    .map((u) => {
      const cur = currentPose(u.id);
      if (!cur) return null;
      const pose = { ...cur, ...u.props };
      const touched = new Set<BoneProp>();
      for (const k of Object.keys(u.props) as (keyof PoseProps)[]) touched.add(POSE_TIMELINE[k]);
      return { id: u.id, pose, touched };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  docStore.update(label, (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    for (const p of prepared) keyBoneInDraft(d, a, p.id, p.pose, p.touched, time, ui.defaultCurve);
    extendDuration(a, time);
  });
}

export function extendDuration(a: Draft<Animation>, time: number) {
  if (time > a.duration) a.duration = time;
}

type Channel = BoneProp;

/** The transform channels a temporary pose edit touched (an override holds only the properties that were changed). */
export function editedChannels(o: PoseProps | undefined): Set<Channel> {
  const out = new Set<Channel>();
  if (o) for (const k of Object.keys(o) as (keyof PoseProps)[]) if (o[k] !== undefined) out.add(POSE_TIMELINE[k]);
  return out;
}

/**
 * Key Edited (Spine's K): keys only the channels that were changed since the last key, for the bones that have such edits (with Auto-key off an edit
 * is a pending pose until keyed). Rotating a bone keys its rotation and leaves translate, scale and shear alone. With nothing pending it keys
 * every channel of the selected bones, like Key Shown, so the key still does something when Auto-key has already keyed everything.
 */
export function keyEditedBones() {
  const ui = uiStore.get();
  if (!currentAnimation() || ui.mode !== 'animate') return;
  const pending = Object.keys(ui.overrides).filter((id) => editedChannels(ui.overrides[id]).size > 0);
  if (!pending.length) {
    keySelectedBones();
    return;
  }
  keyBonesChannels(pending.map((id) => ({ id, channels: editedChannels(ui.overrides[id]) })), 'Key edited');
}

function keyBonesChannels(list: { id: Id; channels: Set<Channel> }[], label: string) {
  const ui = uiStore.get();
  const anim = currentAnimation();
  if (!anim || ui.mode !== 'animate') return;
  const time = ui.time;
  const prepared = list
    .map(({ id, channels }) => {
      const cur = currentPose(id);
      return cur ? { id, channels, pose: { ...cur, ...ui.overrides[id] } } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (!prepared.length) return;
  docStore.update(label, (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    for (const p of prepared) keyBoneInDraft(d, a, p.id, p.pose, p.channels, time, ui.defaultCurve);
    extendDuration(a, time);
  });
  uiStore.patch({ overrides: {} });
}

/**
 * Key Constrained: keys the pose the selected bones have after the constraints (IK, transform, path, physics, sliders), as the viewport shows
 * it now, instead of their own local pose. With it a physics motion or an IK pose is baked into ordinary keys one frame at a time.
 */
export function keyConstrainedBones() {
  const ui = uiStore.get();
  const anim = currentAnimation();
  if (!anim || ui.mode !== 'animate') return;
  if (!ui.selection.bones.length) {
    toast('Select a bone to key');
    return;
  }
  const time = ui.time;
  const skeleton = getScene().skeleton;
  const prepared = ui.selection.bones
    .map((id) => {
      const b = skeleton.boneById(id);
      if (!b) return null;
      b.validateApplied();
      // the turn nearest to the rotation the bone has on its own, so that a key does not spin the bone a whole turn
      const rotation = b.rotation + ((((b.arotation - b.rotation + 180) % 360) + 360) % 360) - 180;
      return { id, pose: { x: b.ax, y: b.ay, rotation, scaleX: b.ascaleX, scaleY: b.ascaleY, shearX: b.ashearX, shearY: b.ashearY } };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (!prepared.length) return;
  docStore.update('Key constrained', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    for (const p of prepared) keyBoneInDraft(d, a, p.id, p.pose, new Set<BoneProp>(['rotate', 'translate', 'scale', 'shear']), time, ui.defaultCurve);
    extendDuration(a, time);
  });
  uiStore.patch({ overrides: {} });
}

/** Keys the current pose of the selected bones (all four transform timelines or a subset). */
export function keySelectedBones(which: BoneProp[] = ['rotate', 'translate', 'scale', 'shear']) {
  const ui = uiStore.get();
  const anim = currentAnimation();
  if (!anim || ui.mode !== 'animate') return;
  const ids = ui.selection.bones;
  if (!ids.length) {
    toast('Select a bone to key');
    return;
  }
  const time = ui.time;
  const prepared = ids
    .map((id) => {
      const cur = currentPose(id);
      return cur ? { id, pose: { ...cur, ...ui.overrides[id] } } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  docStore.update('Key bones', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    for (const p of prepared) keyBoneInDraft(d, a, p.id, p.pose, new Set(which), time, ui.defaultCurve);
    extendDuration(a, time);
  });
  uiStore.patch({ overrides: {} });
}

// ------------------------------------------------------------------ images, slots, attachments

export async function importImageFiles(files: File[], paths?: string[]): Promise<string[]> {
  const refs: ImageRef[] = [];
  for (const [i, f] of files.entries()) {
    if (isPsd(f)) {
      await importPsd(f);
      continue;
    }
    if (!/^image\/(png|jpeg|webp|gif)/.test(f.type) && !/\.(png|jpe?g|webp|gif)$/i.test(f.name)) continue;
    try {
      const path = paths?.[i] ? cleanImageName(paths[i]) : '';
      refs.push(await assets.addFile(f, path || undefined));
    } catch (e) {
      toast(`Could not read ${f.name}`, 'error');
      console.error(e);
    }
  }
  if (refs.length) {
    // a whole folder is one step of the history
    docStore.update(refs.length > 1 ? 'Import images' : 'Import image', (d) => {
      d.images.push(...refs);
    });
    toast(`Imported ${refs.length} image${refs.length > 1 ? 's' : ''}`, 'ok');
  }
  return refs.map((r) => r.name);
}

/** Imports what was dropped: files, or folders of files (their folders become folders of pictures). Call it inside the drop event. */
export async function importDropped(dt: DataTransfer): Promise<{ names: string[]; folder: boolean }> {
  const entries = entriesOf(dt);
  const loose = [...dt.files];
  if (!entries.some((e) => e.isDirectory)) return { names: await importImageFiles(loose), folder: false };
  const { files } = await readEntries(entries);
  return { names: await importImageFiles(files.map((f) => f.file), files.map((f) => f.path)), folder: true };
}

/** Imports the files of a "choose a folder" input. */
export async function importFolderFiles(list: File[]): Promise<string[]> {
  const files = pathedFromInput(list);
  return importImageFiles(files.map((f) => f.file), files.map((f) => f.path));
}

/** Where an attachment goes on a bone so that it sits at a scene position (and stays upright in the scene). */
function placeOnBone(live: { worldToLocal(x: number, y: number): [number, number]; a: number; b: number; c: number; d: number } | undefined, wx: number, wy: number): { x: number; y: number; rotation: number } {
  if (!live) return { x: wx, y: wy, rotation: 0 };
  const [x, y] = live.worldToLocal(wx, wy);
  const det = live.a * live.d - live.b * live.c;
  const rot = det < 0 ? atan2Deg(live.c, live.a) : -atan2Deg(live.c, live.a);
  return { x, y, rotation: det < 0 ? -rot : rot };
}

function pixelsToPng(px: PsdPixels): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = px.width;
  canvas.height = px.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode the layer'))), 'image/png'));
}

/**
 * Imports a Photoshop file: every visible layer becomes a picture (groups are folders) and a slot with a region attachment, bottom layer
 * first, so the stack of the file is the draw order. The slots go on the selected bone (the first one, or a new root when there is none).
 * One step in the history. Returns the number of layers imported.
 */
export async function importPsd(file: File): Promise<number> {
  let psd;
  try {
    psd = await readPsdFile(await file.arrayBuffer());
  } catch (e) {
    toast(`Could not read ${file.name}`, 'error');
    console.error(e);
    return 0;
  }
  if (!psd.layers.length) {
    toast(`${file.name} has no visible pixel layers`, 'info');
    return 0;
  }
  const refs: { ref: ImageRef; layer: (typeof psd.layers)[number] }[] = [];
  for (const layer of psd.layers) {
    try {
      refs.push({ ref: await assets.addFile(await pixelsToPng(layer.pixels), layer.name), layer });
    } catch (e) {
      toast(`Could not read the layer "${layer.name}"`, 'error');
      console.error(e);
    }
  }
  const doc = skeletonDoc();
  const selected = uiStore.get().selection.bones[0] ?? doc.bones[0]?.id;
  const setup = getSetupSkeleton();
  const live = selected ? setup.boneById(selected) : undefined;
  const root = live ? null : newBone({ name: freshName('root', doc.bones) });
  const boneId = live ? live.data.id : root!.id;
  const slotIds: Id[] = [];
  docStore.update('Import PSD', (d) => {
    if (root) d.skeleton.bones.push(root);
    const skin = d.skeleton.skins[0];
    for (const { ref, layer } of refs) {
      const center = layerCenter(psd, layer);
      const { x: lx, y: ly, rotation } = placeOnBone(live, center[0], center[1]);
      const slot = newSlot({ name: freshName(ref.name.split('/').pop() ?? ref.name, d.skeleton.slots), bone: boneId, attachment: ref.name, color: [1, 1, 1, layer.opacity], blend: layer.blend });
      d.images.push({ ...ref, psd: center });
      d.skeleton.slots.push(slot);
      skin.attachments[slot.id] = { [ref.name]: { type: 'region', name: ref.name, path: ref.name, x: lx, y: ly, rotation, scaleX: 1, scaleY: 1, width: ref.width, height: ref.height, color: [1, 1, 1, 1] } };
      slotIds.push(slot.id);
    }
  });
  if (slotIds.length) setSelection({ slot: slotIds[slotIds.length - 1], bones: [boneId] });
  toast(psd.skipped.hidden ? `Imported layers: ${slotIds.length} from ${file.name} (${psd.skipped.hidden} hidden skipped)` : `Imported layers: ${slotIds.length} from ${file.name}`, 'ok');
  return slotIds.length;
}

/**
 * "Update from PSD": the layers of a (repainted) Photoshop file are matched to the pictures of the project by name. The matched pictures get
 * the new pixels (a region attachment follows the new size and the way the layer moved; meshes keep their shape, so a repaint of the same
 * size drops in), the layers the project has not got become new slots in their place of the stack, and nothing is removed. One step.
 */
export async function reimportPsd(file: File): Promise<{ updated: number; added: number }> {
  const none = { updated: 0, added: 0 };
  let psd;
  try {
    psd = await readPsdFile(await file.arrayBuffer());
  } catch (e) {
    toast(`Could not read ${file.name}`, 'error');
    console.error(e);
    return none;
  }
  const plan = planPsdSync(psd.layers, project().images);
  if (!plan.updates.length && !plan.added.length) {
    toast(`${file.name} has no visible pixel layers`, 'info');
    return none;
  }
  const fresh = new Map<string, { asset: ImageAsset; layer: PsdLayer }>();
  const refs = new Map<string, ImageRef>();
  try {
    for (const { layer, image } of plan.updates) fresh.set(image.name, { asset: await assets.decode(image.name, await pixelsToPng(layer.pixels)), layer });
    for (const layer of plan.added) refs.set(layer.name, await assets.addFile(await pixelsToPng(layer.pixels), layer.name));
  } catch (e) {
    toast(`Could not read the layers of ${file.name}`, 'error');
    console.error(e);
    return none;
  }
  const doc = skeletonDoc();
  const selected = uiStore.get().selection.bones[0] ?? doc.bones[0]?.id;
  const setup = getSetupSkeleton();
  const live = selected ? setup.boneById(selected) : undefined;
  const root = live ? null : newBone({ name: freshName('root', doc.bones) });
  const boneId = live ? live.data.id : root!.id;
  let meshes = 0;
  const pixelChanges: { name: string; before: ImageAsset | undefined; after: ImageAsset }[] = [];
  for (const { asset } of fresh.values()) {
    const before = assets.get(asset.name);
    assets.set(asset.name, asset);
    pixelChanges.push({ name: asset.name, before, after: assets.get(asset.name)! });
  }
  // a canvas that was made bigger (or smaller) moves every layer by the same amount: that part is not an edit of the artwork
  const common = commonShift(
    plan.updates.map(({ layer, image }) => {
      if (!image.psd) return null;
      const c = layerCenter(psd, layer);
      return [c[0] - image.psd[0], c[1] - image.psd[1]] as [number, number];
    }),
  );
  docStore.update('Update from PSD', (d) => {
    if (root && plan.added.length) d.skeleton.bones.push(root);
    const skin0 = d.skeleton.skins[0];
    // 1. the pictures that exist: pixels, size, and the attachments that show them
    for (const { image } of plan.updates) {
      const entry = fresh.get(image.name)!;
      const img = d.images.find((i) => i.id === image.id);
      if (!img) continue;
      const from = { width: img.width, height: img.height };
      const to = { width: entry.asset.width, height: entry.asset.height };
      const center = layerCenter(psd, entry.layer);
      const moved: [number, number] | null = img.psd ? [center[0] - img.psd[0] - common[0], center[1] - img.psd[1] - common[1]] : null;
      img.width = to.width;
      img.height = to.height;
      img.psd = center;
      img.rev = (img.rev ?? 0) + 1;
      for (const skin of d.skeleton.skins) {
        for (const [slotId, byName] of Object.entries(skin.attachments)) {
          const bone = setup.boneById(d.skeleton.slots.find((s) => s.id === slotId)?.bone ?? '');
          for (const att of Object.values(byName)) {
            if ((att.type !== 'region' && att.type !== 'mesh') || (att.path ?? att.name) !== image.name) continue;
            if (att.type === 'mesh') {
              meshes++;
              continue;
            }
            let shift: [number, number] = [0, 0];
            if (moved && bone) {
              const o = bone.worldToLocal(0, 0);
              const t = bone.worldToLocal(moved[0], moved[1]);
              shift = [t[0] - o[0], t[1] - o[1]];
            }
            Object.assign(att, fitRegion(att, from, to, shift));
          }
        }
      }
    }
    // 2. the layers that are new: a slot each, right above the slot of the layer under them in the file
    let anchor: Id | null = null;
    for (const layer of psd.layers) {
      const ref = refs.get(layer.name);
      if (!ref) {
        anchor = d.skeleton.slots.find((s) => s.attachment === layer.name)?.id ?? anchor;
        continue;
      }
      const center = layerCenter(psd, layer);
      const at = placeOnBone(live, center[0], center[1]);
      const slot = newSlot({ name: freshName(ref.name.split('/').pop() ?? ref.name, d.skeleton.slots), bone: boneId, attachment: ref.name, color: [1, 1, 1, layer.opacity], blend: layer.blend });
      d.images.push({ ...ref, psd: center });
      const at0 = anchor ? d.skeleton.slots.findIndex((s) => s.id === anchor) + 1 : 0;
      d.skeleton.slots.splice(at0, 0, slot);
      skin0.attachments[slot.id] = { [ref.name]: { type: 'region', name: ref.name, path: ref.name, x: at.x, y: at.y, rotation: at.rotation, scaleX: 1, scaleY: 1, width: ref.width, height: ref.height, color: [1, 1, 1, 1] } };
      anchor = slot.id;
    }
  });
  if (pixelChanges.length) keepPixelsForUndo(pixelChanges);
  const head = `Update from ${file.name}: ${plan.updates.length} updated, ${plan.added.length} new, ${plan.gone.length} not in the file`;
  toast(meshes ? `${head} (${meshes} meshes keep their shape)` : head, 'ok');
  return { updated: plan.updates.length, added: plan.added.length };
}

/** Creates a slot + region attachment for an image, centered at the given world position (setup pose). */
export function addImageToScene(imageName: string, worldX: number, worldY: number, boneId?: Id | null): { slotId: Id } | null {
  const img = project().images.find((i) => i.name === imageName);
  if (!img) return null;
  const doc = skeletonDoc();
  const bid = boneId ?? uiStore.get().selection.bones[0] ?? doc.bones[0]?.id;
  const setup = getSetupSkeleton();
  const bone = bid ? setup.boneById(bid) : undefined;
  if (!bone) return null;
  const [lx, ly] = bone.worldToLocal(worldX, worldY);
  const det = bone.a * bone.d - bone.b * bone.c;
  const rot = det < 0 ? atan2Deg(bone.c, bone.a) : -atan2Deg(bone.c, bone.a);
  const slot = newSlot({ name: freshName(img.name, doc.slots), bone: bone.data.id, attachment: img.name });
  docStore.update('Add image', (d) => {
    const sel = uiStore.get().selection.slot;
    const idx = sel ? d.skeleton.slots.findIndex((s) => s.id === sel) : -1;
    if (idx >= 0) d.skeleton.slots.splice(idx + 1, 0, slot);
    else d.skeleton.slots.push(slot);
    const skin = d.skeleton.skins[0];
    skin.attachments[slot.id] = {
      [img.name]: { type: 'region', name: img.name, path: img.name, x: lx, y: ly, rotation: det < 0 ? -rot : rot, scaleX: 1, scaleY: 1, width: img.width, height: img.height, color: [1, 1, 1, 1] },
    };
  });
  setSelection({ slot: slot.id, attachment: img.name, bones: [bone.data.id] });
  return { slotId: slot.id };
}

export function setSlotProps(id: Id, patch: Partial<Slot>, label = 'Edit slot') {
  docStore.update(label, (d) => {
    const s = d.skeleton.slots.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    if ('dark' in patch) setSlotDarkColor(d.skeleton, id, patch.dark ?? null); // two-color keys follow the dark color
  });
}

export function renameSlot(id: Id, name: string) {
  const clean = name.trim();
  if (!clean) return;
  setSlotProps(id, { name: freshName(clean, skeletonDoc().slots.filter((s) => s.id !== id)) }, 'Rename slot');
}

export function deleteSlots(ids: Id[]) {
  docStore.update('Delete slots', (d) => {
    removeSlots(d.skeleton, new Set(ids));
  });
  setSelection({ bones: uiStore.get().selection.bones });
}

/** Animate mode: keys the draw order with `id` moved to `toIndex`. */
function keyDrawOrder(id: Id, toIndex: number) {
  const anim = currentAnimation();
  const ui = uiStore.get();
  if (!anim) return;
  const order = getScene().skeleton.drawOrder.map((s) => s.data.id);
  const i = order.indexOf(id);
  if (i < 0) return;
  // a slot in a folder reorders its folder only: the folder's slots swap places, the others stay
  const inFolder = folderOrderAfterMove(skeletonDoc(), order, id, toIndex);
  if (inFolder) {
    docStore.update('Key draw order', (d) => {
      const a = d.skeleton.animations.find((x) => x.id === anim.id);
      if (!a) return;
      upsertKey((a.drawOrderFolder ??= {})[inFolder.folder.id] ??= [], { time: ui.time, order: inFolder.order });
      extendDuration(a, ui.time);
    });
    return;
  }
  order.splice(i, 1);
  order.splice(Math.max(0, Math.min(order.length, toIndex)), 0, id);
  docStore.update('Key draw order', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    upsertKey(a.drawOrder, { time: ui.time, order });
    extendDuration(a, ui.time);
  });
}

export function moveSlot(id: Id, toIndex: number) {
  if (uiStore.get().mode === 'animate') {
    keyDrawOrder(id, toIndex);
    return;
  }
  docStore.update('Reorder slot', (d) => {
    const list = d.skeleton.slots;
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return;
    const [s] = list.splice(i, 1);
    list.splice(Math.max(0, Math.min(list.length, toIndex)), 0, s);
  });
}

export function setSlotBone(id: Id, boneId: Id) {
  // keep the slot's attachments visually in place by re-expressing them in the new bone's frame (region attachments only)
  const doc = skeletonDoc();
  const slot = doc.slots.find((s) => s.id === id);
  if (!slot || slot.bone === boneId) return;
  const setup = getSetupSkeleton();
  const from = setup.boneById(slot.bone);
  const to = setup.boneById(boneId);
  if (!from || !to) return;
  docStore.update('Change slot bone', (d) => {
    const s = d.skeleton.slots.find((x) => x.id === id)!;
    s.bone = boneId;
    for (const skin of d.skeleton.skins) {
      const atts = skin.attachments[id];
      if (!atts) continue;
      for (const name in atts) {
        const a = atts[name];
        if (a.type === 'region') {
          const [wx, wy] = from.localToWorld(a.x, a.y);
          const [lx, ly] = to.worldToLocal(wx, wy);
          a.x = lx;
          a.y = ly;
        } else if (a.type === 'point') {
          const [wx, wy] = from.localToWorld(a.x, a.y);
          const [lx, ly] = to.worldToLocal(wx, wy);
          a.x = lx;
          a.y = ly;
          a.rotation += from.worldRotationX - to.worldRotationX; // keep pointing the same way
        } else if ((a.type === 'mesh' || a.type === 'boundingbox' || a.type === 'clipping') && !a.weights) {
          for (let i = 0; i < a.vertices.length; i += 2) {
            const [wx, wy] = from.localToWorld(a.vertices[i], a.vertices[i + 1]);
            const [lx, ly] = to.worldToLocal(wx, wy);
            a.vertices[i] = lx;
            a.vertices[i + 1] = ly;
          }
        }
      }
    }
  });
}

export function setAttachmentProps(slotId: Id, name: string, patch: Record<string, unknown>, label = 'Edit attachment') {
  docStore.update(label, (d) => {
    const skin = d.skeleton.skins[0];
    const a = skin.attachments[slotId]?.[name];
    if (a) Object.assign(a, patch);
  });
}

export function deleteAttachment(slotId: Id, name: string) {
  docStore.update('Delete attachment', (d) => {
    for (const skin of d.skeleton.skins) delete skin.attachments[slotId]?.[name];
    const s = d.skeleton.slots.find((x) => x.id === slotId);
    if (s && s.attachment === name) s.attachment = null;
    purgeAttachment(d.skeleton, slotId, name); // deform timelines of a missing mesh make the official loader throw
  });
}

/** Switches the visible attachment of a slot: setup pose in Setup mode, a key in Animate mode. */
export function setSlotAttachment(slotId: Id, name: string | null) {
  const ui = uiStore.get();
  if (ui.mode === 'setup') {
    setSlotProps(slotId, { attachment: name }, 'Set attachment');
    return;
  }
  const anim = currentAnimation();
  if (!anim) return;
  docStore.update('Key attachment', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    const tl = (a.slots[slotId] ??= {});
    const keys = (tl.attachment ??= []);
    upsertKey(keys, { time: ui.time, name });
    extendDuration(a, ui.time);
  });
}

/**
 * Setup: sets the slot color. Animate: keys it at the playhead. A slot with a dark color (two-color tinting) is keyed in an rgba2
 * timeline: `dark` is the dark color to key with the light one (default: the setup dark color).
 */
export function setSlotColor(slotId: Id, color: RGBA, dark?: RGB) {
  const ui = uiStore.get();
  if (ui.mode === 'setup') {
    setSlotProps(slotId, { color, ...(dark ? { dark } : {}) }, dark ? 'Slot colors' : 'Slot color');
    return;
  }
  const anim = currentAnimation();
  if (!anim) return;
  docStore.update('Key color', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    const setupDark = d.skeleton.slots.find((s) => s.id === slotId)?.dark ?? null;
    const tl = (a.slots[slotId] ??= {});
    let keys;
    let value: number[];
    if (setupDark) {
      if (tl.rgba) {
        tl.rgba2 = rgbaToRgba2(tl.rgba, setupDark); // light-only keys become two-color ones
        delete tl.rgba;
      }
      keys = tl.rgba2 ??= [];
      value = [color[0], color[1], color[2], color[3], ...(dark ?? setupDark)];
    } else {
      keys = tl.rgba ??= [];
      value = [color[0], color[1], color[2], color[3]];
    }
    const exist = keys.find((k) => Math.abs(k.time - ui.time) < 1e-4);
    if (exist) exist.value = value;
    else {
      const curve = makeCurve(ui.defaultCurve, value.length);
      upsertKey(keys, { time: ui.time, value, ...(curve !== undefined ? { curve } : {}) });
    }
    extendDuration(a, ui.time);
  });
}

// ------------------------------------------------------------------ animations

export function createAnimation(name?: string, duration = 1): Id {
  const doc = skeletonDoc();
  const anim = newAnimation(freshName(name?.trim() || 'animation', doc.animations), duration);
  docStore.update('New animation', (d) => {
    d.skeleton.animations.push(anim);
  });
  uiStore.patch({ animationId: anim.id, time: 0, playing: false, overrides: {}, selectedKeys: [] });
  return anim.id;
}

/** Removes the keys of an animation that change nothing. Returns how many keys went. */
export function cleanUpKeys(id: Id): number {
  let removed = 0;
  docStore.update('Clean up animation', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === id);
    if (a) removed = cleanUpAnimation(a);
  });
  uiStore.patch({ selectedKeys: [] });
  toast(removed ? `Removed ${removed} keys that change nothing` : 'Nothing to clean up: every key does something', removed ? 'ok' : 'info');
  return removed;
}

/** Makes the end of the current animation the same as its start (or the start the same as the end). Returns how many timelines changed. */
export function closeCurrentLoop(keep: 'first' | 'last', selectedOnly: boolean): number {
  const anim = currentAnimation();
  if (!anim) return 0;
  const bones = selectedOnly ? uiStore.get().selection.bones : undefined;
  let changed = 0;
  docStore.update('Close the loop', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (a) changed = closeLoop(a, { keep, bones });
  });
  toast(changed ? `Closed the loop on ${changed} timelines` : 'The end already matches the start', changed ? 'ok' : 'info');
  return changed;
}

/** Drops the keys of the bone timelines that a curve does not need (`strength` scales the tolerance). Returns how many keys went. */
export function simplifyCurrentAnimation(strength: number, selectedOnly: boolean): number {
  const anim = currentAnimation();
  if (!anim) return 0;
  const bones = selectedOnly ? uiStore.get().selection.bones : undefined;
  let removed = 0;
  docStore.update('Simplify keys', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (a) removed = simplifyAnimation(a, scaleTolerance(DEFAULT_TOLERANCE, strength), d.skeleton.fps, bones);
  });
  uiStore.patch({ selectedKeys: [] });
  toast(removed ? `Removed ${removed} keys, the curves stay within the tolerance` : 'No key can go without changing the motion', removed ? 'ok' : 'info');
  return removed;
}

/** Writes the result of the constraints (IK, physics, sliders ...) into plain bone keys of a new animation. Returns its id. */
export function bakeCurrentAnimation(options: Partial<BakeOptions>): Id | null {
  const anim = currentAnimation();
  if (!anim) return null;
  const doc = skeletonDoc();
  const baked = bakeAnimation(doc, anim, { ...options, skinId: uiStore.get().skinId });
  baked.name = freshName(`${anim.name} baked`, doc.animations);
  docStore.update('Bake animation', (d) => {
    d.skeleton.animations.push(baked);
  });
  selectAnimation(baked.id);
  const skipped = bakeSkips(doc, anim);
  if (skipped.length) toast(`Baked into "${baked.name}", but path constraint "${skipped.join('", "')}" has no path on some frames: its bones are not baked`, 'info', 7000);
  else toast(`Baked into "${baked.name}": ${Object.keys(baked.bones).length} bones carry keys`, 'ok');
  return baked.id;
}

/** Bakes `layer` on top of the current animation into a new animation (breathing over a walk). Returns its id. */
export function layerCurrentAnimation(layerId: Id, options: Partial<LayerOptions>): Id | null {
  const anim = currentAnimation();
  const doc = skeletonDoc();
  const layer = doc.animations.find((x) => x.id === layerId);
  if (!anim || !layer) return null;
  if (layer.id === anim.id) {
    toast('Choose another animation for the layer', 'error');
    return null;
  }
  const ids = new Set(doc.bones.map((x) => x.id));
  const moved = layerBones(layer, ids);
  if (!moved.length) {
    toast(`"${layer.name}" moves no bones`, 'info');
    return null;
  }
  const out = stackLayer(anim, layer, ids, doc.fps, options);
  out.name = freshName(`${anim.name} + ${layer.name}`, doc.animations);
  docStore.update('Layer animation', (d) => {
    d.skeleton.animations.push(out);
  });
  selectAnimation(out.id);
  toast(`Layered "${layer.name}" over "${anim.name}" into "${out.name}": ${moved.length} bones`, 'ok');
  return out.id;
}

/** Fades the pictures of a slot into each other where this animation changes them (a second slot shows the old picture). Returns the partner slot. */
export function crossfadeSlot(slotId: Id, seconds: number): Id | null {
  const anim = currentAnimation();
  const doc = skeletonDoc();
  const slot = doc.slots.find((s) => s.id === slotId);
  if (!anim || !slot) return null;
  const why = fadeRefusal(doc, slot, anim);
  if (why) {
    toast(
      why === 'no-keys' ? 'This animation changes no picture of the slot' : why === 'two-color' ? 'A slot with a dark color cannot fade' : why === 'color-keys' ? 'The slot already has color keys in this animation' : 'This slot changes no picture',
      'info',
    );
    return null;
  }
  if (!applyCrossfade(structuredClone(doc), anim.id, slotId, seconds)) {
    toast('No change of picture is long enough to fade', 'info');
    return null;
  }
  let made: Crossfade | null = null;
  docStore.update('Crossfade pictures', (d) => {
    made = applyCrossfade(d.skeleton, anim.id, slotId, seconds);
  });
  const got = made as Crossfade | null;
  if (!got) return null;
  uiStore.patch({ selectedKeys: [] });
  toast(`Faded ${got.fades} changes of picture; "${skeletonDoc().slots.find((s) => s.id === got.partner)?.name ?? ''}" shows the old pictures`, 'ok');
  return got.partner;
}

export function selectAnimation(id: Id) {
  uiStore.patch({ animationId: id, time: 0, playing: false, overrides: {}, selectedKeys: [] });
}

export function renameAnimation(id: Id, name: string) {
  const clean = name.trim();
  if (!clean) return;
  const doc = skeletonDoc();
  docStore.update('Rename animation', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === id);
    if (a) a.name = freshName(clean, doc.animations.filter((x) => x.id !== id));
  });
}

export function duplicateAnimation(id: Id) {
  const doc = skeletonDoc();
  const src = doc.animations.find((a) => a.id === id);
  if (!src) return;
  const copy: Animation = { ...structuredClone(src), id: newAnimation('x').id, name: freshName(src.name + ' copy', doc.animations) };
  docStore.update('Duplicate animation', (d) => {
    d.skeleton.animations.push(copy);
  });
  selectAnimation(copy.id);
}

export function deleteAnimation(id: Id) {
  docStore.update('Delete animation', (d) => {
    // sliders that applied it simply do nothing until another animation is chosen; the mix table forgets it
    removeAnimation(d, id);
  });
  const ui = uiStore.get();
  if (ui.animationId === id) {
    const next = skeletonDoc().animations[0]?.id ?? null;
    uiStore.patch({ animationId: next, time: 0, playing: false, overrides: {}, selectedKeys: [], mode: next ? ui.mode : 'setup' });
  }
}

export function setAnimationDuration(id: Id, duration: number) {
  const anim = skeletonDoc().animations.find((a) => a.id === id);
  if (!anim) return;
  // an export derives the length from the last key, so a shorter value would play differently in the game
  const end = animationEndTime(anim);
  if (duration < end - 1e-6) toast('An animation cannot be shorter than its last key — delete or move the keys first');
  const d0 = Math.max(1 / skeletonDoc().fps, duration, end);
  docStore.update('Animation length', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === id);
    if (a) {
      a.duration = d0;
      for (const m of a.markers ?? []) m.time = Math.min(m.time, d0); // a marker never lies beyond the end
    }
  });
  if (uiStore.get().time > d0) uiStore.patch({ time: d0 });
}

export function setFps(fps: number) {
  const f = Math.max(1, Math.min(240, Math.round(fps)));
  docStore.update('Set FPS', (d) => {
    d.skeleton.fps = f;
  });
}

// ------------------------------------------------------------------ keys

export function deleteKeys(refs: KeyRef[]) {
  const anim = currentAnimation();
  if (!anim || !refs.length) return;
  docStore.update('Delete keys', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (a) removeKeys(a, refs);
  });
}

/** `ripple`: the later keys of each timeline come along (Shift keys). `loop`: the keys travel round the animation's length (Offset keys). */
export function moveKeysBy(refs: KeyRef[], dt: number, ripple = false, loop = false): KeyRef[] {
  const anim = currentAnimation();
  if (!anim || !refs.length) return refs;
  let result = refs;
  docStore.update('Move keys', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    result = moveKeys(a, refs, dt, ripple, loop ? a.duration : 0);
    // a ripple also moved keys that are not in `refs`: the animation must still cover the last one (a loop never leaves the animation)
    if (!loop) extendDuration(a, ripple ? animationEndTime(a) : Math.max(...result.map((r) => r.time)));
  });
  return result;
}

/** Sets the interpolation of the referenced keys (applies to the segment that starts at each key). */
export function setKeysCurve(refs: KeyRef[], kind: 'linear' | 'stepped' | 'bezier' | number[]) {
  const anim = currentAnimation();
  if (!anim || !refs.length) return;
  docStore.update('Set interpolation', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    for (const ref of refs) {
      const keys = resolveKeys(a, ref) as { time: number; value?: number[]; curve?: unknown }[] | undefined;
      const k = keys?.find((x) => Math.abs(x.time - ref.time) < 1e-4);
      if (!k || !('value' in k) || !k.value) continue;
      const channels = ref.kind === 'deform' ? 1 : k.value.length;
      if (kind === 'linear') delete k.curve;
      else if (kind === 'stepped') k.curve = 'stepped';
      else if (kind === 'bezier') k.curve = makeCurve('bezier', channels);
      else {
        const c: number[] = [];
        for (let i = 0; i < channels; i++) c.push(...kind.slice(0, 4));
        k.curve = c;
      }
    }
  });
  // "last chosen": the next new key starts with this interpolation (a custom curve counts as smooth)
  if (settingsStore.get().lastChosenCurve) uiStore.patch({ defaultCurve: kind === 'linear' || kind === 'stepped' ? kind : 'bezier' });
}

// ------------------------------------------------------------------ events

export function createEvent(name?: string): Id {
  const doc = skeletonDoc();
  const id = newAnimation('x').id;
  docStore.update('New event', (d) => {
    d.skeleton.events.push({ id, name: freshName(name?.trim() || 'event', doc.events), int: 0, float: 0, string: '' });
  });
  return id;
}

export function updateEvent(id: Id, patch: Partial<{ name: string; int: number; float: number; string: string; audio: string; volume: number; balance: number }>) {
  const doc = skeletonDoc();
  docStore.update('Edit event', (d) => {
    const e = d.skeleton.events.find((x) => x.id === id);
    if (!e) return;
    if (patch.name !== undefined) e.name = freshName(patch.name.trim() || e.name, doc.events.filter((x) => x.id !== id));
    if (patch.int !== undefined) e.int = Math.round(patch.int);
    if (patch.float !== undefined) e.float = patch.float;
    if (patch.string !== undefined) e.string = patch.string;
    if (patch.audio !== undefined) {
      const path = patch.audio.trim();
      if (path) e.audio = path;
      else {
        delete e.audio;
        delete e.volume;
        delete e.balance;
      }
    }
    if (e.audio) {
      if (patch.volume !== undefined) e.volume = Math.min(1, Math.max(0, patch.volume));
      if (patch.balance !== undefined) e.balance = Math.min(1, Math.max(-1, patch.balance));
    }
  });
}

export function deleteEvent(id: Id) {
  docStore.update('Delete event', (d) => {
    d.skeleton.events = d.skeleton.events.filter((e) => e.id !== id);
    for (const a of d.skeleton.animations) a.events = a.events.filter((k) => k.event !== id);
  });
}

/** Fires the event at the playhead of the current animation. */
export function keyEvent(eventId: Id) {
  const ui = uiStore.get();
  const anim = currentAnimation();
  if (!anim) {
    toast('Create an animation first');
    return;
  }
  if (ui.mode !== 'animate') setMode('animate');
  docStore.update('Key event', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    a.events.push({ time: uiStore.get().time, event: eventId });
    a.events.sort((x, y) => x.time - y.time);
    extendDuration(a, uiStore.get().time);
  });
}

// ------------------------------------------------------------------ skins

export function setActiveSkin(id: Id | null) {
  const ui = uiStore.get();
  let mix = id && ui.skinMix.includes(id) ? ui.skinMix.filter((m) => m !== id) : ui.skinMix;
  // a pinned skin stays shown when another one is chosen
  const old = ui.skinId;
  if (old && old !== id && ui.skinPins.includes(old) && !mix.includes(old) && skeletonDoc().skins.some((s) => s.id === old)) mix = [...mix, old];
  uiStore.patch({ skinId: id, skinMix: mix });
}

/**
 * Pins a skin (or lets it go): a pinned skin stays shown together with whichever skin is chosen, instead of being replaced by it.
 * Pinning a skin that is not the active one shows it at once. Editor only: the export does not change.
 */
export function toggleSkinPin(id: Id) {
  const ui = uiStore.get();
  const doc = skeletonDoc();
  if (doc.skins[0]?.id === id || !doc.skins.some((s) => s.id === id)) return;
  const pinned = ui.skinPins.includes(id);
  uiStore.patch({
    skinPins: pinned ? ui.skinPins.filter((p) => p !== id) : [...ui.skinPins, id],
    skinMix: !pinned && ui.skinId !== id && !ui.skinMix.includes(id) ? [...ui.skinMix, id] : ui.skinMix,
  });
}

/** Shows a skin together with the active one (and the others in the mix), or takes it out again. Editor only: the export does not change. */
export function toggleSkinMix(id: Id) {
  const ui = uiStore.get();
  const doc = skeletonDoc();
  if (doc.skins[0]?.id === id || ui.skinId === id || !doc.skins.some((s) => s.id === id)) return;
  uiStore.patch({ skinMix: ui.skinMix.includes(id) ? ui.skinMix.filter((m) => m !== id) : [...ui.skinMix, id] });
}

export function createSkin(name?: string): Id {
  const doc = skeletonDoc();
  const skin = newSkin(freshName(name?.trim() || 'skin', doc.skins));
  docStore.update('New skin', (d) => {
    d.skeleton.skins.push(skin);
  });
  setActiveSkin(skin.id);
  return skin.id;
}

export function renameSkin(id: Id, name: string) {
  const clean = name.trim();
  if (!clean) return;
  const doc = skeletonDoc();
  docStore.update('Rename skin', (d) => {
    const s = d.skeleton.skins.find((x) => x.id === id);
    if (s && s !== d.skeleton.skins[0]) s.name = freshName(clean, doc.skins.filter((x) => x.id !== id));
  });
}

export function deleteSkin(id: Id) {
  const doc = skeletonDoc();
  if (doc.skins[0]?.id === id) {
    toast('The default skin cannot be deleted');
    return;
  }
  docStore.update('Delete skin', (d) => {
    d.skeleton.skins = d.skeleton.skins.filter((s) => s.id !== id);
    for (const a of d.skeleton.animations) {
      delete a.deform[id];
      if (a.sequence) delete a.sequence[id];
      pruneSequences(a);
    }
  });
  if (uiStore.get().skinId === id) setActiveSkin(null);
  if (uiStore.get().skinMix.includes(id)) uiStore.patch({ skinMix: uiStore.get().skinMix.filter((m) => m !== id) });
  if (uiStore.get().skinPins.includes(id)) uiStore.patch({ skinPins: uiStore.get().skinPins.filter((m) => m !== id) });
}

/** In a non-default skin: shows `imageName` instead of the default attachment `placeholder` of a slot. */
export function setSkinImage(skinId: Id, slotId: Id, placeholder: string, imageName: string) {
  const img = project().images.find((i) => i.name === imageName);
  if (!img) return;
  docStore.update('Skin image', (d) => {
    putSkinImage(d.skeleton as SkeletonDoc, skinId, slotId, placeholder, img);
  });
}

/**
 * Makes the skin of a prefix from the pictures that carry it ("arctic/head", "arctic-head" -> the skin "arctic" shows that picture where the
 * default skin has "head"). A skin of that name that already exists gets the new pictures. One step in the history. Returns the skin, or null
 * when no picture of the prefix fits an attachment.
 */
export function createSkinFromImages(prefix: string): Id | null {
  const picks = planSkinImages(skeletonDoc(), project().images, prefix);
  if (!picks.length) {
    toast('No picture with that prefix fits an attachment', 'error');
    return null;
  }
  let result = { skinId: '' as Id, placed: 0 };
  docStore.update('Skin from images', (d) => {
    result = applySkinPicks(d.skeleton as SkeletonDoc, prefix, picks, d.images as ImageRef[]);
  });
  if (!result.placed) return null;
  setActiveSkin(result.skinId);
  const odd = picks.filter((p) => p.sizeDiffers).length;
  toast(odd ? `Skin made from ${result.placed} pictures; ${odd} of a different size than the mesh` : `Skin made from ${result.placed} pictures`, odd ? 'info' : 'ok');
  return result.skinId;
}

/**
 * Makes a mesh of the default skin follow the shape of another mesh of it (two slots that share one shape: a left and a right arm).
 * The mesh keeps its picture, colour and sequence; its own shape is replaced by the source's (undo brings it back).
 */
export function linkMeshTo(slotId: Id, name: string, source: { slotId: Id; name: string }) {
  const doc = docStore.get().skeleton;
  const skin = doc.skins[0];
  const own = skin.attachments[slotId]?.[name];
  const src = skin.attachments[source.slotId]?.[source.name];
  if (own?.type !== 'mesh' || src?.type !== 'mesh' || src === own) return;
  if (src.link) {
    toast('That mesh is a linked mesh itself: link to the mesh it follows', 'error');
    return;
  }
  if (linkedTo(doc, skin.id, slotId, name).length) {
    toast('Other meshes follow this one: unlink them first', 'error');
    return;
  }
  docStore.update('Link mesh', (d) => {
    const m = d.skeleton.skins[0].attachments[slotId]?.[name];
    if (m?.type === 'mesh') m.link = makeLink(d.skeleton, slotId, { skinId: d.skeleton.skins[0].id, slotId: source.slotId, name: source.name });
  });
}

/** Whether a linked mesh keeps using the deform timelines of its source mesh. */
export function setLinkDeform(skinId: Id, slotId: Id, name: string, on: boolean) {
  docStore.update('Linked mesh deform', (d) => {
    const m = d.skeleton.skins.find((s) => s.id === skinId)?.attachments[slotId]?.[name];
    if (m?.type === 'mesh' && m.link) m.link.deform = on;
  });
}

/** Cuts a linked mesh loose from its source: it keeps the shape it has now and can be edited on its own. */
export function unlinkMesh(skinId: Id, slotId: Id, name: string) {
  docStore.update('Unlink mesh', (d) => {
    const m = d.skeleton.skins.find((s) => s.id === skinId)?.attachments[slotId]?.[name];
    if (m?.type === 'mesh') delete m.link;
  });
}

export function removeSkinImage(skinId: Id, slotId: Id, placeholder: string) {
  docStore.update('Remove skin image', (d) => {
    const skin = d.skeleton.skins.find((s) => s.id === skinId);
    if (skin) delete skin.attachments[slotId]?.[placeholder];
  });
}

// ------------------------------------------------------------------ images

/** Renames an image; every attachment that shows it follows. Returns the new name, or null when it was refused. */
export function renameImageAction(from: string, raw: string): string | null {
  const to = cleanImageName(raw);
  if (!to) {
    toast('An image needs a name', 'error');
    return null;
  }
  if (to === from) return from;
  if (skeletonList(project()).some((d) => sequenceFrameOwner(d, from))) {
    toast('This picture is a frame of a sequence: its name is the sequence path and a number, so it is renamed there', 'error');
    return null;
  }
  if (project().images.some((i) => i.name === to)) {
    toast(`There is already an image called "${to}"`, 'error');
    return null;
  }
  assets.alias(from, to);
  let ok = false;
  docStore.update('Rename image', (d) => {
    ok = renameImage(d, from, to).ok;
  });
  return ok ? to : null;
}

/** Makes Undo and Redo of the last step swap the pixels behind the pictures too (the document only holds their size). */
function keepPixelsForUndo(changes: { name: string; before: ImageAsset | undefined; after: ImageAsset }[]) {
  docStore.attachEffect({
    undo: () => changes.forEach((c) => assets.swap(c.name, c.before)),
    redo: () => changes.forEach((c) => assets.swap(c.name, c.after)),
  });
}

/** Puts new pixels behind an image name. The attachments keep their size on screen; the atlas gets the new picture. */
export async function replaceImagePixels(name: string, file: File | Blob): Promise<void> {
  try {
    const asset = await assets.decode(name, file);
    const before = assets.get(name);
    assets.set(name, asset);
    docStore.update('Replace image', (d) => {
      const img = d.images.find((i) => i.name === name);
      if (img) {
        img.width = asset.width;
        img.height = asset.height;
        img.rev = (img.rev ?? 0) + 1; // a same-size repaint still counts as a step of its own
      }
    });
    keepPixelsForUndo([{ name, before, after: assets.get(name)! }]);
    toast(`Replaced "${name}" (${asset.width}×${asset.height})`, 'ok');
  } catch (e) {
    toast(`Could not read that image: ${(e as Error).message}`, 'error');
  }
}

/** Removes every image that no attachment shows. */
export function removeUnusedImages(): number {
  const names = unusedImages(project());
  if (!names.length) {
    toast('Every image is in use', 'info');
    return 0;
  }
  docStore.update('Remove unused images', (d) => {
    d.images = d.images.filter((i) => !names.includes(i.name));
  });
  // the pixels stay in memory so that undo brings the images back; a saved project only carries the images it lists
  toast(`Removed ${names.length} unused image${names.length === 1 ? '' : 's'}`, 'ok');
  return names.length;
}

export function duplicateSkinAction(id: Id, opts?: DuplicateSkinOptions, pictures?: { find: string; replace: string }) {
  let made: Id | null = null;
  let repointed = 0;
  docStore.update('Duplicate skin', (d) => {
    made = duplicateSkin(d.skeleton, id, opts)?.id ?? null;
    // the copy shows pictures of its own: a part of the picture names is swapped, where the swapped name is a picture that exists
    if (made && pictures?.find) repointed = repointSkinPictures(d.skeleton, made, pictures.find, pictures.replace, new Set(d.images.map((i) => i.name)));
  });
  if (made) {
    setActiveSkin(made);
    if (pictures?.find) toast(repointed ? `Duplicated, ${repointed} pictures point at other pictures` : 'Duplicated, no picture name matched a picture that exists', repointed ? 'ok' : 'info');
  } else toast('The default skin cannot be duplicated');
}

/** Merges a skin into another: its attachments (and, with the options, bones, constraints and keys) are copied there; the skin itself stays. */
export function mergeSkinAction(fromId: Id, intoId: Id, opts?: MergeSkinOptions) {
  let result: { added: number; replaced: number } | null = null;
  let into = '';
  docStore.update('Merge skins', (d) => {
    result = mergeSkin(d.skeleton, fromId, intoId, opts);
    into = d.skeleton.skins.find((s) => s.id === intoId)?.name ?? '';
  });
  const r = result as { added: number; replaced: number } | null;
  if (!r) toast('Pick another skin to merge into');
  else if (!r.added && !r.replaced) toast('Nothing to merge: every attachment is already there', 'info');
  else toast(`Merged into "${into}": ${r.added} added, ${r.replaced} replaced`, 'ok');
  return r;
}

/** "Skin required": the bone or constraint is only active in the skins that list it. */
export function setSkinRequiredAction(kind: ScopeKind, id: Id, required: boolean) {
  docStore.update(required ? 'Require skin' : 'Always active', (d) => setSkinRequired(d.skeleton, kind, id, required));
}

export function setSkinScopeAction(skinId: Id, kind: ScopeKind, id: Id, on: boolean) {
  docStore.update('Skin scope', (d) => setSkinScope(d.skeleton, skinId, kind, id, on));
}

export function toggleSkinOverride(skinId: Id, slotId: Id, name: string) {
  docStore.update('Skin attachment', (d) => void toggleOverride(d.skeleton, skinId, slotId, name));
}

/** Edits one channel of one key (graph editor). */
export function setKeyChannelValue(ref: KeyRef, channel: number, value: number) {
  const anim = currentAnimation();
  if (!anim) return;
  docStore.update('Edit key value', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    const keys = resolveKeys(a, ref) as { time: number; value?: number[] }[] | undefined;
    const k = keys?.find((x) => Math.abs(x.time - ref.time) < 1e-4);
    if (k?.value) k.value[channel] = value;
  });
}

/** Moves one bezier handle (1 or 2) of a key's curve for a channel. x in 0..1 of the segment, y relative to the value change. */
export function setKeyCurveHandle(ref: KeyRef, channel: number, handle: 1 | 2, nx: number, ny: number) {
  const anim = currentAnimation();
  if (!anim) return;
  docStore.update('Edit curve', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    const keys = resolveKeys(a, ref) as { time: number; value?: number[]; curve?: unknown }[] | undefined;
    const k = keys?.find((x) => Math.abs(x.time - ref.time) < 1e-4);
    if (!k || !k.value) return;
    const channels = ref.kind === 'deform' ? 1 : k.value.length;
    let curve = k.curve;
    if (!Array.isArray(curve)) {
      curve = [];
      for (let c = 0; c < channels; c++) (curve as number[]).push(1 / 3, 1 / 3, 2 / 3, 2 / 3);
    }
    const arr = curve as number[];
    const i = channel * 4 + (handle === 1 ? 0 : 2);
    arr[i] = Math.max(0, Math.min(1, nx));
    arr[i + 1] = ny;
    k.curve = arr;
  });
}

interface ClipKey {
  kind: KeyRef['kind'];
  target: Id;
  prop: string;
  dt: number;
  key: Record<string, unknown>;
}
let clipboard: ClipKey[] = [];

export function copyKeys(refs: KeyRef[]) {
  const anim = currentAnimation();
  if (!anim || !refs.length) return;
  const min = Math.min(...refs.map((r) => r.time));
  clipboard = [];
  for (const r of refs) {
    const keys = resolveKeys(anim, r);
    const k = keys?.find((x) => Math.abs(x.time - r.time) < 1e-4);
    if (k) clipboard.push({ kind: r.kind, target: r.target, prop: r.prop, dt: r.time - min, key: structuredClone(k) as Record<string, unknown> });
  }
  toast(`Copied ${clipboard.length} key${clipboard.length === 1 ? '' : 's'}`);
}

export function pasteKeys(time: number): KeyRef[] {
  const anim = currentAnimation();
  if (!anim || !clipboard.length) return [];
  const out: KeyRef[] = [];
  const doc = skeletonDoc();
  const fps = doc.fps;
  // keys copied from one bone go onto the bone that is selected now (the other arm), keys from several bones onto as many selected bones, else back where they came from
  const sel = uiStore.get().selection;
  const items = retargetClip(
    clipboard,
    sel.bones.filter((id) => doc.bones.some((b) => b.id === id)),
    sel.slot && doc.slots.some((s) => s.id === sel.slot) ? sel.slot : null,
    doc.bones.map((b) => b.id),
  );
  docStore.update('Paste keys', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    for (const original of items) {
      let c = original;
      // colour keys follow the target slot: two-colour keys need a dark colour there, and a two-colour slot keeps its kind of keys
      if (c.kind === 'slot' && (c.prop === 'rgba' || c.prop === 'rgba2')) {
        const dark = !!d.skeleton.slots.find((s) => s.id === c.target)?.dark;
        if (c.prop === 'rgba2' && !dark) c = { ...c, prop: 'rgba', key: rgba2ToRgba([c.key as unknown as Key])[0] as unknown as Record<string, unknown> }; // the curve loses its dark channels too
        else if (c.prop === 'rgba' && dark) continue;
      }
      const t = snapTime(time + c.dt, fps);
      let keys = resolveKeys(a, c);
      if (!keys) {
        // create the timeline container
        if (c.kind === 'bone') (ensureBoneTimelines(a, c.target) as Record<string, unknown>)[c.prop] = keys = [];
        else if (c.kind === 'slot') ((a.slots[c.target] ??= {}) as Record<string, unknown>)[c.prop] = keys = [];
        else if (c.kind === 'ik') keys = a.ik[c.target] = [];
        else if (c.kind === 'transform') keys = (a.transform[c.target] = []);
        else if (c.kind === 'slider') ((a.slider[c.target] ??= {}) as Record<string, unknown>)[c.prop] = keys = [];
        else if (c.kind === 'path') ((a.path[c.target] ??= {}) as Record<string, unknown>)[c.prop] = keys = [];
        else if (c.kind === 'physics') ((a.physics[c.target] ??= {}) as Record<string, unknown>)[c.prop] = keys = [];
        else if (c.kind === 'deform') {
          const [skinId, att] = c.prop.split('\u0001');
          keys = (((a.deform[skinId] ??= {})[c.target] ??= {})[att] = []) as unknown as { time: number }[];
        } else if (c.kind === 'sequence') {
          const [skinId, att] = c.prop.split('\u0001');
          keys = ((((a.sequence ??= {})[skinId] ??= {})[c.target] ??= {})[att] = []) as unknown as { time: number }[];
        }
      }
      if (!keys) continue;
      // a pasted key that says what the key there already says changes nothing, so the curve that was drawn on it stays
      const there = (keys as { time: number }[]).find((k) => Math.abs(k.time - t) <= KEY_EPS);
      if (!there || !sameKeyValue(there, c.key)) upsertKey(keys as { time: number }[], { ...c.key, time: t } as { time: number });
      out.push({ kind: c.kind, target: c.target, prop: c.prop, time: t });
    }
    extendDuration(a, Math.max(...out.map((o) => o.time)));
  });
  return out;
}

export { RAD2DEG };
