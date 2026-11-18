/**
 * Runtime skeleton: compiles the document into index based data, then poses it (setup -> animation -> constraints ->
 * world transforms) and produces world-space geometry for attachments.
 *
 * The math follows the Spine 4.x reference behaviour (bone inherit modes, 1/2 bone IK, weighted skinning) so that
 * exported skeletons render identically in the official runtimes.
 */
import { applyAnimationOnto } from './animate';
import type {
  Animation,
  Attachment,
  BlendMode,
  BoundingBoxAttachment,
  ClippingAttachment,
  Id,
  Inherit,
  Influence,
  MeshAttachment,
  PathAttachment,
  PathPositionMode,
  PathRotateMode,
  PathSpacingMode,
  PhysicsParam,
  PointAttachment,
  RGB,
  RGBA,
  RegionAttachment,
  SkeletonDoc,
  TransformProp,
} from './model';
import { hasLinkedMeshes, linkSource } from './links';
import { BONE_PROPS, polygonVertexCount } from './model';
import { DEG2RAD, EPS, EPS2, INV_PI2, RAD2DEG, SPINE_PI, atan2Deg, signum } from './math';
import { computeWorldPositions, newPathScratch, pathCurveLengths, setSize } from './path';

// ------------------------------------------------------------------ compiled data

export interface BoneData {
  index: number;
  id: Id;
  name: string;
  parent: number;
  children: number[];
  length: number;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
  inherit: Inherit;
  skinRequired: boolean;
  color: RGBA;
}

export interface SlotData {
  index: number;
  id: Id;
  name: string;
  bone: number;
  color: RGBA;
  dark: RGB | null;
  blend: BlendMode;
  attachment: string | null;
}

