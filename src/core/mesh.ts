/**
 * Mesh tooling: region -> mesh, alpha tracing, Delaunay triangulation, vertex add/remove, weights (auto, brush, bind).
 * Everything here is pure geometry on plain arrays so it can be tested in Node.
 */
import Delaunator from 'delaunator';
import type { Id, Influence, MeshAttachment, PathAttachment, RegionAttachment } from './model';
import { DEG2RAD, distToSegmentSq, matApply, matInvert, pointInPolygon } from './math';
import type { Mat } from './math';

// ------------------------------------------------------------------ region -> mesh

/** A 4 vertex quad covering the region (vertices in slot-bone space, hull = 4). */
export function meshFromRegion(r: RegionAttachment): MeshAttachment {
  const w = r.width;
  const h = r.height;
  const c = Math.cos(r.rotation * DEG2RAD);
  const s = Math.sin(r.rotation * DEG2RAD);
  const corners: [number, number][] = [
    [-w / 2, -h / 2],
    [-w / 2, h / 2],
    [w / 2, h / 2],
    [w / 2, -h / 2],
  ];
  const vertices: number[] = [];
  for (const [x, y] of corners) {
    const lx = x * r.scaleX;
    const ly = y * r.scaleY;
    vertices.push(lx * c - ly * s + r.x, lx * s + ly * c + r.y);
  }
  return {
    type: 'mesh',
    name: r.name,
    path: r.path,
    color: [...r.color] as MeshAttachment['color'],
    width: w,
    height: h,
    uvs: [0, 1, 0, 0, 1, 0, 1, 1],
    triangles: [0, 1, 2, 2, 3, 0],
    hull: 4,
    edges: [],
    vertices,
    weights: null,
  };
}

/** Maps image pixel coordinates (y down) to slot-bone space through the region transform. */
export function imageToBoneSpace(r: RegionAttachment, imgW: number, imgH: number): (px: number, py: number) => [number, number] {
  const c = Math.cos(r.rotation * DEG2RAD);
  const s = Math.sin(r.rotation * DEG2RAD);
  const sx = (r.width / imgW) * r.scaleX;
  const sy = (r.height / imgH) * r.scaleY;
  return (px, py) => {
    const lx = (px - imgW / 2) * sx;
    const ly = (imgH / 2 - py) * sy;
    return [lx * c - ly * s + r.x, lx * s + ly * c + r.y];
  };
}

// ------------------------------------------------------------------ polygon helpers

export function polygonArea(p: ArrayLike<[number, number]>): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a / 2;
}

function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.sqrt(l2);
}

function dp(points: [number, number][], tol: number): [number, number][] {
  if (points.length < 3) return points.slice();
  let maxD = 0;
  let idx = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > tol) {
    const left = dp(points.slice(0, idx + 1), tol);
    const right = dp(points.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

/** Douglas-Peucker for closed polygons. */
export function simplifyClosed(points: [number, number][], tol: number): [number, number][] {
  if (points.length <= 4) return points.slice();
  // split at the two most distant points to keep both halves well conditioned
  let i0 = 0;
  let best = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (d > best) {
      best = d;
      i0 = i;
    }
  }
  const a = dp(points.slice(0, i0 + 1), tol);
  const b = dp(points.slice(i0).concat([points[0]]), tol);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

/** Moves every vertex along its outward normal. */
export function offsetPolygon(points: [number, number][], dist: number): [number, number][] {
  const n = points.length;
  const sign = polygonArea(points) >= 0 ? 1 : -1;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i + n - 1) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const norm = (a: [number, number], b: [number, number]): [number, number] => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      return sign > 0 ? [dy / l, -dx / l] : [-dy / l, dx / l];
    };
    const n1 = norm(p0, p1);
    const n2 = norm(p1, p2);
    let nx = n1[0] + n2[0];
    let ny = n1[1] + n2[1];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    // miter scale (clamped so sharp corners do not explode)
    const dot = Math.max(0.5, nx * n1[0] + ny * n1[1]);
    out.push([p1[0] + (nx * dist) / dot, p1[1] + (ny * dist) / dot]);
  }
  return out;
}

// ------------------------------------------------------------------ alpha tracing

