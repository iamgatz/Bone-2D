/** Every user-level operation on the document / UI. Components and tools call these; they never mutate state directly. */
import type { Draft } from 'immer';
import { animationEndTime } from '@/core/animate';
import { DEFAULT_TOLERANCE, bakeAnimation, scaleTolerance, simplifyAnimation } from '@/core/bake';
import type { BakeOptions } from '@/core/bake';
import { cleanUpAnimation } from '@/core/cleanup';
import { closeLoop } from '@/core/loops';
import { findAnimation, freshName, makeCurve, normalizeBoneOrder, pruneSequences, purgeAttachment, removeBones, removeSlots, rgbaToRgba2, setSlotDarkColor, snapTime, upsertKey, decompose } from '@/core/edit';
import type { BoneMats } from '@/core/mesh';
import { moveKeys, removeKeys, resolveKeys } from '@/core/keyrefs';
import { duplicateSkin, setSkinRequired, setSkinScope, toggleOverride } from '@/core/skins';
import type { ScopeKind } from '@/core/skins';
import type { KeyRef } from '@/core/keyrefs';
import { RAD2DEG, atan2Deg, matInvert, matMul } from '@/core/math';
import type { Mat } from '@/core/math';
import { newAnimation, newBone, newSkin, newSlot } from '@/core/model';
import { playSpan } from '@/core/playback';
import { cleanImageName, renameImage, sequenceFrameOwner, unusedImages } from '@/core/images';
import type { Animation, Bone, Id, Inherit, Project, RGB, RGBA, Slot } from '@/core/model';
import { getScene, getSetupSkeleton } from '@/editor/scene';
import { assets } from './assets';
import { docStore } from './doc';
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

const POSE_TIMELINE: Record<keyof PoseProps, 'rotate' | 'translate' | 'scale' | 'shear'> = {
  rotation: 'rotate',
  x: 'translate',
  y: 'translate',
  scaleX: 'scale',
  scaleY: 'scale',
  shearX: 'shear',
  shearY: 'shear',
};

function ensureBoneTimelines(a: Draft<Animation>, id: Id) {
  return (a.bones[id] ??= {});
}

