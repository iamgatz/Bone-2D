/**
 * DragonBones skeleton files (`*_ske.json`, format 5.x) -> the Spine 4.3 JSON structure that `importSpineJson` reads, so that a
 * DragonBones project arrives with its bones, slots, skins, meshes with weights and animations. What DragonBones does differently:
 *   - y points down: positions get y negated, angles their sign; its skews skX / skY become rotation = -skY, shearY = skY - skX;
 *   - a picture hangs by a pivot (a share of its size), displays are listed by number, a weighted mesh keeps bind poses;
 *   - keys have a length in frames, and their easing is a number (quadratic, cosine) or a curve of shares.
 * Everything that has no counterpart is named in `warnings`; nothing is dropped silently.
 */

import type { ParsedPage } from './atlas';
import { importSpineJson } from './spineJson';
import type { SpineImportResult } from './spineJson';

type J = Record<string, any>;

const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
/** A flag of the file: a boolean, a number, or a word such as "false". */
const flag = (v: unknown, d: boolean): boolean => {
  if (v === undefined || v === null) return d;
  return typeof v === 'string' ? !['false', '0', 'NaN', 'null', ''].includes(v) : Boolean(v);
};

export interface PictureSize {
  width: number;
  height: number;
}

export interface DragonBonesImport {
  /** The name of the armature that was converted. */
  name: string;
  /** A Spine 4.3 skeleton document. */
  spine: J;
  warnings: string[];
}

const RAD = Math.PI / 180;
/** The angle brought into (-180, 180]. */
const wrap = (degrees: number) => degrees - 360 * Math.ceil((degrees - 180) / 360);

/** An affine map [a b c d tx ty] the DragonBones way: x' = a x + c y + tx, y' = b x + d y + ty (y down). */
type Mat = [number, number, number, number, number, number];

const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const turn = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
function invert([a, b, c, d, x, y]: Mat): Mat {
  const det = a * d - b * c || 1e-9;
  return [d / det, -b / det, -c / det, a / det, (c * y - d * x) / det, (b * x - a * y) / det];
}
const matAt = (list: unknown, at: number): Mat => {
  const v = arr(list);
  return [num(v[at], 1), num(v[at + 1], 0), num(v[at + 2], 0), num(v[at + 3], 1), num(v[at + 4], 0), num(v[at + 5], 0)];
};

interface Placement {
  x: number;
  y: number;
  /** The directions of the two axes in degrees, as the file gives them: skY turns the x axis, skX the y axis. */
  skX: number;
  skY: number;
  scX: number;
  scY: number;
}

function placement(raw: unknown): Placement {
  const t = obj(raw);
  // the newer spelling: rotate and skew; the older: skX and skY
  const turned = 'rotate' in t || 'skew' in t;
  const skY = turned ? num(t.rotate, 0) : num(t.skY, 0);
  const skX = turned ? skY + num(t.skew, 0) : num(t.skX, 0);
  return { x: num(t.x, 0), y: num(t.y, 0), skX, skY, scX: num(t.scX, 1), scY: num(t.scY, 1) };
}

const matrixOf = (p: Placement): Mat => [
  Math.cos(p.skY * RAD) * p.scX,
  Math.sin(p.skY * RAD) * p.scX,
  -Math.sin(p.skX * RAD) * p.scY,
  Math.cos(p.skX * RAD) * p.scY,
  p.x,
  p.y,
];

const hex = (v: number) =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, '0');

/** "rM": 50 and friends as an "rrggbbaa" colour; whether the colour also adds to the picture, which a tint cannot. */
function tint(raw: unknown): { color: string; adds: boolean } {
  const c = obj(raw);
  const part = (k: string) => num(c[k], 100) / 100;
  return {
    color: hex(part('rM')) + hex(part('gM')) + hex(part('bM')) + hex(part('aM')),
    adds: ['rO', 'gO', 'bO', 'aO'].some((k) => num(c[k], 0) !== 0),
  };
}

export function isDragonBones(root: unknown): boolean {
  const r = obj(root);
  return Array.isArray(r.armature) && r.armature.some((a: unknown) => Array.isArray(obj(a).bone));
}

/** The names of the pictures a file shows, as its displays call them. */
export function displayPaths(root: unknown): string[] {
  const paths = new Set<string>();
  for (const a of arr(obj(root).armature).map(obj))
    for (const skin of arr(a.skin).map(obj))
      for (const slot of arr(skin.slot).map(obj))
        for (const d of arr(slot.display).map(obj))
          if (['image', 'mesh', undefined].includes(d.type)) paths.add(str(d.path) || str(d.name));
  paths.delete('');
  return [...paths];
}