export interface TraceOptions {
  /** Alpha (0-255) above which a pixel counts as solid. */
  threshold?: number;
  /** Outline simplification tolerance in image pixels. */
  tolerance?: number;
  /** Pixels the outline is pushed outwards. */
  padding?: number;
  /** Approximate spacing of interior vertices in pixels (0 = no interior points). */
  spacing?: number;
  maxHullVertices?: number;
}

/** Largest outer contour of the opaque pixels, in image pixel coordinates (y down). */
export function traceOutline(rgba: ArrayLike<number>, w: number, h: number, opts: TraceOptions = {}): [number, number][] {
  const threshold = opts.threshold ?? 12;
  const scale = Math.max(1, Math.ceil(Math.max(w, h) / 220));
  const mw = Math.ceil(w / scale);
  const mh = Math.ceil(h / scale);
  const mask = new Uint8Array(mw * mh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > threshold) mask[Math.floor(y / scale) * mw + Math.floor(x / scale)] = 1;
    }
  }
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < mw && y < mh && mask[y * mw + x] === 1;

  // directed boundary edges on the corner lattice, filled pixel on the right-hand side
  const stride = mw + 1;
  const outgoing = new Map<number, number[]>();
  const edges: [number, number][] = [];
  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const from = ay * stride + ax;
    const to = by * stride + bx;
    const id = edges.length;
    edges.push([from, to]);
    const list = outgoing.get(from);
    if (list) list.push(id);
    else outgoing.set(from, [id]);
  };
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!filled(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!filled(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!filled(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }
  if (edges.length === 0) return [];

  const used = new Uint8Array(edges.length);
  let bestLoop: [number, number][] = [];
  let bestArea = 0;
  for (let start = 0; start < edges.length; start++) {
    if (used[start]) continue;
    const loop: [number, number][] = [];
    let e = start;
    let guard = 0;
    while (!used[e] && guard++ < edges.length + 4) {
      used[e] = 1;
      const [from, to] = edges[e];
      loop.push([(from % stride) * scale, Math.floor(from / stride) * scale]);
      const cands = (outgoing.get(to) ?? []).filter((c) => !used[c]);
      if (cands.length === 0) break;
      if (cands.length === 1) e = cands[0];
      else {
        // prefer a right turn (towards the filled side) to keep the outline tight at diagonal contacts
        const dx = (to % stride) - (from % stride);
        const dy = Math.floor(to / stride) - Math.floor(from / stride);
        let pick = cands[0];
        let bestCross = -Infinity;
        for (const c of cands) {
          const [f2, t2] = edges[c];
          const ex = (t2 % stride) - (f2 % stride);
          const ey = Math.floor(t2 / stride) - Math.floor(f2 / stride);
          const cross = dx * ey - dy * ex; // y-down: positive = turning right
          if (cross > bestCross) {
            bestCross = cross;
            pick = c;
          }
        }
        e = pick;
      }
    }
    const a = Math.abs(polygonArea(loop));
    if (a > bestArea) {
      bestArea = a;
      bestLoop = loop;
    }
  }
  const clamp = (p: [number, number]): [number, number] => [Math.min(w, Math.max(0, p[0])), Math.min(h, Math.max(0, p[1]))];
  let tol = opts.tolerance ?? Math.max(1.2, scale * 0.9);
  let poly = simplifyClosed(bestLoop, tol);
  const maxHull = opts.maxHullVertices ?? 48;
  while (poly.length > maxHull && tol < 200) {
    tol *= 1.35;
    poly = simplifyClosed(bestLoop, tol);
  }
  if (poly.length < 3) poly = bestLoop.slice(0, 3);
  const pad = opts.padding ?? 2;
  if (pad !== 0) poly = offsetPolygon(poly, pad);
  return poly.map(clamp);
}

// ------------------------------------------------------------------ triangulation

/** Delaunay triangulation of `points` (flat x,y), keeping only triangles whose centroid is inside the hull polygon. */
export function triangulate(points: ArrayLike<number>, hullCount: number): number[] {
  const n = points.length / 2;
  if (n < 3) return [];
  const flat = new Float64Array(points.length);
  for (let i = 0; i < points.length; i++) flat[i] = points[i];
  const del = new Delaunator(flat);
  const hull = new Float64Array(hullCount * 2);
  for (let i = 0; i < hullCount * 2; i++) hull[i] = points[i];
  const out: number[] = [];
  const t = del.triangles;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i];
    const b = t[i + 1];
    const c = t[i + 2];
    const cx = (flat[a * 2] + flat[b * 2] + flat[c * 2]) / 3;
    const cy = (flat[a * 2 + 1] + flat[b * 2 + 1] + flat[c * 2 + 1]) / 3;
    const area = Math.abs((flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]) - (flat[c * 2] - flat[a * 2]) * (flat[b * 2 + 1] - flat[a * 2 + 1]));
    if (area < 1e-6) continue;
    if (hullCount >= 3 && !pointInPolygon(cx, cy, hull)) continue;
    out.push(a, b, c);
  }
  return out;
}

