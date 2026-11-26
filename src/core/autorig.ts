/**
 * Auto-rig: a character painted in layers gets its skeleton. The names of the layers say which part of the body each one is, their shapes
 * say where the joints are: two parts that overlap are joined in the overlap, a limb painted in one piece is bent where it bends. The
 * result is a plan (bones, which layer goes on which, where IK goes); the store carries it out. Pure functions, world coordinates, y up.
 */
import { distToSegmentSq } from './math';
import type { Id } from './model';

export type Point = [number, number];

/** What a layer shows. `near` goes on whatever bone is closest, `keep` is left as it is. */
export const PARTS = [
  'hips',
  'torso',
  'neck',
  'head',
  'face',
  'upperArm',
  'forearm',
  'hand',
  'arm',
  'thigh',
  'shin',
  'foot',
  'leg',
  'tail',
  'near',
  'keep',
] as const;
export type Part = (typeof PARTS)[number];

export type Side = '' | 'l' | 'r' | 'front' | 'back';

const words = (alternatives: string) => new RegExp(`(?:^| )(?:${alternatives})(?= |$)`);

/** The first pattern that matches names the part, so the specific ones stand before the general ones. */
const PATTERNS: [Part, RegExp, RegExp?][] = [
  ['keep', words('background|bg|shadows?|фон|тень'), /背景|影/],
  ['upperArm', words('upper ?arms?|arms? upper|biceps?|плечо'), /上臂|大臂/],
  ['forearm', words('fore ?arms?|lower ?arms?|arms? lower|предплеч[а-я]*'), /前臂|小臂/],
  ['thigh', words('thighs?|upper ?legs?|legs? upper|бедро|бедра'), /大腿/],
  ['shin', words('shins?|calf|calves|lower ?legs?|legs? lower|голен[а-я]*'), /小腿/],
  [
    'face',
    words(
      'eyes?|eyelids?|eyelashes|eyebrows?|brows?|pupils?|iris|mouth|lips?|nose|ears?|hair|hairs|ponytails?|pigtails?|bangs|fringe|' +
        'hats?|helmet|face|teeth|tooth|tongue|beard|m(?:o)?ustache|глаза?|зрач[а-я]*|веки?|бров[а-я]*|рот|губ[а-я]*|нос|носик|ухо|уши|' +
        'волос[а-я]*|челка|шляпа|шапка|шлем|лицо|зубы?|язык|борода|усы',
    ),
    /眼|睫|瞳|眉|嘴|唇|鼻|耳|发|髮|帽|脸|臉|牙|舌|胡/,
  ],
  ['arm', words('arms?|рука|руки|руку'), /手臂|胳膊|臂/],
  ['hand', words('hands?|palms?|fists?|fingers?|thumbs?|кисть|кисти|ладон[а-я]*|пал[ье]ц[а-я]*'), /手/],
  ['foot', words('foot|feet|shoes?|boots?|toes?|ступн[а-я]*|стопа|стопы|ботин[а-я]*|сапог[а-я]*|туфл[а-я]*'), /脚|腳|足|鞋|靴/],
  ['leg', words('legs?|нога|ноги|ногу'), /腿/],
  ['neck', words('neck|шея|шею'), /脖|颈|頸/],
  ['head', words('head|skull|голова|голову|головы'), /头|頭/],
  ['hips', words('hips?|pelvis|waist|таз'), /胯|臀|腰|髋/],
  ['torso', words('torso|body|chest|trunk|spine|abdomen|тело|туловище|торс|корпус|грудь'), /身|躯|軀|胸/],
  ['tail', words('tails?|хвост[а-я]*'), /尾/],
];

const SIDES: [Side, RegExp, RegExp?][] = [
  ['l', words('left|l|лев[а-я]*|л'), /左/],
  ['r', words('right|r|прав[а-я]*|п'), /右/],
  ['front', words('front|near|передн[а-я]*|ближн[а-я]*'), /前(?!臂)/],
  ['back', words('back|rear|far|задн[а-я]*|дальн[а-я]*'), /后|後/],
];

