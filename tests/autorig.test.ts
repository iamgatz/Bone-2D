/** Auto-rig: the layers of a painted character get a skeleton from their names and shapes, without the picture moving. */
import { beforeEach, describe, expect, it } from 'vitest';
import { guessPart, PARTS, planRig } from '@/core/autorig';
import { matApply } from '@/core/math';
import { adjacency, autoWeights, generateMeshFromImage, imageToBoneSpace, smoothWeights } from '@/core/mesh';
import type { MeshAttachment, RegionAttachment } from '@/core/model';
import { emptyProject, newSlot } from '@/core/model';
import { validateProject } from '@/core/validate';
import { autoRig, rigCandidates } from '@/store/autoRigActions';
import { assets } from '@/store/assets';
import { docStore } from '@/store/doc';
import { setupMats } from '@/store/meshActions';
import { getSetupSkeleton } from '@/store/scene';
import { meshWorldPositions } from '@/core/mesh';
import { uiStore } from '@/store/ui';

type P = [number, number];

describe('the part a layer name speaks of', () => {
  it.each([
    ['torso', 'torso', ''],
    ['Body', 'torso', ''],
    ['head', 'head', ''],
    ['front hair', 'face', ''],
    ['ponytail', 'face', ''],
    ['Eye_L', 'face', ''],
    ['ear', 'face', ''],
    ['arm_L', 'arm', 'l'],
    ['ArmUpperRight', 'upperArm', 'r'],
    ['left/forearm', 'forearm', 'l'],
    ['right arm/hand 2', 'hand', 'r'],
    ['back leg', 'leg', 'back'],
    ['rear leg', 'leg', 'back'],
    ['front arm', 'arm', 'front'],
    ['thigh.r', 'thigh', 'r'],
    ['lower leg left', 'shin', 'l'],
    ['Boot-R', 'foot', 'r'],
    ['tail', 'tail', ''],
    ['neck', 'neck', ''],
    ['pelvis', 'hips', ''],
    ['background', 'keep', ''],
    ['sword', 'near', ''],
    ['Голова', 'head', ''],
    ['Тело', 'torso', ''],
    ['левая рука', 'arm', 'l'],
    ['предплечье_п', 'forearm', 'r'],
    ['правое бедро', 'thigh', 'r'],
    ['волосы', 'face', ''],
    ['хвост', 'tail', ''],
    ['身体', 'torso', ''],
    ['头', 'head', ''],
    ['头发', 'face', ''],
    ['左手臂', 'arm', 'l'],
    ['右前臂', 'forearm', 'r'],
    ['左手', 'hand', 'l'],
    ['右大腿', 'thigh', 'r'],
    ['左小腿', 'shin', 'l'],
    ['尾巴', 'tail', ''],
  ])('%s', (name, part, side) => {
    expect(guessPart(name)).toEqual({ part, side });
  });
});

/** A layer painted as thick lines: the picture covers them, and its region puts it where they are in the scene. */
function painted(name: string, line: P[], radius: number) {
  const xs = line.map((p) => p[0]);
  const ys = line.map((p) => p[1]);
  const left = Math.min(...xs) - radius - 2;
  const top = Math.max(...ys) + radius + 2;
  const width = Math.ceil(Math.max(...xs) - Math.min(...xs) + 2 * radius + 4);
  const height = Math.ceil(Math.max(...ys) - Math.min(...ys) + 2 * radius + 4);
  const data = new Uint8ClampedArray(width * height * 4);
  const near = (x: number, y: number) =>
    line.some((a, i) => {
      const b = line[Math.min(i + 1, line.length - 1)];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) <= radius;
    });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (near(left + x + 0.5, top - y - 0.5)) data[(y * width + x) * 4 + 3] = 255;
  const region: RegionAttachment = {
    type: 'region',
    name,
    path: name,
    x: left + width / 2,
    y: top - height / 2,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    width,
    height,
    color: [1, 1, 1, 1],
  };
  return { name, region, image: { data, width, height } as ImageData };
}

