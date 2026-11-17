/** Mesh / weight / deform operations on the document. */
import { makeCurve, reconcileDeform, upsertKey } from '@/core/edit';
import { RAD2DEG } from '@/core/math';
import type { Mat } from '@/core/math';
import { deformHome } from '@/core/links';
import { adjacency, autoWeights, bindMesh, generateMeshFromImage, keepOutside, locateInMesh, meshFromRegion, meshWorldPositions, mirrorWeights, normalizeInfluences, pruneWeights, removeMeshVertices, setBoneWeight, smoothWeights, swapBoneWeights, triangulate, unbindMesh } from '@/core/mesh';
import { mirrorName } from '@/core/duplicate';
import type { BoneMats, TraceOptions, VertexMap } from '@/core/mesh';
import { matInvert } from '@/core/math';
import type { Id, Influence, MeshAttachment, RegionAttachment } from '@/core/model';
import { setupPicture } from '@/core/sequence';
import { getScene, getSetupSkeleton } from '@/editor/scene';
import { assets } from './assets';
import { docStore } from './doc';
import { setSelection } from './actions';
import { toast, uiStore } from './ui';

export function setupMats(): { mats: BoneMats; slotMat: (slotId: Id) => Mat } {
  const setup = getSetupSkeleton();
  const mats: BoneMats = new Map();
  for (const b of setup.bones) mats.set(b.data.id, { a: b.a, b: b.b, c: b.c, d: b.d, x: b.worldX, y: b.worldY });
  const doc = docStore.get().skeleton;
  return {
    mats,
    slotMat: (slotId) => {
      const slot = doc.slots.find((s) => s.id === slotId);
      return (slot && mats.get(slot.bone)) ?? { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 };
    },
  };
}

export function getMesh(slotId: Id, name: string): MeshAttachment | undefined {
  const a = docStore.get().skeleton.skins[0]?.attachments[slotId]?.[name];
  return a && a.type === 'mesh' ? a : undefined;
}

let lastLinkedToast = 0;

/** The mesh to change the SHAPE of: a linked mesh has the shape of its source, so it is refused (the source is where the shape is edited). */
function getShapeMesh(slotId: Id, name: string): MeshAttachment | undefined {
  const mesh = getMesh(slotId, name);
  if (mesh?.link) {
    const now = Date.now();
    if (now - lastLinkedToast > 1500) toast(`This mesh follows the shape of "${mesh.link.source}": edit that mesh, or unlink this one first`, 'error');
    lastLinkedToast = now;
    return undefined;
  }
  return mesh;
}

export function getRegion(slotId: Id, name: string): RegionAttachment | undefined {
  const a = docStore.get().skeleton.skins[0]?.attachments[slotId]?.[name];
  return a && a.type === 'region' ? a : undefined;
}

/**
 * Replaces a mesh and keeps its deform keys valid in the same undo step: they follow their vertices (`map`), are carried
 * over per bone when the weights change, or are dropped when the layout is incompatible (`'drop'`, bind / unbind).
 */
function writeMesh(slotId: Id, name: string, mesh: MeshAttachment, label: string, map: VertexMap | 'drop' = null) {
  const before = getMesh(slotId, name);
  let dropped = false;
  docStore.update(label, (d) => {
    d.skeleton.skins[0].attachments[slotId][name] = mesh;
    if (before) dropped = reconcileDeform(d.skeleton, slotId, name, before, mesh, map);
  });
  if (dropped) toast(`Deform keys of "${name}" were removed: the mesh layout changed`);
}

// ------------------------------------------------------------------ creation

