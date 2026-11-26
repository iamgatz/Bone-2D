/**
 * Tracing a mesh again without losing the work on it: the new vertex set takes over from the old one where the vertices are (with any
 * reshaping done by hand), how the bones move them, and the vertices that were chosen to stay. Pure functions.
 */
import { locateInMesh, normalizeInfluences, triangulate } from './mesh';
import { matApply, matInvert, pointInPolygon } from './math';
import type { Mat } from './math';
import type { Id, Influence, MeshAttachment } from './model';
import { isSimple } from './pieces';

type Point = [number, number];

export interface Rebuilt {
  mesh: MeshAttachment;
  /** Where the vertices that were chosen to stay are now. */
  kept: number[];
}

/**
 * The affine map from the picture to the vertex positions that fits them best (least squares). A mesh that nobody reshaped follows it
 * exactly; what a vertex is away from it is the reshaping.
 */
function fit(uvs: readonly number[], positions: ArrayLike<number>): (u: number, v: number) => Point {
  const n = uvs.length >> 1;
  // normal equations of [u v 1] . c = x, and the same for y
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const bx = [0, 0, 0];
  const by = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const row = [uvs[i * 2], uvs[i * 2 + 1], 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) m[r * 3 + c] += row[r] * row[c];
      bx[r] += row[r] * positions[i * 2];
      by[r] += row[r] * positions[i * 2 + 1];
    }
  }
  const det3 = (a: number[]) =>
    a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const d = det3(m);
  if (Math.abs(d) < 1e-12) return () => [bx[2] / (n || 1), by[2] / (n || 1)];
  const solve = (b: number[]) => [0, 1, 2].map((col) => det3(m.map((v, i) => (i % 3 === col ? b[(i / 3) | 0] : v))) / d);
  const cx = solve(bx);
  const cy = solve(by);
  return (u, v) => [cx[0] * u + cx[1] * v + cx[2], cy[0] * u + cy[1] * v + cy[2]];
}

/** The new points in picture pixels with the chosen old vertices among them: in place of the nearest new outline point, or inside. */
function withKept(
  fresh: Point[],
  hull: number,
  old: Point[],
  oldHull: number,
  keep: readonly number[],
): { points: Point[]; hull: number; from: number[] } {
  const outline = fresh.slice(0, hull);
  const outlineFrom = outline.map(() => -1);
  const inner = fresh.slice(hull);
  const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const k of keep.filter((i) => i < oldHull)) {
    const order = outline
      .map((p, i) => i)
      .filter((i) => outlineFrom[i] < 0)
      .sort((a, b) => dist(outline[a], old[k]) - dist(outline[b], old[k]));
    // the nearest place that leaves a usable outline
    for (const i of order.slice(0, 3)) {
      const next = outline.slice();
      next[i] = old[k];
      if (!isSimple(next)) continue;
      outline[i] = old[k];
      outlineFrom[i] = k;
      break;
    }
  }
  const flat = outline.flat();
  const stay = keep.filter((i) => i >= oldHull && pointInPolygon(old[i][0], old[i][1], flat));
  // new inner points give way to a kept one that is close
  let area = 0;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++)
    area += outline[j][0] * outline[i][1] - outline[i][0] * outline[j][1];
  const room = 0.5 * Math.sqrt(Math.abs(area) / 2 / Math.max(1, fresh.length));
  const rest = inner.filter((p) => stay.every((k) => dist(p, old[k]) > room));
  return {
    points: [...outline, ...rest, ...stay.map((k) => old[k])],
    hull: outline.length,
    from: [...outlineFrom, ...rest.map(() => -1), ...stay],
  };
}

/**
 * The mesh with the vertex set of `fresh` (a mesh traced from the same picture, which is `width` by `height` pixels) and the work of
 * `old`. `positions` are the old vertices in the space they are kept in: the setup pose for a weighted mesh (give the setup matrices of
 * the bones as `bones`), the space of the slot's bone for any other. `keep` lists old vertices that stay exactly as they are.
 */
export function rebuildMesh(
  old: MeshAttachment,
  fresh: MeshAttachment,
  width: number,
  height: number,
  positions: ArrayLike<number>,
  keep: readonly number[] = [],
  bones: ReadonlyMap<Id, Mat> | null = null,
): Rebuilt {
  const pixels = (uvs: readonly number[]) => {
    const out: Point[] = [];
    for (let i = 0; i < uvs.length; i += 2) out.push([uvs[i] * width, uvs[i + 1] * height]);
    return out;
  };
  const was = pixels(old.uvs);
  const { points, hull, from } = withKept(pixels(fresh.uvs), fresh.hull, was, old.hull, keep);
  const triangles = triangulate(points.flat(), hull);
  const base = fit(old.uvs, positions);
  const wasFlat = was.flat();
  const inverse = new Map<Id, Mat>();
  if (bones) for (const [id, m] of bones) inverse.set(id, matInvert(m));

  const uvs: number[] = [];
  const vertices: number[] = [];
  const weights: Influence[][] = [];
  points.forEach(([px, py], i) => {
    const k = from[i];
    if (k >= 0) {
      uvs.push(old.uvs[k * 2], old.uvs[k * 2 + 1]);
      if (old.weights) weights.push(old.weights[k].map((e) => [...e] as Influence));
      else vertices.push(positions[k * 2], positions[k * 2 + 1]);
      return;
    }
    const u = px / width;
    const v = py / height;
    uvs.push(u, v);
    // the old triangle the point is on (or the nearest one), and how much each of its corners counts there
    const at = locateInMesh(wasFlat, old.triangles, px, py);
    const corners = at ? [0, 1, 2].map((c) => old.triangles[at.tri * 3 + c]) : [0];
    const raw = at ? at.bary.map((b) => Math.max(0, b)) : [1];
    const sum = raw.reduce((s, b) => s + b, 0) || 1;
    let [x, y] = base(u, v);
    corners.forEach((c, n) => {
      const [bx, by] = base(old.uvs[c * 2], old.uvs[c * 2 + 1]);
      x += (raw[n] / sum) * (positions[c * 2] - bx);
      y += (raw[n] / sum) * (positions[c * 2 + 1] - by);
    });
    if (!old.weights) {
      vertices.push(x, y);
      return;
    }
    const shares = new Map<Id, number>();
    corners.forEach((c, n) => {
      for (const [bone, , , w] of old.weights![c]) shares.set(bone, (shares.get(bone) ?? 0) + (w * raw[n]) / sum);
    });
    weights.push(
      normalizeInfluences(
        [...shares].map(([bone, w]) => {
          const im = inverse.get(bone);
          const [bx, by] = im ? matApply(im, x, y) : [x, y];
          return [bone, bx, by, w] as Influence;
        }),
      ),
    );
  });
  return {
    mesh: { ...old, uvs, triangles, hull, edges: [], vertices, weights: old.weights ? weights : null },
    kept: from.flatMap((k, i) => (k >= 0 ? [i] : [])),
  };
}
