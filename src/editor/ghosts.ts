/**
 * Onion skin (Spine calls it ghosting): the poses of the frames before and after the playhead, drawn faded under the current one,
 * so the motion can be judged without playing it.
 */
import { applyAnimation } from '@/core/animate';
import type { Animation, SkeletonDoc } from '@/core/model';
import { compileSkeleton, createSkeleton } from '@/core/skeleton';
import type { Skeleton, SkeletonData } from '@/core/skeleton';
import type { Scene } from './scene';

export type OnionStyle = 'image' | 'silhouette' | 'xray';
export type OnionMode = 'frames' | 'keys';

export interface OnionConfig {
  before: number;
  after: number;
  /** Frames between two ghosts. */
  gap: number;
  /** 'frames': a ghost every `gap` frames; 'keys': a ghost at each key before and after the playhead. */
  mode?: OnionMode;
  /** How far each ghost is moved from the pose, per step away from the playhead (scene units). Before the playhead it goes the other way. */
  offsetX?: number;
  offsetY?: number;
  /** 'image': the pictures faded and tinted; 'silhouette': flat colour; 'xray': a flat colour drawn over the pose, so the pose shows through. */
  style?: OnionStyle;
  /** Draw the ghosts over the pose instead of under it (always so for 'xray'). */
  top?: boolean;
  colorBefore?: [number, number, number];
  colorAfter?: [number, number, number];
}

/** The distinct times at which an animation has a key (of the given bones and their slots only, when `bones` is given), sorted. */
export function keyTimes(anim: Animation, only?: { bones: readonly string[]; slots?: readonly string[] } | null): number[] {
  const times = new Set<number>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object' && v[0] !== null && typeof (v[0] as { time?: unknown }).time === 'number') for (const k of v as { time: number }[]) times.add(k.time);
      else v.forEach(walk);
    } else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  if (only && (only.bones.length || only.slots?.length)) {
    for (const id of only.bones) walk(anim.bones[id]);
    for (const id of only.slots ?? []) walk(anim.slots[id]);
  } else walk({ ...anim, id: undefined, name: undefined, play: undefined, markers: undefined });
  return [...times].sort((a, b) => a - b);
}

/** Ghosts at the keys around `time`: the nearest `before` keys before it and `after` keys after it (a time on the playhead is not a ghost). */
export function keyGhostTimes(time: number, keys: readonly number[], cfg: OnionConfig): GhostTime[] {
  const out: GhostTime[] = [];
  const before = keys.filter((t) => t < time - 1e-6).reverse();
  const after = keys.filter((t) => t > time + 1e-6);
  before.slice(0, cfg.before).forEach((t, i) => out.push({ time: t, side: 'before', index: i + 1 }));
  after.slice(0, cfg.after).forEach((t, i) => out.push({ time: t, side: 'after', index: i + 1 }));
  return out;
}

export interface GhostTime {
  time: number;
  side: 'before' | 'after';
  /** 1 = the ghost next to the current frame, 2 = the next one, ... */
  index: number;
}

/** The times of the ghosts around `time`. A ghost that would fall outside the animation wraps around when it loops, and is left out otherwise. */
export function ghostTimes(time: number, duration: number, fps: number, cfg: OnionConfig, loop: boolean): GhostTime[] {
  const out: GhostTime[] = [];
  const step = Math.max(1, cfg.gap) / Math.max(1, fps);
  const place = (t: number): number | null => {
    if (duration <= 0) return null;
    if (t >= -1e-9 && t <= duration + 1e-9) return Math.min(duration, Math.max(0, t));
    if (!loop) return null;
    return ((t % duration) + duration) % duration;
  };
  for (let i = 1; i <= cfg.before; i++) {
    const t = place(time - i * step);
    if (t !== null && Math.abs(t - time) > 1e-6) out.push({ time: t, side: 'before', index: i });
  }
  for (let i = 1; i <= cfg.after; i++) {
    const t = place(time + i * step);
    if (t !== null && Math.abs(t - time) > 1e-6) out.push({ time: t, side: 'after', index: i });
  }
  return out;
}

export interface Ghost {
  skeleton: Skeleton;
  alpha: number;
  tint: [number, number, number, number];
  /** Where the ghost is moved to (scene units). */
  offset?: [number, number];
  /** Only the shape, filled with the tint. */
  flat?: boolean;
  /** Drawn over the pose, not under it. */
  top?: boolean;
}

const TINT_BEFORE: Ghost['tint'] = [1, 0.62, 0.55, 1];
const TINT_AFTER: Ghost['tint'] = [0.55, 0.82, 1, 1];

let pool: { data: Scene['data']; skinId: string | null; skeletons: Skeleton[] } | null = null;