export function convertToMesh(slotId: Id, name: string, kind: 'trace' | 'quad' = 'trace', opts: TraceOptions = {}) {
  const region = getRegion(slotId, name);
  if (!region) return;
  let mesh: MeshAttachment;
  if (kind === 'quad') mesh = meshFromRegion(region);
  else {
    const img = assets.getImageData(setupPicture(region) ?? region.path);
    mesh = img ? generateMeshFromImage(region, img.data, img.width, img.height, opts) : meshFromRegion(region);
  }
  mesh.region = { x: region.x, y: region.y, rotation: region.rotation, scaleX: region.scaleX, scaleY: region.scaleY, width: region.width, height: region.height };
  writeMesh(slotId, name, mesh, 'Convert to mesh');
  setSelection({ slot: slotId, attachment: name, bones: uiStore.get().selection.bones });
  uiStore.patch({ tool: 'mesh' });
  toast(`Mesh: ${mesh.uvs.length / 2} vertices, ${mesh.triangles.length / 3} triangles`, 'ok');
}

/** Re-traces an existing (unweighted) mesh from its image. */
export function regenerateMesh(slotId: Id, name: string, opts: TraceOptions) {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh) return;
  if (mesh.weights) {
    toast('Unbind the mesh before re-tracing it', 'error');
    return;
  }
  const r = mesh.region ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: mesh.width, height: mesh.height };
  const region: RegionAttachment = { type: 'region', name: mesh.name, path: mesh.path, color: mesh.color, ...r, ...(mesh.sequence ? { sequence: mesh.sequence } : {}) };
  const img = assets.getImageData(setupPicture(mesh) ?? mesh.path);
  if (!img) return;
  const next = generateMeshFromImage(region, img.data, img.width, img.height, opts);
  next.region = mesh.region;
  writeMesh(slotId, name, next, 'Re-trace mesh', 'drop'); // a new vertex set: old deform keys mean nothing
  setSelection({ slot: slotId, attachment: name, bones: uiStore.get().selection.bones, vertices: [] });
}

// ------------------------------------------------------------------ setup-space vertex editing

/** Moves vertices to world positions in the setup pose. */
export function moveMeshVertices(slotId: Id, name: string, moves: { index: number; x: number; y: number }[]) {
  if (!getShapeMesh(slotId, name)) return;
  const { mats, slotMat } = setupMats();
  const inv = matInvert(slotMat(slotId));
  docStore.update('Move vertices', (d) => {
    const m = d.skeleton.skins[0].attachments[slotId]?.[name];
    if (!m || m.type !== 'mesh') return;
    for (const mv of moves) {
      if (m.weights) {
        m.weights[mv.index] = m.weights[mv.index].map(([bone, , , w]) => {
          const bm = mats.get(bone);
          if (!bm) return [bone, 0, 0, w] as Influence;
          const im = matInvert(bm);
          return [bone, im.a * mv.x + im.b * mv.y + im.x, im.c * mv.x + im.d * mv.y + im.y, w] as Influence;
        });
      } else {
        m.vertices[mv.index * 2] = inv.a * mv.x + inv.b * mv.y + inv.x;
        m.vertices[mv.index * 2 + 1] = inv.c * mv.x + inv.d * mv.y + inv.y;
      }
    }
  });
}