const SIDED: ReadonlySet<Part> = new Set(['upperArm', 'forearm', 'hand', 'arm', 'thigh', 'shin', 'foot', 'leg', 'tail']);

/** A layer name as words: "ArmUpper_L-2" → "arm upper l". */
const asWords = (s: string) =>
  s
    .replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я㐀-鿿]+/g, ' ')
    .trim();

/** The part and the side a layer name speaks of. The name itself counts first, then the groups it sits in. */
export function guessPart(name: string): { part: Part; side: Side } {
  const segments = name.split('/').map(asWords).reverse();
  const find = <T>(list: [T, RegExp, RegExp?][]): T | undefined => {
    for (const s of segments) for (const [value, latin, han] of list) if (latin.test(s) || han?.test(s)) return value;
    return undefined;
  };
  const part = find(PATTERNS) ?? 'near';
  return { part, side: SIDED.has(part) ? (find(SIDES) ?? '') : '' };
}

/** How a piece of the head turns: hair swings from its top, ears and hats stand on their bottom, the rest turns about its middle. */
const HANGING: [RegExp, RegExp] = [
  words('hair|hairs|ponytails?|pigtails?|bangs|fringe|beard|волос[а-я]*|челка|коса|косы|хвостики?|борода'),
  /发|髮|胡|辫/,
];
const STANDING: [RegExp, RegExp] = [words('ears?|hats?|helmet|horns?|ухо|уши|шляпа|шапка|шлем|рога?'), /耳(?!环)|帽|角/];
/** The picture of the face itself, which is the head and gets no bone of its own. */
const FACE_BASE = /^(?:face|лицо|脸|臉|面部)$/;

export interface RigLayer {
  id: Id;
  /** The name of the layer with the groups it sits in ("head/hair"): it names the bone of a piece of the face. */
  name?: string;
  part: Part;
  side: Side;
  /** Opaque places of the picture in the scene, taken on an even grid. */
  points: Point[];
  /** The distance between neighbouring places of that grid. */
  step: number;
}

interface RigBone {
  key: string;
  name: string;
  /** The key of the parent bone; null goes on the root. */
  parent: string | null;
  from: Point;
  to: Point;
}

interface RigSkin {
  id: Id;
  /** The keys of the bones that carry the layer: two or more make it a mesh with weights. */
  bones: string[];
  /** Where that mesh bends: the place, and the direction the limb runs there. */
  joints: { at: Point; along: Point }[];
  /** The part of the mesh that follows the second bone alone: from `at` along `along` its share grows, and is all `over` further. */
  firm?: { at: Point; along: Point; over: number };
}

interface RigIk {
  /** The key of the last bone of the chain. */
  end: string;
  name: string;
  at: Point;
}

export interface RigPlan {
  bones: RigBone[];
  layers: RigSkin[];
  ik: RigIk[];
}

export interface RigOptions {
  legIk: boolean;
  armIk: boolean;
  /** Eyes, mouth, hair and the like get bones of their own on the head. */
  faceBones: boolean;
}

interface Shape {
  points: Point[];
  step: number;
}

const add = (a: Point, b: Point, k = 1): Point => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const unit = (a: Point): Point => {
  const l = Math.hypot(a[0], a[1]);
  return l > 1e-9 ? [a[0] / l, a[1] / l] : [0, -1];
};
const mean = (points: readonly Point[]): Point => {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / (points.length || 1), y / (points.length || 1)];
};

function bounds(points: readonly Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2 };
}