/** The armature a file is about: the one no other armature shows as a part of itself, with the most bones. */
function mainArmature(armatures: J[]): J {
  const parts = new Set<string>();
  for (const a of armatures)
    for (const skin of arr(a.skin))
      for (const slot of arr(obj(skin).slot))
        for (const d of arr(obj(slot).display).map(obj)) if (d.type === 'armature') parts.add(str(d.path, str(d.name)));
  const own = armatures.filter((a) => !parts.has(str(a.name)));
  return (own.length ? own : armatures).reduce((best, a) => (arr(a.bone).length > arr(best.bone).length ? a : best));
}

/** Whether a JSON document is a DragonBones texture atlas (`*_tex.json`). */
export const isDragonAtlas = (root: unknown): boolean => Array.isArray(obj(root).SubTexture);

/** The page and the regions a DragonBones texture atlas describes, in the shape the unpacker cuts. */
export function dragonAtlas(root: unknown): ParsedPage {
  const atlas = obj(root);
  return {
    file: str(atlas.imagePath),
    width: num(atlas.width, 0),
    height: num(atlas.height, 0),
    pma: false,
    regions: arr(atlas.SubTexture)
      .map(obj)
      .map((r) => {
        const width = num(r.width, 0);
        const height = num(r.height, 0);
        const originalWidth = num(r.frameWidth, width);
        const originalHeight = num(r.frameHeight, height);
        // frameX / frameY say where the original picture starts, seen from the kept part; the unpacker counts from the bottom left
        return {
          name: str(r.name),
          x: num(r.x, 0),
          y: num(r.y, 0),
          width,
          height,
          // a turned region lies a quarter turn clockwise in the page
          rotate: r.rotated ? (270 as const) : (0 as const),
          offsetX: -num(r.frameX, 0),
          offsetY: originalHeight - height + num(r.frameY, 0),
          originalWidth,
          originalHeight,
        };
      }),
  };
}

// ---- timelines

interface Frame {
  raw: J;
  time: number;
  /** Frames until the next key. */
  length: number;
}

function framesOf(list: unknown, fps: number): Frame[] {
  let at = 0;
  return arr(list)
    .map(obj)
    .map((raw) => {
      const length = Math.max(0, num(raw.duration, 1));
      const frame = { raw, time: at / fps, length };
      at += length;
      return frame;
    });
}

/** How a key runs to the next one: held, straight, or a bezier of shares [x1, y1, x2, y2]. */
type Ease = 'stepped' | 'linear' | number[] | { samples: number[] };

function easeOf(raw: J): Ease {
  const curve = arr(raw.curve);
  if (curve.length === 4) return curve.map((v) => num(v, 0));
  if (curve.length > 4) return { samples: curve.map((v) => num(v, 0)) };
  const e = raw.tweenEasing;
  if (typeof e !== 'number' || e === -2) return 'stepped';
  if (e === 0) return 'linear';
  // quadratic in, quadratic out and (near enough) cosine in and out, each as strong as the number says
  if (e <= 1) return [1 / 3, (1 + e) / 3, 2 / 3, 1 - (1 - e) / 3];
  const k = Math.min(1, e - 1);
  return [0.37, 0.37 * (1 - k), 0.63, 0.63 * (1 - k) + k];
}

/** The share of the way at share `t` of the time along a curve of several bezier pieces. */
function along(curve: number[], t: number): number {
  const points = [0, 0, ...curve, 1, 1];
  for (let i = 0; i + 7 < points.length; i += 6) {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = points.slice(i, i + 8);
    if (t > x3 && i + 13 < points.length) continue;
    const at = (a: number, b: number, c: number, d: number, s: number) =>
      (1 - s) ** 3 * a + 3 * (1 - s) ** 2 * s * b + 3 * (1 - s) * s ** 2 * c + s ** 3 * d;
    let low = 0;
    let high = 1;
    for (let k = 0; k < 24; k++) {
      const mid = (low + high) / 2;
      if (at(x0, x1, x2, x3, mid) < t) low = mid;
      else high = mid;
    }
    return at(y0, y1, y2, y3, (low + high) / 2);
  }
  return t;
}