/** Adds a vertex at a world position (inside = interior vertex, outside = new outline vertex). */
export function addMeshVertex(slotId: Id, name: string, wx: number, wy: number): number | null {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh) return null;
  const { mats, slotMat } = setupMats();
  const sm = slotMat(slotId);
  const world = meshWorldPositions(mesh, sm, mats);
  const n = mesh.uvs.length / 2;
  const loc = locateInMesh(world, mesh.triangles, wx, wy);
  if (!loc) return null;
  const [l1, l2, l3] = loc.bary;
  const tri = [mesh.triangles[loc.tri * 3], mesh.triangles[loc.tri * 3 + 1], mesh.triangles[loc.tri * 3 + 2]];
  const uv: [number, number] = [0, 0];
  tri.forEach((vi, k) => {
    const l = [l1, l2, l3][k];
    uv[0] += mesh.uvs[vi * 2] * l;
    uv[1] += mesh.uvs[vi * 2 + 1] * l;
  });
  const inside = Math.min(l1, l2, l3) >= -1e-6;
  // outline vertices are inserted after the nearest outline vertex; interior vertices are appended
  let insertAt = n;
  let hull = mesh.hull;
  if (!inside) {
    let best = Infinity;
    for (let i = 0; i < mesh.hull; i++) {
      const j = (i + 1) % mesh.hull;
      const ax = world[i * 2], ay = world[i * 2 + 1], bx = world[j * 2], by = world[j * 2 + 1];
      const dx = bx - ax, dy = by - ay;
      const l2s = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wy - ay) * dy) / l2s));
      const d = (ax + dx * t - wx) ** 2 + (ay + dy * t - wy) ** 2;
      if (d < best) {
        best = d;
        insertAt = i + 1;
      }
    }
    hull += 1;
  }
  let newWeights: Influence[] | null = null;
  if (mesh.weights) {
    const acc = new Map<Id, number>();
    tri.forEach((vi, k) => {
      const l = Math.max(0, [l1, l2, l3][k]);
      for (const [bone, , , w] of mesh.weights![vi]) acc.set(bone, (acc.get(bone) ?? 0) + w * l);
    });
    newWeights = normalizeInfluences(
      [...acc.entries()].map(([bone, w]) => {
        const im = matInvert(mats.get(bone) ?? { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 });
        return [bone, im.a * wx + im.b * wy + im.x, im.c * wx + im.d * wy + im.y, w] as Influence;
      }),
    );
  }
  const inv = matInvert(sm);
  const local: [number, number] = [inv.a * wx + inv.b * wy + inv.x, inv.c * wx + inv.d * wy + inv.y];
  const world2: number[] = Array.from(world);
  world2.splice(insertAt * 2, 0, wx, wy);
  const uvs = mesh.uvs.slice();
  uvs.splice(insertAt * 2, 0, uv[0], uv[1]);
  const vertices = mesh.vertices.slice();
  const weights = mesh.weights ? mesh.weights.slice() : null;
  if (weights && newWeights) weights.splice(insertAt, 0, newWeights);
  else vertices.splice(insertAt * 2, 0, local[0], local[1]);
  const next: MeshAttachment = { ...mesh, uvs, vertices, weights, hull, triangles: triangulate(world2, hull) };
  const from = Array.from({ length: n + 1 }, (_, j) => (j < insertAt ? j : j === insertAt ? -1 : j - 1));
  writeMesh(slotId, name, next, 'Add vertex', from);
  setSelection({ slot: slotId, attachment: name, bones: uiStore.get().selection.bones, vertices: [insertAt] });
  return insertAt;
}

export function deleteMeshVertices(slotId: Id, name: string, indices: number[]) {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh || !indices.length) return;
  const { mats, slotMat } = setupMats();
  const world = meshWorldPositions(mesh, slotMat(slotId), mats);
  const remove = new Set(indices);
  const next = removeMeshVertices(mesh, remove, world);
  if (next === mesh) {
    toast('A mesh outline needs at least 3 vertices');
    return;
  }
  const kept = Array.from({ length: mesh.uvs.length / 2 }, (_, i) => i).filter((i) => !remove.has(i));
  writeMesh(slotId, name, next, 'Delete vertices', kept);
  setSelection({ slot: slotId, attachment: name, bones: uiStore.get().selection.bones, vertices: [] });
}

/** Rebuilds the triangulation (Delaunay inside the outline). */
export function retriangulateMesh(slotId: Id, name: string) {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh) return;
  const { mats, slotMat } = setupMats();
  const world = meshWorldPositions(mesh, slotMat(slotId), mats);
  writeMesh(slotId, name, { ...mesh, triangles: triangulate(world, mesh.hull) }, 'Retriangulate');
}

// ------------------------------------------------------------------ binding & weights

export function boneSegments(boneIds: Id[]) {
  const setup = getSetupSkeleton();
  const segs = [];
  for (const id of boneIds) {
    const b = setup.boneById(id);
    if (b) segs.push({ id, ax: b.worldX, ay: b.worldY, bx: b.tipX, by: b.tipY });
  }
  return segs;
}