export interface RegionData {
  kind: 'region';
  src: RegionAttachment;
  name: string;
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

/** Skinned vertex data shared by meshes and polygon attachments (see `meshWorldVertices`). */
export interface VertexData {
  vertexCount: number;
  weighted: boolean;
  /** Unweighted: x,y per vertex. Weighted: (x, y, weight) per influence. */
  positions: Float32Array;
  /** Weighted only: per vertex [influenceCount, boneIndex...]. */
  bones: Int32Array | null;
  /** Length of a deform array for this attachment. */
  deformLength: number;
}

export interface MeshData extends VertexData {
  kind: 'mesh';
  src: MeshAttachment;
  name: string;
  path: string;
  color: RGBA;
  width: number;
  height: number;
  uvs: Float32Array;
  triangles: Uint16Array;
  hull: number;
}

export interface BoundingBoxData extends VertexData {
  kind: 'boundingbox';
  src: BoundingBoxAttachment;
  name: string;
  color: RGBA;
}

export interface ClippingData extends VertexData {
  kind: 'clipping';
  src: ClippingAttachment;
  name: string;
  color: RGBA;
  /** Id of the last clipped slot (null = until the end). */
  end: Id | null;
  convex: boolean;
  inverse: boolean;
}

export interface PointData {
  kind: 'point';
  src: PointAttachment;
  name: string;
  color: RGBA;
  x: number;
  y: number;
  rotation: number;
}

export type PolygonData = BoundingBoxData | ClippingData;

/** A Bezier path: `vertexCount` points, three per node (in-handle, anchor, out-handle). */
export interface PathAttachmentData extends VertexData {
  kind: 'path';
  src: PathAttachment;
  name: string;
  color: RGBA;
  closed: boolean;
  constantSpeed: boolean;
  /** Setup pose curve lengths (see `pathCurveLengths`). Filled by `compileSkeleton`; every compiled skin owns its copy. */
  lengths: number[];
}

/** Attachments that are drawn as images. */
export type ImageData = RegionData | MeshData;

export type AttachmentData = RegionData | MeshData | BoundingBoxData | ClippingData | PointData | PathAttachmentData;

export interface SkinData {
  id: Id;
  name: string;
  /** Indexed by slot index. */
  attachments: Map<string, AttachmentData>[];
  bones: number[];
  constraints: number[];
}

export interface IkData {
  kind: 'ik';
  index: number;
  id: Id;
  name: string;
  bones: number[];
  target: number;
  mix: number;
  softness: number;
  bendDirection: 1 | -1;
  compress: boolean;
  stretch: boolean;
  scaleY: 'none' | 'uniform' | 'volume';
  skinRequired: boolean;
}
export interface TransformToData {
  prop: TransformProp;
  offset: number;
  max: number;
  scale: number;
}
export interface TransformFromData {
  prop: TransformProp;
  offset: number;
  to: TransformToData[];
}
export interface TransformData {
  kind: 'transform';
  index: number;
  id: Id;
  name: string;
  bones: number[];
  source: number;
  localSource: boolean;
  localTarget: boolean;
  additive: boolean;
  clamp: boolean;
  properties: TransformFromData[];
  /** rotation, x, y, scaleX, scaleY, shearY */
  offsets: number[];
  /** setup mixes: rotate, x, y, scaleX, scaleY, shearY */
  mix: number[];
  skinRequired: boolean;
}
/** Spine 4.3 slider: applies `animation` at a manual time or at a time driven by a bone property. */
export interface SliderData {
  kind: 'slider';
  index: number;
  id: Id;
  name: string;
  /** The animation that is applied (`null`: the slider does nothing). */
  animation: Animation | null;
  /** Bones whose local transform the animation modifies. */
  animatedBones: number[];
  additive: boolean;
  loop: boolean;
  /** Setup mix and setup time. */
  mix: number;
  time: number;
  /** Driver bone index, or -1. */
  bone: number;
  property: TransformProp;
  from: number;
  to: number;
  scale: number;
  local: boolean;
  skinRequired: boolean;
}
/** Spine 4.3 path constraint: bones follow the path attachment shown in `slot`. */
export interface PathConstraintData {
  kind: 'path';
  index: number;
  id: Id;
  name: string;
  bones: number[];
  slot: number;
  positionMode: PathPositionMode;
  spacingMode: PathSpacingMode;
  rotateMode: PathRotateMode;
  offsetRotation: number;
  position: number;
  spacing: number;
  /** setup mixes: rotate, x, y */
  mix: number[];
  skinRequired: boolean;
}
/** Spine 4.3 physics constraint on one bone. `massInverse` and `step` (= 1 / fps) are what the simulation uses. */
export interface PhysicsData {
  kind: 'physics';
  index: number;
  id: Id;
  name: string;
  bone: number;
  x: number;
  y: number;
  rotate: number;
  scaleX: number;
  shearX: number;
  scaleY: 'none' | 'uniform' | 'volume';
  limit: number;
  step: number;
  inertia: number;
  strength: number;
  damping: number;
  massInverse: number;
  wind: number;
  gravity: number;
  mix: number;
  global: Record<PhysicsParam, boolean>;
  skinRequired: boolean;
}
export type ConstraintData = IkData | TransformData | SliderData | PathConstraintData | PhysicsData;

export interface SkeletonData {
  name: string;
  fps: number;
  /** What wind and gravity of the physics constraints are measured against. */
  referenceScale: number;
  bones: BoneData[];
  slots: SlotData[];
  skins: SkinData[];
  defaultSkin: SkinData;
  constraints: ConstraintData[];
  boneIndex: Map<Id, number>;
  slotIndex: Map<Id, number>;
  constraintIndex: Map<Id, number>;
  skinById: Map<Id, SkinData>;
  /** A linked mesh that shares the deform of its source -> the source (the deform timelines of the source move it, its own are ignored). */
  deformSource: Map<AttachmentData, AttachmentData>;
  /** A source mesh -> the slots (other than its own) that can show a linked mesh sharing its deform. */
  deformFollowers: Map<AttachmentData, number[]>;
  /** Token that changes whenever the bone id order changes (invalidates weighted attachment caches). */
  boneOrderKey: string;
  /** The draw order folders: id and the setup indices of their slots in setup order. */
  folders: { id: Id; slots: number[] }[];
}

// ------------------------------------------------------------------ compile

const attachmentCache = new WeakMap<Attachment, { key: string; data: AttachmentData }>();

function compileAttachment(att: Attachment, boneIndex: Map<Id, number>, boneOrderKey: string): AttachmentData {
  const weighted = (att.type === 'mesh' || att.type === 'clipping' || att.type === 'boundingbox' || att.type === 'path') && att.weights != null;
  const hit = attachmentCache.get(att);
  if (hit && (!weighted || hit.key === boneOrderKey)) return hit.data;

  let data: AttachmentData;
  if (att.type === 'point') {
    data = { kind: 'point', src: att, name: att.name, color: att.color, x: att.x, y: att.y, rotation: att.rotation };
  } else if (att.type === 'path') {
    data = { kind: 'path', src: att, name: att.name, color: att.color, closed: att.closed, constantSpeed: att.constantSpeed, lengths: [], ...compileVertices(polygonVertexCount(att), att.vertices, att.weights, boneIndex) };
  } else if (att.type === 'clipping') {
    data = { kind: 'clipping', src: att, name: att.name, color: att.color, end: att.end, convex: att.convex, inverse: att.inverse, ...compileVertices(polygonVertexCount(att), att.vertices, att.weights, boneIndex) };
  } else if (att.type === 'boundingbox') {
    data = { kind: 'boundingbox', src: att, name: att.name, color: att.color, ...compileVertices(polygonVertexCount(att), att.vertices, att.weights, boneIndex) };
  } else if (att.type === 'region') {
    data = {
      kind: 'region',
      src: att,
      name: att.name,
      path: att.path,
      x: att.x,
      y: att.y,
      rotation: att.rotation,
      scaleX: att.scaleX,
      scaleY: att.scaleY,
      width: att.width,
      height: att.height,
      color: att.color,
    };
  } else {
    const vertexCount = att.uvs.length >> 1;
    data = {
      kind: 'mesh',
      src: att,
      name: att.name,
      path: att.path,
      color: att.color,
      width: att.width,
      height: att.height,
      uvs: Float32Array.from(att.uvs),
      triangles: Uint16Array.from(att.triangles),
      hull: att.hull,
      ...compileVertices(vertexCount, att.vertices, att.weights, boneIndex),
    };
  }
  attachmentCache.set(att, { key: boneOrderKey, data });
  return data;
}

/** Packs unweighted (x,y) or weighted (influence) vertex data into the typed arrays `meshWorldVertices` reads. */
function compileVertices(vertexCount: number, vertices: number[], weights: Influence[][] | null, boneIndex: Map<Id, number>): VertexData {
  if (!weights) {
    const positions = Float32Array.from(vertices);
    return { vertexCount, weighted: false, positions, bones: null, deformLength: positions.length };
  }
  let influences = 0;
  const lists: { bone: number; x: number; y: number; w: number }[][] = [];
  for (let i = 0; i < vertexCount; i++) {
    const src = weights[i] ?? [];
    const list: { bone: number; x: number; y: number; w: number }[] = [];
    for (const inf of src) {
      const bi = boneIndex.get(inf[0]);
      if (bi === undefined) continue;
      list.push({ bone: bi, x: inf[1], y: inf[2], w: inf[3] });
    }
    if (list.length === 0) list.push({ bone: 0, x: 0, y: 0, w: 1 });
    influences += list.length;
    lists.push(list);
  }
  const positions = new Float32Array(influences * 3);
  const bones = new Int32Array(vertexCount + influences);
  let p = 0;
  let b = 0;
  for (const list of lists) {
    bones[b++] = list.length;
    for (const inf of list) {
      bones[b++] = inf.bone;
      positions[p++] = inf.x;
      positions[p++] = inf.y;
      positions[p++] = inf.w;
    }
  }
  return { vertexCount, weighted: true, positions, bones, deformLength: influences * 2 };
}

/** Fills `deformSource` and `deformFollowers`: which linked meshes follow the deform of which source. */
function resolveLinkedMeshes(doc: SkeletonDoc, data: SkeletonData) {
  doc.skins.forEach((skin, si) => {
    const compiledSkin = data.skins[si];
    for (const slotId in skin.attachments) {
      const slotIdx = data.slotIndex.get(slotId);
      if (slotIdx === undefined) continue;
      for (const name in skin.attachments[slotId]) {
        const att = skin.attachments[slotId][name];
        if (att.type !== 'mesh' || !att.link?.deform) continue;
        const source = linkSource(doc, slotId, att);
        const sourceIdx = source ? data.slotIndex.get(source.slotId) : undefined;
        if (!source || sourceIdx === undefined) continue;
        const from = compiledSkin.attachments[slotIdx]?.get(name);
        const to = data.skinById.get(source.skin.id)?.attachments[sourceIdx]?.get(att.link.source);
        if (!from || !to) continue;
        data.deformSource.set(from, to);
        if (sourceIdx !== slotIdx) {
          const list = data.deformFollowers.get(to) ?? [];
          if (!list.includes(slotIdx)) list.push(slotIdx);
          data.deformFollowers.set(to, list);
        }
      }
    }
  });
}

/** Stable topological order: parents always before children, otherwise document order is kept. */
function orderedBones(doc: SkeletonDoc) {
  const out: typeof doc.bones = [];
  const placed = new Set<Id>();
  const byId = new Map(doc.bones.map((b) => [b.id, b] as const));
  const visit = (b: (typeof doc.bones)[number], depth: number) => {
    if (placed.has(b.id) || depth > doc.bones.length) return;
    if (b.parent) {
      const p = byId.get(b.parent);
      if (p) visit(p, depth + 1);
    }
    placed.add(b.id);
    out.push(b);
  };
  for (const b of doc.bones) visit(b, 0);
  return out;
}

const compileMemo = new WeakMap<SkeletonDoc, SkeletonData>();

export function compileSkeleton(doc: SkeletonDoc): SkeletonData {
  const memo = compileMemo.get(doc);
  if (memo) return memo;

  const bonesDoc = orderedBones(doc);
  const boneIndex = new Map<Id, number>();
  bonesDoc.forEach((b, i) => boneIndex.set(b.id, i));
  const boneOrderKey = bonesDoc.map((b) => b.id).join('|');

  // A bone below a "skin required" bone is required too: a skin that does not list the parent leaves it without a matrix, and the
  // official runtime would still update the child on top of it (NaN). Spine's editor marks the children itself; here it is a rule.
  const required = new Set<Id>();
  for (const b of bonesDoc) if (b.skinRequired || (b.parent !== null && required.has(b.parent))) required.add(b.id);
  const bones: BoneData[] = bonesDoc.map((b, i) => ({
    index: i,
    id: b.id,
    name: b.name,
    parent: b.parent !== null ? (boneIndex.get(b.parent) ?? -1) : -1,
    children: [],
    length: b.length,
    x: b.x,
    y: b.y,
    rotation: b.rotation,
    scaleX: b.scaleX,
    scaleY: b.scaleY,
    shearX: b.shearX,
    shearY: b.shearY,
    inherit: b.inherit,
    skinRequired: required.has(b.id),
    color: b.color,
  }));
  for (const b of bones) if (b.parent >= 0) bones[b.parent].children.push(b.index);

  const slotIndex = new Map<Id, number>();
  const slots: SlotData[] = doc.slots.map((s, i) => {
    slotIndex.set(s.id, i);
    return {
      index: i,
      id: s.id,
      name: s.name,
      bone: boneIndex.get(s.bone) ?? 0,
      color: s.color,
      dark: s.dark,
      blend: s.blend,
      attachment: s.attachment,
    };
  });

  const constraintIndex = new Map<Id, number>();
  const constraints: ConstraintData[] = [];
  for (const c of doc.constraints) {
    if (c.type === 'slider') {
      const driver = c.bone === null ? -1 : (boneIndex.get(c.bone) ?? -2);
      if (driver === -2) continue; // dangling driver bone
      const animation = c.animation ? (doc.animations.find((a) => a.id === c.animation) ?? null) : null;
      const animatedBones: number[] = [];
      if (animation) {
        for (const id of Object.keys(animation.bones)) {
          const bi = boneIndex.get(id);
          const tl = animation.bones[id];
          if (bi !== undefined && BONE_PROPS.some((p) => tl[p]?.length)) animatedBones.push(bi);
        }
      }
      constraintIndex.set(c.id, constraints.length);
      constraints.push({
        kind: 'slider',
        index: constraints.length,
        id: c.id,
        name: c.name,
        animation,
        animatedBones,
        additive: c.additive,
        loop: c.loop,
        mix: c.mix,
        time: c.time,
        bone: driver,
        property: c.property,
        from: c.from,
        to: c.to,
        scale: c.scale,
        local: c.local,
        skinRequired: c.skinRequired,
      });
      continue;
    }
    if (c.type === 'physics') {
      const bone = boneIndex.get(c.bone);
      if (bone === undefined) continue; // dangling reference
      constraintIndex.set(c.id, constraints.length);
      constraints.push({
        kind: 'physics',
        index: constraints.length,
        id: c.id,
        name: c.name,
        bone,
        x: c.x,
        y: c.y,
        rotate: c.rotate,
        scaleX: c.scaleX,
        shearX: c.shearX,
        scaleY: c.scaleY,
        limit: c.limit,
        step: 1 / c.fps,
        inertia: c.inertia,
        strength: c.strength,
        damping: c.damping,
        massInverse: 1 / c.mass,
        wind: c.wind,
        gravity: c.gravity,
        mix: c.mix,
        global: { ...c.global },
        skinRequired: c.skinRequired,
      });
      continue;
    }
    const bi = c.bones.map((id) => boneIndex.get(id)).filter((v): v is number => v !== undefined);
    if (c.type === 'path') {
      const slot = slotIndex.get(c.target);
      if (bi.length === 0 || bi.length !== c.bones.length || slot === undefined) continue; // dangling reference
      constraintIndex.set(c.id, constraints.length);
      constraints.push({
        kind: 'path',
        index: constraints.length,
        id: c.id,
        name: c.name,
        bones: bi,
        slot,
        positionMode: c.positionMode,
        spacingMode: c.spacingMode,
        rotateMode: c.rotateMode,
        offsetRotation: c.offsetRotation,
        position: c.position,
        spacing: c.spacing,
        mix: [c.mix.rotate, c.mix.x, c.mix.y],
        skinRequired: c.skinRequired,
      });
      continue;
    }
    if (c.type === 'transform') {
      const source = boneIndex.get(c.source);
      if (bi.length === 0 || bi.length !== c.bones.length || source === undefined) continue;
      constraintIndex.set(c.id, constraints.length);
      constraints.push({
        kind: 'transform',
        index: constraints.length,
        id: c.id,
        name: c.name,
        bones: bi,
        source,
        localSource: c.localSource,
        localTarget: c.localTarget,
        additive: c.additive,
        clamp: c.clamp,
        properties: c.properties.map((f) => ({ prop: f.prop, offset: f.offset, to: f.to.map((t) => ({ prop: t.prop, offset: t.offset, max: t.max, scale: t.scale })) })),
        offsets: [c.offsets.rotation, c.offsets.x, c.offsets.y, c.offsets.scaleX, c.offsets.scaleY, c.offsets.shearY],
        mix: [c.mix.rotate, c.mix.x, c.mix.y, c.mix.scaleX, c.mix.scaleY, c.mix.shearY],
        skinRequired: c.skinRequired,
      });
      continue;
    }
    const target = boneIndex.get(c.target);
    if (bi.length === 0 || bi.length !== c.bones.length || target === undefined) continue; // dangling reference
    constraintIndex.set(c.id, constraints.length);
    constraints.push({
      kind: 'ik',
      index: constraints.length,
      id: c.id,
      name: c.name,
      bones: bi,
      target,
      mix: c.mix,
      softness: c.softness,
      bendDirection: c.bendPositive ? 1 : -1,
      compress: c.compress,
      stretch: c.stretch,
      scaleY: c.scaleY,
      skinRequired: c.skinRequired,
    });
  }

  const skinById = new Map<Id, SkinData>();
  const pathEntries: { att: PathAttachmentData; slot: number }[] = [];
  const skins: SkinData[] = doc.skins.map((s) => {
    const perSlot: Map<string, AttachmentData>[] = slots.map(() => new Map());
    for (const slotId in s.attachments) {
      const si = slotIndex.get(slotId);
      if (si === undefined) continue;
      const atts = s.attachments[slotId];
      for (const name in atts) {
        const compiled = compileAttachment(atts[name], boneIndex, boneOrderKey);
        if (compiled.kind === 'path') {
          // the lengths depend on the setup pose of THIS document, so every compile gets its own copy of the data
          const own: PathAttachmentData = { ...compiled, lengths: [] };
          pathEntries.push({ att: own, slot: si });
          perSlot[si].set(name, own);
        } else perSlot[si].set(name, compiled);
      }
    }
    const skin: SkinData = {
      id: s.id,
      name: s.name,
      attachments: perSlot,
      bones: s.bones.map((id) => boneIndex.get(id)).filter((v): v is number => v !== undefined),
      constraints: s.constraints.map((id) => constraintIndex.get(id)).filter((v): v is number => v !== undefined),
    };
    skinById.set(s.id, skin);
    return skin;
  });
  const defaultSkin = skins[0] ?? { id: '', name: 'default', attachments: slots.map(() => new Map()), bones: [], constraints: [] };

  const data: SkeletonData = {
    name: doc.name,
    fps: doc.fps,
    referenceScale: doc.referenceScale ?? 100,
    bones,
    slots,
    skins,
    defaultSkin,
    constraints,
    boneIndex,
    slotIndex,
    constraintIndex,
    skinById,
    deformSource: new Map(),
    deformFollowers: new Map(),
    boneOrderKey,
    folders: (doc.drawOrderFolders ?? []).map((f) => ({ id: f.id, slots: f.slots.map((s) => slotIndex.get(s)).filter((i): i is number => i !== undefined).sort((a, b) => a - b) })),
  };
  if (hasLinkedMeshes(doc)) resolveLinkedMeshes(doc, data);
  if (pathEntries.length) fillPathLengths(data, pathEntries);
  compileMemo.set(doc, data);
  return data;
}

/** Measures the curves of every path attachment in the setup pose (animation and constraints ignored). */
function fillPathLengths(data: SkeletonData, entries: { att: PathAttachmentData; slot: number }[]) {
  const sk = new Skeleton(data);
  sk.updateId = 1;
  for (const b of sk.bones) {
    b.ax = b.x;
    b.ay = b.y;
    b.arotation = b.rotation;
    b.ascaleX = b.scaleX;
    b.ascaleY = b.scaleY;
    b.ashearX = b.shearX;
    b.ashearY = b.shearY;
    b.updateWorldTransform();
  }
  const points: number[] = [];
  for (const { att, slot } of entries) {
    meshWorldVertices(sk, sk.slots[slot], att, null, points);
    att.lengths = pathCurveLengths(points, Math.floor(att.vertexCount / 3), att.closed);
  }
}

// ------------------------------------------------------------------ runtime objects

export class Bone {
  readonly data: BoneData;
  readonly skeleton: Skeleton;
  parent: Bone | null = null;
  readonly children: Bone[] = [];

  /** Local pose (setup + animation). */
  x = 0;
  y = 0;
  rotation = 0;
  scaleX = 1;
  scaleY = 1;
  shearX = 0;
  shearY = 0;
  inherit: Inherit = 'normal';

