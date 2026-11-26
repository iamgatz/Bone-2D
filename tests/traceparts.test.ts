/** Trace mesh on a picture made of separate pieces (two eyes, a loose strand): the outline has to hold every one of them. */
import { describe, expect, it } from 'vitest';
import { segmentsCross } from '../src/core/constrain';
import { pointInPolygon } from '../src/core/math';
import { generateMeshFromImage, traceOutline } from '../src/core/mesh';
import type { RegionAttachment } from '../src/core/model';

type Shape = (x: number, y: number) => boolean;
const disc =
  (cx: number, cy: number, r: number): Shape =>
  (x, y) =>
    Math.hypot(x - cx, y - cy) <= r;
const box =
  (x0: number, y0: number, x1: number, y1: number): Shape =>
  (x, y) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;

function picture(w: number, h: number, shapes: Shape[]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (shapes.some((s) => s(x + 0.5, y + 0.5))) d[(y * w + x) * 4 + 3] = 255;
  return d;
}

/** How many opaque pixel centres are outside the polygon. */
function outside(rgba: Uint8ClampedArray, w: number, h: number, poly: [number, number][]): number {
  const flat = new Float64Array(poly.flat());
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > 12 && !pointInPolygon(x + 0.5, y + 0.5, flat)) n++;
  return n;
}

function crossings(poly: [number, number][]): number {
  const flat = poly.flat();
  const n = poly.length;
  let count = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (segmentsCross(flat, i, (i + 1) % n, j, (j + 1) % n)) count++;
  return count;
}

const CASES: { name: string; w: number; h: number; shapes: Shape[] }[] = [
  { name: 'two eyes side by side', w: 160, h: 64, shapes: [disc(32, 32, 20), disc(120, 32, 20)] },
  { name: 'a body and a loose strand', w: 128, h: 128, shapes: [disc(48, 80, 36), box(100, 8, 106, 60)] },
  { name: 'a big piece and a small button far off', w: 300, h: 200, shapes: [box(10, 10, 140, 190), disc(270, 30, 6)] },
  {
    name: 'five scattered sparks',
    w: 200,
    h: 200,
    shapes: [disc(20, 20, 8), disc(180, 25, 8), disc(100, 100, 10), disc(30, 175, 8), disc(170, 170, 8)],
  },
  { name: 'pieces of a large picture', w: 900, h: 700, shapes: [disc(180, 200, 120), box(600, 80, 640, 620), disc(300, 580, 60)] },
  {
    name: 'a ring with a dot in the middle',
    w: 160,
    h: 160,
    shapes: [(x, y) => disc(80, 80, 70)(x, y) && !disc(80, 80, 45)(x, y), disc(80, 80, 12)],
  },
  {
    name: 'two thin diagonal strokes',
    w: 120,
    h: 120,
    shapes: [(x, y) => Math.abs(x - y) < 3 && x < 50, (x, y) => Math.abs(x + y - 150) < 3 && x > 70],
  },
];

describe('Trace mesh on separate pieces', () => {
  for (const c of CASES) {
    it(`keeps every pixel: ${c.name}`, () => {
      const rgba = picture(c.w, c.h, c.shapes);
      const poly = traceOutline(rgba, c.w, c.h);
      expect(outside(rgba, c.w, c.h, poly)).toBe(0);
      expect(crossings(poly)).toBe(0);
      expect(poly.length).toBeLessThanOrEqual(120);
    });
  }

  it('builds a mesh whose triangles stay inside such an outline and use every outline point', () => {
    const c = CASES[1];
    const rgba = picture(c.w, c.h, c.shapes);
    const region: RegionAttachment = {
      type: 'region',
      name: 'img',
      path: 'img',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: c.w,
      height: c.h,
      color: [1, 1, 1, 1],
    };
    const m = generateMeshFromImage(region, rgba, c.w, c.h, { spacing: 20 });
    const used = new Set(m.triangles);
    for (let i = 0; i < m.hull; i++) expect(used.has(i)).toBe(true);
    // every opaque pixel is under a triangle
    const tri: Float64Array[] = [];
    for (let t = 0; t < m.triangles.length; t += 3)
      tri.push(new Float64Array([0, 1, 2].flatMap((k) => [m.uvs[m.triangles[t + k] * 2] * c.w, m.uvs[m.triangles[t + k] * 2 + 1] * c.h])));
    let bare = 0;
    for (let y = 0; y < c.h; y++)
      for (let x = 0; x < c.w; x++) if (rgba[(y * c.w + x) * 4 + 3] > 12 && !tri.some((p) => pointInPolygon(x + 0.5, y + 0.5, p))) bare++;
    expect(bare).toBeLessThanOrEqual(2);
  });

  it('ignores a speck of one or two stray pixels instead of stretching the outline to it', () => {
    const rgba = picture(200, 100, [disc(50, 50, 30), box(190.2, 5.2, 191.8, 5.8)]);
    const poly = traceOutline(rgba, 200, 100);
    expect(Math.max(...poly.map((p) => p[0]))).toBeLessThan(100);
  });

  it('leaves a picture of one piece as it was traced before', () => {
    const rgba = picture(128, 128, [disc(64, 64, 48)]);
    const poly = traceOutline(rgba, 128, 128);
    expect(poly.length).toBeLessThanOrEqual(48);
    expect(outside(rgba, 128, 128, poly)).toBe(0);
  });
});