interface Key {
  time: number;
  values: number[];
  ease: Ease;
}

/**
 * Keys with their values, ready to be written: in an animation that goes round, the last key of a timeline that still moves goes
 * back to the first one (an angle by the shorter way), and a curve of several pieces becomes a key at every frame.
 */
function closed(keys: (Key & { length: number })[], fps: number, loops: boolean, angles: number[] = []): Key[] {
  if (!keys.length) return [];
  const last = keys.at(-1)!;
  const list = [...keys];
  if (loops && list.length > 1 && last.length > 0 && last.ease !== 'stepped') {
    const values = keys[0].values.map((v, c) => (angles.includes(c) ? last.values[c] + wrap(v - last.values[c]) : v));
    list.push({ time: last.time + last.length / fps, values, ease: 'stepped', length: 0 });
  }
  return list.flatMap((key, i): Key[] => {
    const next = list[i + 1];
    if (!next || typeof key.ease === 'string' || Array.isArray(key.ease)) return [key];
    const curve = key.ease.samples;
    return Array.from({ length: Math.max(1, key.length) }, (_, f) => {
      const share = along(curve, f / Math.max(1, key.length));
      return { time: key.time + f / fps, values: key.values.map((v, c) => v + (next.values[c] - v) * share), ease: 'linear' as const };
    });
  });
}

/** The `curve` entry of a Spine key: control points in time and value, channel by channel; `progress`: values are shares (deform). */
function curveOf(key: Key, next: Key | undefined, progress = false): J {
  if (!next || key.ease === 'linear') return {};
  if (key.ease === 'stepped') return { curve: 'stepped' };
  if (!Array.isArray(key.ease)) return {};
  const [x1, y1, x2, y2] = key.ease;
  const span = next.time - key.time;
  const channels = progress ? [0] : key.values.map((_, i) => i);
  return {
    curve: channels.flatMap((c) => {
      const from = progress ? 0 : key.values[c];
      const to = progress ? 1 : next.values[c];
      return [key.time + x1 * span, from + y1 * (to - from), key.time + x2 * span, from + y2 * (to - from)];
    }),
  };
}

const written = (keys: Key[], value: (values: number[]) => J, progress = false) =>
  keys.map((key, i) => ({ time: key.time, ...value(key.values), ...curveOf(key, keys[i + 1], progress) }));

// ---- the conversion

interface Mesh {
  /** The transforms from the file's vertex offsets to ours: one linear map for each vertex of a plain mesh, else one per influence. */
  offsets: Mat[][];
}