/** Interior sample points of a polygon on a staggered grid, kept away from the outline. */
export function interiorPoints(hull: [number, number][], spacing: number): [number, number][] {
  if (spacing <= 0) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of hull) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const flat = new Float64Array(hull.length * 2);
  hull.forEach((p, i) => {
    flat[i * 2] = p[0];
    flat[i * 2 + 1] = p[1];
  });
  const out: [number, number][] = [];
  const minEdge2 = (spacing * 0.7) ** 2;
  let row = 0;
  for (let y = minY + spacing / 2; y < maxY; y += spacing * 0.866, row++) {
    for (let x = minX + (row % 2 ? spacing / 2 : 0) + spacing / 2; x < maxX; x += spacing) {
      if (!pointInPolygon(x, y, flat)) continue;
      let near = Infinity;
      for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) near = Math.min(near, distToSegmentSq(x, y, hull[j][0], hull[j][1], hull[i][0], hull[i][1]));
      if (near >= minEdge2) out.push([x, y]);
    }
  }
  return out;
}

/** Adds points along long outline edges so triangles stay reasonably sized. */
export function subdivideOutline(hull: [number, number][], maxEdge: number): [number, number][] {
  if (maxEdge <= 0) return hull;
  const out: [number, number][] = [];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    out.push(a);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(d / maxEdge);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Builds a fully triangulated mesh from the opaque pixels of an image (replaces a region attachment). */
export function generateMeshFromImage(region: RegionAttachment, rgba: ArrayLike<number>, imgW: number, imgH: number, opts: TraceOptions = {}): MeshAttachment {
  let outline = traceOutline(rgba, imgW, imgH, opts);
  if (outline.length < 3) return meshFromRegion(region);
  const spacing = opts.spacing ?? Math.max(imgW, imgH) / 5;
  outline = subdivideOutline(outline, spacing * 1.6);
  const inner = interiorPoints(outline, spacing);
  const pts: [number, number][] = [...outline, ...inner];
  const flat: number[] = [];
  for (const p of pts) flat.push(p[0], p[1]);
  const triangles = triangulate(flat, outline.length);
  const toBone = imageToBoneSpace(region, imgW, imgH);
  const vertices: number[] = [];
  const uvs: number[] = [];
  for (const [px, py] of pts) {
    const [bx, by] = toBone(px, py);
    vertices.push(bx, by);
    uvs.push(px / imgW, py / imgH);
  }
  return {
    type: 'mesh',
    name: region.name,
    path: region.path,
    color: [...region.color] as MeshAttachment['color'],
    width: imgW,
    height: imgH,
    uvs,
    triangles,
    hull: outline.length,
    edges: [],
    vertices,
    weights: null,
  };
}

// ------------------------------------------------------------------ setup-space positions

export type BoneMats = Map<Id, Mat>;

/** Setup-pose world positions of every mesh vertex (x,y pairs). */
export function meshWorldPositions(mesh: MeshAttachment, slotMat: Mat, bones: BoneMats): Float64Array {
  return vertexWorldPositions(mesh, mesh.uvs.length >> 1, slotMat, bones);
}

/** Setup-pose world positions of `n` vertices stored like a mesh's (unweighted in the slot bone's space, or weighted). */
export function vertexWorldPositions(mesh: { vertices: number[]; weights: Influence[][] | null }, n: number, slotMat: Mat, bones: BoneMats): Float64Array {
  const out = new Float64Array(n * 2);
  if (!mesh.weights) {
    for (let i = 0; i < n; i++) {
      const p = matApply(slotMat, mesh.vertices[i * 2], mesh.vertices[i * 2 + 1]);
      out[i * 2] = p[0];
      out[i * 2 + 1] = p[1];
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    for (const [bone, bx, by, w] of mesh.weights[i] ?? []) {
      const m = bones.get(bone);
      if (!m) continue;
      const p = matApply(m, bx, by);
      x += p[0] * w;
      y += p[1] * w;
    }
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  }
  return out;
}

// ------------------------------------------------------------------ weights

export interface BoneSegment {
  id: Id;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export function normalizeInfluences(list: Influence[], maxInfluences = 4): Influence[] {
  let out = list.filter((i) => i[3] > 1e-4).sort((a, b) => b[3] - a[3]).slice(0, maxInfluences);
  const sum = out.reduce((s, i) => s + i[3], 0);
  if (sum <= 0) return out.length ? [[out[0][0], out[0][1], out[0][2], 1]] : [];
  out = out.map((i) => [i[0], i[1], i[2], i[3] / sum] as Influence);
  return out;
}

/** Inverse-distance weights from bone segments, limited to `maxInfluences` bones per vertex. */
export function autoWeights(world: ArrayLike<number>, segs: BoneSegment[], opts: { maxInfluences?: number; falloff?: number } = {}): { bone: Id; w: number }[][] {
  const maxInfl = opts.maxInfluences ?? 4;
  const falloff = opts.falloff ?? 2.2;
  const n = world.length / 2;
  const res: { bone: Id; w: number }[][] = [];
  for (let i = 0; i < n; i++) {
    const px = world[i * 2];
    const py = world[i * 2 + 1];
    const scores = segs.map((s) => {
      const d = Math.sqrt(distToSegmentSq(px, py, s.ax, s.ay, s.bx, s.by));
      return { bone: s.id, w: 1 / Math.pow(d + 6, falloff) };
    });
    scores.sort((a, b) => b.w - a.w);
    const top = scores.slice(0, maxInfl);
    const sum = top.reduce((s, t) => s + t.w, 0) || 1;
    // drop negligible influences relative to the strongest
    const kept = top.filter((t) => t.w / sum > 0.04);
    const ksum = kept.reduce((s, t) => s + t.w, 0) || 1;
    res.push(kept.map((t) => ({ bone: t.bone, w: t.w / ksum })));
  }
  return res;
}

/** Vertex adjacency from triangles. */
export function adjacency(triangles: ArrayLike<number>, vertexCount: number): number[][] {
  const adj: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>());
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i];
    const b = triangles[i + 1];
    const c = triangles[i + 2];
    adj[a].add(b).add(c);
    adj[b].add(a).add(c);
    adj[c].add(a).add(b);
  }
  return adj.map((s) => [...s]);
}

