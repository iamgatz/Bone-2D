/**
 * Document model. Plain JSON — every entity has a stable `id` and cross references use ids (never names),
 * so renaming is always safe. Animation data mirrors the Spine 4.3 export structure on purpose.
 */

export type Id = string;
export type RGBA = [number, number, number, number];
export type RGB = [number, number, number];

export type Inherit = 'normal' | 'onlyTranslation' | 'noRotationOrReflection' | 'noScale' | 'noScaleOrReflection';
export const INHERIT_MODES: Inherit[] = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection'];

export type BlendMode = 'normal' | 'additive' | 'multiply' | 'screen';
export const BLEND_MODES: BlendMode[] = ['normal', 'additive', 'multiply', 'screen'];

export interface Bone {
  id: Id;
  name: string;
  parent: Id | null;
  length: number;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
  inherit: Inherit;
  /** Editor color (nonessential). */
  color: RGBA;
  skinRequired: boolean;
  /** Editor-only flags. */
  hidden: boolean;
  locked: boolean;
}

export interface Slot {
  id: Id;
  name: string;
  bone: Id;
  color: RGBA;
  dark: RGB | null;
  /** Setup pose attachment name (key in the skin). */
  attachment: string | null;
  blend: BlendMode;
  hidden: boolean;
}

export interface RegionAttachment {
  type: 'region';
  name: string;
  /** Image name used to look up the texture region. */
  path: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
  color: RGBA;
}

/** [bone id, bind x, bind y, weight]. Bind position is in the bone's setup-world local space. */
export type Influence = [bone: Id, x: number, y: number, weight: number];

export interface MeshAttachment {
  type: 'mesh';
  name: string;
  path: string;
  color: RGBA;
  /** Source image size in pixels (used for editing/tracing). */
  width: number;
  height: number;
  /** Texture coordinates in 0..1 relative to the image, 2 per vertex. */
  uvs: number[];
  triangles: number[];
  /** Number of leading vertices that form the outline polygon. */
  hull: number;
  /** Vertex index pairs for editor wire edges (nonessential). */
  edges: number[];
  /** Unweighted: x,y per vertex in slot bone space. Empty when `weights` is set. */
  vertices: number[];
  /** Weighted: per vertex influences. `null` when unweighted. */
  weights: Influence[][] | null;
  /** Editor metadata: the region transform this mesh was generated from (used to re-trace). Not exported. */
  region?: { x: number; y: number; rotation: number; scaleX: number; scaleY: number; width: number; height: number };
}

/** A single point + rotation in the slot bone's space (spawn points, muzzles …). Never drawn by runtimes. */
export interface PointAttachment {
  type: 'point';
  name: string;
  x: number;
  y: number;
  rotation: number;
  /** Editor color (nonessential). */
  color: RGBA;
}

/**
 * Outline shared by bounding boxes and clipping polygons. Vertex data has the layout of a mesh: unweighted = x,y per
 * vertex in the slot bone's space (`vertices`), weighted = per vertex influences (`weights`, `vertices` empty).
 * Weights are kept (imports, bone deletion) and skinned, but the editor only edits vertex positions.
 */
interface PolygonBase {
  name: string;
  /** Editor color (nonessential). */
  color: RGBA;
  vertices: number[];
  weights: Influence[][] | null;
}

/** A hit test polygon (see Spine's `SkeletonBounds`). */
export interface BoundingBoxAttachment extends PolygonBase {
  type: 'boundingbox';
}

/** Clips the slots from its own slot up to and including `end` (`null` = until the end of the draw order). */
export interface ClippingAttachment extends PolygonBase {
  type: 'clipping';
  /** Id of the last slot that is clipped. */
  end: Id | null;
  /** Treat the polygon as convex (its convex hull is used when it is not). */
  convex: boolean;
  /** Show everything *outside* the polygon (always convex). */
  inverse: boolean;
}

export type PolygonAttachment = BoundingBoxAttachment | ClippingAttachment;

/**
 * A composite Bezier path (Spine's `path` attachment) that bones can follow through a path constraint. Its points have the
 * layout of the file format: three per node — in-handle, anchor, out-handle — in `vertices` (x,y in the slot bone's space) or
 * in `weights` when the path is skinned to bones. A path with `n` nodes therefore has `3n` points; an open one has `n - 1`
 * curves (its first in-handle and last out-handle are unused placeholders), a closed one `n` curves.
 */