/** A figure facing us, back to front. Its left arm bends at (-100, 270), its right leg is straight, its left leg is two pictures. */
const FIGURE = [
  painted(
    'background',
    [
      [-200, 200],
      [200, 200],
    ],
    5,
  ),
  painted(
    'arm_r',
    [
      [40, 330],
      [100, 270],
      [100, 190],
    ],
    15,
  ),
  painted(
    'leg_r',
    [
      [25, 205],
      [30, 25],
    ],
    17,
  ),
  painted(
    'torso',
    [
      [0, 305],
      [0, 245],
    ],
    45,
  ),
  painted(
    'thigh_l',
    [
      [-25, 200],
      [-34, 115],
    ],
    17,
  ),
  painted(
    'shin_l',
    [
      [-34, 118],
      [-30, 25],
    ],
    15,
  ),
  painted(
    'arm_l',
    [
      [-40, 330],
      [-100, 270],
      [-100, 190],
    ],
    15,
  ),
  painted(
    'head',
    [
      [0, 385],
      [0, 385],
    ],
    45,
  ),
  painted(
    'eye_l',
    [
      [-15, 390],
      [-15, 390],
    ],
    6,
  ),
  painted(
    'sleeve',
    [
      [-48, 322],
      [-62, 308],
    ],
    18,
  ),
];

let slots: Record<string, string> = {};

beforeEach(() => {
  const p = emptyProject();
  const root = p.skeleton.bones[0];
  slots = {};
  for (const layer of FIGURE) {
    const slot = newSlot({ name: layer.name, bone: root.id });
    slot.attachment = layer.name;
    slots[layer.name] = slot.id;
    p.skeleton.slots.push(slot);
    p.skeleton.skins[0].attachments[slot.id] = { [layer.name]: { ...layer.region } };
    p.images.push({ id: layer.name, name: layer.name, width: layer.image.width, height: layer.image.height });
  }
  docStore.replace(p);
  assets.getImageData = (name) => FIGURE.find((l) => l.name === name)!.image;
  uiStore.patch({ mode: 'setup', tool: 'select' });
});

const run = () => autoRig(rigCandidates(), { legIk: true, armIk: false });
const bone = (name: string) => {
  const found = getSetupSkeleton().bones.find((b) => b.data.name === name);
  if (!found) throw new Error(`no bone ${name}`);
  return found;
};
const near = (got: P, want: P, within: number) => expect(Math.hypot(got[0] - want[0], got[1] - want[1])).toBeLessThan(within);
const from = (name: string): P => [bone(name).worldX, bone(name).worldY];
const to = (name: string): P => [bone(name).tipX, bone(name).tipY];
const holder = (layer: string) => {
  const doc = docStore.get().skeleton;
  const slot = doc.slots.find((s) => s.id === slots[layer])!;
  return doc.bones.find((b) => b.id === slot.bone)!.name;
};
const attachment = (layer: string) => docStore.get().skeleton.skins[0].attachments[slots[layer]][layer];

/** Where the setup pose shows a place of a layer's picture: a plain picture. */
function shown(layer: string, px: number, py: number): P {
  const att = attachment(layer) as RegionAttachment;
  const image = FIGURE.find((l) => l.name === layer)!.image;
  const { slotMat } = setupMats();
  return matApply(slotMat(slots[layer]), ...imageToBoneSpace(att, image.width, image.height)(px, py));
}