  /** Applied local transform (matches the world transform after constraints). */
  ax = 0;
  ay = 0;
  arotation = 0;
  ascaleX = 1;
  ascaleY = 1;
  ashearX = 0;
  ashearY = 0;

  /** World transform: world = [a b; c d] * local + [worldX worldY]. */
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  worldX = 0;
  worldY = 0;

  /**
   * Spine 4.3's lazy transforms. `world === skeleton.updateId`: the world transform is current.
   * `local === skeleton.updateId`: the applied local transform is stale because the world transform was modified.
   * Constraints edit the applied local (`a*`) or world values and invalidate what depends on them; a bone that
   * shows up again in the update cache only recomputes its world transform if it was invalidated.
   */
  world = 0;
  local = 0;
  sorted = false;
  active = true;

  constructor(data: BoneData, skeleton: Skeleton) {
    this.data = data;
    this.skeleton = skeleton;
    this.setToSetupPose();
  }

  setToSetupPose() {
    const d = this.data;
    this.x = d.x;
    this.y = d.y;
    this.rotation = d.rotation;
    this.scaleX = d.scaleX;
    this.scaleY = d.scaleY;
    this.shearX = d.shearX;
    this.shearY = d.shearY;
    this.inherit = d.inherit;
  }

  /** Update cache entry: computes the world transform unless it is already current. */
  update() {
    if (this.world !== this.skeleton.updateId) this.updateWorldTransform();
  }

  /** World transform from the parent's world transform and this bone's applied local transform. Children are not updated. */
  updateWorldTransform() {
    const skeleton = this.skeleton;
    if (this.local === skeleton.updateId) this.updateAppliedTransform();
    else this.world = skeleton.updateId;
    this.updateWorldTransformWith(this.ax, this.ay, this.arotation, this.ascaleX, this.ascaleY, this.ashearX, this.ashearY);
  }

  /** Makes sure the applied local transform reflects the current world transform (needed before reading or editing it). */
  validateApplied() {
    if (this.local === this.skeleton.updateId) this.updateAppliedTransform();
  }

  /** A constraint is about to edit the applied LOCAL transform: the world transform of this bone and its descendants becomes stale. */
  modifyLocal() {
    this.validateApplied();
    this.world = 0;
    this.resetWorld();
  }

  /** A constraint is about to edit the WORLD transform: the applied local transform becomes stale, descendants are invalidated. */
  modifyWorld() {
    const id = this.skeleton.updateId;
    this.local = id;
    this.world = id;
    this.resetWorld();
  }

  private resetWorld() {
    const id = this.skeleton.updateId;
    for (const child of this.children) {
      if (child.world === id) {
        if (child.local === id) child.updateAppliedTransform();
        child.world = 0;
        child.resetWorld();
      }
    }
  }

  updateWorldTransformWith(x: number, y: number, rotation: number, scaleX: number, scaleY: number, shearX: number, shearY: number) {
    this.ax = x;
    this.ay = y;
    this.arotation = rotation;
    this.ascaleX = scaleX;
    this.ascaleY = scaleY;
    this.ashearX = shearX;
    this.ashearY = shearY;

    const skeleton = this.skeleton;
    const parent = this.parent;
    if (!parent) {
      const sx = skeleton.scaleX;
      const sy = skeleton.scaleY;
      const rx = (rotation + shearX) * DEG2RAD;
      const ry = (rotation + 90 + shearY) * DEG2RAD;
      this.a = Math.cos(rx) * scaleX * sx;
      this.b = Math.cos(ry) * scaleY * sx;
      this.c = Math.sin(rx) * scaleX * sy;
      this.d = Math.sin(ry) * scaleY * sy;
      this.worldX = x * sx + skeleton.x;
      this.worldY = y * sy + skeleton.y;
      return;
    }

    let pa = parent.a;
    let pb = parent.b;
    let pc = parent.c;
    let pd = parent.d;
    this.worldX = pa * x + pb * y + parent.worldX;
    this.worldY = pc * x + pd * y + parent.worldY;

    switch (this.inherit) {
      case 'normal': {
        const rx = (rotation + shearX) * DEG2RAD;
        const ry = (rotation + 90 + shearY) * DEG2RAD;
        const la = Math.cos(rx) * scaleX;
        const lb = Math.cos(ry) * scaleY;
        const lc = Math.sin(rx) * scaleX;
        const ld = Math.sin(ry) * scaleY;
        this.a = pa * la + pb * lc;
        this.b = pa * lb + pb * ld;
        this.c = pc * la + pd * lc;
        this.d = pc * lb + pd * ld;
        return;
      }
      case 'onlyTranslation': {
        const sx = skeleton.scaleX;
        const sy = skeleton.scaleY;
        const rx = (rotation + shearX) * DEG2RAD;
        const ry = (rotation + 90 + shearY) * DEG2RAD;
        this.a = Math.cos(rx) * scaleX * sx;
        this.b = Math.cos(ry) * scaleY * sx;
        this.c = Math.sin(rx) * scaleX * sy;
        this.d = Math.sin(ry) * scaleY * sy;
        break;
      }
      case 'noRotationOrReflection': {
        const sx = skeleton.scaleX;
        const sy = skeleton.scaleY;
        const sxi = 1 / sx;
        const syi = 1 / sy;
        pa *= sxi;
        pc *= syi;
        let s = pa * pa + pc * pc;
        let r = 0;
        if (s > EPS2) {
          s = Math.abs(pa * pd * syi - pb * sxi * pc) / s;
          pb = pc * s;
          pd = pa * s;
          r = rotation - atan2Deg(pc, pa);
        } else {
          pa = 0;
          pc = 0;
          r = rotation - 90 + atan2Deg(pd, pb);
        }
        const rx = (r + shearX) * DEG2RAD;
        const ry = (r + shearY + 90) * DEG2RAD;
        const la = Math.cos(rx) * scaleX;
        const lb = Math.cos(ry) * scaleY;
        const lc = Math.sin(rx) * scaleX;
        const ld = Math.sin(ry) * scaleY;
        this.a = (pa * la - pb * lc) * sx;
        this.b = (pa * lb - pb * ld) * sx;
        this.c = (pc * la + pd * lc) * sy;
        this.d = (pc * lb + pd * ld) * sy;
        break;
      }
      case 'noScale':
      case 'noScaleOrReflection': {
        const sx = skeleton.scaleX;
        const sy = skeleton.scaleY;
        const sxi = 1 / sx;
        const syi = 1 / sy;
        const r = rotation * DEG2RAD;
        const cos = Math.cos(r);
        const sin = Math.sin(r);
        let za = (pa * cos + pb * sin) * sxi;
        let zc = (pc * cos + pd * sin) * syi;
        const zl = Math.sqrt(za * za + zc * zc);
        const s = zl > 0 ? 1 / zl : 0; // zero only for a collapsed parent (the official code gets Infinity here)
        za *= s;
        zc *= s;
        let zb = -zc;
        let zd = za;
        if (this.inherit === 'noScale' && (pa * pd - pb * pc < 0) !== (sx < 0 !== sy < 0)) {
          zb = -zb;
          zd = -zd;
        }
        const rx = shearX * DEG2RAD;
        const ry = (90 + shearY) * DEG2RAD;
        const la = Math.cos(rx) * scaleX;
        const lb = Math.cos(ry) * scaleY;
        const lc = Math.sin(rx) * scaleX;
        const ld = Math.sin(ry) * scaleY;
        this.a = (za * la + zb * lc) * sx;
        this.b = (za * lb + zb * ld) * sx;
        this.c = (zc * la + zd * lc) * sy;
        this.d = (zc * lb + zd * ld) * sy;
        break;
      }
    }
  }

  /** Recomputes the applied local transform from the (possibly modified) world transform. */
  updateAppliedTransform() {
    const skeleton = this.skeleton;
    this.local = 0;
    this.world = skeleton.updateId;
    const sx = skeleton.scaleX;
    const sy = skeleton.scaleY;
    const parent = this.parent;
    if (!parent) {
      const sxi = 1 / sx;
      const syi = 1 / sy;
      this.ax = (this.worldX - skeleton.x) * sxi;
      this.ay = (this.worldY - skeleton.y) * syi;
      this.set5(this.a * sxi, this.b * sxi, this.c * syi, this.d * syi, 0);
      return;
    }
    let pa = parent.a;
    let pb = parent.b;
    let pc = parent.c;
    let pd = parent.d;
    const pad = pa * pd - pb * pc;
    // a singular parent (a bone scaled to 0, say) has no inverse; the official code divides by zero here and produces NaN
    // for the whole subtree, we keep every transform finite instead
    const pid = pad === 0 || !Number.isFinite(1 / pad) ? 0 : 1 / pad;
    const ia = pd * pid;
    const ib = pb * pid;
    const ic = pc * pid;
    const id = pa * pid;
    const dx = this.worldX - parent.worldX;
    const dy = this.worldY - parent.worldY;
    this.ax = dx * ia - dy * ib;
    this.ay = dy * id - dx * ic;

    switch (this.inherit) {
      case 'normal':
        this.set5(ia * this.a - ib * this.c, ia * this.b - ib * this.d, id * this.c - ic * this.a, id * this.d - ic * this.b, 0);
        break;
      case 'onlyTranslation': {
        const sxi = 1 / sx;
        const syi = 1 / sy;
        this.set5(this.a * sxi, this.b * sxi, this.c * syi, this.d * syi, 0);
        break;
      }
      case 'noRotationOrReflection': {
        const sxi = 1 / sx;
        const syi = 1 / sy;
        pa *= sxi;
        pc *= syi;
        const wa = this.a * sxi;
        const wb = this.b * sxi;
        const wc = this.c * syi;
        const wd = this.d * syi;
        // a collapsed parent (first column 0) has no rotation to undo: the official code divides by zero, we stay finite
        const sd = pa * pa + pc * pc;
        const s = sd > 0 ? 1 / sd : 0;
        const dd = Math.abs(pad * sxi * syi);
        const det = dd > 0 ? 1 / dd : 0;
        this.set5((pa * wa + pc * wc) * s, (pa * wb + pc * wd) * s, (pa * wc - pc * wa) * det, (pa * wd - pc * wb) * det, atan2Deg(pc, pa));
        break;
      }
      case 'noScale':
      case 'noScaleOrReflection': {
        const sxi = 1 / sx;
        const syi = 1 / sy;
        const wa = this.a * sxi;
        const wb = this.b * sxi;
        const wc = this.c * syi;
        const wd = this.d * syi;
        let tx = pd * this.a - pb * this.c;
        let ty = pa * this.c - pc * this.a;
        if (pad < 0) {
          tx = -tx;
          ty = -ty;
        }
        let r = atan2Deg(ty, tx);
        this.arotation = r;
        r *= DEG2RAD;
        const cos = Math.cos(r);
        const sin = Math.sin(r);
        let za = (pa * cos + pb * sin) * sxi;
        let zc = (pc * cos + pd * sin) * syi;
        const zl = Math.sqrt(za * za + zc * zc);
        const s = zl > 0 ? 1 / zl : 0; // zero only for a collapsed parent (the official code gets Infinity here)
        za *= s;
        zc *= s;
        const si = this.inherit === 'noScale' && pad < 0 !== (sx < 0 !== sy < 0) ? -1 : 1;
        this.set4(za * wa + zc * wc, za * wb + zc * wd, (za * wc - zc * wa) * si, (za * wd - zc * wb) * si);
      }
    }
  }