/** The two ends of a long shape, the one closer to `anchor` first, each where a joint would be: half a width inside the end. */
function ends(shape: Shape, anchor: Point): { near: Point; far: Point; width: number } {
  const c = mean(shape.points);
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const p of shape.points) {
    const [dx, dy] = sub(p, c);
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const axis: Point = [Math.cos(angle), Math.sin(angle)];
  const along = shape.points.map((p) => (p[0] - c[0]) * axis[0] + (p[1] - c[1]) * axis[1]);
  const across = shape.points.map((p) => (p[1] - c[1]) * axis[0] - (p[0] - c[0]) * axis[1]);
  const lo = along.reduce((m, v) => Math.min(m, v), Infinity);
  const hi = along.reduce((m, v) => Math.max(m, v), -Infinity);
  const length = hi - lo + shape.step;
  // an evenly filled strip of width w spreads w / √12 around its middle
  const width = Math.sqrt((12 * across.reduce((s, v) => s + v * v, 0)) / (across.length || 1)) + shape.step / 2;
  const inset = Math.min(width / 2, length * 0.2);
  const end = (from: number, inward: 1 | -1): Point => {
    const slice = shape.points.filter((_, i) => (along[i] - from) * inward <= length * 0.12);
    const m = mean(slice);
    const depth = ((m[0] - c[0]) * axis[0] + (m[1] - c[1]) * axis[1] - from) * inward + shape.step / 2;
    return add(m, axis, Math.max(0, inset - depth) * inward);
  };
  const a = end(lo, 1);
  const b = end(hi, -1);
  return dist(a, anchor) <= dist(b, anchor) ? { near: a, far: b, width } : { near: b, far: a, width };
}

/** The places of `b` that `a` lies under, as exactly as the grids of the two allow. */
function shared(a: Shape, b: Shape): Point[] {
  const cell = Math.max(a.step, b.step) * 1.5 || 1;
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const taken = new Set(a.points.map((p) => key(p[0], p[1])));
  return b.points.filter((p) => taken.has(key(p[0], p[1])));
}

/** The middle of where two shapes lie over each other, null when they do not. */
function overlap(a: Shape, b: Shape): Point | null {
  const both = shared(a, b);
  return both.length >= 3 ? mean(both) : null;
}

/** The joint between two parts: in their overlap when that is where their ends meet, else halfway between the ends. */
function join(a: Shape, aEnd: Point, b: Shape, bEnd: Point, width: number): Point {
  const o = overlap(a, b);
  const m = mid(aEnd, bEnd);
  return o && dist(o, m) <= width ? o : m;
}