/** Skeletons posed at the ghost times (kept between frames, they are only re-posed). */
export function ghostsFor(scene: Scene, anim: Animation, time: number, fps: number, cfg: OnionConfig, loop: boolean, skinId: string | null, only?: { bones: readonly string[]; slots?: readonly string[] } | null): Ghost[] {
  const times = cfg.mode === 'keys' ? keyGhostTimes(time, keyTimes(anim, only), cfg) : ghostTimes(time, anim.duration, fps, cfg, loop);
  const style = cfg.style ?? 'image';
  const flat = style !== 'image';
  const top = style === 'xray' || !!cfg.top;
  if (!pool || pool.data !== scene.data || pool.skinId !== skinId) pool = { data: scene.data, skinId, skeletons: [] };
  const physics = scene.data.constraints.some((c) => c.kind === 'physics') ? 'reset' : 'none';
  return times.map((g, i) => {
    const skeleton = (pool!.skeletons[i] ??= createSkeleton(scene.data, skinId));
    applyAnimation(skeleton, anim, g.time);
    skeleton.updateWorldTransform(physics);
    const reach = g.side === 'before' ? cfg.before : cfg.after;
    const rgb = (g.side === 'before' ? cfg.colorBefore : cfg.colorAfter) ?? (g.side === 'before' ? TINT_BEFORE : TINT_AFTER).slice(0, 3);
    const sign = g.side === 'before' ? -1 : 1;
    const offset: [number, number] | undefined = cfg.offsetX || cfg.offsetY ? [sign * g.index * (cfg.offsetX ?? 0), sign * g.index * (cfg.offsetY ?? 0)] : undefined;
    // the nearest ghost is the strongest
    return { skeleton, alpha: 0.42 * (1 - (g.index - 1) / Math.max(1, reach + 0.5)), tint: [rgb[0], rgb[1], rgb[2], 1], offset, flat, top };
  });
}

// ---------------------------------------------------------------- a reference: another animation (or the setup pose) drawn under the pose being edited

const TINT_REFERENCE: Ghost['tint'] = [0.62, 1, 0.66, 1];

/**
 * The moment of the reference animation that goes with the playhead: the same time, wrapped round a loop when the reference is shorter,
 * held at its last frame otherwise. An animation with no length shows its first frame.
 */
export function referenceTime(time: number, duration: number, loop: boolean): number {
  if (!(duration > 0)) return 0;
  if (time <= duration) return Math.max(0, time);
  return loop ? ((time % duration) + duration) % duration : duration;
}

let refPool: { data: Scene['data']; skinId: string | null; skeleton: Skeleton } | null = null;

/** The skeleton posed as the reference animation is at the moment that goes with the playhead (`anim` null: the setup pose), faded and tinted green. */
export function referenceGhost(scene: Scene, anim: Animation | null, time: number, loop: boolean, skinId: string | null): Ghost {
  if (!refPool || refPool.data !== scene.data || refPool.skinId !== skinId) refPool = { data: scene.data, skinId, skeleton: createSkeleton(scene.data, skinId) };
  const skeleton = refPool.skeleton;
  skeleton.setToSetupPose();
  if (anim) applyAnimation(skeleton, anim, referenceTime(time, anim.duration, loop));
  skeleton.updateWorldTransform(scene.data.constraints.some((c) => c.kind === 'physics') ? 'reset' : 'none');
  return { skeleton, alpha: 0.45, tint: TINT_REFERENCE };
}

// ---------------------------------------------------------------- a checkpoint: the pose of the skeleton as it was, drawn under the current one

const TINT_CHECKPOINT: Ghost['tint'] = [0.74, 0.64, 1, 1];

let cpPool: { doc: SkeletonDoc; skinId: string | null; data: SkeletonData; skeleton: Skeleton } | null = null;

/**
 * The checkpoint's skeleton posed like the one being edited: the animation with the same id at the same time (the setup pose when the animation
 * is not in the checkpoint, or in Setup mode), faded and tinted violet. Null when the checkpoint cannot be posed.
 */
export function checkpointGhost(doc: SkeletonDoc, animationId: string | null, time: number, loop: boolean, skinId: string | null): Ghost | null {
  const skin = skinId && doc.skins.some((s) => s.id === skinId) ? skinId : null;
  if (!cpPool || cpPool.doc !== doc || cpPool.skinId !== skin) {
    const data = compileSkeleton(doc);
    cpPool = { doc, skinId: skin, data, skeleton: createSkeleton(data, skin) };
  }
  const { skeleton, data } = cpPool;
  skeleton.setToSetupPose();
  const anim = animationId ? doc.animations.find((a) => a.id === animationId) : undefined;
  if (anim) applyAnimation(skeleton, anim, referenceTime(time, anim.duration, loop));
  skeleton.updateWorldTransform(data.constraints.some((c) => c.kind === 'physics') ? 'reset' : 'none');
  return { skeleton, alpha: 0.5, tint: TINT_CHECKPOINT };
}