describe('auto-rig', () => {
  it('guesses every part from the names', () => {
    expect(rigCandidates().map((c) => [c.slot, c.part, c.side])).toEqual([
      ['background', 'keep', ''],
      ['arm_r', 'arm', 'r'],
      ['leg_r', 'leg', 'r'],
      ['torso', 'torso', ''],
      ['thigh_l', 'thigh', 'l'],
      ['shin_l', 'shin', 'l'],
      ['arm_l', 'arm', 'l'],
      ['head', 'head', ''],
      ['eye_l', 'face', ''],
      ['sleeve', 'near', ''],
    ]);
  });

  it('puts the joints where the parts meet and where the limbs bend', () => {
    run();
    near(from('upper-arm-l'), [-40, 330], 18);
    near(to('upper-arm-l'), [-100, 270], 14);
    near(to('forearm-l'), [-100, 190], 18);
    near(from('upper-arm-r'), [40, 330], 18);
    near(to('upper-arm-r'), [100, 270], 14);
    near(from('thigh-l'), [-25, 200], 20);
    near(to('thigh-l'), [-34, 116], 12);
    near(to('shin-l'), [-30, 25], 20);
    near(to('thigh-r'), [27.5, 115], 14);
    near(from('head'), [0, 345], 20);
    expect(to('head')[1]).toBeGreaterThan(420);
    expect(from('hips')[1]).toBeLessThan(from('torso')[1]);
  });

  it('builds the tree, puts the pictures on it and gives the legs IK', () => {
    expect(run()).toEqual({ bones: 11, meshes: 3, ik: 2 });
    const doc = docStore.get().skeleton;
    const parent = (name: string) => {
      const b = doc.bones.find((x) => x.name === name)!;
      return doc.bones.find((x) => x.id === b.parent)?.name;
    };
    expect(parent('hips')).toBe('root');
    expect(parent('torso')).toBe('hips');
    expect(parent('head')).toBe('torso');
    expect(parent('upper-arm-l')).toBe('torso');
    expect(parent('forearm-l')).toBe('upper-arm-l');
    expect(parent('thigh-r')).toBe('hips');
    expect(parent('shin-r')).toBe('thigh-r');
    expect(holder('torso')).toBe('torso');
    expect(holder('thigh_l')).toBe('thigh-l');
    expect(holder('shin_l')).toBe('shin-l');
    expect(holder('eye_l')).toBe('head');
    expect(holder('sleeve')).toBe('upper-arm-l');
    expect(holder('background')).toBe('root');
    expect(attachment('arm_l').type).toBe('mesh');
    expect(attachment('arm_r').type).toBe('mesh');
    expect(attachment('leg_r').type).toBe('mesh');
    expect(attachment('thigh_l').type).toBe('region');
    expect(doc.constraints.map((c) => [c.type, c.type === 'ik' ? c.bones.length : 0])).toEqual([
      ['ik', 2],
      ['ik', 2],
    ]);
    expect(validateProject(docStore.get())).toEqual([]);
  });

  it('leaves every picture where it was, and the bones where they were planned with IK on', () => {
    const corners = (layer: string) => {
      const { width, height } = FIGURE.find((l) => l.name === layer)!.image;
      return [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ].map(([x, y]) => shown(layer, x, y));
    };
    const plain = ['torso', 'thigh_l', 'shin_l', 'head', 'eye_l', 'sleeve'];
    const before = plain.map(corners);
    run();
    plain.forEach((layer, i) => corners(layer).forEach((p, k) => near(p, before[i][k], 0.05)));
    // a mesh shows each place of its picture where the picture was
    for (const layer of ['arm_l', 'arm_r', 'leg_r']) {
      const mesh = attachment(layer) as MeshAttachment;
      const { region } = FIGURE.find((l) => l.name === layer)!;
      const { mats, slotMat } = setupMats();
      const world = meshWorldPositions(mesh, slotMat(slots[layer]), mats);
      for (let i = 0; i < mesh.uvs.length / 2; i++) {
        near(
          [world[i * 2], world[i * 2 + 1]],
          [region.x + (mesh.uvs[i * 2] - 0.5) * region.width, region.y - (mesh.uvs[i * 2 + 1] - 0.5) * region.height],
          0.05,
        );
      }
    }
    // IK in the setup pose bends nothing: the bones end where the next ones start
    near(to('thigh-l'), from('shin-l'), 0.5);
    near(to('shin-l'), from('shin-l target'), 1);
    near(to('shin-r'), from('shin-r target'), 1);
  });

  it('is one step of the history', () => {
    const before = docStore.get();
    run();
    expect(docStore.history.past).toEqual(['Auto-rig']);
    docStore.undo();
    expect(docStore.get()).toEqual(before);
  });

  it('leaves alone what it is told to keep, and says so when there is nothing to build', () => {
    const before = docStore.get();
    expect(
      autoRig(
        rigCandidates().map((c) => ({ ...c, part: 'keep' as const })),
        { legIk: true, armIk: true },
      ),
    ).toEqual({
      bones: 0,
      meshes: 0,
      ik: 0,
    });
    expect(docStore.get()).toBe(before);
  });

  it('folds a limb painted in one piece less than a plain trace does', () => {
    run();
    const upper = bone('upper-arm-l');
    const fore = bone('forearm-l');
    const joint: P = [fore.worldX, fore.worldY];
    const segments = [upper, fore].map((b) => ({ id: b.data.id, ax: b.worldX, ay: b.worldY, bx: b.tipX, by: b.tipY }));
    /** The share of the area that turns over when the forearm turns, the worst of several angles. */
    const folds = (world: ArrayLike<number>, weights: number[], triangles: number[]) =>
      Math.max(
        ...[-110, -90, -60, 60, 90, 110].map((degrees) => {
          const c = Math.cos((degrees * Math.PI) / 180);
          const s = Math.sin((degrees * Math.PI) / 180);
          const posed = weights.map((w, i) => {
            const [x, y] = [world[i * 2] - joint[0], world[i * 2 + 1] - joint[1]];
            return [x * (1 - w) + (x * c - y * s) * w, y * (1 - w) + (x * s + y * c) * w];
          });
          const area = (at: (i: number) => ArrayLike<number>, t: number) => {
            const [a, b, d] = [0, 1, 2].map((k) => at(triangles[t + k]));
            return ((b[0] - a[0]) * (d[1] - a[1]) - (d[0] - a[0]) * (b[1] - a[1])) / 2;
          };
          let turned = 0;
          let total = 0;
          for (let t = 0; t < triangles.length; t += 3) {
            const rest = area((i) => [world[i * 2], world[i * 2 + 1]], t);
            const bent = area((i) => posed[i], t);
            total += Math.abs(rest);
            if (rest * bent < 0) turned += Math.abs(bent);
          }
          return turned / total;
        }),
      );
    const measure = (mesh: MeshAttachment) => {
      const world: number[] = [];
      const layer = FIGURE.find((l) => l.name === 'arm_l')!.region;
      for (let i = 0; i < mesh.uvs.length / 2; i++)
        world.push(layer.x + (mesh.uvs[i * 2] - 0.5) * layer.width, layer.y - (mesh.uvs[i * 2 + 1] - 0.5) * layer.height);
      const weights = smoothWeights(autoWeights(world, segments), adjacency(mesh.triangles, world.length / 2), 2, 0.5);
      return folds(
        world,
        weights.map((list) => list.find((e) => e.bone === fore.data.id)?.w ?? 0),
        mesh.triangles,
      );
    };
    const layer = FIGURE.find((l) => l.name === 'arm_l')!;
    const plain = generateMeshFromImage(layer.region, layer.image.data, layer.image.width, layer.image.height);
    const rigged = attachment('arm_l') as MeshAttachment;
    const even = generateMeshFromImage(layer.region, layer.image.data, layer.image.width, layer.image.height, {
      vertices: rigged.uvs.length / 2,
    });
    const [was, evenly, is] = [measure(plain), measure(even), measure(rigged)];
    expect(is).toBeLessThan(was * 0.5);
    // and it is the rows that do it: an even mesh with as many vertices folds more
    expect(is).toBeLessThan(evenly * 0.7);
  });
});