/** Blends each vertex's weights with its neighbours' (`amount` 0..1), keeping at most `maxInfluences`. */
export function smoothWeights(weights: { bone: Id; w: number }[][], adj: number[][], passes: number, amount = 0.5, maxInfluences = 4): { bone: Id; w: number }[][] {
  let cur = weights;
  for (let p = 0; p < passes; p++) {
    cur = cur.map((own, i) => {
      const nb = adj[i];
      if (!nb.length) return own;
      const acc = new Map<Id, number>();
      for (const e of own) acc.set(e.bone, (acc.get(e.bone) ?? 0) + e.w * (1 - amount));
      for (const j of nb) for (const e of cur[j]) acc.set(e.bone, (acc.get(e.bone) ?? 0) + (e.w * amount) / nb.length);
      const list = [...acc.entries()].map(([bone, w]) => ({ bone, w })).sort((a, b) => b.w - a.w).slice(0, maxInfluences);
      const sum = list.reduce((s, e) => s + e.w, 0) || 1;
      return list.map((e) => ({ bone: e.bone, w: e.w / sum }));
    });
  }
  return cur;
}

/** Converts an unweighted mesh into a weighted one using the given per-vertex weights. */
export function bindMesh(mesh: MeshAttachment, slotMat: Mat, bones: BoneMats, weights: { bone: Id; w: number }[][]): MeshAttachment {
  const world = meshWorldPositions(mesh, slotMat, bones);
  const inv = new Map<Id, Mat>();
  for (const [id, m] of bones) inv.set(id, matInvert(m));
  const out: Influence[][] = [];
  const n = mesh.uvs.length / 2;
  for (let i = 0; i < n; i++) {
    const list: Influence[] = [];
    for (const e of weights[i] ?? []) {
      const im = inv.get(e.bone);
      if (!im) continue;
      const p = matApply(im, world[i * 2], world[i * 2 + 1]);
      list.push([e.bone, p[0], p[1], e.w]);
    }
    out.push(normalizeInfluences(list));
  }
  return { ...mesh, vertices: [], weights: out };
}