export interface PathAttachment extends PolygonBase {
  type: 'path';
  closed: boolean;
  /**
   * Constant speed along the path: curve lengths are measured every frame. Otherwise the lengths of the setup pose are used
   * (they are computed when the skeleton is compiled and exported, never stored).
   */
  constantSpeed: boolean;
}

export type Attachment = RegionAttachment | MeshAttachment | PolygonAttachment | PointAttachment | PathAttachment;

/** Number of vertices of a polygon (or number of points of a path) attachment. */
export function polygonVertexCount(p: { vertices: number[]; weights: Influence[][] | null }): number {
  return p.weights ? p.weights.length : p.vertices.length >> 1;
}

/** Number of nodes (anchors) of a path. */
export function pathNodeCount(p: { vertices: number[]; weights: Influence[][] | null }): number {
  return Math.floor(polygonVertexCount(p) / 3);
}

/** Number of Bezier curves of a path: one per node when closed, one less when open. */
export function pathCurveCount(p: { vertices: number[]; weights: Influence[][] | null; closed: boolean }): number {
  const n = pathNodeCount(p);
  return p.closed ? n : Math.max(0, n - 1);
}

export const DEFAULT_CLIPPING_COLOR: RGBA = [0.808, 0.227, 0.227, 1];
export const DEFAULT_BOUNDING_BOX_COLOR: RGBA = [0.38, 0.94, 0, 1];
export const DEFAULT_POINT_COLOR: RGBA = [0.945, 0.945, 0, 1];
export const DEFAULT_PATH_COLOR: RGBA = [1, 0.5, 0, 1];

/** Image (atlas region) name of an attachment, or null for attachments that have no image. */
export function attachmentImage(a: Attachment): string | null {
  return a.type === 'region' || a.type === 'mesh' ? a.path : null;
}

/** True for attachments that have an outline of vertices but no image. */
export function isPolygon(a: Attachment): a is PolygonAttachment {
  return a.type === 'clipping' || a.type === 'boundingbox';
}

export interface Skin {
  id: Id;
  name: string;
  /** slot id -> attachment name -> attachment */
  attachments: Record<Id, Record<string, Attachment>>;
  bones: Id[];
  constraints: Id[];
}

export interface IkConstraint {
  id: Id;
  type: 'ik';
  name: string;
  /** 1 or 2 bones. For 2 bones the second must be a direct child of the first. */
  bones: Id[];
  target: Id;
  mix: number;
  softness: number;
  bendPositive: boolean;
  compress: boolean;
  stretch: boolean;
  /** How scaleY follows scaleX when compress/stretch scales a bone. */
  scaleY: 'none' | 'uniform' | 'volume';
  skinRequired: boolean;
}
/** Transform constraint properties (Spine 4.3). */
export type TransformProp = 'rotate' | 'x' | 'y' | 'scaleX' | 'scaleY' | 'shearY';
export const TRANSFORM_PROPS: TransformProp[] = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'];

/** One constrained property: value = offset + (source - from.offset) * scale, optionally clamped to offset..max. */
export interface TransformTo {
  prop: TransformProp;
  offset: number;
  max: number;
  scale: number;
}

/** A source property and the target properties it drives. */
export interface TransformFrom {
  prop: TransformProp;
  offset: number;
  to: TransformTo[];
}

export interface TransformConstraint {
  id: Id;
  type: 'transform';
  name: string;
  /** Bones that are modified. */
  bones: Id[];
  /** Bone whose transform is read. */
  source: Id;
  localSource: boolean;
  localTarget: boolean;
  additive: boolean;
  clamp: boolean;
  properties: TransformFrom[];
  /** Offsets applied to the source value (rotation, x, y, scaleX, scaleY, shearY). */
  offsets: { rotation: number; x: number; y: number; scaleX: number; scaleY: number; shearY: number };
  /** Setup mixes, 0..1. */
  mix: { rotate: number; x: number; y: number; scaleX: number; scaleY: number; shearY: number };
  skinRequired: boolean;
}

/**
 * Spine 4.3 slider: applies an animation at a time that is set by hand (and can be keyed) or driven by a bone property:
 * `time = to + (value(property) - from) * scale`.
 */