/** The points of a shape around a share `t` of the way from `a` to `b`, and their middle. */
function middleAt(shape: Shape, a: Point, b: Point, t: number): Point {
  const d = sub(b, a);
  const l2 = d[0] * d[0] + d[1] * d[1] || 1;
  const slice = shape.points.filter((p) => Math.abs(((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2 - t) <= 0.05);
  return slice.length ? mean(slice) : add(a, d, t);
}

/** Where a limb painted in one piece bends: where its middle line is furthest from straight, or halfway when it is straight. */
function bend(shape: Shape, a: Point, b: Point): Point {
  const length = dist(a, b);
  const u = unit(sub(b, a));
  let best = middleAt(shape, a, b, 0.5);
  let furthest = length * 0.08;
  for (let t = 0.3; t <= 0.701; t += 0.05) {
    const m = middleAt(shape, a, b, t);
    const off = Math.abs((m[0] - a[0]) * u[1] - (m[1] - a[1]) * u[0]);
    if (off > furthest) {
      furthest = off;
      best = m;
    }
  }
  return best;
}

/** The far end of a part that starts at `joint`: as far as it reaches in the direction of its middle. */
function tip(shape: Shape, joint: Point, towards?: Point): Point {
  const u = towards ?? unit(sub(mean(shape.points), joint));
  let reach = 0;
  for (const p of shape.points) reach = Math.max(reach, (p[0] - joint[0]) * u[0] + (p[1] - joint[1]) * u[1]);
  const b = bounds(shape.points);
  return add(joint, u, reach || Math.max(b.width, b.height) / 2);
}

const FAMILIES = [
  { whole: 'arm', segments: ['upperArm', 'forearm'], end: 'hand', names: ['upper-arm', 'forearm', 'hand'] },
  { whole: 'leg', segments: ['thigh', 'shin'], end: 'foot', names: ['thigh', 'shin', 'foot'] },
] as const;

/** Layers of limbs that no name gave a side: when there are two of a part, side by side, they are the left one and the right one. */
function splitSides(layers: RigLayer[], middle: number): RigLayer[] {
  let out = layers;
  for (const family of FAMILIES) {
    const parts: Part[] = [family.whole, ...family.segments, family.end];
    const loose = out.filter((l) => l.side === '' && parts.includes(l.part));
    const apart = parts.some((part) => {
      const same = loose.filter((l) => l.part === part).map((l) => bounds(l.points));
      return same.some((a) => same.some((b) => b.cx - a.cx > Math.max(a.width, b.width) * 0.6));
    });
    if (apart) out = out.map((l) => (loose.includes(l) ? { ...l, side: mean(l.points)[0] < middle ? 'l' : 'r' } : l));
  }
  return out;
}

export function planRig(input: readonly RigLayer[], opts: RigOptions): RigPlan {
  const used = input.filter((l) => l.part !== 'keep' && l.points.length > 0);
  const plan: RigPlan = { bones: [], layers: [], ik: [] };
  if (!used.length) return plan;
  const all = used.flatMap((l) => l.points);
  const trunk = used.filter((l) => l.part === 'torso' || l.part === 'hips').flatMap((l) => l.points);
  const middle = trunk.length ? mean(trunk)[0] : bounds(all).cx;
  const layers = splitSides([...used], middle);

  const shapeOf = (part: Part, side?: Side): (Shape & { ids: Id[] }) | null => {
    const list = layers.filter((l) => l.part === part && (side === undefined || l.side === side));
    return list.length
      ? { points: list.flatMap((l) => l.points), step: Math.max(...list.map((l) => l.step)), ids: list.map((l) => l.id) }
      : null;
  };
  const bone = (key: string, name: string, parent: string | null, from: Point, to: Point) => {
    plan.bones.push({ key, name, parent, from, to });
    return key;
  };
  const put = (shape: { ids: Id[] } | null, bones: string[], joints: RigSkin['joints'] = [], firm?: RigSkin['firm']) => {
    for (const id of shape?.ids ?? []) plan.layers.push({ id, bones, joints, ...(firm && { firm }) });
  };

  /** The bone of one piece of the face, from where the piece turns to where it reaches. */
  const piece = (layer: RigLayer) => {
    const path = (layer.name ?? '').split('/');
    const own = path.at(-1) || 'face';
    const about = path.map(asWords).join(' ');
    const is = ([latin, han]: [RegExp, RegExp]) => latin.test(about) || han.test(about);
    const b = bounds(layer.points);
    const inset = b.height * 0.15;
    const centre = mean(layer.points);
    const reach = Math.max(b.height / 2, layer.step * 2);
    const [from, to]: [Point, Point] = is(HANGING)
      ? [
          [b.cx, b.maxY - inset],
          [b.cx, Math.min(b.minY, b.maxY - inset - reach)],
        ]
      : is(STANDING)
        ? [
            [b.cx, b.minY + inset],
            [b.cx, Math.max(b.maxY, b.minY + inset + reach)],
          ]
        : [centre, add(centre, [0, 1], reach)];
    const key = bone(`face:${layer.id}`, own, 'head', from, to);
    plan.layers.push({ id: layer.id, bones: [key], joints: [] });
  };

  // ---- the middle of the body: hips, torso, neck, head
  const torso = shapeOf('torso');
  const hips = shapeOf('hips');
  const neck = shapeOf('neck');
  // a face without a head layer is the head
  const head = shapeOf('head') ?? shapeOf('face');
  let pelvisKey: string | null = null;
  let chestKey: string | null = null;
  const everything = bounds(all);
  let hipPoint: Point = [middle, everything.minY + everything.height * 0.45];
  let neckBase: Point = [middle, everything.maxY - everything.height * 0.25];
  const body = torso ?? hips;
  if (body) {
    const b = bounds(body.points);
    const above = neck ?? head;
    const top: Point = [mean(body.points)[0], b.maxY - b.height * 0.08];
    const met = above && overlap(body, above);
    neckBase = met && met[1] > b.minY + b.height / 2 ? met : top;
    hipPoint = hips && torso ? mean(hips.points) : [mean(body.points)[0], b.minY + b.height * 0.12];
    let waist = add(hipPoint, sub(neckBase, hipPoint), 0.2);
    if (hips && torso) {
      const o = overlap(hips, torso);
      if (o && o[1] > hipPoint[1] && o[1] < neckBase[1]) waist = o;
    }
    pelvisKey = bone('hips', 'hips', null, hipPoint, waist);
    if (torso) chestKey = bone('torso', 'torso', pelvisKey, waist, neckBase);
    // the body bends at the waist: its picture goes on both bones when the waist runs through it. The upper half of the spine stays
    // whole, so that the arms and the head do not come away from the chest, with rows of vertices where that part begins.
    const t = torso && bounds(torso.points);
    if (t && waist[1] > t.minY + t.height * 0.1 && waist[1] < t.maxY - t.height * 0.1) {
      const along = unit(sub(neckBase, waist));
      const over = dist(waist, neckBase) * 0.5;
      put(torso, ['hips', 'torso'], [{ at: add(waist, along, over), along }], { at: waist, along, over });
    } else put(torso, ['torso']);
    put(hips, ['hips']);
  }
  const chest = chestKey ?? pelvisKey;

  let headParent = chest;
  let headBase: Point | null = body ? neckBase : null;
  if (neck) {
    const b = bounds(neck.points);
    const from: Point = body ? neckBase : [mean(neck.points)[0], b.minY];
    const met = head && overlap(neck, head);
    const to: Point = met && met[1] > from[1] ? met : [from[0], Math.max(b.maxY, from[1] + b.height / 2)];
    headParent = bone('neck', 'neck', chest, from, to);
    headBase = to;
    put(neck, ['neck']);
  }
  if (head) {
    const b = bounds(head.points);
    // the head turns about a point in its lower part
    const from: Point = headBase && headBase[1] < b.minY + b.height / 2 ? headBase : [mean(head.points)[0], b.minY + b.height * 0.15];
    bone('head', 'head', headParent, from, [from[0], Math.max(b.maxY, from[1] + b.height / 2)]);
    // the pieces of the face: each on a bone of its own, or all with the head
    const skull = shapeOf('head');
    if (skull) put(skull, ['head']);
    for (const l of layers) {
      if (l.part !== 'face') continue;
      const base = FACE_BASE.test(asWords(l.name?.split('/').at(-1) ?? ''));
      if (opts.faceBones && !base) piece(l);
      else plan.layers.push({ id: l.id, bones: ['head'], joints: [] });
    }
  }

  // ---- limbs
  for (const family of FAMILIES) {
    const isArm = family.whole === 'arm';
    const anchor = isArm ? neckBase : hipPoint;
    const parent = isArm ? chest : pelvisKey;
    const parts: Part[] = [family.whole, ...family.segments, family.end];
    const sides = [...new Set(layers.filter((l) => parts.includes(l.part)).map((l) => l.side))];
    for (const side of sides) {
      const suffix = side ? `-${side}` : '';
      const name = (i: number) => family.names[i] + suffix;
      const key = (i: number) => family.names[i] + suffix;
      const segments = family.segments.map((part) => shapeOf(part, side));
      const whole = shapeOf(family.whole, side);
      const extremity = shapeOf(family.end, side);
      const present = segments.flatMap((s, i) => (s ? [{ shape: s, i }] : []));
      const keys: string[] = [];
      let last: { shape: Shape; far: Point; width: number } | null = null;

      if (!present.length && whole) {
        const e = ends(whole, anchor);
        const wrist = extremity ? join(whole, e.far, extremity, e.far, e.width) : e.far;
        const elbow = bend(whole, e.near, wrist);
        keys.push(bone(key(0), name(0), parent, e.near, elbow));
        keys.push(bone(key(1), name(1), keys[0], elbow, wrist));
        put(whole, [...keys], [{ at: elbow, along: unit(sub(wrist, e.near)) }]);
        last = { shape: whole, far: wrist, width: e.width };
      } else if (present.length) {
        const spans = [];
        let from = anchor;
        for (const p of present) {
          const e = ends(p.shape, from);
          spans.push({ ...p, ...e });
          from = e.far;
        }
        const joints: Point[] = [spans[0].near];
        for (let k = 1; k < spans.length; k++) {
          const a = spans[k - 1];
          const b = spans[k];
          joints.push(join(a.shape, a.far, b.shape, b.near, Math.max(a.width, b.width)));
        }
        const tail = spans[spans.length - 1];
        let wrist = tail.far;
        if (extremity) {
          const o = overlap(tail.shape, extremity);
          if (o && dist(o, tail.far) <= tail.width) wrist = o;
        }
        joints.push(wrist);
        spans.forEach((s, k) => {
          keys.push(bone(key(s.i), name(s.i), k ? keys[k - 1] : parent, joints[k], joints[k + 1]));
          put(shapeOf(family.segments[s.i], side), [key(s.i)]);
        });
        last = { shape: tail.shape, far: wrist, width: tail.width };
        // a sleeve over a limb painted in parts goes with the closest of them
        if (whole) for (const id of whole.ids) plan.layers.push({ id, bones: [], joints: [] });
      }
      if (extremity) {
        const from = last ? last.far : ends(extremity, anchor).near;
        const hand = bone(key(2), name(2), keys.at(-1) ?? parent, from, tip(extremity, from));
        put(extremity, [hand]);
      }
      if (keys.length === 2 && (isArm ? opts.armIk : opts.legIk) && last) {
        plan.ik.push({ end: keys[1], name: family.whole + suffix, at: last.far });
      }
    }
  }

  // ---- tails: three bones along each one
  for (const side of [...new Set(layers.filter((l) => l.part === 'tail').map((l) => l.side))]) {
    const shape = shapeOf('tail', side)!;
    const e = ends(shape, hipPoint);
    const suffix = side ? `-${side}` : '';
    const points = [e.near, middleAt(shape, e.near, e.far, 1 / 3), middleAt(shape, e.near, e.far, 2 / 3), e.far];
    const keys: string[] = [];
    for (let i = 0; i < 3; i++)
      keys.push(bone(`tail${suffix}-${i + 1}`, `tail${suffix}-${i + 1}`, i ? keys[i - 1] : pelvisKey, points[i], points[i + 1]));
    put(
      shape,
      keys,
      [1, 2].map((i) => ({ at: points[i], along: unit(sub(points[i + 1], points[i - 1])) })),
    );
  }

  // ---- what is left: a detail painted over a part goes with that part, the rest on the closest bone
  plan.layers = plan.layers.filter((l) => l.bones.length);
  const done = new Map(plan.layers.map((l) => [l.id, l.bones]));
  layers.forEach((l, at) => {
    if (done.has(l.id) || !plan.bones.length) return;
    // the layers stand bottom first: the topmost one under this layer that holds nearly all of it
    let under: string[] | undefined;
    for (let k = at - 1; k >= 0 && !under && l.part === 'near'; k--) {
      const bones = done.get(layers[k].id);
      if (bones && shared(layers[k], l).length >= l.points.length * 0.8) under = bones;
    }
    const [x, y] = mean(l.points);
    let closest = '';
    let best = Infinity;
    for (const b of plan.bones) {
      if (under && !under.includes(b.key)) continue;
      const d = distToSegmentSq(x, y, b.from[0], b.from[1], b.to[0], b.to[1]);
      if (d < best) {
        best = d;
        closest = b.key;
      }
    }
    plan.layers.push({ id: l.id, bones: [closest], joints: [] });
    done.set(l.id, [closest]);
  });
  return plan;
}

/** The opaque places of a picture on an even grid, put where `toScene` says each pixel is. */
export function sampleShape(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  toScene: (px: number, py: number) => Point,
): { points: Point[]; step: number } {
  // about this many places for a picture that is opaque all over
  const grid = Math.max(1, Math.floor(Math.sqrt((width * height) / 1600)));
  const points: Point[] = [];
  for (let y = Math.floor(grid / 2); y < height; y += grid)
    for (let x = Math.floor(grid / 2); x < width; x += grid) if (rgba[(y * width + x) * 4 + 3] > 12) points.push(toScene(x + 0.5, y + 0.5));
  return { points, step: dist(toScene(0, 0), toScene(grid, 0)) };
}