  private set4(ra: number, rb: number, rc: number, rd: number) {
    const x = ra * ra + rc * rc;
    const y = rb * rb + rd * rd;
    if (x > EPS2) {
      this.ashearX = atan2Deg(rc, ra);
      this.ascaleX = Math.sqrt(x);
    } else {
      this.ashearX = 0;
      this.ascaleX = 0;
    }
    this.ascaleY = Math.sqrt(y);
    if (y > EPS2) {
      this.ashearY = atan2Deg(rd, rb);
      if (ra * rd - rb * rc < 0) {
        this.ascaleY = -this.ascaleY;
        this.ashearY += 90;
      } else this.ashearY -= 90;
      if (this.ashearY > 180) this.ashearY -= 360;
      else if (this.ashearY <= -180) this.ashearY += 360;
    } else this.ashearY = 0;
  }

  private set5(ra: number, rb: number, rc: number, rd: number, ro: number) {
    this.ashearX = 0;
    const x = ra * ra + rc * rc;
    const y = rb * rb + rd * rd;
    if (x > EPS2) {
      const r = atan2Deg(rc, ra);
      this.arotation = r + ro;
      this.ascaleX = Math.sqrt(x);
      this.ascaleY = Math.sqrt(y);
      if (y > EPS2) {
        this.ashearY = atan2Deg(rd, rb);
        if (ra * rd - rb * rc < 0) {
          this.ascaleY = -this.ascaleY;
          this.ashearY += 90 - r;
        } else this.ashearY -= 90 + r;
        if (this.ashearY > 180) this.ashearY -= 360;
        else if (this.ashearY <= -180) this.ashearY += 360;
      } else this.ashearY = 0;
    } else {
      this.ascaleX = 0;
      this.ascaleY = Math.sqrt(y);
      this.ashearY = 0;
      this.arotation = y > EPS2 ? atan2Deg(rd, rb) - 90 + ro : ro;
    }
  }

  worldToLocal(wx: number, wy: number, out: [number, number] = [0, 0]): [number, number] {
    const det = this.a * this.d - this.b * this.c;
    if (!(Math.abs(det) > 1e-12)) {
      // a collapsed bone (scaled to 0) has no inverse: its origin is the closest local position
      out[0] = 0;
      out[1] = 0;
      return out;
    }
    const x = wx - this.worldX;
    const y = wy - this.worldY;
    out[0] = (x * this.d - y * this.b) / det;
    out[1] = (y * this.a - x * this.c) / det;
    return out;
  }

  localToWorld(lx: number, ly: number, out: [number, number] = [0, 0]): [number, number] {
    out[0] = lx * this.a + ly * this.b + this.worldX;
    out[1] = lx * this.c + ly * this.d + this.worldY;
    return out;
  }

  get worldRotationX(): number {
    return atan2Deg(this.c, this.a);
  }
  get worldRotationY(): number {
    return atan2Deg(this.d, this.b);
  }
  get worldScaleX(): number {
    return Math.sqrt(this.a * this.a + this.c * this.c);
  }
  get worldScaleY(): number {
    return Math.sqrt(this.b * this.b + this.d * this.d);
  }
  /** Tip of the bone in world space. */
  get tipX(): number {
    return this.worldX + this.a * this.data.length;
  }
  get tipY(): number {
    return this.worldY + this.c * this.data.length;
  }
}

export class Slot {
  readonly data: SlotData;
  readonly bone: Bone;
  color: RGBA = [1, 1, 1, 1];
  dark: RGB | null = null;
  attachmentName: string | null = null;
  /** Deform deltas for the current attachment (empty = none). */
  deform: number[] = [];
  /** The frame of the current attachment's sequence that a sequence timeline chose; -1 = none (the setup frame shows). */
  sequenceIndex = -1;

  constructor(data: SlotData, bone: Bone) {
    this.data = data;
    this.bone = bone;
    this.setToSetupPose();
  }

  setToSetupPose() {
    const d = this.data;
    this.color = [d.color[0], d.color[1], d.color[2], d.color[3]];
    this.dark = d.dark ? [d.dark[0], d.dark[1], d.dark[2]] : null;
    this.attachmentName = d.attachment;
    this.deform = [];
    this.sequenceIndex = -1;
  }
}

export class IkConstraint {
  readonly kind = 'ik' as const;
  readonly data: IkData;
  readonly bones: Bone[];
  readonly target: Bone;
  mix: number;
  softness: number;
  bendDirection: number;
  compress: boolean;
  stretch: boolean;
  active = true;

  constructor(data: IkData, skeleton: Skeleton) {
    this.data = data;
    this.bones = data.bones.map((i) => skeleton.bones[i]);
    this.target = skeleton.bones[data.target];
    this.mix = data.mix;
    this.softness = data.softness;
    this.bendDirection = data.bendDirection;
    this.compress = data.compress;
    this.stretch = data.stretch;
  }

  setToSetupPose() {
    const d = this.data;
    this.mix = d.mix;
    this.softness = d.softness;
    this.bendDirection = d.bendDirection;
    this.compress = d.compress;
    this.stretch = d.stretch;
  }

  sourceActive() {
    return this.target.active;
  }

  sort(skeleton: Skeleton) {
    this.active = this.target.active;
    if (!this.active) return;
    skeleton.sortBone(this.target);
    const parent = this.bones[0];
    skeleton.sortBone(parent);
    skeleton.cache.push(this);
    // the constrained bones (and their descendants) are updated again after the constraint changed their local transforms
    parent.sorted = false;
    skeleton.sortReset(parent.children);
  }

  update() {
    if (this.mix === 0) return;
    const t = this.target;
    const sy = this.data.scaleY;
    if (this.bones.length === 1) apply1(this.bones[0], t.worldX, t.worldY, this.compress, this.stretch, sy, this.mix);
    else apply2(this.bones[0], this.bones[1], t.worldX, t.worldY, this.bendDirection, this.stretch, sy, this.softness, this.mix);
  }
}

const MIX_INDEX: Record<TransformProp, number> = { rotate: 0, x: 1, y: 2, scaleX: 3, scaleY: 4, shearY: 5 };
const PI2 = SPINE_PI * 2;

function transformFrom(prop: TransformProp, sk: Skeleton, s: Bone, local: boolean, off: number[]): number {
  const sx = sk.scaleX;
  const sy = sk.scaleY;
  switch (prop) {
    case 'rotate': {
      if (local) return s.arotation + off[0];
      let v = Math.atan2(s.c / sy, s.a / sx) * RAD2DEG + ((s.a * s.d - s.b * s.c) * sx * sy > 0 ? off[0] : -off[0]);
      if (v < 0) v += 360;
      return v;
    }
    case 'x':
      return local ? s.ax + off[1] : (off[1] * s.a + off[2] * s.b + s.worldX) / sx;
    case 'y':
      return local ? s.ay + off[2] : (off[1] * s.c + off[2] * s.d + s.worldY) / sy;
    case 'scaleX': {
      if (local) return s.ascaleX + off[3];
      const a = s.a / sx;
      const c = s.c / sy;
      return Math.sqrt(a * a + c * c) + off[3];
    }
    case 'scaleY': {
      if (local) return s.ascaleY + off[4];
      const b = s.b / sx;
      const d = s.d / sy;
      return Math.sqrt(b * b + d * d) + off[4];
    }
    case 'shearY': {
      if (local) return s.ashearY + off[5];
      const ix = 1 / sx;
      const iy = 1 / sy;
      return (Math.atan2(s.d * iy, s.b * ix) - Math.atan2(s.c * iy, s.a * ix)) * RAD2DEG - 90 + off[5];
    }
  }
}

function transformTo(prop: TransformProp, sk: Skeleton, mix: number[], bone: Bone, value: number, local: boolean, additive: boolean) {
  const sx = sk.scaleX;
  const sy = sk.scaleY;
  const m = mix[MIX_INDEX[prop]];
  switch (prop) {
    case 'rotate': {
      if (local) {
        bone.arotation += (additive ? value : value - bone.arotation) * m;
        return;
      }
      const ix = 1 / sx;
      const iy = 1 / sy;
      const a = bone.a * ix;
      const b = bone.b * ix;
      const c = bone.c * iy;
      const d = bone.d * iy;
      value *= DEG2RAD;
      if (!additive) value -= Math.atan2(c, a);
      if (value > SPINE_PI) value -= PI2;
      else if (value < -SPINE_PI) value += PI2;
      value *= m;
      const cos = Math.cos(value);
      const sin = Math.sin(value);
      bone.a = (cos * a - sin * c) * sx;
      bone.b = (cos * b - sin * d) * sx;
      bone.c = (sin * a + cos * c) * sy;
      bone.d = (sin * b + cos * d) * sy;
      return;
    }
    case 'x':
      if (local) bone.ax += (additive ? value : value - bone.ax) * m;
      else {
        if (!additive) value -= bone.worldX / sx;
        bone.worldX += value * m * sx;
      }
      return;
    case 'y':
      if (local) bone.ay += (additive ? value : value - bone.ay) * m;
      else {
        if (!additive) value -= bone.worldY / sy;
        bone.worldY += value * m * sy;
      }
      return;
    case 'scaleX':
      if (local) {
        if (additive) bone.ascaleX *= 1 + (value - 1) * m;
        else if (bone.ascaleX !== 0) bone.ascaleX += (value - bone.ascaleX) * m;
      } else if (additive) {
        const s = 1 + (value - 1) * m;
        bone.a *= s;
        bone.c *= s;
      } else {
        const a = bone.a / sx;
        const c = bone.c / sy;
        let s = Math.sqrt(a * a + c * c);
        if (s !== 0) {
          s = 1 + ((value - s) * m) / s;
          bone.a *= s;
          bone.c *= s;
        }
      }
      return;
    case 'scaleY':
      if (local) {
        if (additive) bone.ascaleY *= 1 + (value - 1) * m;
        else if (bone.ascaleY !== 0) bone.ascaleY += (value - bone.ascaleY) * m;
      } else if (additive) {
        const s = 1 + (value - 1) * m;
        bone.b *= s;
        bone.d *= s;
      } else {
        const b = bone.b / sx;
        const d = bone.d / sy;
        let s = Math.sqrt(b * b + d * d);
        if (s !== 0) {
          s = 1 + ((value - s) * m) / s;
          bone.b *= s;
          bone.d *= s;
        }
      }
      return;
    case 'shearY': {
      if (local) {
        if (!additive) value -= bone.ashearY;
        bone.ashearY += value * m;
        return;
      }
      const b = bone.b / sx;
      const d = bone.d / sy;
      const by = Math.atan2(d, b);
      value = (value + 90) * DEG2RAD;
      if (additive) value -= SPINE_PI / 2;
      else {
        value -= by - Math.atan2(bone.c / sy, bone.a / sx);
        if (value > SPINE_PI) value -= PI2;
        else if (value < -SPINE_PI) value += PI2;
      }
      value = by + value * m;
      const s = Math.sqrt(b * b + d * d);
      bone.b = Math.cos(value) * s * sx;
      bone.d = Math.sin(value) * s * sy;
    }
  }
}

/** Spine 4.3 transform constraint: maps properties of a source bone onto constrained bones. */
export class TransformConstraintRT {
  readonly kind = 'transform' as const;
  readonly data: TransformData;
  readonly skeleton: Skeleton;
  readonly bones: Bone[];
  readonly source: Bone;
  mix: number[];
  active = true;
  /** The world rotation the source had when the constraint last read it (0..360), NaN before; lets the tests spot a read on the 0/360 wrap. */
  lastSourceRotation = Number.NaN;

  constructor(data: TransformData, skeleton: Skeleton) {
    this.data = data;
    this.skeleton = skeleton;
    this.bones = data.bones.map((i) => skeleton.bones[i]);
    this.source = skeleton.bones[data.source];
    this.mix = data.mix.slice();
  }

  setToSetupPose() {
    this.mix = this.data.mix.slice();
  }

  sourceActive() {
    return this.source.active;
  }

