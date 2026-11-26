/** Going over from one pose to another: the values of a posed skeleton, taken and blended. */
import type { Skeleton } from '@/core/skeleton';

interface SlotPose {
  attachment: string | null;
  color: number[];
  dark: number[] | null;
  deform: number[];
}

export interface Pose {
  /** x, y, rotation, scaleX, scaleY, shearX, shearY of every bone. */
  bones: number[][];
  slots: SlotPose[];
  /** The animated numbers of every constraint. */
  constraints: number[][];
  /** What an IK constraint cannot be halfway between: which way it bends, whether it compresses and stretches. */
  switches: ([number, boolean, boolean] | null)[];
}

const BONE = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const;
/** The values of `BONE` that are angles: they take the short way round. */
const ANGLES: ReadonlySet<string> = new Set(['rotation', 'shearX', 'shearY']);

function numbers(c: Skeleton['constraints'][number]): number[] {
  if (c.kind === 'ik') return [c.mix, c.softness];
  if (c.kind === 'transform') return [...c.mix];
  if (c.kind === 'path') return [c.position, c.spacing, ...c.mix];
  if (c.kind === 'slider') return [c.mix, c.time];
  return [c.mix];
}

function put(c: Skeleton['constraints'][number], v: number[]) {
  if (c.kind === 'ik') [c.mix, c.softness] = v;
  else if (c.kind === 'transform') c.mix = v;
  else if (c.kind === 'path') {
    [c.position, c.spacing] = v;
    c.mix = v.slice(2);
  } else if (c.kind === 'slider') [c.mix, c.time] = v;
  else c.mix = v[0];
}

export function capturePose(skeleton: Skeleton): Pose {
  return {
    bones: skeleton.bones.map((b) => BONE.map((k) => b[k])),
    slots: skeleton.slots.map((s) => ({
      attachment: s.attachmentName,
      color: [...s.color],
      dark: s.dark && [...s.dark],
      deform: [...s.deform],
    })),
    constraints: skeleton.constraints.map(numbers),
    switches: skeleton.constraints.map((c) => (c.kind === 'ik' ? [c.bendDirection, c.compress, c.stretch] : null)),
  };
}

/** Takes the skeleton, posed for the new animation, back towards `from`: at 0 it shows `from`, at 1 it stays as it is. */
export function mixPose(skeleton: Skeleton, from: Pose, share: number) {
  const t = Math.min(1, Math.max(0, share));
  const old = 1 - t;
  const blend = (a: number, b: number) => b + (a - b) * old;
  skeleton.bones.forEach((bone, i) => {
    BONE.forEach((k, n) => {
      let a = from.bones[i][n];
      if (ANGLES.has(k)) a -= Math.round((a - bone[k]) / 360) * 360;
      bone[k] = blend(a, bone[k]);
    });
  });
  skeleton.slots.forEach((slot, i) => {
    const was = from.slots[i];
    slot.color = slot.color.map((v, n) => blend(was.color[n], v)) as typeof slot.color;
    if (slot.dark && was.dark) slot.dark = slot.dark.map((v, n) => blend(was.dark![n], v)) as typeof slot.dark;
    // a shape goes over into another of the same picture; no deform is the shape at rest
    if (was.attachment !== slot.attachmentName) return;
    const length = Math.max(was.deform.length, slot.deform.length);
    if (length) slot.deform = Array.from({ length }, (_, n) => blend(was.deform[n] ?? 0, slot.deform[n] ?? 0));
  });
  skeleton.constraints.forEach((c, i) => {
    const was = from.constraints[i];
    // a knee changes the side it bends to in the middle of the mix
    const held = from.switches[i];
    if (c.kind === 'ik' && held && old > 0.5) [c.bendDirection, c.compress, c.stretch] = held;
    put(
      c,
      numbers(c).map((v, n) => blend(was[n], v)),
    );
  });
}