export interface SliderConstraint {
  id: Id;
  type: 'slider';
  name: string;
  /** Id of the animation to apply. `null` until one is chosen — such a slider does nothing and is not exported. */
  animation: Id | null;
  /** Add the animation's values to the current pose instead of replacing them. */
  additive: boolean;
  /** Wrap the time around the animation's duration instead of clamping it. */
  loop: boolean;
  /** Setup mix (0..1) and setup time in seconds; the time is only used when no bone drives it. */
  mix: number;
  time: number;
  /** Optional driver bone. */
  bone: Id | null;
  property: TransformProp;
  from: number;
  to: number;
  scale: number;
  /** Upper end of the driven range (editor metadata, the runtime does not use it). */
  max: number;
  /** Read the bone's local transform instead of its world transform. */
  local: boolean;
  skinRequired: boolean;
}

export type PathPositionMode = 'fixed' | 'percent';
export type PathSpacingMode = 'length' | 'fixed' | 'percent' | 'proportional';
export type PathRotateMode = 'tangent' | 'chain' | 'chainScale';
export const PATH_POSITION_MODES: PathPositionMode[] = ['fixed', 'percent'];
export const PATH_SPACING_MODES: PathSpacingMode[] = ['length', 'fixed', 'percent', 'proportional'];
export const PATH_ROTATE_MODES: PathRotateMode[] = ['tangent', 'chain', 'chainScale'];

/**
 * Spine 4.3 path constraint: moves (and rotates / scales) bones along the path attachment that is currently shown in `target`
 * (a slot). The first bone sits at `position`, the others follow with `spacing`.
 */
export interface PathConstraint {
  id: Id;
  type: 'path';
  name: string;
  /** Bones that follow the path. */
  bones: Id[];
  /** Slot whose path attachment is followed. */
  target: Id;
  /** `fixed`: `position` is a distance along the path; `percent`: 0..1 of its length. */
  positionMode: PathPositionMode;
  /** `length`: the bones' lengths plus `spacing`; `fixed`: `spacing` apart; `percent`: of the path length; `proportional`: relative to the bone lengths. */
  spacingMode: PathSpacingMode;
  /** `tangent`: bones face along the path; `chain`: bones keep their lengths and point at the next one; `chainScale`: bones are also stretched to reach it. */
  rotateMode: PathRotateMode;
  /** Degrees added to the rotation of the bones. */
  offsetRotation: number;
  /** Setup position of the first bone and setup spacing (animatable). */
  position: number;
  spacing: number;
  /** Setup mixes, 0..1. */
  mix: { rotate: number; x: number; y: number };
  skinRequired: boolean;
}

/** Which animatable parameters of a physics constraint are driven by the animation's GLOBAL physics timelines. */
export type PhysicsParam = 'inertia' | 'strength' | 'damping' | 'mass' | 'wind' | 'gravity' | 'mix';
export const PHYSICS_PARAMS: PhysicsParam[] = ['inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix'];

/**
 * Spine 4.2+ physics constraint: a spring simulation that moves, rotates, scales or shears ONE bone as if it hung on the
 * bone's own movement. The simulation advances in steps of `1 / fps` seconds and only runs while an animation plays.
 */
export interface PhysicsConstraint {
  id: Id;
  type: 'physics';
  name: string;
  bone: Id;
  /** How much the simulation moves / rotates / scales / shears the bone, 0..1 (0 = not at all). */
  x: number;
  y: number;
  rotate: number;
  scaleX: number;
  shearX: number;
  /** How scaleY follows scaleX. */
  scaleY: 'none' | 'uniform' | 'volume';
  /** Movement beyond this many units per second makes no more effect. */
  limit: number;
  /** Simulation steps per second. */
  fps: number;
  /** Setup values of the animatable parameters. */
  inertia: number;
  strength: number;
  damping: number;
  /** The mass; the runtime stores 1 / mass. */
  mass: number;
  wind: number;
  gravity: number;
  mix: number;
  /** Parameters taken from the global physics timelines of the animation instead of the constraint's own. */
  global: Record<PhysicsParam, boolean>;
  skinRequired: boolean;
}

export type Constraint = IkConstraint | TransformConstraint | SliderConstraint | PathConstraint | PhysicsConstraint;

export function constraintBoneIds(c: Constraint): Id[] {
  if (c.type === 'ik') return [...c.bones, c.target];
  if (c.type === 'transform') return [...c.bones, c.source];
  if (c.type === 'path') return [...c.bones];
  if (c.type === 'physics') return [c.bone];
  return c.bone ? [c.bone] : [];
}

export interface EventDef {
  id: Id;
  name: string;
  int: number;
  float: number;
  string: string;
}

// ---------------------------------------------------------------- animation

