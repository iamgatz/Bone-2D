import { duplicateBones } from '@/core/duplicate';
import type { BonePose, Id, PoseEntry } from '@/core/model';
import { blendPose, newPose, newPoseName } from '@/core/poses';
import { currentPose, setBonePose, setSelection } from './actions';
import type { PoseProps } from './actions';
import { docStore } from './doc';
import { setupMats } from './meshActions';
import { toast, uiStore } from './ui';

/** Bones to act on: the selected ones, or every bone when nothing is selected. */
function targets(): Id[] {
  const doc = docStore.get().skeleton;
  const sel = uiStore.get().selection.bones.filter((id) => doc.bones.some((b) => b.id === id));
  return sel.length ? sel : doc.bones.map((b) => b.id);
}

/** Sets the pose of the selected bones (all bones when none is selected) back to the setup pose. Animate mode: keys the setup values at the playhead. */
export function resetPose() {
  const ui = uiStore.get();
  if (ui.mode !== 'animate') {
    toast('Reset pose works in Animate mode: the setup pose is what you edit in Setup mode');
    return;
  }
  const doc = docStore.get().skeleton;
  const ids = targets();
  if (!ui.autoKey) {
    // no keys are being written: drop the unkeyed edits of those bones
    const overrides = { ...ui.overrides };
    for (const id of ids) delete overrides[id];
    uiStore.patch({ overrides });
    return;
  }
  const updates = ids.flatMap((id) => {
    const b = doc.bones.find((x) => x.id === id);
    return b ? [{ id, props: { x: b.x, y: b.y, rotation: b.rotation, scaleX: b.scaleX, scaleY: b.scaleY, shearX: b.shearX, shearY: b.shearY } }] : [];
  });
  setBonePose(updates, 'Reset pose');
}

let poseClipboard: Record<string, Required<PoseProps>> | null = null;

/** Remembers the pose of the selected bones (all bones when none is selected), by bone name. */
export function copyPose() {
  const doc = docStore.get().skeleton;
  const clip: Record<string, Required<PoseProps>> = {};
  for (const id of targets()) {
    const pose = currentPose(id);
    const bone = doc.bones.find((b) => b.id === id);
    if (pose && bone) clip[bone.name] = pose;
  }
  poseClipboard = clip;
  toast(`Pose of ${Object.keys(clip).length} bones copied`, 'ok');
}

/** Applies a copied pose to the bones with the same names (the selected ones, or all of them). */
export function pastePose() {
  if (!poseClipboard) {
    toast('Copy a pose first');
    return;
  }
  const doc = docStore.get().skeleton;
  const clip = poseClipboard;
  const updates = targets().flatMap((id) => {
    const bone = doc.bones.find((b) => b.id === id);
    const pose = bone && clip[bone.name];
    return pose ? [{ id, props: pose }] : [];
  });
  if (!updates.length) {
    toast('No bone with a copied name is selected');
    return;
  }
  setBonePose(updates, 'Paste pose');
}

/** Copies the selected bones with their children, slots and images; a mirrored copy is reflected across the vertical axis. */
export function duplicateSelection(mirror: boolean) {
  const ui = uiStore.get();
  if (ui.mode !== 'setup') {
    toast('Duplicating bones works in Setup mode');
    return;
  }
  const doc = docStore.get().skeleton;
  if (!ui.selection.bones.length) {
    toast('Select a bone first');
    return;
  }
  if (!ui.selection.bones.some((id) => doc.bones.find((b) => b.id === id)?.parent)) {
    toast('The root bone cannot be copied');
    return;
  }
  const { mats } = setupMats();
  let made: { bones: Id[]; slots: Id[] } = { bones: [], slots: [] };
  docStore.update(mirror ? 'Mirror bones' : 'Duplicate bones', (d) => {
    made = duplicateBones(d.skeleton, mats, ui.selection.bones, mirror);
  });
  if (!made.bones.length) {
    toast('The root bone cannot be copied');
    return;
  }
  setSelection({ bones: made.bones });
  toast('Copied with the slots and images. Constraints and animation keys are not copied');
}

// ---------------------------------------------------------------- the pose library (kept in the project file, not exported)

/** The pose of the selected bones (all bones when none is selected) as it is shown now, by bone name. */
function capture(): Record<string, BonePose> {
  const doc = docStore.get().skeleton;
  const out: Record<string, BonePose> = {};
  for (const id of targets()) {
    const pose = currentPose(id);
    const bone = doc.bones.find((b) => b.id === id);
    if (pose && bone) out[bone.name] = pose;
  }
  return out;
}

/** Keeps the pose of the selected bones (all when none is selected) in the library under a name. Returns it. */
export function savePose(name?: string): PoseEntry | null {
  const bones = capture();
  if (!Object.keys(bones).length) {
    toast('There is no bone to keep a pose of');
    return null;
  }
  const entry = newPose(docStore.get().poses ?? [], bones, name);
  docStore.update('Save pose', (d) => {
    (d.poses ??= []).push(entry);
  });
  toast(`Pose "${entry.name}" kept: ${Object.keys(bones).length} bones`, 'ok');
  return entry;
}

/** Puts a kept pose on the selected bones (all when none is selected) that it knows by name; amount 0..1 goes part of the way from the current pose. */
export function applyPose(id: Id, amount = 1): number {
  const entry = (docStore.get().poses ?? []).find((p) => p.id === id);
  if (!entry) return 0;
  const doc = docStore.get().skeleton;
  const updates = targets().flatMap((boneId) => {
    const bone = doc.bones.find((b) => b.id === boneId);
    const target = bone && entry.bones[bone.name];
    const cur = currentPose(boneId);
    return target && cur ? [{ id: boneId, props: blendPose(cur, target, amount) }] : [];
  });
  if (!updates.length) {
    toast('No selected bone is in this pose');
    return 0;
  }
  setBonePose(updates, `Apply pose "${entry.name}"`);
  return updates.length;
}

/** Replaces the bones of a kept pose with the pose of the selected bones (all when none is selected). */
export function overwritePose(id: Id) {
  const bones = capture();
  if (!Object.keys(bones).length) return;
  docStore.update('Update pose', (d) => {
    const p = d.poses?.find((x) => x.id === id);
    if (p) p.bones = bones;
  });
}

export function renamePose(id: Id, name: string) {
  const list = docStore.get().poses ?? [];
  const entry = list.find((p) => p.id === id);
  const wanted = name.trim();
  if (!entry || !wanted || wanted === entry.name) return;
  const next = newPoseName(list.filter((p) => p.id !== id), wanted);
  docStore.update('Rename pose', (d) => {
    const p = d.poses?.find((x) => x.id === id);
    if (p) p.name = next;
  });
}

export function deletePose(id: Id) {
  docStore.update('Delete pose', (d) => {
    if (d.poses) d.poses = d.poses.filter((p) => p.id !== id);
  });
}