/** Back to a plain mesh in the slot bone's space (positions preserved). */
export function unbindMesh(mesh: MeshAttachment, slotMat: Mat, bones: BoneMats): MeshAttachment {
  if (!mesh.weights) return mesh;
  const world = meshWorldPositions(mesh, slotMat, bones);
  const inv = matInvert(slotMat);
  const vertices: number[] = [];
  for (let i = 0; i < world.length / 2; i++) {
    const p = matApply(inv, world[i * 2], world[i * 2 + 1]);
    vertices.push(p[0], p[1]);
  }
  return { ...mesh, vertices, weights: null };
}

/**
 * Sets the weight of one bone on a vertex, rescaling the other influences so the total stays 1.
 * `bindFor` supplies the bind position when the bone is not yet an influence.
 */
export function setBoneWeight(list: Influence[], bone: Id, target: number, bindFor: (bone: Id) => [number, number] | null, maxInfluences = 4): Influence[] {
  target = Math.max(0, Math.min(1, target));
  let cur = list.map((i) => [...i] as Influence);
  let mine = cur.find((i) => i[0] === bone);
  if (!mine) {
    const bind = bindFor(bone);
    if (!bind) return list;
    mine = [bone, bind[0], bind[1], 0] as Influence;
    cur.push(mine);
  }
  const others = cur.filter((i) => i !== mine);
  const otherSum = others.reduce((s, i) => s + i[3], 0);
  mine[3] = target;
  const rest = 1 - target;
  if (otherSum > 1e-6) for (const o of others) o[3] = (o[3] / otherSum) * rest;
  else if (others.length) for (const o of others) o[3] = rest / others.length;
  else mine[3] = 1;
  cur = cur.filter((i) => i[3] > 1e-4);
  return normalizeInfluences(cur, maxInfluences);
}

// ------------------------------------------------------------------ vertex editing (setup space)

/** Barycentric UV + weights for a new point from the triangle that contains it (or the nearest triangle). */
export function locateInMesh(world: ArrayLike<number>, triangles: ArrayLike<number>, px: number, py: number): { tri: number; bary: [number, number, number] } | null {
  let best: { tri: number; bary: [number, number, number]; score: number } | null = null;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t] * 2;
    const b = triangles[t + 1] * 2;
    const c = triangles[t + 2] * 2;
    const det = (world[b + 1] - world[c + 1]) * (world[a] - world[c]) + (world[c] - world[b]) * (world[a + 1] - world[c + 1]);
    if (Math.abs(det) < 1e-9) continue;
    const l1 = ((world[b + 1] - world[c + 1]) * (px - world[c]) + (world[c] - world[b]) * (py - world[c + 1])) / det;
    const l2 = ((world[c + 1] - world[a + 1]) * (px - world[c]) + (world[a] - world[c]) * (py - world[c + 1])) / det;
    const l3 = 1 - l1 - l2;
    const score = Math.min(l1, l2, l3);
    if (!best || score > best.score) best = { tri: t / 3, bary: [l1, l2, l3], score };
  }
  return best ? { tri: best.tri, bary: best.bary } : null;
}

