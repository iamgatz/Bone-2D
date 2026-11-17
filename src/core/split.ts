/**
 * Split bone (Spine: the Split button in the bone properties, with Nested and Fibonacci boxes): cuts one bone into several shorter ones
 * along its own x axis. The original keeps its name, its slots, weights and keys and becomes the first part; the new parts have no keys.
 * Nested: every new part is a child of the one before it (a chain: tail, spine, tentacle). Not nested: the parts stand side by side as
 * siblings under the parent of the original. Equal lengths, or Fibonacci (each part shorter than the one before: 5 3 2 1 1).
 * In the nested case the children of the original go to the part they sit on (by their x), so a hand at the end of a forearm follows the last part.
 */
import { DEG2RAD } from './math';
import type { Bone, Id, SkeletonDoc } from './model';
import { newBone } from './model';
import { freshName, normalizeBoneOrder } from './edit';

export const MAX_SPLIT = 32;

export interface SplitOptions {
  nested: boolean;
  fibonacci: boolean;
}

/** Lengths of `count` parts that add up to `total`. Fibonacci: the longest first (…5, 3, 2, 1, 1). */
export function splitLengths(total: number, count: number, fibonacci: boolean): number[] {
  const w: number[] = [];
  if (fibonacci) {
    let a = 1;
    let b = 1;
    for (let i = 0; i < count; i++) {
      w.push(a);
      [a, b] = [b, a + b];
    }
    w.reverse();
  } else for (let i = 0; i < count; i++) w.push(1);
  const sum = w.reduce((s, x) => s + x, 0);
  return w.map((x) => (total * x) / sum);
}

/** Splits the bone in the document. Returns the ids of the new parts in order, or an error text. */
export function splitBoneInDoc(doc: SkeletonDoc, id: Id, count: number, opts: SplitOptions): { ids: Id[] } | { error: string } {
  const bone = doc.bones.find((b) => b.id === id);
  if (!bone) return { error: 'Bone not found' };
  const n = Math.round(count);
  if (!(n >= 2) || n > MAX_SPLIT) return { error: `Split into 2 to ${MAX_SPLIT} bones` };
  if (!opts.nested && !bone.parent) return { error: 'The root bone can only be split nested' };
  if (!(bone.length > 0)) return { error: 'The bone has no length to split' };
  const lens = splitLengths(bone.length, n, opts.fibonacci);
  const offsets: number[] = [];
  let at = 0;
  for (const l of lens) {
    offsets.push(at);
    at += l;
  }
  const originalChildren = doc.bones.filter((b) => b.parent === id);
  const parts: Bone[] = [];
  const baseName = bone.name;
  for (let i = 1; i < n; i++) {
    const name = freshName(`${baseName}${i + 1}`, [...doc.bones, ...parts]);
    if (opts.nested) {
      parts.push(newBone({ name, parent: i === 1 ? id : parts[i - 2].id, x: lens[i - 1], length: lens[i], color: bone.color, skinRequired: bone.skinRequired }));
    } else {
      // along the bone's own x axis, in the space of its parent
      const ang = (bone.rotation + bone.shearX) * DEG2RAD;
      parts.push(
        newBone({
          name,
          parent: bone.parent,
          x: bone.x + Math.cos(ang) * bone.scaleX * offsets[i],
          y: bone.y + Math.sin(ang) * bone.scaleX * offsets[i],
          rotation: bone.rotation,
          scaleX: bone.scaleX,
          scaleY: bone.scaleY,
          shearX: bone.shearX,
          shearY: bone.shearY,
          inherit: bone.inherit,
          length: lens[i],
          color: bone.color,
          skinRequired: bone.skinRequired,
        }),
      );
    }
  }
  bone.length = lens[0];
  if (opts.nested) {
    // the parts are the original's frame moved along x, so a child only needs its x shifted
    for (const ch of originalChildren) {
      let k = 0;
      for (let i = 1; i < n; i++) if (ch.x >= offsets[i] - 1e-9) k = i;
      if (k === 0) continue;
      ch.parent = parts[k - 1].id;
      ch.x -= offsets[k];
    }
  }
  const at0 = doc.bones.findIndex((b) => b.id === id);
  doc.bones.splice(at0 + 1, 0, ...parts);
  normalizeBoneOrder(doc);
  return { ids: parts.map((p) => p.id) };
}