/** Writes keys for the given bone pose props at `time` into an animation draft. */
function keyBoneInDraft(d: Draft<Project>, anim: Draft<Animation>, boneId: Id, pose: Required<PoseProps>, touched: Set<'rotate' | 'translate' | 'scale' | 'shear'>, time: number, curveKind: 'linear' | 'bezier' | 'stepped') {
  const setup = d.skeleton.bones.find((b) => b.id === boneId);
  if (!setup) return;
  const tl = ensureBoneTimelines(anim, boneId);
  const key = (channels: number, value: number[]) => ({ time, value, ...(makeCurve(curveKind, channels) !== undefined ? { curve: makeCurve(curveKind, channels) } : {}) });
  const put = (prop: 'rotate' | 'translate' | 'scale' | 'shear', value: number[]) => {
    const keys = (tl[prop] ??= []);
    const k = key(value.length, value);
    const exist = keys.find((x) => Math.abs(x.time - time) < 1e-4);
    if (exist) exist.value = value;
    else upsertKey(keys, k);
  };
  if (touched.has('rotate')) put('rotate', [pose.rotation - setup.rotation]);
  if (touched.has('translate')) put('translate', [pose.x - setup.x, pose.y - setup.y]);
  if (touched.has('scale')) put('scale', [setup.scaleX !== 0 ? pose.scaleX / setup.scaleX : 1, setup.scaleY !== 0 ? pose.scaleY / setup.scaleY : 1]);
  if (touched.has('shear')) put('shear', [pose.shearX - setup.shearX, pose.shearY - setup.shearY]);
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
  if (ui.mode === 'setup') {
    docStore.update(label, (d) => {
      for (const u of updates) {
        const b = d.skeleton.bones.find((x) => x.id === u.id);
        if (b) Object.assign(b, u.props);
      }
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
      const touched = new Set<'rotate' | 'translate' | 'scale' | 'shear'>();
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

/** Keys the current pose of the selected bones (all four transform timelines or a subset). */
export function keySelectedBones(which: ('rotate' | 'translate' | 'scale' | 'shear')[] = ['rotate', 'translate', 'scale', 'shear']) {
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

export async function importImageFiles(files: File[]): Promise<string[]> {
  const added: string[] = [];
  for (const f of files) {
    if (!/^image\/(png|jpeg|webp|gif)/.test(f.type) && !/\.(png|jpe?g|webp|gif)$/i.test(f.name)) continue;
    try {
      const ref = await assets.addFile(f);
      docStore.update('Import image', (d) => {
        d.images.push(ref);
      });
      added.push(ref.name);
    } catch (e) {
      toast(`Could not read ${f.name}`, 'error');
      console.error(e);
    }
  }
  if (added.length) toast(`Imported ${added.length} image${added.length > 1 ? 's' : ''}`, 'ok');
  return added;
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
  toast(`Baked into "${baked.name}": ${Object.keys(baked.bones).length} bones carry keys`, 'ok');
  return baked.id;
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
    d.skeleton.animations = d.skeleton.animations.filter((a) => a.id !== id);
    // sliders that applied it simply do nothing until another animation is chosen
    for (const c of d.skeleton.constraints) if (c.type === 'slider' && c.animation === id) c.animation = null;
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
    if (a) a.duration = d0;
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

export function updateEvent(id: Id, patch: Partial<{ name: string; int: number; float: number; string: string }>) {
  const doc = skeletonDoc();
  docStore.update('Edit event', (d) => {
    const e = d.skeleton.events.find((x) => x.id === id);
    if (!e) return;
    if (patch.name !== undefined) e.name = freshName(patch.name.trim() || e.name, doc.events.filter((x) => x.id !== id));
    if (patch.int !== undefined) e.int = Math.round(patch.int);
    if (patch.float !== undefined) e.float = patch.float;
    if (patch.string !== undefined) e.string = patch.string;
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
  uiStore.patch({ skinId: id });
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
}

/** In a non-default skin: shows `imageName` instead of the default attachment `placeholder` of a slot. */
export function setSkinImage(skinId: Id, slotId: Id, placeholder: string, imageName: string) {
  const img = project().images.find((i) => i.name === imageName);
  if (!img) return;
  docStore.update('Skin image', (d) => {
    const def = d.skeleton.skins[0].attachments[slotId]?.[placeholder];
    const skin = d.skeleton.skins.find((s) => s.id === skinId);
    if (!skin || !def) return;
    const base = def.type === 'region' ? def : { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    (skin.attachments[slotId] ??= {})[placeholder] = {
      type: 'region',
      name: placeholder,
      path: img.name,
      x: base.x,
      y: base.y,
      rotation: base.rotation,
      scaleX: base.scaleX,
      scaleY: base.scaleY,
      width: img.width,
      height: img.height,
      color: [1, 1, 1, 1],
    };
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
  if (sequenceFrameOwner(project().skeleton, from)) {
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

/** Puts new pixels behind an image name. The attachments keep their size on screen; the atlas gets the new picture. */
export async function replaceImagePixels(name: string, file: File | Blob): Promise<void> {
  try {
    const asset = await assets.decode(name, file);
    assets.set(name, asset);
    docStore.update('Replace image', (d) => {
      const img = d.images.find((i) => i.name === name);
      if (img) {
        img.width = asset.width;
        img.height = asset.height;
      }
    });
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

export function duplicateSkinAction(id: Id) {
  let made: Id | null = null;
  docStore.update('Duplicate skin', (d) => {
    made = duplicateSkin(d.skeleton, id)?.id ?? null;
  });
  if (made) setActiveSkin(made);
  else toast('The default skin cannot be duplicated');
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
  const fps = skeletonDoc().fps;
  docStore.update('Paste keys', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    for (const c of clipboard) {
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
      upsertKey(keys as { time: number }[], { ...c.key, time: t } as { time: number });
      out.push({ kind: c.kind, target: c.target, prop: c.prop, time: t });
    }
    extendDuration(a, Math.max(...out.map((o) => o.time)));
  });
  return out;
}

export { RAD2DEG };