/** Removes the given vertices (never dropping below a 3 vertex hull) and retriangulates in `positions` space. */
export function removeMeshVertices(mesh: MeshAttachment, remove: Set<number>, positions: ArrayLike<number>): MeshAttachment {
  const n = mesh.uvs.length / 2;
  const keep: number[] = [];
  let hull = 0;
  for (let i = 0; i < n; i++) {
    if (remove.has(i)) continue;
    keep.push(i);
    if (i < mesh.hull) hull++;
  }
  if (hull < 3) return mesh;
  const pos: number[] = [];
  const uvs: number[] = [];
  const vertices: number[] = [];
  const weights: Influence[][] | null = mesh.weights ? [] : null;
  for (const i of keep) {
    pos.push(positions[i * 2], positions[i * 2 + 1]);
    uvs.push(mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]);
    if (weights) weights.push(mesh.weights![i]);
    else vertices.push(mesh.vertices[i * 2], mesh.vertices[i * 2 + 1]);
  }
  return { ...mesh, uvs, vertices, weights, hull, triangles: triangulate(pos, hull) };
}

// ------------------------------------------------------------------ deform layout

/**
 * Number of deform values an attachment expects: x,y per vertex, or x,y per influence for weighted meshes.
 * Mirrors `compileSkeleton` (a vertex without a usable influence still counts one) and the exported vertex layout.
 */
export function deformLength(mesh: MeshAttachment | PathAttachment, hasBone: (id: Id) => boolean): number {
  if (!mesh.weights) return mesh.vertices.length;
  const n = mesh.type === 'mesh' ? mesh.uvs.length >> 1 : mesh.weights.length;
  let influences = 0;
  for (let i = 0; i < n; i++) {
    let count = 0;
    for (const inf of mesh.weights[i] ?? []) if (hasBone(inf[0])) count++;
    influences += count || 1;
  }
  return influences * 2;
}

/** For every vertex of an edited mesh, the index of the vertex it came from (-1 = new). `null` = same order and count. */
export type VertexMap = ArrayLike<number> | null;

function influenceBones(mesh: MeshAttachment, vertex: number, hasBone: (id: Id) => boolean): Id[] {
  const out: Id[] = [];
  for (const inf of mesh.weights?.[vertex] ?? []) if (hasBone(inf[0])) out.push(inf[0]);
  return out.length ? out : [''];
}

/**
 * Re-lays out one deform key after the mesh changed from `before` to `after`.
 * Values follow their vertex (and, for weighted meshes, their bone); new vertices / influences start at zero.
 * Returns `null` when the old values cannot be carried over (bind / unbind, unknown history) — the caller drops the keys.
 */
export function remapDeformValues(before: MeshAttachment, after: MeshAttachment, map: VertexMap, hasBone: (id: Id) => boolean, values: ArrayLike<number>, hasBoneBefore: (id: Id) => boolean = hasBone): number[] | null {
  if ((before.weights == null) !== (after.weights == null)) return null;
  if (values.length !== deformLength(before, hasBoneBefore)) return null;
  const nOld = before.uvs.length >> 1;
  const nNew = after.uvs.length >> 1;
  if (!map && nOld !== nNew) return null;
  const from = (j: number) => (map ? map[j] : j);
  if (!after.weights) {
    const out = new Array<number>(nNew * 2).fill(0);
    for (let j = 0; j < nNew; j++) {
      const s = from(j);
      if (s >= 0 && s < nOld) {
        out[j * 2] = values[s * 2];
        out[j * 2 + 1] = values[s * 2 + 1];
      }
    }
    return out;
  }
  const oldBones: Id[][] = [];
  const oldOffset: number[] = [];
  let offset = 0;
  for (let i = 0; i < nOld; i++) {
    const bones = influenceBones(before, i, hasBoneBefore);
    oldBones.push(bones);
    oldOffset.push(offset);
    offset += bones.length * 2;
  }
  const out: number[] = [];
  for (let j = 0; j < nNew; j++) {
    const s = from(j);
    for (const bone of influenceBones(after, j, hasBone)) {
      const k = s >= 0 && s < nOld ? oldBones[s].indexOf(bone) : -1;
      out.push(k >= 0 ? values[oldOffset[s] + k * 2] : 0, k >= 0 ? values[oldOffset[s] + k * 2 + 1] : 0);
    }
  }
  return out;
}
