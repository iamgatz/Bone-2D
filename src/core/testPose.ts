/**
 * The test pose of the Weights tool: bones moved to see how a mesh bends, while its weights are painted. It is only looked at: the setup
 * pose, and with it the document, never changes. Pure functions on a posed skeleton; the store and the viewport call them.
 */
import type { Id } from '@/core/model';
import type { Skeleton } from '@/core/skeleton';

/** What a drag takes hold of: a bone that is turned about its origin, or one that is moved. */
export interface Grab {
  bone: Id;
  move: boolean;
  /** The bone is the target of an IK chain: where that chain starts. */
  chain?: Id;
}

export interface LocalPose {
  x: number;
  y: number;
  rotation: number;
}

/** One swing of the wiggle, in seconds. */
export const WIGGLE_PERIOD = 1.6;
/** How far a wiggled bone turns to each side, in degrees. */
const WIGGLE_ANGLE = 25;
/** How much of the way to the start of its chain a wiggled IK target is pulled. */
const WIGGLE_PULL = 0.35;
/** The shortest swing of a wiggled bone that is moved, so a bone without length is seen to move too. */
const WIGGLE_MIN = 20;

/**
 * What a drag on the bone `id` does. A bone that an IK constraint turns cannot be turned by hand, so its target is moved instead; a
 * target and a bone without a parent are moved; every other bone is turned.
 */
export function grabFor(skeleton: Skeleton, id: Id): Grab | null {
  const bone = skeleton.boneById(id);
  if (!bone) return null;
  const at = bone.data.index;
  const bones = skeleton.data.bones;
  for (const c of skeleton.data.constraints) {
    if (c.kind !== 'ik' || c.mix <= 0 || !(c.target === at || c.bones.includes(at))) continue;
    return { bone: bones[c.target].id, move: true, chain: bones[c.bones[0]].id };
  }
  return { bone: id, move: !bone.parent };
}

/** A vector of the scene in the space of the parent of a bone: what has to be added to its x and y to move it that far. */
function toParent(skeleton: Skeleton, id: Id, dx: number, dy: number): [number, number] {
  const p = skeleton.boneById(id)?.parent;
  if (!p) return [dx, dy];
  const det = p.a * p.d - p.b * p.c || 1e-9;
  return [(p.d * dx - p.b * dy) / det, (-p.c * dx + p.a * dy) / det];
}

/**
 * The drag of a grabbed bone that began at `from` in the pose of `skeleton`: gives the local values the bone has with the pointer
 * at `to`. A moved bone follows the pointer, a turned one turns by the angle the pointer went round its origin.
 */
export function dragFrom(skeleton: Skeleton, grab: Grab, from: [number, number]): ((to: [number, number]) => Partial<LocalPose>) | null {
  const bone = skeleton.boneById(grab.bone);
  if (!bone) return null;
  const { x, y, rotation, worldX, worldY, parent } = bone;
  if (grab.move) {
    return (to) => {
      const [lx, ly] = toParent(skeleton, grab.bone, to[0] - from[0], to[1] - from[1]);
      return { x: x + lx, y: y + ly };
    };
  }
  const sign = parent && parent.a * parent.d - parent.b * parent.c < 0 ? -1 : 1;
  const a0 = Math.atan2(from[1] - worldY, from[0] - worldX);
  return (to) => {
    const turn = (Math.atan2(to[1] - worldY, to[0] - worldX) - a0) * (180 / Math.PI);
    return { rotation: rotation + sign * (((((turn + 180) % 360) + 360) % 360) - 180) };
  };
}

/**
 * The swing of the wiggle about the pose of `skeleton`: gives the local values at a time in seconds. A turned bone swings to both sides.
 * An IK target is pulled toward the start of its chain and let back, which bends the joint between them. Any other moved bone goes from
 * side to side.
 */
export function wiggleOf(skeleton: Skeleton, grab: Grab): ((seconds: number) => Partial<LocalPose>) | null {
  const bone = skeleton.boneById(grab.bone);
  if (!bone) return null;
  const { x, y, rotation } = bone;
  const phase = (seconds: number) => (seconds / WIGGLE_PERIOD) * Math.PI * 2;
  if (!grab.move) return (t) => ({ rotation: rotation + WIGGLE_ANGLE * Math.sin(phase(t)) });
  const root = grab.chain ? skeleton.boneById(grab.chain) : undefined;
  if (root) {
    const [lx, ly] = toParent(skeleton, grab.bone, (root.worldX - bone.worldX) * WIGGLE_PULL, (root.worldY - bone.worldY) * WIGGLE_PULL);
    return (t) => {
      const k = (1 - Math.cos(phase(t))) / 2;
      return { x: x + lx * k, y: y + ly * k };
    };
  }
  const reach = Math.max(WIGGLE_MIN, bone.data.length * WIGGLE_PULL);
  const [lx, ly] = toParent(skeleton, grab.bone, reach, 0);
  return (t) => {
    const k = Math.sin(phase(t));
    return { x: x + lx * k, y: y + ly * k };
  };
}