  sort(skeleton: Skeleton) {
    const d = this.data;
    if (!d.localSource) skeleton.sortBone(this.source);
    const worldTarget = !d.localTarget;
    if (worldTarget) for (const b of this.bones) skeleton.sortBone(b);
    skeleton.cache.push(this);
    for (const b of this.bones) skeleton.sortReset(b.children);
    for (const b of this.bones) b.sorted = worldTarget;
  }

  update() {
    const m = this.mix;
    if (m[0] === 0 && m[1] === 0 && m[2] === 0 && m[3] === 0 && m[4] === 0 && m[5] === 0) return;
    const d = this.data;
    const sk = this.skeleton;
    const source = this.source;
    if (d.localSource) source.validateApplied();
    for (const bone of this.bones) {
      if (d.localTarget) bone.modifyLocal();
      else bone.modifyWorld();
      for (const from of d.properties) {
        const raw = transformFrom(from.prop, sk, source, d.localSource, d.offsets);
        if (from.prop === 'rotate' && !d.localSource) this.lastSourceRotation = raw;
        const value = raw - from.offset;
        for (const to of from.to) {
          if (m[MIX_INDEX[to.prop]] === 0) continue;
          let clamped = to.offset + value * to.scale;
          if (d.clamp) {
            clamped = to.offset < to.max ? Math.min(to.max, Math.max(to.offset, clamped)) : Math.min(to.offset, Math.max(to.max, clamped));
          }
          transformTo(to.prop, sk, m, bone, clamped, d.localTarget, d.additive);
        }
      }
    }
  }
}

const NO_OFFSETS = [0, 0, 0, 0, 0, 0];

/**
 * Spine 4.3 slider. Applies an animation on top of the current (constrained) pose, at a time that is either its own
 * `time` (animatable) or computed from a bone property: `to + (value - from) * scale`.
 */
export class SliderRT {
  readonly kind = 'slider' as const;
  readonly data: SliderData;
  readonly skeleton: Skeleton;
  readonly bone: Bone | null;
  mix: number;
  time: number;
  active = true;

  constructor(data: SliderData, skeleton: Skeleton) {
    this.data = data;
    this.skeleton = skeleton;
    this.bone = data.bone >= 0 ? skeleton.bones[data.bone] : null;
    this.mix = data.mix;
    this.time = data.time;
  }

  setToSetupPose() {
    this.mix = this.data.mix;
    this.time = this.data.time;
  }

  sourceActive() {
    // a slider that has no animation does nothing and is not exported, so it must not shape the update order either
    return this.data.animation !== null;
  }

  sort(skeleton: Skeleton) {
    const d = this.data;
    if (this.bone && !d.local) skeleton.sortBone(this.bone);
    skeleton.cache.push(this);
    // the animated bones change their local transforms: they (and their descendants) are updated again afterwards
    for (const i of d.animatedBones) {
      const bone = skeleton.bones[i];
      bone.sorted = false;
      skeleton.sortReset(bone.children);
    }
  }

  update() {
    if (this.mix === 0) return;
    const d = this.data;
    const animation = d.animation;
    if (!animation) return;
    const sk = this.skeleton;
    const bone = this.bone;
    if (bone) {
      if (!bone.active) return;
      if (d.local) bone.validateApplied();
      this.time = d.to + (transformFrom(d.property, sk, bone, d.local, NO_OFFSETS) - d.from) * d.scale;
      if (d.loop && animation.duration > 0) this.time = animation.duration + (this.time % animation.duration);
      else this.time = Math.max(0, this.time);
    }
    for (const i of d.animatedBones) sk.bones[i].modifyLocal();
    applyAnimationOnto(sk, animation, this.time, this.mix, d.additive, d.loop);
  }
}

/**
 * Spine 4.3 path constraint: moves, rotates and (chainScale) stretches bones so they follow the path attachment that is
 * shown in a slot. A statement by statement port of the official `PathConstraint.update` / `sort`.
 */
export class PathConstraintRT {
  readonly kind = 'path' as const;
  readonly data: PathConstraintData;
  readonly skeleton: Skeleton;
  readonly bones: Bone[];
  readonly slot: Slot;
  position: number;
  spacing: number;
  /** mixRotate, mixX, mixY */
  mix: number[];
  active = true;
  /** True when a bone had to turn by exactly half a turn (the wrap of the angle decides which way): two runtimes can differ by float noise there. Read by the tests. */
  onBranchCut = false;
  private readonly scratch = newPathScratch();
  private readonly points: number[] = [];
  private lengths: number[] = [];

  constructor(data: PathConstraintData, skeleton: Skeleton) {
    this.data = data;
    this.skeleton = skeleton;
    this.bones = data.bones.map((i) => skeleton.bones[i]);
    this.slot = skeleton.slots[data.slot];
    this.position = data.position;
    this.spacing = data.spacing;
    this.mix = data.mix.slice();
  }

  setToSetupPose() {
    this.position = this.data.position;
    this.spacing = this.data.spacing;
    this.mix = this.data.mix.slice();
  }

  sourceActive() {
    return this.slot.bone.active;
  }

  sort(skeleton: Skeleton) {
    const slotIndex = this.slot.data.index;
    const slotBone = this.slot.bone;
    if (skeleton.skin) this.sortPathSlot(skeleton, skeleton.skin, slotIndex, slotBone);
    if (skeleton.data.defaultSkin !== skeleton.skin) this.sortPathSlot(skeleton, skeleton.data.defaultSkin, slotIndex, slotBone);
    this.sortPath(skeleton, skeleton.slotAttachment(this.slot), slotBone);
    for (const bone of this.bones) skeleton.sortBone(bone);
    skeleton.cache.push(this);
    for (const bone of this.bones) skeleton.sortReset(bone.children);
    for (const bone of this.bones) bone.sorted = true;
  }

  private sortPathSlot(skeleton: Skeleton, skin: SkinData, slotIndex: number, slotBone: Bone) {
    const entries = skin.attachments[slotIndex];
    if (entries) for (const att of entries.values()) this.sortPath(skeleton, att, slotBone);
  }

  /** Bones that move the path must be up to date before the constraint reads its points. */
  private sortPath(skeleton: Skeleton, att: AttachmentData | null, slotBone: Bone) {
    if (!att || att.kind !== 'path') return;
    const pathBones = att.bones;
    if (!pathBones) skeleton.sortBone(slotBone);
    else {
      const bones = skeleton.bones;
      for (let i = 0, n = pathBones.length; i < n; ) {
        let nn = pathBones[i++];
        nn += i;
        while (i < nn) skeleton.sortBone(bones[pathBones[i++]]);
      }
    }
  }

  update() {
    const skeleton = this.skeleton;
    const att = skeleton.slotAttachment(this.slot);
    if (!att || att.kind !== 'path') return;
    const mixRotate = this.mix[0];
    const mixX = this.mix[1];
    const mixY = this.mix[2];
    if (mixRotate === 0 && mixX === 0 && mixY === 0) return;
    this.onBranchCut = false;
    const data = this.data;
    const tangents = data.rotateMode === 'tangent';
    const scale = data.rotateMode === 'chainScale';
    const bones = this.bones;
    const boneCount = bones.length;
    const spacesCount = tangents ? boneCount : boneCount + 1;
    const spaces = setSize(this.scratch.spaces, spacesCount);
    const lengths = scale ? (this.lengths = setSize(this.lengths, boneCount)) : [];
    const spacing = this.spacing;
    switch (data.spacingMode) {
      case 'percent':
        if (scale) {
          for (let i = 0, n = spacesCount - 1; i < n; i++) {
            const bone = bones[i];
            const setupLength = bone.data.length;
            const x = setupLength * bone.a;
            const y = setupLength * bone.c;
            lengths[i] = Math.sqrt(x * x + y * y);
          }
        }
        for (let i = 1; i < spacesCount; i++) spaces[i] = spacing;
        break;
      case 'proportional': {
        let sum = 0;
        for (let i = 0, n = spacesCount - 1; i < n; ) {
          const bone = bones[i];
          const setupLength = bone.data.length;
          if (setupLength < EPS) {
            if (scale) lengths[i] = 0;
            spaces[++i] = spacing;
          } else {
            const x = setupLength * bone.a;
            const y = setupLength * bone.c;
            const length = Math.sqrt(x * x + y * y);
            if (scale) lengths[i] = length;
            spaces[++i] = length;
            sum += length;
          }
        }
        if (sum > 0) {
          sum = (spacesCount / sum) * spacing;
          for (let i = 1; i < spacesCount; i++) spaces[i] *= sum;
        }
        break;
      }
      default: {
        const lengthSpacing = data.spacingMode === 'length';
        for (let i = 0, n = spacesCount - 1; i < n; ) {
          const bone = bones[i];
          const setupLength = bone.data.length;
          if (setupLength < EPS) {
            if (scale) lengths[i] = 0;
            spaces[++i] = spacing;
          } else {
            const x = setupLength * bone.a;
            const y = setupLength * bone.c;
            const length = Math.sqrt(x * x + y * y);
            if (scale) lengths[i] = length;
            spaces[++i] = ((lengthSpacing ? Math.max(0, setupLength + spacing) : spacing) * length) / setupLength;
          }
        }
      }
    }

    // the path's points in world space (with the slot's deformation and the bones it is skinned to)
    const slot = this.slot;
    meshWorldVertices(skeleton, slot, att, slot.deform.length ? slot.deform : null, this.points);
    const positions = computeWorldPositions(
      { points: this.points, verticesLength: att.vertexCount * 2, closed: att.closed, constantSpeed: att.constantSpeed, lengths: att.lengths, position: this.position, positionMode: data.positionMode, spacingMode: data.spacingMode },
      this.scratch,
      spacesCount,
      tangents,
    );
    let boneX = positions[0];
    let boneY = positions[1];
    let offsetRotation = data.offsetRotation;
    let tip = false;
    if (offsetRotation === 0) tip = data.rotateMode === 'chain';
    else {
      tip = false;
      const bone = slot.bone;
      offsetRotation *= bone.a * bone.d - bone.b * bone.c > 0 ? DEG2RAD : -DEG2RAD;
    }
    for (let i = 0, ip = 3; i < boneCount; i++, ip += 3) {
      const bone = bones[i];
      bone.modifyWorld();
      bone.worldX += (boneX - bone.worldX) * mixX;
      bone.worldY += (boneY - bone.worldY) * mixY;
      const x = positions[ip];
      const y = positions[ip + 1];
      const dx = x - boneX;
      const dy = y - boneY;
      if (scale) {
        const length = lengths[i];
        if (length !== 0) {
          const s = (Math.sqrt(dx * dx + dy * dy) / length - 1) * mixRotate + 1;
          bone.a *= s;
          bone.c *= s;
        }
      }
      boneX = x;
      boneY = y;
      if (mixRotate > 0) {
        const a = bone.a;
        const b = bone.b;
        const c = bone.c;
        const d = bone.d;
        let r = 0;
        if (tangents) r = positions[ip - 1];
        else if (spaces[i + 1] === 0) r = positions[ip + 2];
        else r = Math.atan2(dy, dx);
        r -= Math.atan2(c, a);
        if (tip) {
          const cos = Math.cos(r);
          const sin = Math.sin(r);
          const length = bone.data.length;
          boneX += (length * (cos * a - sin * c) - dx) * mixRotate;
          boneY += (length * (sin * a + cos * c) - dy) * mixRotate;
        } else r += offsetRotation;
        if (Math.abs(Math.abs(r) - SPINE_PI) < 1e-6) this.onBranchCut = true;
        if (r > SPINE_PI) r -= PI2;
        else if (r < -SPINE_PI) r += PI2;
        r *= mixRotate;
        const cos = Math.cos(r);
        const sin = Math.sin(r);
        bone.a = cos * a - sin * c;
        bone.b = cos * b - sin * d;
        bone.c = sin * a + cos * c;
        bone.d = sin * b + cos * d;
      }
    }
  }
}

/** How a physics constraint is treated by `Skeleton.updateWorldTransform`: Spine's `Physics` enum. */
export type PhysicsMode = 'none' | 'reset' | 'update' | 'pose';

/**
 * Spine 4.3 physics constraint: a spring simulation that moves, rotates, scales or shears one bone, driven by the bone's own
 * movement. A statement by statement port of the official `PhysicsConstraint.update`; the state it keeps between calls
 * (`ux`, offsets, velocities...) is why it is only simulated while an animation plays.
 */
export class PhysicsConstraintRT {
  readonly kind = 'physics' as const;
  readonly data: PhysicsData;
  readonly skeleton: Skeleton;
  readonly bone: Bone;
  active = true;
  // the animatable parameters
  inertia: number;
  strength: number;
  damping: number;
  massInverse: number;
  wind: number;
  gravity: number;
  mix: number;
  // simulation state
  private isReset = true;
  private ux = 0;
  private uy = 0;
  private cx = 0;
  private cy = 0;
  private tx = 0;
  private ty = 0;
  private xOffset = 0;
  private xLag = 0;
  private xVelocity = 0;
  private yOffset = 0;
  private yLag = 0;
  private yVelocity = 0;
  private rotateOffset = 0;
  private rotateLag = 0;
  private rotateVelocity = 0;
  private scaleOffset = 0;
  private scaleLag = 0;
  private scaleVelocity = 0;
  private remaining = 0;
  private lastTime = 0;