/** Binds (or re-binds) a mesh to the given bones using automatic weights. */
export function bindMeshToBones(slotId: Id, name: string, boneIds: Id[]) {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh) return;
  const { mats, slotMat } = setupMats();
  const doc = docStore.get().skeleton;
  const slot = doc.slots.find((s) => s.id === slotId);
  const ids = [...new Set([...(mesh.weights ? mesh.weights.flat().map((i) => i[0]) : []), ...boneIds])];
  if (!ids.length && slot) ids.push(slot.bone);
  if (!ids.length) {
    toast('Select the bones to bind to first', 'error');
    return;
  }
  const world = meshWorldPositions(mesh, slotMat(slotId), mats);
  let w = autoWeights(world, boneSegments(ids));
  w = smoothWeights(w, adjacency(mesh.triangles, mesh.uvs.length / 2), 2, 0.5);
  const base = mesh.weights ? unbindMesh(mesh, slotMat(slotId), mats) : mesh;
  writeMesh(slotId, name, bindMesh(base, slotMat(slotId), mats, w), 'Bind mesh'); // unweighted → weighted drops the deform keys; re-binding keeps them per bone
  uiStore.patch({ brush: { ...uiStore.get().brush, bone: uiStore.get().brush.bone ?? ids[0] } });
  toast(`Bound to ${ids.length} bone${ids.length === 1 ? '' : 's'}`, 'ok');
}

export function unbindMeshFromBones(slotId: Id, name: string) {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh || !mesh.weights) return;
  const { mats, slotMat } = setupMats();
  writeMesh(slotId, name, unbindMesh(mesh, slotMat(slotId), mats), 'Unbind mesh');
}

/** The selected vertices of this mesh (Spine: Auto, Smooth, Prune and Swap work on them; with none selected, on the whole mesh). */
export function weightScope(slotId: Id, name: string, count: number): Set<number> | undefined {
  const sel = uiStore.get().selection;
  if (sel.slot !== slotId || sel.attachment !== name) return undefined;
  const v = sel.vertices.filter((i) => i >= 0 && i < count);
  return v.length ? new Set(v) : undefined;
}

export function autoWeightMesh(slotId: Id, name: string) {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh || !mesh.weights) return;
  const ids = [...new Set(mesh.weights.flat().map((i) => i[0]))];
  const { mats, slotMat } = setupMats();
  const world = meshWorldPositions(mesh, slotMat(slotId), mats);
  let w = autoWeights(world, boneSegments(ids));
  w = smoothWeights(w, adjacency(mesh.triangles, mesh.uvs.length / 2), 2, 0.5);
  const done = bindMesh(unbindMesh(mesh, slotMat(slotId), mats), slotMat(slotId), mats, w);
  const only = weightScope(slotId, name, mesh.uvs.length / 2);
  writeMesh(slotId, name, only && done.weights ? { ...done, weights: keepOutside(mesh.weights, done.weights, only) } : done, 'Auto weights');
}

export function smoothMeshWeights(slotId: Id, name: string, passes = 1) {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh || !mesh.weights) return;
  const { mats, slotMat } = setupMats();
  const world = meshWorldPositions(mesh, slotMat(slotId), mats);
  const cur = mesh.weights.map((list) => list.map((i) => ({ bone: i[0], w: i[3] })));
  const sm = smoothWeights(cur, adjacency(mesh.triangles, mesh.uvs.length / 2), passes, 0.6);
  const inv = new Map<Id, Mat>();
  for (const [id, m] of mats) inv.set(id, matInvert(m));
  const weights = sm.map((list, i) =>
    normalizeInfluences(
      list.map((e) => {
        const im = inv.get(e.bone)!;
        return [e.bone, im.a * world[i * 2] + im.b * world[i * 2 + 1] + im.x, im.c * world[i * 2] + im.d * world[i * 2 + 1] + im.y, e.w] as Influence;
      }),
    ),
  );
  writeMesh(slotId, name, { ...mesh, weights: keepOutside(mesh.weights, weights, weightScope(slotId, name, mesh.uvs.length / 2)) }, 'Smooth weights');
}

