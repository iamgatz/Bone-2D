/** Tracing a mesh again: an exact number of vertices, and the weights, the reshaping and the chosen vertices carry over. */
import { beforeEach, describe, expect, it } from 'vitest';
import { generateMeshFromImage, meshFromRegion, meshWorldPositions, traceOutline } from '@/core/mesh';
import { pointInPolygon } from '@/core/math';
import type { MeshAttachment, RegionAttachment } from '@/core/model';
import { emptyProject, newBone, newSlot } from '@/core/model';
import { rebuildMesh } from '@/core/retrace';
import { validateProject } from '@/core/validate';
import { setSelection } from '@/store/actions';
import { assets } from '@/store/assets';
import { docStore } from '@/store/doc';
import { bindMeshToBones, getMesh, moveMeshVertices, regenerateMesh, setupMats } from '@/store/meshActions';
import { uiStore } from '@/store/ui';

type Solid = (x: number, y: number) => boolean;

const picture = (w: number, h: number, solid: Solid) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x + 0.5, y + 0.5)) data[(y * w + x) * 4 + 3] = 255;
  return { data, width: w, height: h };
};

const region = (w: number, h: number, more: Partial<RegionAttachment> = {}): RegionAttachment => ({
  type: 'region',
  name: 'img',
  path: 'img',
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  width: w,
  height: h,
  color: [1, 1, 1, 1],
  ...more,
});

/** Share of the opaque pixels that the outline of the mesh leaves out. */
function outside(mesh: MeshAttachment, w: number, h: number, solid: Solid): number {
  const hull: number[] = [];
  for (let i = 0; i < mesh.hull; i++) hull.push(mesh.uvs[i * 2] * w, mesh.uvs[i * 2 + 1] * h);
  let all = 0;
  let out = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!solid(x + 0.5, y + 0.5)) continue;
      all++;
      if (!pointInPolygon(x + 0.5, y + 0.5, hull)) out++;
    }
  return out / all;
}

const SHAPES: [string, number, number, Solid][] = [
  ['disc', 120, 120, (x, y) => Math.hypot(x - 60, y - 60) < 55],
  ['limb', 70, 240, (x, y) => Math.hypot(x - 35, y - Math.max(30, Math.min(210, y))) < 24],
  ['star', 200, 200, (x, y) => Math.hypot(x - 100, y - 100) < 60 + 30 * Math.cos(5 * Math.atan2(y - 100, x - 100))],
  ['two eyes', 160, 80, (x, y) => Math.hypot(x - 30, y - 40) < 22 || Math.hypot(x - 130, y - 40) < 22],
];

describe('a mesh of a chosen number of vertices', () => {
  for (const [name, w, h, solid] of SHAPES)
    it(`${name}: has that many, and the outline keeps every opaque pixel`, () => {
      const img = picture(w, h, solid);
      for (const count of [24, 60, 150]) {
        const mesh = generateMeshFromImage(region(w, h), img.data, w, h, { vertices: count });
        expect(mesh.uvs.length / 2).toBe(count);
        expect(mesh.vertices.length / 2).toBe(count);
        expect(outside(mesh, w, h, solid)).toBeLessThan(0.002);
        // every vertex is used by a triangle
        expect(new Set(mesh.triangles).size).toBe(count);
      }
    });

  it('gives the outline what it needs when the number is too small for it', () => {
    const [, w, h, solid] = SHAPES[2];
    const img = picture(w, h, solid);
    const mesh = generateMeshFromImage(region(w, h), img.data, w, h, { vertices: 6 });
    expect(mesh.uvs.length / 2).toBeGreaterThanOrEqual(6);
    expect(outside(mesh, w, h, solid)).toBeLessThan(0.002);
  });

  it('leaves the plain trace as it was', () => {
    const [, w, h, solid] = SHAPES[0];
    const img = picture(w, h, solid);
    const outline = traceOutline(img.data, w, h);
    expect(outline.length).toBeGreaterThan(5);
    expect(generateMeshFromImage(region(w, h), img.data, w, h).hull).toBeGreaterThanOrEqual(outline.length);
  });
});

