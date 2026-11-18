/**
 * What the constraints do, in a form the viewport can draw: for each active constraint, what drives it, which bones it moves and how strongly.
 * The constraint debug view ("who pulls what") uses it; it reads the posed skeleton and changes nothing.
 */
import type { Id } from './model';
import type { Bone, Skeleton } from './skeleton';

export type LinkKind = 'ik' | 'transform' | 'path' | 'slider' | 'physics';

export interface ConstraintLink {
  id: Id;
  name: string;
  kind: LinkKind;
  /** How much of the constraint's result is used, 0..1 (the strongest of its mixes; a slider's mix is its own). */
  strength: number;
  /** The bone the constraint follows (an IK target, a transform source, a slider's bone); null for a path (it follows a slot) or physics. */
  driver: Bone | null;
  /** The bones it moves. */
  driven: Bone[];
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** The active constraints of a posed skeleton as links, in the order they are applied. */
export function constraintLinks(skeleton: Skeleton): ConstraintLink[] {
  const out: ConstraintLink[] = [];
  for (const c of skeleton.constraints) {
    if (!c.active) continue;
    const base = { id: c.data.id, name: c.data.name };
    if (c.kind === 'ik') out.push({ ...base, kind: 'ik', strength: clamp01(c.mix), driver: c.target, driven: [...c.bones] });
    else if (c.kind === 'transform') out.push({ ...base, kind: 'transform', strength: clamp01(Math.max(...c.mix, 0)), driver: c.source, driven: [...c.bones] });
    else if (c.kind === 'path') out.push({ ...base, kind: 'path', strength: clamp01(Math.max(...c.mix, 0)), driver: null, driven: [...c.bones] });
    else if (c.kind === 'physics') out.push({ ...base, kind: 'physics', strength: clamp01(c.mix), driver: null, driven: [c.bone] });
    else out.push({ ...base, kind: 'slider', strength: clamp01(c.mix), driver: c.bone, driven: [] });
  }
  return out;
}

/** The links that touch one of the bones (as the driver or as a bone it moves). */
export function linksTouching(links: readonly ConstraintLink[], bones: ReadonlySet<Id>): ConstraintLink[] {
  return links.filter((l) => (l.driver !== null && bones.has(l.driver.data.id)) || l.driven.some((b) => bones.has(b.data.id)));
}

/**
 * Which links the debug view draws in full: the selected constraint, else the ones that touch the selected bones, else all of them.
 * The others are drawn faded.
 */
export function focusLinks(links: readonly ConstraintLink[], selectedConstraint: Id | null, selectedBones: readonly Id[]): ReadonlySet<Id> {
  if (selectedConstraint && links.some((l) => l.id === selectedConstraint)) return new Set([selectedConstraint]);
  if (selectedBones.length) {
    const touching = linksTouching(links, new Set(selectedBones));
    if (touching.length) return new Set(touching.map((l) => l.id));
  }
  return new Set(links.map((l) => l.id));
}

/** The text of a link's label: the name, and the strength when it is not full. */
export function linkLabel(l: ConstraintLink): string {
  const pct = Math.round(l.strength * 100);
  return pct >= 100 ? l.name : `${l.name} ${pct}%`;
}