  constructor(data: PhysicsData, skeleton: Skeleton) {
    this.data = data;
    this.skeleton = skeleton;
    this.bone = skeleton.bones[data.bone];
    this.inertia = data.inertia;
    this.strength = data.strength;
    this.damping = data.damping;
    this.massInverse = data.massInverse;
    this.wind = data.wind;
    this.gravity = data.gravity;
    this.mix = data.mix;
  }

  /** The animatable parameters; timelines and the editor see the mass, the simulation uses its inverse. */
  getParam(p: PhysicsParam): number {
    return p === 'mass' ? 1 / this.massInverse : this[p];
  }
  setParam(p: PhysicsParam, v: number) {
    if (p === 'mass') this.massInverse = 1 / v;
    else this[p] = v;
  }

  setToSetupPose() {
    const d = this.data;
    this.inertia = d.inertia;
    this.strength = d.strength;
    this.damping = d.damping;
    this.massInverse = d.massInverse;
    this.wind = d.wind;
    this.gravity = d.gravity;
    this.mix = d.mix;
  }

  sourceActive() {
    return this.bone.active;
  }

  sort(skeleton: Skeleton) {
    skeleton.sortBone(this.bone);
    skeleton.cache.push(this);
    skeleton.sortReset(this.bone.children);
  }

  /** Forgets everything the simulation has learned from movement: the next update starts from rest. */
  reset() {
    this.remaining = 0;
    this.lastTime = this.skeleton.time;
    this.isReset = true;
    this.xOffset = 0;
    this.xLag = 0;
    this.xVelocity = 0;
    this.yOffset = 0;
    this.yLag = 0;
    this.yVelocity = 0;
    this.rotateOffset = 0;
    this.rotateLag = 0;
    this.rotateVelocity = 0;
    this.scaleOffset = 0;
    this.scaleLag = 0;
    this.scaleVelocity = 0;
  }

  /** The next update reacts as if the bone had moved by an additional (x, y) in world space. */
  translate(x: number, y: number) {
    this.ux -= x;
    this.uy -= y;
    this.cx -= x;
    this.cy -= y;
  }

  /** The next update reacts as if the bone had rotated around (x, y) in world space. */
  rotate(x: number, y: number, degrees: number) {
    const r = degrees * DEG2RAD;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const dx = this.cx - x;
    const dy = this.cy - y;
    this.translate(dx * cos - dy * sin - dx, dx * sin + dy * cos - dy);
  }