describe('the planner with whatever it is told', () => {
  it('makes a tree with finite places for any choice of parts, shapes of one place included', () => {
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    const sides = ['', 'l', 'r', 'front', 'back'] as const;
    for (let round = 0; round < 1500; round++) {
      const layers = Array.from({ length: 1 + random(8) }, (_, i) => {
        const [x, y, w, h] = [random(200) - 100, random(200), 1 + random(6) ** 2, 1 + random(6) ** 2];
        const dot = random(5) === 0;
        const points = Array.from({ length: dot ? 1 : 12 }, (_, k): P => (dot ? [x, y] : [x + (w * (k % 3)) / 2, y + (h * (k >> 2)) / 3]));
        return { id: `s${i}`, part: PARTS[random(PARTS.length)], side: sides[random(sides.length)], points, step: 1 + random(4) };
      });
      const plan = planRig(layers, { legIk: true, armIk: true });
      const keys = new Set<string>();
      for (const b of plan.bones) {
        expect([...b.from, ...b.to].every(Number.isFinite)).toBe(true);
        expect(keys.has(b.key)).toBe(false);
        if (b.parent) expect(keys.has(b.parent)).toBe(true);
        keys.add(b.key);
      }
      const placed = plan.layers.map((l) => l.id);
      expect(new Set(placed).size).toBe(placed.length);
      for (const l of plan.layers) {
        expect(l.bones.length).toBeGreaterThan(0);
        for (const key of l.bones) expect(keys.has(key)).toBe(true);
        for (const j of l.joints) expect([...j.at, ...j.along].every(Number.isFinite)).toBe(true);
      }
      // with a bone to go on, every picture that is not left alone gets one
      if (plan.bones.length) expect(placed.length).toBe(layers.filter((l) => l.part !== 'keep').length);
      for (const ik of plan.ik) expect(keys.has(ik.end)).toBe(true);
    }
  });
});