/** `undefined` = linear, `'stepped'`, or normalized bezier: 4 numbers (x1,y1,x2,y2) per channel, x/y in 0..1 of the segment. */
export type Curve = 'stepped' | number[];

export interface Key {
  time: number;
  value: number[];
  curve?: Curve;
}
export type Timeline = Key[];

export interface AttachmentKey {
  time: number;
  name: string | null;
}

export interface IkKey extends Key {
  /** value = [mix, softness] */
  bendPositive: boolean;
  compress: boolean;
  stretch: boolean;
}

export interface DrawOrderKey {
  time: number;
  /** Complete slot id order (bottom to top). */
  order: Id[];
}

export interface EventKey {
  time: number;
  event: Id;
  int?: number;
  float?: number;
  string?: string;
}

/** Slider timelines. value = [seconds] / [mix]. */
export interface SliderTimelines {
  time?: Timeline;
  mix?: Timeline;
}

/** Path constraint timelines. value = [position] / [spacing] / [mixRotate, mixX, mixY]. */
export interface PathTimelines {
  position?: Timeline;
  spacing?: Timeline;
  mix?: Timeline;
}

/** The key of `Animation.physics` that holds the GLOBAL timelines (the file stores them under an empty constraint name). */
export const GLOBAL_PHYSICS = '*';

/** Physics constraint timelines, one value per key (the mass is NOT inverted). `reset` keys restart the simulation; their value is ignored. */
export interface PhysicsTimelines {
  inertia?: Timeline;
  strength?: Timeline;
  damping?: Timeline;
  mass?: Timeline;
  wind?: Timeline;
  gravity?: Timeline;
  mix?: Timeline;
  reset?: Timeline;
}

export interface BoneTimelines {
  /** value = [degrees] relative to setup */
  rotate?: Timeline;
  /** value = [x, y] relative to setup */
  translate?: Timeline;
  /** value = [x, y] multiplier of setup scale */
  scale?: Timeline;
  /** value = [x, y] degrees relative to setup */
  shear?: Timeline;
}

export interface SlotTimelines {
  attachment?: AttachmentKey[];
  /** value = [r, g, b, a] absolute (the light color) */
  rgba?: Timeline;
  /**
   * Two-color tinting: value = [r, g, b, a, darkR, darkG, darkB] absolute. Needs `slot.dark` (the setup dark color) and
   * replaces `rgba` on that slot (Spine's `rgba2` timeline).
   */
  rgba2?: Timeline;
}

export interface Animation {
  id: Id;
  name: string;
  /** Explicit length in seconds (>= last key). */
  duration: number;
  bones: Record<Id, BoneTimelines>;
  slots: Record<Id, SlotTimelines>;
  ik: Record<Id, IkKey[]>;
  /** Transform constraint mixes over time. value = [mixRotate, mixX, mixY, mixScaleX, mixScaleY, mixShearY]. */
  transform: Record<Id, Timeline>;
  /** Slider time / mix over time, by constraint id. */
  slider: Record<Id, SliderTimelines>;
  /** Path constraint position / spacing / mixes over time, by constraint id. */
  path: Record<Id, PathTimelines>;
  /** Physics constraint parameters over time, by constraint id (`GLOBAL_PHYSICS` = the global timelines). */
  physics: Record<Id, PhysicsTimelines>;
  /** skin id -> slot id -> attachment name -> keys; Key.value = per vertex deltas (x,y pairs; per influence for weighted meshes). */
  deform: Record<Id, Record<Id, Record<string, Timeline>>>;
  drawOrder: DrawOrderKey[];
  events: EventKey[];
}

// ---------------------------------------------------------------- project

export interface SkeletonDoc {
  name: string;
  fps: number;
  /** Size that wind and gravity of the physics constraints are measured against (Spine's default is 100). */
  referenceScale?: number;
  bones: Bone[];
  slots: Slot[];
  skins: Skin[];
  constraints: Constraint[];
  events: EventDef[];
  animations: Animation[];
}

export interface ImageRef {
  id: Id;
  /** Unique name; also the atlas region name. */
  name: string;
  width: number;
  height: number;
}

/** The local transform of one bone. */
export interface BonePose {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
}

/** A pose kept in the pose library: the local transforms of some bones by bone name (so it survives renaming ids and works after a bone is added). Not exported. */
export interface PoseEntry {
  id: Id;
  name: string;
  bones: Record<string, BonePose>;
}

export interface Project {
  format: 'bone2d';
  version: 1;
  name: string;
  skeleton: SkeletonDoc;
  images: ImageRef[];
  /** The pose library of the editor (poses are not part of the Spine export). */
  poses?: PoseEntry[];
}

