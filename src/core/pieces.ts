/**
 * A picture made of separate pieces (two eyes, a loose strand, a button) and its one mesh outline. A mesh has a single outline, so the
 * pieces are joined by narrow bridges before the outline is traced; the checks here tell whether an outline really holds every piece.
 * Works on the small mask the tracing uses: one cell per `scale` x `scale` pixels. Pure.
 */
import { segmentsCross } from './constrain';
import { distToSegmentSq, pointInPolygon } from './math';

export interface Mask {
  /** 1 for a cell with at least one solid pixel. */
  cells: Uint8Array;
  width: number;
  height: number;
}

/** Specks of fewer solid pixels than this are dirt of the painting: the outline does not stretch to them. */
const SPECK = 4;

/** Calls `visit` for the neighbours of a cell, four of them or eight. */
function neighbours(m: Mask, i: number, diagonal: boolean, visit: (j: number) => void) {
  const x = i % m.width;
  const y = (i / m.width) | 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < m.width && ny < m.height) visit(ny * m.width + nx);
    }
}

/** The label of the piece of every solid cell (-1 for an empty one) and the cells of each piece. */
function label(m: Mask, diagonal: boolean): { of: Int32Array; pieces: number[][] } {
  const of = new Int32Array(m.cells.length).fill(-1);
  const pieces: number[][] = [];
  for (let start = 0; start < m.cells.length; start++) {
    if (!m.cells[start] || of[start] >= 0) continue;
    const list = [start];
    of[start] = pieces.length;
    for (let k = 0; k < list.length; k++)
      neighbours(m, list[k], diagonal, (j) => {
        if (m.cells[j] && of[j] < 0) {
          of[j] = pieces.length;
          list.push(j);
        }
      });
    pieces.push(list);
  }
  return { of, pieces };
}

/** The mask without its specks (`solid[i]` is how many solid pixels cell `i` stands for), and how many pieces are left. */
export function withoutSpecks(m: Mask, solid: ArrayLike<number>): { mask: Mask; pieces: number } {
  const { pieces } = label(m, true);
  const cells = new Uint8Array(m.cells.length);
  let kept = 0;
  for (const piece of pieces) {
    let pixels = 0;
    for (const i of piece) pixels += solid[i];
    if (pixels < SPECK) continue;
    kept++;
    for (const i of piece) cells[i] = 1;
  }
  return { mask: { ...m, cells }, pieces: kept };
}

/** Two cells that only touch by a corner get a third one beside them: the outline walks cells that share a side. */
function closeCorners(m: Mask) {
  const { cells, width: w, height: h } = m;
  for (let y = 0; y + 1 < h; y++)
    for (let x = 0; x + 1 < w; x++) {
      const a = y * w + x;
      const [b, c, d] = [a + 1, a + w, a + w + 1];
      if (cells[a] && cells[d] && !cells[b] && !cells[c]) cells[b] = 1;
      else if (cells[b] && cells[c] && !cells[a] && !cells[d]) cells[a] = 1;
    }
}

/**
 * Joins all the pieces into one: from what is joined already the shortest way over empty cells to another piece is filled, `thick`
 * cells to each side, until none is left apart.
 */
export function bridgePieces(m: Mask, thick: number): Mask {
  const out: Mask = { ...m, cells: Uint8Array.from(m.cells) };
  closeCorners(out);
  for (let round = 0; round <= m.cells.length; round++) {
    const { of, pieces } = label(out, false);
    if (pieces.length < 2) break;
    // breadth first from the whole first piece: the first solid cell of another piece ends the shortest way
    const from = new Int32Array(out.cells.length).fill(-1);
    const queue = [...pieces[0]];
    for (const i of queue) from[i] = i;
    let end = -1;
    for (let k = 0; k < queue.length && end < 0; k++)
      neighbours(out, queue[k], false, (j) => {
        if (from[j] >= 0 || end >= 0) return;
        from[j] = queue[k];
        if (out.cells[j] && of[j] !== 0) end = j;
        else queue.push(j);
      });
    if (end < 0) break;
    for (let i = end; ; i = from[i]) {
      const x = i % out.width;
      const y = (i / out.width) | 0;
      for (let ny = Math.max(0, y - thick); ny <= Math.min(out.height - 1, y + thick); ny++)
        for (let nx = Math.max(0, x - thick); nx <= Math.min(out.width - 1, x + thick); nx++) out.cells[ny * out.width + nx] = 1;
      if (from[i] === i) break;
    }
    closeCorners(out);
  }
  return out;
}

/** The pixel centres at the corners of every cell on the rim of a piece: an outline that holds them holds the pieces. */
export function rimPoints(m: Mask, scale: number, w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < m.cells.length; i++) {
    if (!m.cells[i]) continue;
    let sides = 0;
    neighbours(m, i, false, (j) => void (sides += m.cells[j]));
    if (sides === 4) continue;
    const x0 = (i % m.width) * scale;
    const y0 = ((i / m.width) | 0) * scale;
    const x1 = Math.min(w, x0 + scale);
    const y1 = Math.min(h, y0 + scale);
    for (const x of [x0 + 0.5, x1 - 0.5]) for (const y of [y0 + 0.5, y1 - 0.5]) out.push([x, y]);
  }
  return out;
}

/** A polygon a mesh can be built in: no side crosses another and no corner lies on a side it does not belong to. */
export function isSimple(poly: readonly [number, number][]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  const flat = poly.flat();
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const next = (j + 1) % n;
      if (i !== j && i !== next && distToSegmentSq(...poly[i], ...poly[j], ...poly[next]) < 0.04) return false;
      if (j > i && segmentsCross(flat, i, (i + 1) % n, j, next)) return false;
    }
  return true;
}

export function holds(poly: readonly [number, number][], points: readonly [number, number][]): boolean {
  const flat = poly.flat();
  return points.every(([x, y]) => pointInPolygon(x, y, flat));
}

/** The convex outline of a set of points (Andrew's monotone chain): what is left when bridges do not give a usable outline. */
export function wrap(points: readonly [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const out: [number, number][] = [];
    for (const p of list) {
      while (out.length > 1 && turn(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}