  update() {
    const skeleton = this.skeleton;
    const mix = this.mix;
    if (mix === 0) return;
    const d = this.data;
    const x = d.x > 0;
    const y = d.y > 0;
    const rotateOrShearX = d.rotate > 0 || d.shearX > 0;
    const scaleX = d.scaleX > 0;
    const bone = this.bone;
    const l = bone.data.length;
    const t = d.step;
    let z = 0;
    const physics = skeleton.physicsMode;
    if (physics === 'none') return;
    bone.modifyWorld();
    if (physics === 'reset') this.reset();
    if (physics === 'reset' || physics === 'update') {
      const delta = Math.max(skeleton.time - this.lastTime, 0);
      const aa = this.remaining;
      this.remaining += delta;
      this.lastTime = skeleton.time;
      const bx = bone.worldX;
      const by = bone.worldY;
      if (this.isReset) {
        this.isReset = false;
        this.ux = bx;
        this.uy = by;
      } else {
        let a = this.remaining;
        const i = this.inertia;
        const f = skeleton.data.referenceScale;
        let dd = -1; // the official runtime calls this "d"; it is only computed when a step is due
        let m = 0;
        let e = 0;
        let qx = d.limit * delta;
        let qy = qx * Math.abs(skeleton.scaleY);
        qx *= Math.abs(skeleton.scaleX);
        if (x || y) {
          if (x) {
            const u = (this.ux - bx) * i;
            this.xOffset += u > qx ? qx : u < -qx ? -qx : u;
            this.ux = bx;
          }
          if (y) {
            const u = (this.uy - by) * i;
            this.yOffset += u > qy ? qy : u < -qy ? -qy : u;
            this.uy = by;
          }
          if (a >= t) {
            const xs = this.xOffset;
            const ys = this.yOffset;
            dd = this.damping ** (60 * t);
            m = t * this.massInverse;
            e = this.strength;
            const w = f * this.wind;
            const g = f * this.gravity;
            const ax = (w * skeleton.windX + g * skeleton.gravityX) * skeleton.scaleX;
            const ay = (w * skeleton.windY + g * skeleton.gravityY) * skeleton.scaleY;
            do {
              if (x) {
                this.xVelocity += (ax - this.xOffset * e) * m;
                this.xOffset += this.xVelocity * t;
                this.xVelocity *= dd;
              }
              if (y) {
                this.yVelocity -= (ay + this.yOffset * e) * m;
                this.yOffset += this.yVelocity * t;
                this.yVelocity *= dd;
              }
              a -= t;
            } while (a >= t);
            this.xLag = this.xOffset - xs;
            this.yLag = this.yOffset - ys;
          }
          z = Math.max(0, 1 - a / t);
          if (x) bone.worldX += (this.xOffset - this.xLag * z) * mix * d.x;
          if (y) bone.worldY += (this.yOffset - this.yLag * z) * mix * d.y;
        }
        if (rotateOrShearX || scaleX) {
          const ca = Math.atan2(bone.c, bone.a);
          let c = 0;
          let s = 0;
          let mr = 0;
          let dx = this.cx - bone.worldX;
          let dy = this.cy - bone.worldY;
          if (dx > qx) dx = qx;
          else if (dx < -qx) dx = -qx;
          if (dy > qy) dy = qy;
          else if (dy < -qy) dy = -qy;
          a = this.remaining;
          if (rotateOrShearX) {
            mr = (d.rotate + d.shearX) * mix;
            z = this.rotateLag * Math.max(0, 1 - aa / t);
            let r = Math.atan2(dy + this.ty, dx + this.tx) - ca - (this.rotateOffset - z) * mr;
            this.rotateOffset += (r - Math.ceil(r * INV_PI2 - 0.5) * PI2) * i;
            r = (this.rotateOffset - z) * mr + ca;
            c = Math.cos(r);
            s = Math.sin(r);
            if (scaleX) {
              r = l * bone.worldScaleX;
              if (r > 0) this.scaleOffset += ((dx * c + dy * s) * i) / r;
            }
          } else {
            c = Math.cos(ca);
            s = Math.sin(ca);
            const r = l * bone.worldScaleX - this.scaleLag * Math.max(0, 1 - aa / t);
            if (r > 0) this.scaleOffset += ((dx * c + dy * s) * i) / r;
          }
          if (a >= t) {
            if (dd === -1) {
              dd = this.damping ** (60 * t);
              m = t * this.massInverse;
              e = this.strength;
            }
            const ax = this.wind * skeleton.windX + this.gravity * skeleton.gravityX;
            const ay = (this.wind * skeleton.windY + this.gravity * skeleton.gravityY) * 1; // Skeleton.yDir: y points up
            const rs = this.rotateOffset;
            const ss = this.scaleOffset;
            const h = l / f;
            for (;;) {
              a -= t;
              if (scaleX) {
                this.scaleVelocity += (ax * c - ay * s - this.scaleOffset * e) * m;
                this.scaleOffset += this.scaleVelocity * t;
                this.scaleVelocity *= dd;
              }
              if (rotateOrShearX) {
                this.rotateVelocity -= ((ax * s + ay * c) * h + this.rotateOffset * e) * m;
                this.rotateOffset += this.rotateVelocity * t;
                this.rotateVelocity *= dd;
                if (a < t) break;
                const r = this.rotateOffset * mr + ca;
                c = Math.cos(r);
                s = Math.sin(r);
              } else if (a < t) break;
            }
            this.rotateLag = this.rotateOffset - rs;
            this.scaleLag = this.scaleOffset - ss;
          }
          z = Math.max(0, 1 - a / t);
        }
        this.remaining = a;
      }
      this.cx = bone.worldX;
      this.cy = bone.worldY;
    } else {
      // 'pose': the simulation is not advanced, what it has computed so far is applied again
      z = Math.max(0, 1 - this.remaining / t);
      if (x) bone.worldX += (this.xOffset - this.xLag * z) * mix * d.x;
      if (y) bone.worldY += (this.yOffset - this.yLag * z) * mix * d.y;
    }
    if (rotateOrShearX) {
      let o = (this.rotateOffset - this.rotateLag * z) * mix;
      let s = 0;
      let c = 0;
      let a = 0;
      if (d.shearX > 0) {
        let r = 0;
        if (d.rotate > 0) {
          r = o * d.rotate;
          s = Math.sin(r);
          c = Math.cos(r);
          a = bone.b;
          bone.b = c * a - s * bone.d;
          bone.d = s * a + c * bone.d;
        }
        r += o * d.shearX;
        s = Math.sin(r);
        c = Math.cos(r);
        a = bone.a;
        bone.a = c * a - s * bone.c;
        bone.c = s * a + c * bone.c;
      } else {
        o *= d.rotate;
        s = Math.sin(o);
        c = Math.cos(o);
        a = bone.a;
        bone.a = c * a - s * bone.c;
        bone.c = s * a + c * bone.c;
        a = bone.b;
        bone.b = c * a - s * bone.d;
        bone.d = s * a + c * bone.d;
      }
    }
    if (scaleX) {
      let s = 1 + (this.scaleOffset - this.scaleLag * z) * mix * d.scaleX;
      bone.a *= s;
      bone.c *= s;
      if (d.scaleY === 'uniform') {
        bone.b *= s;
        bone.d *= s;
      } else if (d.scaleY === 'volume') {
        s = Math.abs(s);
        s = s >= 0.7 ? 1 / s : 4 - 3.67347 * s;
        bone.b *= s;
        bone.d *= s;
      }
    }
    if (physics !== 'pose') {
      this.tx = l * bone.a;
      this.ty = l * bone.c;
    }
  }
}

function scaleYFactor(mode: IkData['scaleY'], s: number): number {
  if (mode === 'uniform') return s;
  if (mode === 'volume') return 1 / (s < 0.7 ? 0.25 + 0.642857 * s : s);
  return 1;
}

function apply1(bone: Bone, targetX: number, targetY: number, compress: boolean, stretch: boolean, scaleYMode: IkData['scaleY'], alpha: number) {
  bone.modifyLocal();
  const p = bone.parent;
  if (!p) return;
  const skeleton = bone.skeleton;
  let pa = p.a;
  let pb = p.b;
  let pc = p.c;
  let pd = p.d;
  let rotationIK = -bone.ashearX - bone.arotation;
  let tx = 0;
  let ty = 0;
  switch (bone.inherit) {
    case 'onlyTranslation':
      tx = (targetX - bone.worldX) * signum(skeleton.scaleX);
      ty = (targetY - bone.worldY) * signum(skeleton.scaleY);
      break;
    case 'noRotationOrReflection': {
      const s = Math.abs(pa * pd - pb * pc) / Math.max(EPS, pa * pa + pc * pc);
      const sa = pa / skeleton.scaleX;
      const sc = pc / skeleton.scaleY;
      pb = -sc * s * skeleton.scaleX;
      pd = sa * s * skeleton.scaleY;
      rotationIK += atan2Deg(sc, sa);
      const x = targetX - p.worldX;
      const y = targetY - p.worldY;
      const d = pa * pd - pb * pc;
      if (Math.abs(d) <= EPS) {
        tx = 0;
        ty = 0;
      } else {
        tx = (x * pd - y * pb) / d - bone.ax;
        ty = (y * pa - x * pc) / d - bone.ay;
      }
      break;
    }
    default: {
      const x = targetX - p.worldX;
      const y = targetY - p.worldY;
      const d = pa * pd - pb * pc;
      if (Math.abs(d) <= EPS) {
        tx = 0;
        ty = 0;
      } else {
        tx = (x * pd - y * pb) / d - bone.ax;
        ty = (y * pa - x * pc) / d - bone.ay;
      }
    }
  }
  rotationIK += atan2Deg(ty, tx);
  if (bone.ascaleX < 0) rotationIK += 180;
  if (rotationIK > 180) rotationIK -= 360;
  else if (rotationIK <= -180) rotationIK += 360;
  let sx = bone.ascaleX;
  let sy = bone.ascaleY;
  if (compress || stretch) {
    if (bone.inherit === 'noScale' || bone.inherit === 'noScaleOrReflection') {
      tx = targetX - bone.worldX;
      ty = targetY - bone.worldY;
    }
    const b = bone.data.length * sx;
    if (b > EPS) {
      const dd = tx * tx + ty * ty;
      if ((compress && dd < b * b) || (stretch && dd > b * b)) {
        const s = (Math.sqrt(dd) / b - 1) * alpha + 1;
        sx *= s;
        sy *= scaleYFactor(scaleYMode, s);
      }
    }
  }
  // the world transform is recomputed when the bone comes up in the update cache again
  bone.arotation += rotationIK * alpha;
  bone.ascaleX = sx;
  bone.ascaleY = sy;
}

function apply2(parent: Bone, child: Bone, targetX: number, targetY: number, bendDir: number, stretch: boolean, scaleYMode: IkData['scaleY'], softness: number, alpha: number) {
  if (parent.inherit !== 'normal' || child.inherit !== 'normal') return;
  parent.modifyLocal();
  child.modifyLocal();
  const pp = parent.parent;
  if (!pp) return;
  const px = parent.ax;
  const py = parent.ay;
  let psx = parent.ascaleX;
  let psy = parent.ascaleY;
  let sx = psx;
  let sy = psy;
  let csx = child.ascaleX;
  let os1 = 0;
  let os2 = 0;
  let s2 = 0;
  if (psx < 0) {
    psx = -psx;
    os1 = 180;
    s2 = -1;
  } else {
    os1 = 0;
    s2 = 1;
  }
  if (psy < 0) {
    psy = -psy;
    s2 = -s2;
  }
  if (csx < 0) {
    csx = -csx;
    os2 = 180;
  } else os2 = 0;
  const cx = child.ax;
  let cy = 0;
  let cwx = 0;
  let cwy = 0;
  let a = parent.a;
  let b = parent.b;
  let c = parent.c;
  let d = parent.d;
  const u = Math.abs(psx - psy) <= EPS;
  if (!u || stretch) {
    cy = 0;
    cwx = a * cx + parent.worldX;
    cwy = c * cx + parent.worldY;
  } else {
    cy = child.ay;
    cwx = a * cx + b * cy + parent.worldX;
    cwy = c * cx + d * cy + parent.worldY;
  }
  a = pp.a;
  b = pp.b;
  c = pp.c;
  d = pp.d;
  let id = a * d - b * c;
  let x = cwx - pp.worldX;
  let y = cwy - pp.worldY;
  id = Math.abs(id) <= EPS ? 0 : 1 / id;
  const dx = (x * d - y * b) * id - px;
  const dy = (y * a - x * c) * id - py;
  const l1 = Math.sqrt(dx * dx + dy * dy);
  let l2 = child.data.length * csx;
  let a1 = 0;
  let a2 = 0;
  if (l1 < EPS) {
    apply1(parent, targetX, targetY, false, stretch, 'none', alpha);
    child.ay = cy;
    child.arotation = 0;
    return;
  }
  x = targetX - pp.worldX;
  y = targetY - pp.worldY;
  let tx = (x * d - y * b) * id - px;
  let ty = (y * a - x * c) * id - py;
  let dd = tx * tx + ty * ty;
  if (softness !== 0) {
    softness *= psx * (csx + 1) * 0.5;
    const td = Math.sqrt(dd);
    const sd = td - l1 - l2 * psx + softness;
    if (sd > 0) {
      let p = Math.min(1, sd / (softness * 2)) - 1;
      p = (sd - softness * (1 - p * p)) / td;
      tx -= p * tx;
      ty -= p * ty;
      dd = tx * tx + ty * ty;
    }
  }
  let solved = false;
  if (u) {
    l2 *= psx;
    let cos = (dd - l1 * l1 - l2 * l2) / (2 * l1 * l2);
    if (cos < -1) {
      cos = -1;
      a2 = Math.PI * bendDir;
    } else if (cos > 1) {
      cos = 1;
      a2 = 0;
      if (stretch) {
        a = (Math.sqrt(dd) / (l1 + l2) - 1) * alpha + 1;
        sx *= a;
        sy *= scaleYFactor(scaleYMode, a);
      }
    } else a2 = Math.acos(cos) * bendDir;
    a = l1 + l2 * cos;
    b = l2 * Math.sin(a2);
    a1 = Math.atan2(ty * a - tx * b, tx * a + ty * b);
    solved = true;
  } else {
    a = psx * l2;
    b = psy * l2;
    const aa = a * a;
    const bb = b * b;
    const ta = Math.atan2(ty, tx);
    c = bb * l1 * l1 + aa * dd - aa * bb;
    const c1 = -2 * bb * l1;
    const c2 = bb - aa;
    d = c1 * c1 - 4 * c2 * c;
    if (d >= 0) {
      let q = Math.sqrt(d);
      if (c1 < 0) q = -q;
      q = -(c1 + q) * 0.5;
      const r0 = q / c2;
      const r1 = c / q;
      const r = Math.abs(r0) < Math.abs(r1) ? r0 : r1;
      const r2 = dd - r * r;
      if (r2 >= 0) {
        y = Math.sqrt(r2) * bendDir;
        a1 = ta - Math.atan2(y, r);
        a2 = Math.atan2(y / psy, (r - l1) / psx);
        solved = true;
      }
    }
    if (!solved) {
      let minAngle = SPINE_PI;
      let minX = l1 - a;
      let minDist = minX * minX;
      let minY = 0;
      let maxAngle = 0;
      let maxX = l1 + a;
      let maxDist = maxX * maxX;
      let maxY = 0;
      c = (-a * l1) / (aa - bb);
      if (c >= -1 && c <= 1) {
        c = Math.acos(c);
        x = a * Math.cos(c) + l1;
        y = b * Math.sin(c);
        d = x * x + y * y;
        if (d < minDist) {
          minAngle = c;
          minDist = d;
          minX = x;
          minY = y;
        }
        if (d > maxDist) {
          maxAngle = c;
          maxDist = d;
          maxX = x;
          maxY = y;
        }
      }
      if (dd <= (minDist + maxDist) * 0.5) {
        a1 = ta - Math.atan2(minY * bendDir, minX);
        a2 = minAngle * bendDir;
      } else {
        a1 = ta - Math.atan2(maxY * bendDir, maxX);
        a2 = maxAngle * bendDir;
      }
    }
  }
  const os = Math.atan2(cy, cx) * s2;
  let rotation = parent.arotation;
  a1 = (a1 - os) * RAD2DEG + os1 - rotation;
  if (a1 > 180) a1 -= 360;
  else if (a1 <= -180) a1 += 360;
  parent.arotation = rotation + a1 * alpha;
  parent.ascaleX = sx;
  parent.ascaleY = sy;
  rotation = child.arotation;
  a2 = ((a2 + os) * RAD2DEG - child.ashearX) * s2 + os2 - rotation;
  if (a2 > 180) a2 -= 360;
  else if (a2 <= -180) a2 += 360;
  child.ay = cy;
  child.arotation = rotation + a2 * alpha;
}

// ------------------------------------------------------------------ skeleton instance

export class Skeleton {
  readonly data: SkeletonData;
  readonly bones: Bone[];
  readonly slots: Slot[];
  readonly constraints: Array<IkConstraint | TransformConstraintRT | SliderRT | PathConstraintRT | PhysicsConstraintRT>;
  drawOrder: Slot[];
  skin: SkinData | null = null;
  x = 0;
  y = 0;
  scaleX = 1;
  scaleY = 1;
  color: RGBA = [1, 1, 1, 1];
  /** Update order of bones and constraints. */
  cache: Array<Bone | IkConstraint | TransformConstraintRT | SliderRT | PathConstraintRT | PhysicsConstraintRT> = [];
  /** Seconds the skeleton has been advanced by `update`; the physics constraints measure their time with it. */
  time = 0;
  /** Directions of the wind and of gravity (the physics parameters of the constraints are their strengths). */
  windX = 1;
  windY = 0;
  gravityX = 0;
  gravityY = 1;
  /** What the next `updateWorldTransform` does with the physics constraints. */
  physicsMode: PhysicsMode = 'none';

  constructor(data: SkeletonData) {
    this.data = data;
    this.bones = data.bones.map((bd) => new Bone(bd, this));
    for (const bone of this.bones) {
      const p = bone.data.parent;
      if (p >= 0) {
        bone.parent = this.bones[p];
        this.bones[p].children.push(bone);
      }
    }
    this.slots = data.slots.map((sd) => new Slot(sd, this.bones[sd.bone]));
    this.drawOrder = this.slots.slice();
    this.constraints = data.constraints.map((cd) =>
      cd.kind === 'ik'
        ? new IkConstraint(cd, this)
        : cd.kind === 'transform'
          ? new TransformConstraintRT(cd, this)
          : cd.kind === 'path'
            ? new PathConstraintRT(cd, this)
            : cd.kind === 'physics'
              ? new PhysicsConstraintRT(cd, this)
              : new SliderRT(cd, this),
    );
    this.updateCache();
  }

  boneById(id: Id): Bone | undefined {
    const i = this.data.boneIndex.get(id);
    return i === undefined ? undefined : this.bones[i];
  }
  slotById(id: Id): Slot | undefined {
    const i = this.data.slotIndex.get(id);
    return i === undefined ? undefined : this.slots[i];
  }
  constraintById(id: Id): IkConstraint | TransformConstraintRT | SliderRT | PathConstraintRT | PhysicsConstraintRT | undefined {
    const i = this.data.constraintIndex.get(id);
    return i === undefined ? undefined : this.constraints[i];
  }