/** Drops the faint influences of every vertex and keeps at most `max` bones per vertex (Spine's Prune). */
export function pruneMeshWeights(slotId: Id, name: string, threshold = 0.05, max = 4) {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh || !mesh.weights) return;
  const weights = pruneWeights(mesh.weights, threshold, max, weightScope(slotId, name, mesh.uvs.length / 2));
  writeMesh(slotId, name, { ...mesh, weights }, 'Prune weights');
}

/** Two bones exchange their weights (on the selected vertices, or the whole mesh). Returns how many vertices changed. */
export function swapMeshWeights(slotId: Id, name: string, a: Id, b: Id): number {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh || !mesh.weights) return 0;
  if (a === b) {
    toast('Pick two different bones to swap');
    return 0;
  }
  const { mats, slotMat } = setupMats();
  const world = meshWorldPositions(mesh, slotMat(slotId), mats);
  const r = swapBoneWeights(mesh.weights, world, a, b, mats, weightScope(slotId, name, mesh.uvs.length / 2));
  if (!r.changed) {
    toast('Neither bone has weight on these vertices');
    return 0;
  }
  writeMesh(slotId, name, { ...mesh, weights: r.weights }, 'Swap weights');
  return r.changed;
}

/**
 * Copies the weights of one half of the mesh to the other, reflected across the skeleton's vertical axis, with every bone swapped for
 * its mirror twin (a bone named "arm L" for "arm R", "leftLeg" for "rightLeg"). Returns how many vertices were set.
 */
export function mirrorMeshWeights(slotId: Id, name: string, fromLeft: boolean): number {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh || !mesh.weights) return 0;
  const doc = docStore.get().skeleton;
  const byName = new Map(doc.bones.map((b) => [b.name, b.id] as const));
  const nameOf = new Map(doc.bones.map((b) => [b.id, b.name] as const));
  const twin = (id: Id): Id => {
    const bone = nameOf.get(id);
    const other = bone ? byName.get(mirrorName(bone)) : undefined;
    return other ?? id;
  };
  const { mats, slotMat } = setupMats();
  const world = meshWorldPositions(mesh, slotMat(slotId), mats);
  const result = mirrorWeights(mesh.weights, world, 0, fromLeft, twin, mats);
  if (result.changed === 0) {
    toast("No vertex has a mirrored partner on the other side. Mirror weights needs a mesh that is symmetric about the skeleton's center line.", 'info');
    return 0;
  }
  writeMesh(slotId, name, { ...mesh, weights: result.weights }, 'Mirror weights');
  return result.changed;
}

export interface BrushStroke {
  x: number;
  y: number;
}

/** Paints weights for `bone` around a world position. */
export function paintWeights(slotId: Id, name: string, stroke: BrushStroke, bone: Id) {
  const mesh = getShapeMesh(slotId, name);
  if (!mesh || !mesh.weights) return;
  const { brush } = uiStore.get();
  const { mats, slotMat } = setupMats();
  const world = meshWorldPositions(mesh, slotMat(slotId), mats);
  const radius = brush.size;
  const adj = brush.mode === 'smooth' ? adjacency(mesh.triangles, mesh.uvs.length / 2) : null;
  const inv = matInvert(mats.get(bone) ?? { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 });
  const weights = mesh.weights.map((list) => list);
  let changed = false;
  const n = mesh.uvs.length / 2;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(world[i * 2] - stroke.x, world[i * 2 + 1] - stroke.y);
    if (d > radius) continue;
    const f = Math.pow(1 - d / radius, 1.4) * brush.strength;
    const list = weights[i];
    const cur = list.find((e) => e[0] === bone)?.[3] ?? 0;
    const bindFor = (): [number, number] => [inv.a * world[i * 2] + inv.b * world[i * 2 + 1] + inv.x, inv.c * world[i * 2] + inv.d * world[i * 2 + 1] + inv.y];
    let target = cur;
    if (brush.mode === 'add') target = cur + f * 0.6;
    else if (brush.mode === 'subtract') target = cur - f * 0.6;
    else if (brush.mode === 'replace') target = cur + (1 - cur) * Math.min(1, f * 1.5);
    else if (adj) {
      let sum = 0;
      for (const j of adj[i]) sum += weights[j].find((e) => e[0] === bone)?.[3] ?? 0;
      const avg = adj[i].length ? sum / adj[i].length : cur;
      target = cur + (avg - cur) * Math.min(1, f * 1.5);
    }
    if (Math.abs(target - cur) < 1e-4) continue;
    weights[i] = setBoneWeight(list, bone, target, bindFor);
    changed = true;
  }
  if (!changed) return;
  docStore.update('Paint weights', (d) => {
    const m = d.skeleton.skins[0].attachments[slotId]?.[name];
    if (m && m.type === 'mesh') {
      m.weights = weights;
      reconcileDeform(d.skeleton, slotId, name, mesh, { ...mesh, weights }); // influences may have appeared / vanished
    }
  });
}

