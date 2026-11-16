/** Shared, memoized "what the document looks like right now": the posed skeleton for the current mode/animation/time. */
import { applyAnimation } from '@/core/animate';
import type { Animation, Id, SkeletonDoc } from '@/core/model';
import { compileSkeleton, createSkeleton } from '@/core/skeleton';
import type { Skeleton, SkeletonData } from '@/core/skeleton';
import { docStore } from '@/store/doc';
import { uiStore } from '@/store/ui';
import type { Camera, PoseOverride } from '@/store/ui';

export interface Scene {
  doc: SkeletonDoc;
  data: SkeletonData;
  skeleton: Skeleton;
  animation: Animation | null;
}

let cache: {
  doc: SkeletonDoc;
  skinId: Id | null;
  anim: Animation | null;
  time: number;
  overrides: Record<Id, PoseOverride>;
  scene: Scene;
} | null = null;

export function getScene(): Scene {
  const project = docStore.get();
  const ui = uiStore.get();
  const doc = project.skeleton;
  const anim = ui.mode === 'animate' ? (doc.animations.find((a) => a.id === ui.animationId) ?? null) : null;
  const time = anim ? ui.time : 0;
  const overrides = ui.mode === 'animate' ? ui.overrides : EMPTY;
  const c = cache;
  if (c && c.doc === doc && c.skinId === ui.skinId && c.anim === anim && c.time === time && c.overrides === overrides) return c.scene;

  const data = compileSkeleton(doc);
  const skeleton = c && c.scene.data === data && c.skinId === ui.skinId ? c.scene.skeleton : createSkeleton(data, ui.skinId && doc.skins.some((s) => s.id === ui.skinId) ? ui.skinId : null);
  applyAnimation(skeleton, anim, time);
  for (const id in overrides) {
    const b = skeleton.boneById(id);
    if (!b) continue;
    const o = overrides[id];
    if (o.x !== undefined) b.x = o.x;
    if (o.y !== undefined) b.y = o.y;
    if (o.rotation !== undefined) b.rotation = o.rotation;
    if (o.scaleX !== undefined) b.scaleX = o.scaleX;
    if (o.scaleY !== undefined) b.scaleY = o.scaleY;
    if (o.shearX !== undefined) b.shearX = o.shearX;
    if (o.shearY !== undefined) b.shearY = o.shearY;
  }
  skeleton.updateWorldTransform();
  const scene: Scene = { doc, data, skeleton, animation: anim };
  cache = { doc, skinId: ui.skinId, anim, time, overrides, scene };
  return scene;
}

const EMPTY: Record<Id, PoseOverride> = {};

let setupCache: { doc: SkeletonDoc; skeleton: Skeleton } | null = null;
/** The skeleton in its pure setup pose (no animation, no overrides). */
export function getSetupSkeleton(doc: SkeletonDoc = docStore.get().skeleton): Skeleton {
  if (setupCache && setupCache.doc === doc) return setupCache.skeleton;
  const skeleton = createSkeleton(compileSkeleton(doc));
  skeleton.setToSetupPose();
  skeleton.updateWorldTransform();
  setupCache = { doc, skeleton };
  return skeleton;
}

// ------------------------------------------------------------------ camera

export function worldToScreen(cam: Camera, w: number, h: number, wx: number, wy: number): [number, number] {
  return [(wx - cam.x) * cam.zoom + w / 2, h / 2 - (wy - cam.y) * cam.zoom];
}

export function screenToWorld(cam: Camera, w: number, h: number, sx: number, sy: number): [number, number] {
  return [(sx - w / 2) / cam.zoom + cam.x, (h / 2 - sy) / cam.zoom + cam.y];
}