  physicsById(id: Id): PhysicsConstraintRT | undefined {
    const c = this.constraintById(id);
    return c && c.kind === 'physics' ? c : undefined;
  }

  /** The physics constraints of the skeleton, in update order. */
  get physicsConstraints(): PhysicsConstraintRT[] {
    return this.constraints.filter((c): c is PhysicsConstraintRT => c.kind === 'physics');
  }

  /** Advances the skeleton's time (what the physics constraints simulate against). */
  update(delta: number) {
    this.time += delta;
  }

  /** Restarts the simulation of every physics constraint: the next update starts from rest. */
  resetPhysics() {
    for (const c of this.physicsConstraints) c.reset();
  }

  physicsTranslate(x: number, y: number) {
    for (const c of this.physicsConstraints) c.translate(x, y);
  }

  physicsRotate(x: number, y: number, degrees: number) {
    for (const c of this.physicsConstraints) c.rotate(x, y, degrees);
  }

  pathById(id: Id): PathConstraintRT | undefined {
    const c = this.constraintById(id);
    return c && c.kind === 'path' ? c : undefined;
  }

  sliderById(id: Id): SliderRT | undefined {
    const c = this.constraintById(id);
    return c && c.kind === 'slider' ? c : undefined;
  }

  ikById(id: Id): IkConstraint | undefined {
    const c = this.constraintById(id);
    return c && c.kind === 'ik' ? c : undefined;
  }

  transformById(id: Id): TransformConstraintRT | undefined {
    const c = this.constraintById(id);
    return c && c.kind === 'transform' ? c : undefined;
  }

  setSkin(skin: SkinData | null) {
    this.skin = skin && skin !== this.data.defaultSkin ? skin : null;
    this.updateCache();
  }

  /** Resolves the attachment a slot would show: active skin first, then the default skin. */
  getAttachment(slotIndex: number, name: string | null): AttachmentData | null {
    if (name === null) return null;
    if (this.skin) {
      const a = this.skin.attachments[slotIndex]?.get(name);
      if (a) return a;
    }
    return this.data.defaultSkin.attachments[slotIndex]?.get(name) ?? null;
  }

  slotAttachment(slot: Slot): AttachmentData | null {
    return this.getAttachment(slot.data.index, slot.attachmentName);
  }

  updateCache() {
    this.cache.length = 0;
    const bones = this.bones;
    for (const bone of bones) {
      bone.sorted = bone.data.skinRequired;
      bone.active = !bone.sorted;
    }
    if (this.skin) {
      for (const idx of this.skin.bones) {
        let bone: Bone | null = bones[idx];
        while (bone) {
          bone.sorted = false;
          bone.active = true;
          bone = bone.parent;
        }
      }
    }
    for (const c of this.constraints) {
      c.active = c.sourceActive() && (!c.data.skinRequired || (this.skin !== null && this.skin.constraints.includes(c.data.index)));
      if (c.active) c.sort(this);
    }
    for (const bone of bones) this.sortBone(bone);
  }

  sortBone(bone: Bone) {
    // a bone that a skin does not list stays out of the update order (a constraint can clear its `sorted` mark, so check `active` too)
    if (bone.sorted || !bone.active) return;
    if (bone.parent) this.sortBone(bone.parent);
    bone.sorted = true;
    this.cache.push(bone);
  }

  sortReset(bones: Bone[]) {
    for (const bone of bones) {
      if (!bone.active) continue;
      if (bone.sorted) this.sortReset(bone.children);
      bone.sorted = false;
    }
  }

  setToSetupPose() {
    for (const b of this.bones) b.setToSetupPose();
    for (const s of this.slots) s.setToSetupPose();
    for (const c of this.constraints) c.setToSetupPose();
    this.drawOrder = this.slots.slice();
  }

  /** Increments on every `updateWorldTransform`; bones compare their `world` / `local` stamps against it. */
  updateId = 0;

  /**
   * Computes every world transform and applies the constraints. Constraints work on the *applied* local transform
   * (`a*` fields), which starts each update as a copy of the animated pose â€” the pose itself is never modified.
   */
  updateWorldTransform(physics: PhysicsMode = 'none', probe?: (item: Skeleton['cache'][number], after: boolean) => void) {
    this.physicsMode = physics;
    this.updateId++;
    for (const b of this.bones) {
      b.ax = b.x;
      b.ay = b.y;
      b.arotation = b.rotation;
      b.ascaleX = b.scaleX;
      b.ascaleY = b.scaleY;
      b.ashearX = b.shearX;
      b.ashearY = b.shearY;
    }
    if (!probe) {
      for (const item of this.cache) item.update();
      return;
    }
    // a caller that wants to look between the steps (the constraint numbers of a bone) is told before and after every item
    for (const item of this.cache) {
      probe(item, false);
      item.update();
      probe(item, true);
    }
  }

  /** World AABB of visible region/mesh attachments in the current pose: [x, y, width, height]. */
  getBounds(): [number, number, number, number] | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const tmp = new Float32Array(2048);
    for (const slot of this.drawOrder) {
      const att = this.slotAttachment(slot);
      if (!att || (att.kind !== 'region' && att.kind !== 'mesh')) continue; // outlines and points are not part of the image bounds
      let n = 0;
      let buf: Float32Array = tmp;
      if (att.kind === 'region') {
        regionWorldVertices(att, slot.bone, tmp);
        n = 4;
      } else {
        n = att.vertexCount;
        if (n * 2 > tmp.length) buf = new Float32Array(n * 2);
        meshWorldVertices(this, slot, att, slot.deform.length ? slot.deform : null, buf);
      }
      for (let i = 0; i < n; i++) {
        const x = buf[i * 2];
        const y = buf[i * 2 + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    return minX === Infinity ? null : [minX, minY, maxX - minX, maxY - minY];
  }
}

export function createSkeleton(data: SkeletonData, skinId?: Id | null, mix: readonly Id[] = []): Skeleton {
  const s = new Skeleton(data);
  const ids = mix.length ? [...(skinId ? [skinId] : []), ...mix] : skinId ? [skinId] : [];
  if (ids.length) s.setSkin(composeSkins(data, ids));
  return s;
}

/** The skin an attachment shown by a skin mix comes from: the last of the worn skins that has it, else the default skin. */
export function skinHolding(data: SkeletonData, worn: readonly Id[], slotIndex: number, name: string): Id {
  for (let i = worn.length - 1; i >= 0; i--) {
    const skin = data.skinById.get(worn[i]);
    if (skin && skin !== data.defaultSkin && skin.attachments[slotIndex]?.has(name)) return skin.id;
  }
  return data.defaultSkin.id;
}

/**
 * Several skins worn at once (the runtime's Skin.addSkin): a later skin's attachment replaces an earlier one at the same slot and name, and the
 * bones and constraints that any of them lists are active. The default skin is always the base and unknown ids are skipped. Returns the one
 * skin when only one is left, and null when none is.
 */
export function composeSkins(data: SkeletonData, ids: readonly Id[]): SkinData | null {
  const skins: SkinData[] = [];
  for (const id of ids) {
    const skin = data.skinById.get(id);
    if (skin && skin !== data.defaultSkin && !skins.includes(skin)) skins.push(skin);
  }
  if (skins.length < 2) return skins[0] ?? null;
  const attachments = data.slots.map(() => new Map<string, AttachmentData>());
  for (const skin of skins) skin.attachments.forEach((entries, slot) => entries.forEach((att, name) => attachments[slot].set(name, att)));
  return {
    id: skins.map((k) => k.id).join('+'),
    name: skins.map((k) => k.name).join(' + '),
    attachments,
    bones: [...new Set(skins.flatMap((k) => k.bones))],
    constraints: [...new Set(skins.flatMap((k) => k.constraints))],
  };
}

// ------------------------------------------------------------------ geometry

/** Fills `out` (8 floats) with the world positions of a region's quad: bottom-left, top-left, top-right, bottom-right. */
export function regionWorldVertices(att: RegionData, bone: Bone, out: Float32Array | number[]) {
  const w = att.width;
  const h = att.height;
  const lx = (-w / 2) * att.scaleX;
  const ly = (-h / 2) * att.scaleY;
  const lx2 = lx + w * att.scaleX;
  const ly2 = ly + h * att.scaleY;
  const r = att.rotation * DEG2RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const lxCos = lx * cos + att.x;
  const lxSin = lx * sin;
  const lyCos = ly * cos + att.y;
  const lySin = ly * sin;
  const lx2Cos = lx2 * cos + att.x;
  const lx2Sin = lx2 * sin;
  const ly2Cos = ly2 * cos + att.y;
  const ly2Sin = ly2 * sin;
  const ox = [lxCos - lySin, lxCos - ly2Sin, lx2Cos - ly2Sin, lx2Cos - lySin];
  const oy = [lyCos + lxSin, ly2Cos + lxSin, ly2Cos + lx2Sin, lyCos + lx2Sin];
  for (let i = 0; i < 4; i++) {
    out[i * 2] = ox[i] * bone.a + oy[i] * bone.b + bone.worldX;
    out[i * 2 + 1] = ox[i] * bone.c + oy[i] * bone.d + bone.worldY;
  }
}

export const REGION_UVS = new Float32Array([0, 1, 0, 0, 1, 0, 1, 1]);
export const REGION_TRIANGLES = new Uint16Array([0, 1, 2, 2, 3, 0]);

/** World vertex positions of a mesh or polygon attachment. `deform` holds per vertex (or per influence) deltas. */
export function meshWorldVertices(skeleton: Skeleton, slot: Slot, mesh: VertexData, deform: ArrayLike<number> | null, out: Float32Array | number[]) {
  const n = mesh.vertexCount;
  if (!mesh.weighted) {
    const bone = slot.bone;
    const v = mesh.positions;
    const dv = deform && deform.length === v.length ? deform : null;
    for (let i = 0; i < n; i++) {
      const vx = v[i * 2] + (dv ? dv[i * 2] : 0);
      const vy = v[i * 2 + 1] + (dv ? dv[i * 2 + 1] : 0);
      out[i * 2] = vx * bone.a + vy * bone.b + bone.worldX;
      out[i * 2 + 1] = vx * bone.c + vy * bone.d + bone.worldY;
    }
    return;
  }
  const bones = mesh.bones as Int32Array;
  const w = mesh.positions;
  const skelBones = skeleton.bones;
  const dv = deform && deform.length === mesh.deformLength ? deform : null;
  let v = 0;
  let b = 0;
  let f = 0;
  for (let i = 0; i < n; i++) {
    let wx = 0;
    let wy = 0;
    const count = bones[v++];
    for (let k = 0; k < count; k++, b += 3, f += 2) {
      const bone = skelBones[bones[v++]];
      let vx = w[b];
      let vy = w[b + 1];
      if (dv) {
        vx += dv[f];
        vy += dv[f + 1];
      }
      const weight = w[b + 2];
      wx += (vx * bone.a + vy * bone.b + bone.worldX) * weight;
      wy += (vx * bone.c + vy * bone.d + bone.worldY) * weight;
    }
    out[i * 2] = wx;
    out[i * 2 + 1] = wy;
  }
}

/** World position and rotation (degrees) of a point attachment — Spine's `computeWorldPosition` / `computeWorldRotation`. */
export function pointWorld(att: PointData, bone: Bone): { x: number; y: number; rotation: number } {
  const r = att.rotation * DEG2RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    x: att.x * bone.a + att.y * bone.b + bone.worldX,
    y: att.x * bone.c + att.y * bone.d + bone.worldY,
    rotation: atan2Deg(cos * bone.c + sin * bone.d, cos * bone.a + sin * bone.b),
  };
}
