/** The auto-rig carried out on the document: the pictures are looked at, the planned bones are made and the pictures go on them. */
import { guessPart, planRig, sampleShape } from '@/core/autorig';
import type { Part, RigLayer, RigOptions, RigPlan, Side } from '@/core/autorig';
import { matApply } from '@/core/math';
import { imageToBoneSpace } from '@/core/mesh';
import { newBone } from '@/core/model';
import type { Id, RegionAttachment } from '@/core/model';
import { setupPicture } from '@/core/sequence';
import { project, skeletonDoc } from './accessors';
import { assets } from './assets';
import { createBoneWorld } from './boneActions';
import { docStore } from './doc';
import { createIkFromDrag } from './ikActions';
import { bendMesh, setupMats } from './meshActions';
import { setSelection } from './sessionActions';
import { setSlotBone } from './slotActions';
import { toast, uiStore } from './ui';

/** A slot whose picture the auto-rig can put on a bone. */
export interface RigCandidate {
  slotId: Id;
  slot: string;
  /** The picture the slot shows, its size, and where the setup pose puts its top left, top right and bottom left corners. */
  image: string;
  width: number;
  height: number;
  corners: [number, number][];
  /** What the names say it is; a slot that already has a bone of its own is left alone unless asked. */
  part: Part;
  side: Side;
}

export interface RigChoice {
  slotId: Id;
  part: Part;
  side: Side;
}

/** The picture a slot shows in the default skin, when it is a plain picture. */
function pictureOf(slotId: Id): RegionAttachment | null {
  const doc = skeletonDoc();
  const slot = doc.slots.find((s) => s.id === slotId);
  const att = slot?.attachment ? doc.skins[0].attachments[slotId]?.[slot.attachment] : undefined;
  return att?.type === 'region' ? att : null;
}

export function rigCandidates(): RigCandidate[] {
  const doc = skeletonDoc();
  const root = doc.bones.find((b) => !b.parent)?.id;
  const { slotMat } = setupMats();
  return doc.slots.flatMap((slot) => {
    const att = pictureOf(slot.id);
    if (!att) return [];
    const image = setupPicture(att) ?? att.path;
    const size = project().images.find((i) => i.name === image) ?? att;
    const toBone = imageToBoneSpace(att, size.width, size.height);
    const bone = slotMat(slot.id);
    const corner = (x: number, y: number) => matApply(bone, ...toBone(x, y));
    const byPicture = guessPart(att.path ?? att.name);
    const guess = byPicture.part === 'near' ? guessPart(slot.name) : byPicture;
    const free = slot.bone === root;
    return [
      {
        slotId: slot.id,
        slot: slot.name,
        image,
        width: size.width,
        height: size.height,
        corners: [corner(0, 0), corner(size.width, 0), corner(0, size.height)],
        part: free ? guess.part : 'keep',
        side: guess.side,
      },
    ];
  });
}

/** The opaque places of every chosen picture, where the setup pose shows them. Pictures do not change while the choices do. */
export function rigShapes(slotIds: readonly Id[]): Map<Id, Pick<RigLayer, 'points' | 'step'>> {
  const { slotMat } = setupMats();
  const out = new Map<Id, Pick<RigLayer, 'points' | 'step'>>();
  for (const slotId of slotIds) {
    const att = pictureOf(slotId);
    const img = att && assets.getImageData(setupPicture(att) ?? att.path);
    if (!att || !img) continue;
    const toBone = imageToBoneSpace(att, img.width, img.height);
    const bone = slotMat(slotId);
    out.set(
      slotId,
      sampleShape(img.data, img.width, img.height, (px, py) => matApply(bone, ...toBone(px, py))),
    );
  }
  return out;
}

export function planFor(choices: readonly RigChoice[], shapes: ReturnType<typeof rigShapes>, opts: RigOptions): RigPlan {
  return planRig(
    choices.flatMap((c) => {
      const shape = shapes.get(c.slotId);
      return shape ? [{ id: c.slotId, part: c.part, side: c.side, ...shape }] : [];
    }),
    opts,
  );
}

/** Builds the skeleton the choices describe, in one step of the history. */
export function autoRig(choices: readonly RigChoice[], opts: RigOptions): { bones: number; meshes: number; ik: number } {
  const none = { bones: 0, meshes: 0, ik: 0 };
  const plan = planFor(choices, rigShapes(choices.map((c) => c.slotId)), opts);
  if (!plan.bones.length) {
    toast('Auto-rig found no body parts: say what the layers show', 'info');
    return none;
  }
  // the rig is built in the setup pose
  uiStore.patch({ mode: 'setup', playing: false, overrides: {} });
  let meshes = 0;
  let ik = 0;
  docStore.beginGesture('Auto-rig');
  try {
    let root = skeletonDoc().bones.find((b) => !b.parent)?.id;
    if (!root) {
      const bone = newBone({ name: 'root' });
      docStore.update('Auto-rig', (d) => void d.skeleton.bones.push(bone));
      root = bone.id;
    }
    const ids = new Map<string, Id>();
    for (const b of plan.bones) {
      const id = createBoneWorld({
        name: b.name,
        parent: (b.parent && ids.get(b.parent)) || root,
        x: b.from[0],
        y: b.from[1],
        tipX: b.to[0],
        tipY: b.to[1],
      });
      if (id) ids.set(b.key, id);
    }
    for (const layer of plan.layers) {
      const bones = layer.bones.flatMap((key) => ids.get(key) ?? []);
      if (!bones.length) continue;
      setSlotBone(layer.id, bones[0]);
      const att = pictureOf(layer.id);
      if (bones.length > 1 && att) {
        bendMesh(layer.id, att.name, bones, layer.joints);
        meshes++;
      }
    }
    for (const c of plan.ik) {
      const end = ids.get(c.end);
      if (end && createIkFromDrag(end, null, c.at[0], c.at[1])) ik++;
    }
  } finally {
    docStore.endGesture();
  }
  setSelection({});
  uiStore.patch({ tool: 'select' });
  const done = { bones: plan.bones.length, meshes, ik };
  toast(`Auto-rig: bones ${done.bones}, meshes ${done.meshes}, IK constraints ${done.ik}`, 'ok', 5000);
  return done;
}