// ------------------------------------------------------------------ deform (Animate mode)

/** Current deform array of a slot's attachment in the posed scene (zeros when none). */
export function currentDeform(slotId: Id): number[] | null {
  const scene = getScene();
  const slot = scene.skeleton.slotById(slotId);
  if (!slot) return null;
  const att = scene.skeleton.slotAttachment(slot);
  if (!att || (att.kind !== 'mesh' && att.kind !== 'path')) return null;
  return slot.deform.length === att.deformLength ? slot.deform.slice() : new Array(att.deformLength).fill(0);
}

/**
 * Keys a deform: `base` is the deform at drag start, `moves` are world-space offsets (relative to the drag start)
 * for individual vertices.
 */
export function setDeformKey(slotId: Id, name: string, base: number[], moves: { index: number; dx: number; dy: number }[]) {
  const ui = uiStore.get();
  const scene = getScene();
  const anim = scene.animation;
  if (!anim) {
    toast('Create an animation first');
    return;
  }
  const slot = scene.skeleton.slotById(slotId);
  const att = slot ? scene.skeleton.slotAttachment(slot) : null;
  if (!slot || !att || (att.kind !== 'mesh' && att.kind !== 'path')) return;
  const next = base.slice();
  const bones = scene.skeleton.bones;
  let f = 0;
  const moveMap = new Map(moves.map((m) => [m.index, m]));
  const inLocal = (bone: (typeof bones)[number], dx: number, dy: number): [number, number] => {
    const det = bone.a * bone.d - bone.b * bone.c || 1e-9;
    return [(bone.d * dx - bone.b * dy) / det, (-bone.c * dx + bone.a * dy) / det];
  };
  if (!att.weighted) {
    for (const [i, m] of moveMap) {
      const [lx, ly] = inLocal(slot.bone, m.dx, m.dy);
      next[i * 2] = base[i * 2] + lx;
      next[i * 2 + 1] = base[i * 2 + 1] + ly;
    }
  } else {
    const bi = att.bones!;
    let v = 0;
    for (let i = 0; i < att.vertexCount; i++) {
      const count = bi[v++];
      const m = moveMap.get(i);
      for (let k = 0; k < count; k++, f += 2) {
        const bone = bones[bi[v++]];
        if (m) {
          const [lx, ly] = inLocal(bone, m.dx, m.dy);
          next[f] = base[f] + lx;
          next[f + 1] = base[f + 1] + ly;
        }
      }
    }
  }
  const doc = docStore.get().skeleton;
  const skinId = ui.skinId && scene.skeleton.skin?.attachments[slot.data.index]?.get(name) ? ui.skinId : doc.skins[0].id;
  // a linked mesh that shares the deform of its source has no deform of its own: the keys go to the source
  const home = deformHome(doc, skinId, slotId, name);
  docStore.update('Deform mesh', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    const keys = (((a.deform[home.skinId] ??= {})[home.slotId] ??= {})[home.name] ??= []);
    const exist = keys.find((k) => Math.abs(k.time - ui.time) < 1e-4);
    if (exist) exist.value = next;
    else {
      const curve = makeCurve(ui.defaultCurve, 1);
      upsertKey(keys, { time: ui.time, value: next, ...(curve !== undefined ? { curve } : {}) });
    }
    if (ui.time > a.duration) a.duration = ui.time;
  });
}

export { RAD2DEG };