export function dragonBonesToSpine(input: unknown, pictures: ReadonlyMap<string, PictureSize>): DragonBonesImport {
  const root = obj(input);
  if (!isDragonBones(root)) throw new Error('Not a DragonBones skeleton: no armature with bones');
  const warnings: string[] = [];
  const warn = (m: string) => {
    if (!warnings.includes(m)) warnings.push(m);
  };
  const version = str(root.version, '');
  if (version && !(parseFloat(version) >= 5)) warn(`DragonBones ${version} file: only 5.0 and newer import faithfully`);
  const armatures = arr(root.armature).map(obj);
  const armature = mainArmature(armatures);
  const others = armatures.filter((a) => a !== armature).map((a) => str(a.name, '?'));
  if (others.length) warn(`only the armature "${str(armature.name)}" was imported, not "${others.join('", "')}"`);
  const fps = num(armature.frameRate, num(root.frameRate, 24)) || 24;

  // ---- bones, parents first
  const rawBones = arr(armature.bone).map(obj);
  if (rawBones.some((b) => b.type === 'surface')) warn('surface deformers are not supported: what hangs on them will look wrong');
  const byName = new Map(rawBones.map((b) => [str(b.name), b]));
  const ordered: J[] = [];
  const placed = new Set<J>();
  const place = (b: J, chain: Set<J>) => {
    if (placed.has(b) || chain.has(b)) return;
    chain.add(b);
    const parent = byName.get(str(b.parent));
    if (parent) place(parent, chain);
    placed.add(b);
    ordered.push(b);
  };
  for (const b of rawBones) place(b, new Set());
  /** The index in our list of the bone at an index of the file's list (weights count in the file's). */
  const boneAt = rawBones.map((b) => ordered.indexOf(b));

  /** How far from 1 the scale of a bone gets, and how far its two scales get from each other, in the setup pose and in its keys. */
  const stretch = new Map<J, number>();
  const unevenness = new Map<J, number>();
  for (const bone of ordered) {
    const t = placement(bone.transform);
    let most = 0;
    let uneven = 0;
    const scaled = (x: number, y: number) => {
      most = Math.max(most, Math.abs(t.scX * x - 1), Math.abs(t.scY * y - 1));
      uneven = Math.max(uneven, Math.abs(t.scX * x - t.scY * y));
    };
    scaled(1, 1);
    for (const animation of arr(armature.animation).map(obj)) {
      for (const tl of arr(animation.bone).map(obj)) {
        if (str(tl.name) !== str(bone.name)) continue;
        for (const f of arr(tl.scaleFrame).map(obj)) scaled(num(f.x, 1), num(f.y, 1));
        for (const f of arr(tl.frame).map((v) => obj(obj(v).transform))) scaled(num(f.scX, 1), num(f.scY, 1));
      }
    }
    stretch.set(bone, most);
    unevenness.set(bone, uneven);
  }
  const above = (bone: J, of: ReadonlyMap<J, number>) => {
    let most = 0;
    const seen = new Set<J>();
    for (let p = byName.get(str(bone.parent)); p && !seen.has(p); p = byName.get(str(p.parent))) {
      seen.add(p);
      most = Math.max(most, of.get(p) ?? 0);
    }
    return most;
  };
  /** The bones of two bone IK: the solver counts on them following their parent in full. */
  const solved = new Set(
    arr(armature.ik)
      .map(obj)
      .filter((ik) => num(ik.chain, 0) > 0)
      .flatMap((ik) => [str(ik.bone), str(byName.get(str(ik.bone))?.parent)]),
  );

  const bones = ordered.map((b) => {
    const t = placement(b.transform);
    const turns = flag(b.inheritRotation, true);
    const stretched = above(b, stretch);
    // the solver of IK works with bones that follow their parent in full; so does everything under a parent that is never scaled
    const scales = flag(b.inheritScale, true) || stretched < 0.002 || solved.has(str(b.name));
    const mirrors = flag(b.inheritReflection, true);
    if (!flag(b.inheritTranslation, true)) warn(`bone "${str(b.name)}" does not follow its parent's position, which is not supported`);
    if (solved.has(str(b.name)) && !flag(b.inheritScale, true) && stretched >= 0.03)
      warn(`bone "${str(b.name)}" is moved by IK and ignores the scale above it: its poses differ`);
    else if ((!scales || !turns) && above(b, unevenness) >= 0.05)
      warn(`bone "${str(b.name)}" ignores part of a parent that stretches one way more than the other: its angle can differ`);
    const inherit = turns
      ? scales
        ? 'normal'
        : mirrors
          ? 'noScale'
          : 'noScaleOrReflection'
      : scales
        ? 'noRotationOrReflection'
        : 'onlyTranslation';
    return {
      name: str(b.name),
      ...(byName.has(str(b.parent)) ? { parent: str(b.parent) } : {}),
      length: num(b.length, 0),
      x: t.x,
      y: -t.y,
      rotation: wrap(-t.skY),
      scaleX: t.scX,
      scaleY: t.scY,
      shearY: wrap(t.skY - t.skX),
      inherit,
    };
  });

  // ---- slots, bottom first
  const rawSlots = arr(armature.slot).map(obj);
  const rawSkins = arr(armature.skin).map(obj);
  const skinName = (s: J) => str(s.name) || 'default';
  const displaysOf = (skin: J, slot: string) =>
    arr(
      arr(skin.slot)
        .map(obj)
        .find((s) => str(s.name) === slot)?.display,
    );
  const defaultSkin = rawSkins.find((s) => skinName(s) === 'default') ?? rawSkins[0] ?? {};
  /** For every slot, the attachment name of each display number: the default skin names them, every skin shares the names. */
  const names = new Map<string, (string | null)[]>();
  for (const slot of rawSlots) {
    const slotName = str(slot.name);
    const list: (string | null)[] = [];
    const taken = new Set<string>();
    for (const skin of [defaultSkin, ...rawSkins]) {
      displaysOf(skin, slotName).forEach((raw, i) => {
        if (list[i] || !raw) return;
        const base = str(obj(raw).name) || `${slotName} ${i}`;
        let name = base;
        for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
        taken.add(name);
        list[i] = name;
      });
    }
    names.set(slotName, list);
  }
  const nameAt = (slot: string, index: number) => names.get(slot)?.[index] ?? null;

  const slots = rawSlots.map((s) => {
    const slot = str(s.name);
    const color = tint(s.color);
    if (color.adds) warn(`slot "${slot}": colour offsets (adding to the picture) are not supported`);
    const blend = str(s.blendMode, 'normal');
    const mode = blend === 'add' ? 'additive' : blend;
    if (!['normal', 'additive', 'multiply', 'screen'].includes(mode)) warn(`slot "${slot}": the blend mode "${blend}" is not supported`);
    const attachment = nameAt(slot, num(s.displayIndex, 0));
    return {
      name: slot,
      bone: str(s.parent),
      ...(color.color === 'ffffffff' ? {} : { color: color.color }),
      ...(attachment ? { attachment } : {}),
      ...(['additive', 'multiply', 'screen'].includes(mode) ? { blend: mode } : {}),
    };
  });

  // ---- skins
  const meshes = new Map<string, Mesh>();
  const key = (skin: string, slot: string, display: string) => JSON.stringify([skin, slot, display]);
  const size = (path: string): PictureSize => {
    const found = pictures.get(path);
    if (!found) warn(`the picture "${path}" is not among the files: its size is not known`);
    return found ?? { width: 100, height: 100 };
  };

  function attachment(skin: string, slot: string, name: string, d: J): J | null {
    const type = str(d.type, 'image');
    const path = str(d.path) || str(d.name) || name;
    const t = placement(d.transform);
    const m = matrixOf(t);
    const common = path === name ? {} : { path };
    if (type === 'image') {
      const picture = size(path);
      const pivot = d.pivot ? { x: num(obj(d.pivot).x, 0), y: num(obj(d.pivot).y, 0) } : { x: 0.5, y: 0.5 };
      // where the middle of the picture is from the point it hangs by
      const [cx, cy] = [(0.5 - pivot.x) * picture.width, (0.5 - pivot.y) * picture.height];
      if (Math.abs(wrap(t.skX - t.skY)) < 0.01) {
        const [x, y] = apply(m, cx, cy);
        return { ...common, x, y: -y, rotation: wrap(-t.skY), scaleX: t.scX, scaleY: t.scY, ...picture };
      }
      // a slanted picture cannot be a plain one: it becomes a mesh of its four corners
      const corners = [
        [1, 1],
        [0, 1],
        [0, 0],
        [1, 0],
      ];
      const vertices = corners.flatMap(([u, v]) => {
        const [x, y] = apply(m, cx + (u - 0.5) * picture.width, cy + (v - 0.5) * picture.height);
        return [x, -y];
      });
      return { ...common, type: 'mesh', uvs: corners.flat(), triangles: [0, 1, 2, 0, 2, 3], vertices, hull: 4, ...picture };
    }
    if (type === 'mesh') {
      if (d.share) {
        warn(`mesh "${name}" of slot "${slot}" shares the shape of another mesh, which is not supported`);
        return null;
      }
      const raw = arr(d.vertices).map((v) => num(v, 0));
      const uvs = arr(d.uvs).map((v) => num(v, 0));
      const triangles = arr(d.triangles).map((v) => num(v, 0));
      const frame = pictures.get(path) ?? { width: num(d.width, 0), height: num(d.height, 0) };
      const out: J = { ...common, type: 'mesh', uvs, triangles, hull: uvs.length / 2, ...frame };
      const offsets: Mat[][] = [];
      if (!d.weights) {
        out.vertices = [];
        for (let i = 0; i < raw.length; i += 2) {
          const [x, y] = apply(m, raw[i], raw[i + 1]);
          out.vertices.push(x, -y);
          offsets.push([[m[0], -m[1], m[2], -m[3], 0, 0]]);
        }
      } else {
        const weights = arr(d.weights);
        const slotPose = matAt(d.slotPose ?? [1, 0, 0, 1, 0, 0], 0);
        const poses = arr(d.bonePose);
        const bind = new Map<number, Mat>();
        for (let i = 0; i + 6 < poses.length; i += 7) bind.set(num(poses[i], -1), invert(matAt(poses, i + 1)));
        out.vertices = [];
        let at = 0;
        for (let i = 0; i < raw.length; i += 2) {
          const count = num(weights[at++], 0);
          const [x, y] = apply(slotPose, raw[i], raw[i + 1]);
          const pulls = Array.from({ length: count }, () => ({ bone: num(weights[at++], -1), weight: num(weights[at++], 0) }));
          const kept = pulls.filter((p) => p.weight > 0 && boneAt[p.bone] !== undefined);
          if (!kept.length && pulls.length) kept.push({ bone: pulls[0].bone, weight: 1 });
          const sum = kept.reduce((total, p) => total + p.weight, 0) || 1;
          const own: Mat[] = [];
          out.vertices.push(kept.length);
          for (const { bone, weight } of kept) {
            const toBone = bind.get(bone) ?? [1, 0, 0, 1, 0, 0];
            const [bx, by] = apply(toBone, x, y);
            out.vertices.push(boneAt[bone] ?? 0, bx, -by, weight / sum);
            // an offset of the file moves the vertex in the slot's frame, then into the frame of the bone
            const ex = turn(toBone, ...turn(slotPose, 1, 0));
            const ey = turn(toBone, ...turn(slotPose, 0, 1));
            own.push([ex[0], -ex[1], ey[0], -ey[1], 0, 0]);
          }
          offsets.push(own);
        }
      }
      meshes.set(key(skin, slot, name), { offsets });
      return out;
    }
    if (type === 'boundingBox') {
      const shape = str(d.subType, 'rectangle');
      const w = num(d.width, 0) / 2;
      const h = num(d.height, 0) / 2;
      const raw = shape === 'rectangle' ? [-w, -h, w, -h, w, h, -w, h] : arr(d.vertices).map((v) => num(v, 0));
      if (shape === 'ellipse') {
        warn(`bounding box "${name}": ellipses are not supported`);
        return null;
      }
      const vertices: number[] = [];
      for (let i = 0; i + 1 < raw.length; i += 2) {
        const [x, y] = apply(m, raw[i], raw[i + 1]);
        vertices.push(x, -y);
      }
      return { type: 'boundingbox', vertexCount: vertices.length / 2, vertices };
    }
    warn(
      type === 'armature'
        ? `armatures shown inside a slot are not supported (slot "${slot}")`
        : `${type} displays are not supported (slot "${slot}")`,
    );
    return null;
  }

  const skins = rawSkins.map((skin) => {
    const name = skinName(skin);
    const attachments: J = {};
    for (const s of arr(skin.slot).map(obj)) {
      const slot = str(s.name);
      if (!names.has(slot)) continue;
      arr(s.display).forEach((raw, i) => {
        const att = nameAt(slot, i);
        if (!raw || !att) return;
        const made = attachment(name, slot, att, obj(raw));
        if (made) (attachments[slot] ??= {})[att] = made;
      });
    }
    return { name, attachments };
  });
  if (!skins.some((s) => s.name === 'default')) skins.unshift({ name: 'default', attachments: {} });

  // ---- IK
  const constraints = arr(armature.ik)
    .map(obj)
    .flatMap((ik) => {
      const bone = byName.get(str(ik.bone));
      if (!bone || !byName.has(str(ik.target))) {
        warn(`IK constraint "${str(ik.name)}" was skipped: a bone is missing`);
        return [];
      }
      const chain = num(ik.chain, 0) > 0 && byName.has(str(bone.parent)) ? [str(bone.parent), str(ik.bone)] : [str(ik.bone)];
      return [
        {
          type: 'ik',
          name: str(ik.name),
          bones: chain,
          target: str(ik.target),
          mix: num(ik.weight, 1),
          bendPositive: !flag(ik.bendPositive, true),
        },
      ];
    });
  if (arr(armature.path).length || arr(armature.constraint).length) warn('path constraints are not supported and were skipped');

  // ---- animations
  const events: J = {};
  const animations: J = {};
  for (const raw of arr(armature.animation).map(obj)) {
    const an = str(raw.name, 'animation');
    const length = num(raw.duration, 0) / fps;
    const out: J = {};
    // 0 plays go round for ever; one play (the default) holds its last keys
    const loops = num(raw.playTimes, 1) !== 1;
    if (arr(raw.timeline).length) warn(`animation "${an}": timelines of the 5.6 format are not supported and were skipped`);

    const timelineOf = (frames: Frame[], values: (raw: J) => number[]) =>
      closed(
        frames.map((f) => ({ time: f.time, length: f.length, values: values(f.raw), ease: easeOf(f.raw) })),
        fps,
        loops,
      );

    for (const b of arr(raw.bone).map(obj)) {
      const bone = str(b.name);
      if (!byName.has(bone)) continue;
      const tl: J = {};
      const old = framesOf(b.frame, fps);
      const translate = b.translateFrame ? framesOf(b.translateFrame, fps) : old;
      const rotate = b.rotateFrame ? framesOf(b.rotateFrame, fps) : old;
      const scale = b.scaleFrame ? framesOf(b.scaleFrame, fps) : old;
      const at = (r: J) => (r.transform ? obj(r.transform) : r);
      if (translate.length) {
        const keys = timelineOf(translate, (r) => [num(at(r).x, 0), -num(at(r).y, 0)]);
        tl.translate = written(keys, ([x, y]) => ({ x, y }));
      }
      if (rotate.length) {
        // the way from one angle to the next is the shortest one, unless the key says how often to go around
        let before = 0;
        let rounds = 0;
        const angles = rotate.map((f, i) => {
          const t = f.raw.transform ? placement(f.raw.transform) : null;
          let angle = t ? t.skY : num(f.raw.rotate, 0);
          const skew = t ? wrap(t.skX - t.skY) : num(f.raw.skew, 0);
          if (i > 0) {
            if (rounds === 0) angle = before + wrap(angle - before);
            else {
              if (rounds > 0 ? angle >= before : angle <= before) rounds += rounds > 0 ? -1 : 1;
              angle += 360 * rounds;
            }
          }
          rounds = num(f.raw.clockwise ?? f.raw.tweenRotate, 0);
          before = angle;
          return { frame: f, angle, skew };
        });
        const keys = closed(
          angles.map(({ frame, angle, skew }) => ({
            time: frame.time,
            length: frame.length,
            values: [-angle, 0, -skew],
            ease: easeOf(frame.raw),
          })),
          fps,
          loops,
          [0, 2],
        );
        tl.rotate = written(
          keys.map((k) => ({ ...k, values: [k.values[0]] })),
          ([value]) => ({ value }),
        );
        if (keys.some((k) => Math.abs(k.values[2]) > 0.001))
          tl.shear = written(
            keys.map((k) => ({ ...k, values: [k.values[1], k.values[2]] })),
            ([x, y]) => ({ x, y }),
          );
      }
      if (scale.length) {
        const keys = timelineOf(scale, (r) => (r.transform ? [num(at(r).scX, 1), num(at(r).scY, 1)] : [num(r.x, 1), num(r.y, 1)]));
        // the old frames hold a position under x and y: their scale is under transform alone
        const plain = b.scaleFrame ? keys : timelineOf(scale, (r) => [num(obj(r.transform).scX, 1), num(obj(r.transform).scY, 1)]);
        tl.scale = written(plain, ([x, y]) => ({ x, y }));
      }
      if (Object.keys(tl).length) (out.bones ??= {})[bone] = tl;
    }

    for (const s of arr(raw.slot).map(obj)) {
      const slot = str(s.name);
      if (!names.has(slot)) continue;
      const tl: J = {};
      const old = arr(s.frame).map(obj);
      const shown = framesOf(s.displayFrame ?? (old.some((f) => 'displayIndex' in f) ? old : undefined), fps);
      if (shown.length) tl.attachment = shown.map((f) => ({ time: f.time, name: nameAt(slot, num(f.raw.value ?? f.raw.displayIndex, 0)) }));
      const colors = framesOf(s.colorFrame ?? (old.some((f) => 'color' in f) ? old : undefined), fps);
      if (colors.length) {
        const keys = timelineOf(colors, (r) => {
          const c = obj(r.value ?? r.color);
          if (tint(c).adds) warn(`slot "${slot}": colour offsets (adding to the picture) are not supported`);
          return ['rM', 'gM', 'bM', 'aM'].map((k) => Math.min(1, Math.max(0, num(c[k], 100) / 100)));
        });
        tl.rgba = written(keys, ([r, g, b, a]) => ({ color: hex(r) + hex(g) + hex(b) + hex(a) }));
      }
      if (Object.keys(tl).length) (out.slots ??= {})[slot] = tl;
    }

    for (const f of arr(raw.ffd).map(obj)) {
      const slot = str(f.slot);
      const skin = str(f.skin) || 'default';
      const index = displaysOf(rawSkins.find((s) => skinName(s) === skin) ?? {}, slot).findIndex((d) => str(obj(d).name) === str(f.name));
      const att = nameAt(slot, index);
      const mesh = att ? meshes.get(key(skin, slot, att)) : undefined;
      if (!att || !mesh) {
        warn(`animation "${an}": a deform of "${str(f.name)}" was skipped: no such mesh`);
        continue;
      }
      const keys = timelineOf(framesOf(f.frame, fps), (r) => {
        const list = arr(r.vertices);
        const offset = num(r.offset, 0);
        const value = (i: number) => num(list[i - offset], 0);
        return mesh.offsets.flatMap((influences, v) => influences.flatMap((m) => turn(m, value(v * 2), value(v * 2 + 1))));
      });
      (((out.attachments ??= {})[skin] ??= {})[slot] ??= {})[att] = {
        deform: written(keys, (vertices) => ({ vertices }), true),
      };
    }

    for (const ik of arr(raw.ik).map(obj)) {
      const two = constraints.find((c) => c.name === str(ik.name))?.bones.length === 2;
      if (two && arr(ik.frame).some((f) => num(obj(f).weight, 1) > 0 && num(obj(f).weight, 1) < 1))
        warn(`animation "${an}": two bone IK "${str(ik.name)}" that is only partly on bends a little differently`);
      const keys = timelineOf(framesOf(ik.frame, fps), (r) => [num(r.weight, 1), flag(r.bendPositive, true) ? 0 : 1]);
      (out.ik ??= {})[str(ik.name)] = keys.map((k, i) => ({
        time: k.time,
        mix: k.values[0],
        bendPositive: k.values[1] > 0.5,
        ...curveOf({ ...k, values: [k.values[0], 0] }, keys[i + 1] && { ...keys[i + 1], values: [keys[i + 1].values[0], 0] }),
      }));
    }

    const order = framesOf(obj(raw.zOrder).frame, fps);
    if (order.length)
      out.drawOrder = order.map((f) => {
        const list = arr(f.raw.zOrder);
        const offsets: J[] = [];
        for (let i = 0; i + 1 < list.length; i += 2) {
          const slot = slots[num(list[i], -1)];
          if (slot) offsets.push({ slot: slot.name, offset: num(list[i + 1], 0) });
        }
        return { time: f.time, ...(offsets.length ? { offsets } : {}) };
      });

    // events can sit on the animation, on a bone or on a slot
    const happenings: J[] = [];
    const lists = [raw.frame, ...arr(raw.bone).map((b) => obj(b).frame), ...arr(raw.slot).map((s) => obj(s).frame ?? obj(s).displayFrame)];
    for (const list of lists) {
      for (const f of framesOf(list, fps)) {
        const found = arr(f.raw.events).map(obj);
        if (typeof f.raw.event === 'string') found.push({ name: f.raw.event });
        for (const e of found) {
          const name = str(e.name);
          if (!name) continue;
          events[name] ??= {};
          const first = (v: unknown) => arr(v)[0];
          happenings.push({
            time: f.time,
            name,
            ...(typeof first(e.ints) === 'number' ? { int: first(e.ints) } : {}),
            ...(typeof first(e.floats) === 'number' ? { float: first(e.floats) } : {}),
            ...(typeof first(e.strings) === 'string' ? { string: first(e.strings) } : {}),
          });
        }
        if (f.raw.actions || f.raw.action) warn(`animation "${an}": actions (commands to play another animation) are not supported`);
        if (f.raw.sound) warn(`animation "${an}": sounds of keys are not supported`);
      }
    }
    if (happenings.length) out.events = happenings.sort((a, b) => a.time - b.time);

    // an animation is as long as the file says even when its last key comes earlier
    animations[an] = { ...out, length };
  }

  return {
    name: str(armature.name, str(root.name, 'imported')),
    spine: {
      skeleton: { spine: '4.3.00', fps },
      bones,
      slots,
      constraints,
      skins,
      events,
      animations,
    },
    warnings,
  };
}

/** A DragonBones file as a project: converted, read as the Spine file it became, the animations as long as the file says. */
export function importDragonBones(input: unknown, pictures: ReadonlyMap<string, PictureSize>): SpineImportResult {
  const converted = dragonBonesToSpine(input, pictures);
  const result = importSpineJson(converted.spine, converted.name);
  const lengths = obj(converted.spine.animations);
  for (const animation of result.project.skeleton.animations)
    animation.duration = Math.max(animation.duration, num(obj(lengths[animation.name]).length, 0));
  return { ...result, warnings: [...converted.warnings, ...result.warnings] };
}
