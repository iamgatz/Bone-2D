/**
 * Rows of vertices across a joint: where a limb painted in one piece bends, three rows of vertices let the picture fold without turning
 * over. Pure functions on picture coordinates.
 */
import { distToSegmentSq, pointInPolygon } from './math';

type Point = [number, number];

/** A place where a mesh bends, and the direction (a unit vector) the limb runs there. */
export interface Joint {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** The distance between two rows, as a share of the width of the limb, and the least it can be. */
const GAP = 0.12;
const MIN_GAP = 6;
/** Vertices inside the outline on each row. */
const ACROSS = 3;

interface Crossing {
  /** The side of the outline that is crossed, and where along the row. */
  edge: number;
  s: number;
  at: Point;
}

/** The stretch of the row through (x, y) across the limb that lies inside the outline, the closest one to that place. */
function stretch(outline: Point[], x: number, y: number, j: Joint): [Crossing, Crossing] | null {
  const crossings: Crossing[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    // how far each end of the side is from the row, measured along the limb
    const da = (a[0] - x) * j.dx + (a[1] - y) * j.dy;
    const db = (b[0] - x) * j.dx + (b[1] - y) * j.dy;
    if (da < 0 === db < 0) continue;
    const t = da / (da - db);
    const at: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    crossings.push({ edge: i, s: (at[1] - y) * j.dx - (at[0] - x) * j.dy, at });
  }
  crossings.sort((a, b) => a.s - b.s);
  let best: [Crossing, Crossing] | null = null;
  let closest = Infinity;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const [a, b] = [crossings[i], crossings[i + 1]];
    const away = a.s > 0 ? a.s : b.s < 0 ? -b.s : 0;
    if (away < closest) {
      closest = away;
      best = [a, b];
    }
  }
  return best;
}

/** The outline and the inner vertices of a mesh with rows across each joint, the other inner vertices kept away from them. */
export function withJointRows(outline: Point[], inner: Point[], joints: readonly Joint[]): { outline: Point[]; inner: Point[] } {
  let hull = outline;
  let rest = inner;
  const rows: Point[] = [];
  for (const joint of joints) {
    const length = Math.hypot(joint.dx, joint.dy);
    if (!(length > 1e-9)) continue;
    const j = { ...joint, dx: joint.dx / length, dy: joint.dy / length };
    const here = stretch(hull, j.x, j.y, j);
    if (!here) continue;
    const width = here[1].s - here[0].s;
    const gap = Math.max(MIN_GAP, width * GAP);
    rest = rest.filter((p) => {
      const along = Math.abs((p[0] - j.x) * j.dx + (p[1] - j.y) * j.dy);
      const across = Math.abs((p[1] - j.y) * j.dx - (p[0] - j.x) * j.dy);
      return along > gap * 1.75 || across > width / 2 + gap;
    });
    for (const k of [-1, 0, 1]) {
      const found = stretch(hull, j.x + j.dx * gap * k, j.y + j.dy * gap * k, j);
      if (!found) continue;
      // the later side first, so the number of the earlier one stays true
      for (const c of [...found].sort((a, b) => b.edge - a.edge)) {
        if (hull.some((p) => Math.hypot(p[0] - c.at[0], p[1] - c.at[1]) < 3)) continue;
        hull = [...hull.slice(0, c.edge + 1), c.at, ...hull.slice(c.edge + 1)];
      }
      for (let i = 1; i <= ACROSS; i++) {
        const t = i / (ACROSS + 1);
        rows.push([found[0].at[0] + (found[1].at[0] - found[0].at[0]) * t, found[0].at[1] + (found[1].at[1] - found[0].at[1]) * t]);
      }
    }
  }
  const flat = hull.flat();
  const clear = (p: Point) =>
    pointInPolygon(p[0], p[1], flat) &&
    hull.every((a, i) => {
      const b = hull[(i + 1) % hull.length];
      return distToSegmentSq(p[0], p[1], a[0], a[1], b[0], b[1]) > 4;
    });
  const added: Point[] = [];
  for (const p of rows) if (clear(p) && added.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 3)) added.push(p);
  return { outline: hull, inner: [...rest, ...added] };
}