describe('carrying a mesh over to new vertices', () => {
  const [, W, H, solid] = SHAPES[1];
  const img = picture(W, H, solid);
  const at = region(W, H, { x: 40, y: -20, rotation: 30, scaleX: 1.5 });
  const make = (count: number) => generateMeshFromImage(at, img.data, W, H, { vertices: count });

  it('puts the vertices of a mesh nobody reshaped exactly where the picture has them', () => {
    const fresh = make(50);
    const { mesh } = rebuildMesh(make(20), fresh, W, H, make(20).vertices);
    expect(mesh.uvs).toEqual(fresh.uvs);
    mesh.vertices.forEach((v, i) => expect(v).toBeCloseTo(fresh.vertices[i], 6));
  });

  it('keeps a reshaping where it was made', () => {
    const old = make(30);
    // one inner vertex pushed 12 units to the side
    const i = old.hull;
    old.vertices[i * 2] += 12;
    const fresh = make(80);
    const { mesh } = rebuildMesh(old, fresh, W, H, old.vertices);
    const shift = (n: number) =>
      Math.hypot(mesh.vertices[n * 2] - fresh.vertices[n * 2], mesh.vertices[n * 2 + 1] - fresh.vertices[n * 2 + 1]);
    const near = (n: number) => Math.hypot(mesh.uvs[n * 2] * W - old.uvs[i * 2] * W, mesh.uvs[n * 2 + 1] * H - old.uvs[i * 2 + 1] * H);
    const all = [...Array(mesh.uvs.length / 2).keys()];
    const closest = all.reduce((a, b) => (near(b) < near(a) ? b : a));
    expect(shift(closest)).toBeGreaterThan(4);
    expect(Math.max(...all.filter((n) => near(n) > 80).map(shift))).toBeLessThan(1);
  });

  it('keeps the chosen vertices exactly, an inner one and one of the outline', () => {
    const old = make(30);
    old.vertices[old.hull * 2] += 7;
    const keep = [1, old.hull];
    const { mesh, kept } = rebuildMesh(old, make(90), W, H, old.vertices, keep);
    expect(kept.length).toBe(2);
    for (const k of keep) {
      const found = kept.find((n) => mesh.uvs[n * 2] === old.uvs[k * 2] && mesh.uvs[n * 2 + 1] === old.uvs[k * 2 + 1])!;
      expect(found).toBeDefined();
      expect(mesh.vertices[found * 2]).toBe(old.vertices[k * 2]);
      expect(mesh.vertices[found * 2 + 1]).toBe(old.vertices[k * 2 + 1]);
    }
    expect(kept.filter((n) => n < mesh.hull).length).toBe(1);
    expect(new Set(mesh.triangles).size).toBe(mesh.uvs.length / 2);
  });
});

describe('tracing a bound mesh again', () => {
  let slotId = '';
  let bones: string[] = [];
  const [, W, H, solid] = SHAPES[1];

  beforeEach(() => {
    const p = emptyProject();
    const root = newBone({ name: 'root' });
    // the limb stands upright: a from its top to the middle, b on to its bottom
    const a = newBone({ name: 'a', parent: root.id, y: 100, rotation: -90, length: 100 });
    const b = newBone({ name: 'b', parent: a.id, x: 100, length: 100 });
    p.skeleton.bones = [root, a, b];
    const slot = newSlot({ name: 's', bone: root.id });
    slot.attachment = 'img';
    p.skeleton.slots = [slot];
    p.skeleton.skins[0].attachments[slot.id] = { img: meshFromRegion(region(W, H)) };
    docStore.replace(p);
    assets.getImageData = () => picture(W, H, solid) as ImageData;
    uiStore.patch({ mode: 'setup', tool: 'select' });
    [slotId, bones] = [slot.id, [a.id, b.id]];
    setSelection({ slot: slotId, attachment: 'img', bones });
    regenerateMesh(slotId, 'img', { vertices: 40 });
    bindMeshToBones(slotId, 'img', bones);
  });

  const mesh = () => getMesh(slotId, 'img')!;
  const world = () => {
    const { mats, slotMat } = setupMats();
    return meshWorldPositions(mesh(), slotMat(slotId), mats);
  };
  /** The share of bone b at the vertex nearest to a picture pixel. */
  const share = (px: number, py: number) => {
    const m = mesh();
    let best = 0;
    for (let i = 1; i < m.uvs.length / 2; i++)
      if (Math.hypot(m.uvs[i * 2] * W - px, m.uvs[i * 2 + 1] * H - py) < Math.hypot(m.uvs[best * 2] * W - px, m.uvs[best * 2 + 1] * H - py))
        best = i;
    return m.weights![best].find((e) => e[0] === bones[1])?.[3] ?? 0;
  };

  it('keeps it bound, with the weights where they were and the setup pose unchanged', () => {
    const places = [
      [35, 20],
      [35, 120],
      [35, 220],
    ] as const;
    const before = places.map(([x, y]) => share(x, y));
    expect(before[0]).toBeLessThan(0.2);
    expect(before[2]).toBeGreaterThan(0.8);
    regenerateMesh(slotId, 'img', { vertices: 120 });
    const m = mesh();
    expect(m.uvs.length / 2).toBe(120);
    expect(m.weights!.length).toBe(120);
    for (const list of m.weights!) expect(list.reduce((s, e) => s + e[3], 0)).toBeCloseTo(1, 6);
    places.forEach(([x, y], i) => expect(Math.abs(share(x, y) - before[i])).toBeLessThan(0.15));
    const w = world();
    for (let i = 0; i < 120; i++) {
      expect(w[i * 2]).toBeCloseTo(m.uvs[i * 2] * W - W / 2, 4);
      expect(w[i * 2 + 1]).toBeCloseTo(H / 2 - m.uvs[i * 2 + 1] * H, 4);
    }
    expect(validateProject(docStore.get())).toEqual([]);
  });

  it('keeps a selected vertex that was moved, and leaves it selected', () => {
    const at = mesh().hull;
    moveMeshVertices(slotId, 'img', [{ index: at, x: 3, y: 4 }]);
    const weights = mesh().weights![at];
    setSelection({ slot: slotId, attachment: 'img', bones, vertices: [at] });
    regenerateMesh(slotId, 'img', { vertices: 70 });
    const [kept] = uiStore.get().selection.vertices;
    expect(uiStore.get().selection.vertices.length).toBe(1);
    expect(world()[kept * 2]).toBeCloseTo(3, 6);
    expect(world()[kept * 2 + 1]).toBeCloseTo(4, 6);
    expect(mesh().weights![kept]).toEqual(weights);
  });
});
