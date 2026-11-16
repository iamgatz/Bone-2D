/** A built-in demo rig ("Bolt") — procedurally drawn parts, 12 bones, two IK legs, idle + walk animations. */
import { newAnimation, newBone, newSlot, emptyProject } from '@/core/model';
import type { Bone, ImageRef, IkConstraint, Project, Timeline } from '@/core/model';
import { uid } from '@/core/ids';
import { assets } from './assets';
import { docStore } from './doc';
import { emptySelection, toast, uiStore } from './ui';

const C = { body: '#2dd4a7', bodyDark: '#14907a', outline: '#0e1a22', accent: '#ff9f43', accentDark: '#c86f12', light: '#c4fff3', metal: '#9fb3c8', metalDark: '#5f7287', glow: '#59f5ff' };

type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/png'));
}

function grad(ctx: Ctx, y0: number, y1: number, a: string, b: string) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

function outlineFill(ctx: Ctx, fill: string | CanvasGradient) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.outline;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function capsule(ctx: Ctx, w: number, h: number, fillA: string, fillB: string, joint = true) {
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, Math.min(w, h) * 0.42);
  outlineFill(ctx, grad(ctx, 0, h, fillA, fillB));
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.roundRect(w * 0.2, h * 0.1, w * 0.2, h * 0.8, w * 0.1);
  ctx.fill();
  if (joint) {
    ctx.fillStyle = C.metal;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.12, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

const PARTS: { name: string; w: number; h: number; draw: (ctx: Ctx, w: number, h: number) => void }[] = [
  {
    name: 'torso',
    w: 84,
    h: 112,
    draw: (ctx, w, h) => {
      ctx.beginPath();
      ctx.roundRect(3, 3, w - 6, h - 6, 26);
      outlineFill(ctx, grad(ctx, 0, h, C.body, C.bodyDark));
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.roundRect(12, 10, 14, h - 40, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(w * 0.22, h * 0.2, w * 0.56, h * 0.36, 12);
      outlineFill(ctx, grad(ctx, h * 0.2, h * 0.56, C.accent, C.accentDark));
      ctx.fillStyle = C.glow;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.38, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = C.outline;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(w / 2 - 3, h * 0.38 - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    name: 'pelvis',
    w: 88,
    h: 44,
    draw: (ctx, w, h) => {
      ctx.beginPath();
      ctx.roundRect(3, 3, w - 6, h - 6, 18);
      outlineFill(ctx, grad(ctx, 0, h, C.metal, C.metalDark));
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.roundRect(w / 2 - 14, h / 2 - 5, 28, 10, 5);
      ctx.fill();
    },
  },
  {
    name: 'head',
    w: 92,
    h: 86,
    draw: (ctx, w, h) => {
      ctx.beginPath();
      ctx.roundRect(3, 8, w - 6, h - 11, 28);
      outlineFill(ctx, grad(ctx, 0, h, C.light, C.body));
      ctx.beginPath();
      ctx.roundRect(11, h * 0.3, w - 22, h * 0.38, 16);
      outlineFill(ctx, grad(ctx, h * 0.3, h * 0.68, '#14202b', '#0a1118'));
      ctx.fillStyle = C.glow;
      for (const x of [w * 0.34, w * 0.66]) {
        ctx.beginPath();
        ctx.roundRect(x - 7, h * 0.4, 14, 15, 6);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.roundRect(14, 14, 30, 8, 4);
      ctx.fill();
      // antenna
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w / 2, 9);
      ctx.lineTo(w / 2, 1);
      ctx.stroke();
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.arc(w / 2, 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  { name: 'arm-upper', w: 28, h: 70, draw: (c, w, h) => capsule(c, w, h, C.body, C.bodyDark) },
  { name: 'arm-lower', w: 26, h: 68, draw: (c, w, h) => capsule(c, w, h, C.metal, C.metalDark) },
  {
    name: 'hand',
    w: 26,
    h: 26,
    draw: (ctx, w, h) => {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2);
      outlineFill(ctx, grad(ctx, 0, h, C.accent, C.accentDark));
    },
  },
  { name: 'leg-upper', w: 34, h: 76, draw: (c, w, h) => capsule(c, w, h, C.metal, C.metalDark) },
  { name: 'leg-lower', w: 30, h: 72, draw: (c, w, h) => capsule(c, w, h, C.body, C.bodyDark) },
  {
    name: 'foot',
    w: 58,
    h: 24,
    draw: (ctx, w, h) => {
      ctx.beginPath();
      ctx.roundRect(3, 3, w - 6, h - 6, 11);
      outlineFill(ctx, grad(ctx, 0, h, C.accent, C.accentDark));
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.roundRect(9, 6, w - 26, 5, 3);
      ctx.fill();
    },
  },
];

function timeline(keys: [number, number[], (number[] | 'stepped')?][]): Timeline {
  return keys.map(([time, value, curve]) => ({ time, value, ...(curve ? { curve } : {}) }));
}
const EASE = [0.35, 0, 0.65, 1];
const ease2 = [...EASE, ...EASE];

export async function loadSample() {
  assets.clear();
  const refs: Record<string, ImageRef> = {};
  for (const p of PARTS) {
    const [c, ctx] = makeCanvas(p.w, p.h);
    p.draw(ctx, p.w, p.h);
    refs[p.name] = await assets.addFile(await toBlob(c), p.name);
  }

  const project: Project = emptyProject('bolt');
  project.images = Object.values(refs);
  const doc = project.skeleton;
  const by: Record<string, Bone> = { root: doc.bones[0] };
  const add = (name: string, parent: string, p: Partial<Bone>) => {
    const b = newBone({ name, parent: by[parent].id, ...p });
    by[name] = b;
    doc.bones.push(b);
    return b;
  };
  add('hip', 'root', { x: 0, y: 128, rotation: 90, length: 38, color: [1, 0.62, 0.26, 1] });
  add('torso', 'hip', { x: 38, y: 0, rotation: 0, length: 78 });
  add('head', 'torso', { x: 78, y: 0, rotation: 0, length: 66 });
  for (const [side, sy, tilt] of [['R', -36, 6], ['L', 36, -6]] as const) {
    add(`arm${side}1`, 'torso', { x: 64, y: sy, rotation: 180 + tilt, length: 62 });
    add(`arm${side}2`, `arm${side}1`, { x: 62, y: 0, rotation: side === 'R' ? 8 : -8, length: 58 });
    add(`hand${side}`, `arm${side}2`, { x: 58, y: 0, rotation: 0, length: 18 });
  }
  for (const [side, sy, wx] of [['R', -18, 20], ['L', 18, -20]] as const) {
    add(`leg${side}1`, 'hip', { x: 4, y: sy, rotation: 180, length: 64 });
    add(`leg${side}2`, `leg${side}1`, { x: 64, y: 0, rotation: 0, length: 62 });
    add(`foot${side}`, `leg${side}2`, { x: 62, y: 0, rotation: 90, length: 38, inherit: 'noRotationOrReflection' });
    add(`ik${side}`, 'root', { x: wx, y: 12, length: 0, color: [1, 0.48, 0.35, 1] });
  }

  for (const side of ['R', 'L']) {
    const c: IkConstraint = { id: uid(), type: 'ik', name: `leg ${side}`, bones: [by[`leg${side}1`].id, by[`leg${side}2`].id], target: by[`ik${side}`].id, mix: 1, softness: 0, bendPositive: false, compress: false, stretch: true, scaleY: 'none', skinRequired: false };
    doc.constraints.push(c);
  }

  // slots in draw order (back to front)
  const skin = doc.skins[0];
  const place = (slotName: string, bone: string, image: string, x: number, rotation: number) => {
    const img = refs[image];
    const slot = newSlot({ name: slotName, bone: by[bone].id, attachment: image });
    doc.slots.push(slot);
    skin.attachments[slot.id] = { [image]: { type: 'region', name: image, path: image, x, y: 0, rotation, scaleX: 1, scaleY: 1, width: img.width, height: img.height, color: [1, 1, 1, 1] } };
    return slot;
  };
  place('arm L upper', 'armL1', 'arm-upper', 31, 90);
  place('arm L lower', 'armL2', 'arm-lower', 29, 90);
  place('hand L', 'handL', 'hand', 9, 0);
  place('leg L upper', 'legL1', 'leg-upper', 32, 90);
  place('leg L lower', 'legL2', 'leg-lower', 31, 90);
  place('foot L', 'footL', 'foot', 21, 0);
  place('pelvis', 'hip', 'pelvis', 16, -90);
  place('torso', 'torso', 'torso', 40, -90);
  place('head', 'head', 'head', 36, -90);
  place('leg R upper', 'legR1', 'leg-upper', 32, 90);
  place('leg R lower', 'legR2', 'leg-lower', 31, 90);
  place('foot R', 'footR', 'foot', 21, 0);
  place('arm R upper', 'armR1', 'arm-upper', 31, 90);
  place('arm R lower', 'armR2', 'arm-lower', 29, 90);
  place('hand R', 'handR', 'hand', 9, 0);

  // ------------------------------------------------------------ idle
  const idle = newAnimation('idle', 1.6);
  idle.bones[by.hip.id] = { translate: timeline([[0, [0, 0], ease2], [0.8, [0, -4], ease2], [1.6, [0, 0]]]) };
  idle.bones[by.torso.id] = { rotate: timeline([[0, [0], EASE], [0.8, [2.5], EASE], [1.6, [0]]]) };
  idle.bones[by.head.id] = { rotate: timeline([[0, [0], EASE], [0.9, [-3], EASE], [1.6, [0]]]) };
  idle.bones[by.armR1.id] = { rotate: timeline([[0, [0], EASE], [0.8, [3], EASE], [1.6, [0]]]) };
  idle.bones[by.armL1.id] = { rotate: timeline([[0, [0], EASE], [0.8, [-3], EASE], [1.6, [0]]]) };
  idle.bones[by.armR2.id] = { rotate: timeline([[0, [0], EASE], [0.8, [-4], EASE], [1.6, [0]]]) };
  idle.bones[by.armL2.id] = { rotate: timeline([[0, [0], EASE], [0.8, [4], EASE], [1.6, [0]]]) };

  // ------------------------------------------------------------ walk
  const walk = newAnimation('walk', 0.8);
  const D = 0.8;
  walk.bones[by.hip.id] = { translate: timeline([[0, [0, -5], ease2], [0.2, [0, 3], ease2], [0.4, [0, -5], ease2], [0.6, [0, 3], ease2], [D, [0, -5]]]) };
  walk.bones[by.torso.id] = { rotate: timeline([[0, [-3], EASE], [0.4, [3], EASE], [D, [-3]]]) };
  walk.bones[by.head.id] = { rotate: timeline([[0, [3], EASE], [0.4, [-3], EASE], [D, [3]]]) };
  const swing = (a: number): Timeline => timeline([[0, [-a], EASE], [0.4, [a], EASE], [D, [-a]]]);
  walk.bones[by.armR1.id] = { rotate: swing(26) };
  walk.bones[by.armL1.id] = { rotate: swing(-26) };
  walk.bones[by.armR2.id] = { rotate: timeline([[0, [4], EASE], [0.4, [26], EASE], [D, [4]]]) };
  walk.bones[by.armL2.id] = { rotate: timeline([[0, [26], EASE], [0.4, [4], EASE], [D, [26]]]) };
  walk.bones[by.ikR.id] = { translate: timeline([[0, [28, 0]], [0.4, [-28, 0], ease2], [0.6, [0, 22], ease2], [D, [28, 0]]]) };
  walk.bones[by.ikL.id] = { translate: timeline([[0, [-28, 0], ease2], [0.2, [0, 22], ease2], [0.4, [28, 0]], [D, [-28, 0]]]) };

  doc.animations.push(idle, walk);

  docStore.replace(project);
  uiStore.patch({ mode: 'setup', selection: emptySelection, animationId: walk.id, skinId: null, time: 0, playing: false, overrides: {}, selectedKeys: [], camera: { x: 0, y: 150, zoom: 1.55 } });
  window.dispatchEvent(new Event('bone2d:frame'));
  toast('Loaded the "Bolt" demo rig — switch to Animate and press Space', 'ok');
}