// ---------------------------------------------------------------- factories

import { uid } from './ids';

export function newBone(partial: Partial<Bone> & { name: string }): Bone {
  return {
    id: uid(),
    parent: null,
    length: 0,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    shearX: 0,
    shearY: 0,
    inherit: 'normal',
    color: [0.6, 0.6, 0.6, 1],
    skinRequired: false,
    hidden: false,
    locked: false,
    ...partial,
  };
}

export function newSlot(partial: Partial<Slot> & { name: string; bone: Id }): Slot {
  return {
    id: uid(),
    color: [1, 1, 1, 1],
    dark: null,
    attachment: null,
    blend: 'normal',
    hidden: false,
    ...partial,
  };
}

export function newSkin(name: string): Skin {
  return { id: uid(), name, attachments: {}, bones: [], constraints: [] };
}

export function newAnimation(name: string, duration = 1): Animation {
  return { id: uid(), name, duration, bones: {}, slots: {}, ik: {}, transform: {}, slider: {}, path: {}, physics: {}, deform: {}, drawOrder: [], events: [] };
}

export function newPathConstraint(partial: Partial<PathConstraint> & { name: string; bones: Id[]; target: Id }): PathConstraint {
  return {
    id: uid(),
    type: 'path',
    positionMode: 'percent',
    spacingMode: 'length',
    rotateMode: 'chain',
    offsetRotation: 0,
    position: 0,
    spacing: 0,
    mix: { rotate: 1, x: 1, y: 1 },
    skinRequired: false,
    ...partial,
  };
}

export function newPhysicsConstraint(partial: Partial<PhysicsConstraint> & { name: string; bone: Id }): PhysicsConstraint {
  return {
    id: uid(),
    type: 'physics',
    x: 0,
    y: 0,
    rotate: 1,
    scaleX: 0,
    shearX: 0,
    scaleY: 'none',
    limit: 5000,
    fps: 60,
    inertia: 0.5,
    strength: 100,
    damping: 0.85,
    mass: 1,
    wind: 0,
    gravity: 0,
    mix: 1,
    global: { inertia: false, strength: false, damping: false, mass: false, wind: false, gravity: false, mix: false },
    skinRequired: false,
    ...partial,
  };
}

export function newSliderConstraint(partial: Partial<SliderConstraint> & { name: string }): SliderConstraint {
  return {
    id: uid(),
    type: 'slider',
    animation: null,
    additive: false,
    loop: false,
    mix: 1,
    time: 0,
    bone: null,
    property: 'rotate',
    from: 0,
    to: 0,
    scale: 1,
    max: 0,
    local: false,
    skinRequired: false,
    ...partial,
  };
}

export function newTransformConstraint(partial: Partial<TransformConstraint> & { name: string; bones: Id[]; source: Id }): TransformConstraint {
  return {
    id: uid(),
    type: 'transform',
    localSource: false,
    localTarget: false,
    additive: false,
    clamp: false,
    properties: [{ prop: 'rotate', offset: 0, to: [{ prop: 'rotate', offset: 0, max: 1, scale: 1 }] }],
    offsets: { rotation: 0, x: 0, y: 0, scaleX: 0, scaleY: 0, shearY: 0 },
    mix: { rotate: 1, x: 1, y: 1, scaleX: 1, scaleY: 1, shearY: 1 },
    skinRequired: false,
    ...partial,
  };
}

/** Fills fields that older project files lack. Safe to call repeatedly. */
export function migrateProject(p: Project): Project {
  p.format = 'bone2d'; // files saved before the project was renamed from "Marrow" carry the old tag
  for (const a of p.skeleton.animations) {
    if (!a.transform) a.transform = {};
    if (!a.slider) a.slider = {};
    if (!a.path) a.path = {};
    if (!a.physics) a.physics = {};
  }
  return p;
}

export function emptyProject(name = 'untitled'): Project {
  const root = newBone({ name: 'root' });
  return {
    format: 'bone2d',
    version: 1,
    name,
    skeleton: {
      name,
      fps: 30,
      bones: [root],
      slots: [],
      skins: [newSkin('default')],
      constraints: [],
      events: [],
      animations: [],
    },
    images: [],
  };
}

export function isMeshWeighted(m: MeshAttachment): boolean {
  return m.weights != null;
}

export function meshVertexCount(m: MeshAttachment): number {
  return m.uvs.length >> 1;
}
