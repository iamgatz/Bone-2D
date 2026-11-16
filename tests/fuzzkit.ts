/**
 * Machinery of the property test (see fuzz.test.ts): random sequences of REAL editor actions — the same functions
 * the UI calls — must never
 *   - throw,
 *   - leave anything for the document validator to repair,
 *   - produce an export the official Spine 4.3 runtime rejects,
 *   - make our solver output non-finite numbers;
 * and at the end of every run
 *   - our solver still agrees with the official runtime on the exported result,
 *   - undoing everything restores the starting document exactly, and redoing everything restores the final one.
 */
import { expect } from 'vitest';
import { applyAnimation } from '../src/core/animate';
import { exportSpineJson } from '../src/core/export/spineJson';
import { deformProp } from '../src/core/keyrefs';
import type { KeyRef } from '../src/core/keyrefs';
import { meshWorldPositions } from '../src/core/mesh';
import { BLEND_MODES, INHERIT_MODES, TRANSFORM_PROPS, polygonVertexCount } from '../src/core/model';
import type { Animation, Project } from '../src/core/model';
import { compileSkeleton, createSkeleton, meshWorldVertices, pointWorld } from '../src/core/skeleton';
import { validateProject } from '../src/core/validate';
import * as A from '../src/store/actions';
import { docStore } from '../src/store/doc';
import * as I from '../src/store/ikActions';
import * as M from '../src/store/meshActions';
import * as P from '../src/store/polygonActions';
import * as SL from '../src/store/sliderActions';
import * as T from '../src/store/transformActions';
import { emptySelection, uiStore } from '../src/store/ui';
import { getScene } from '../src/editor/scene';
import { addAttachmentRig, buildFixture } from './fixture';
import { S, exportAndLoad } from './official';

// ------------------------------------------------------------------ tiny deterministic RNG

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Ctx {
  r: () => number;
  pick<T>(list: readonly T[]): T | undefined;
  num(min: number, max: number): number;
  chance(p: number): boolean;
}

export function makeCtx(seed: number): Ctx {
  const r = mulberry32(seed);
  return {
    r,
    pick: (list) => (list.length ? list[Math.floor(r() * list.length)] : undefined),
    num: (min, max) => min + r() * (max - min),
    chance: (p) => r() < p,
  };
}

// ------------------------------------------------------------------ document helpers

const project = () => docStore.get();
const doc = () => docStore.get().skeleton;
const NAMES = ['a', 'b', 'bone', 'root', 'head', 'arm', '', '  ', 'x"y', 'ünï', 'bone2', 'torso'];

function meshes() {
  const out: { slotId: string; name: string }[] = [];
  const skin = doc().skins[0];
  for (const slotId in skin.attachments) for (const name in skin.attachments[slotId]) if (skin.attachments[slotId][name].type === 'mesh') out.push({ slotId, name });
  return out;
}
function regions() {
  const out: { slotId: string; name: string }[] = [];
  const skin = doc().skins[0];
  for (const slotId in skin.attachments) for (const name in skin.attachments[slotId]) if (skin.attachments[slotId][name].type === 'region') out.push({ slotId, name });
  return out;
}
function polygons() {
  const out: { slotId: string; name: string; type: 'clipping' | 'boundingbox' }[] = [];
  const skin = doc().skins[0];
  for (const slotId in skin.attachments) {
    for (const name in skin.attachments[slotId]) {
      const t = skin.attachments[slotId][name].type;
      if (t === 'clipping' || t === 'boundingbox') out.push({ slotId, name, type: t });
    }
  }
  return out;
}
function points() {
  const out: { slotId: string; name: string }[] = [];
  const skin = doc().skins[0];
  for (const slotId in skin.attachments) for (const name in skin.attachments[slotId]) if (skin.attachments[slotId][name].type === 'point') out.push({ slotId, name });
  return out;
}

function allKeyRefs(a: Animation): KeyRef[] {
  const out: KeyRef[] = [];
  for (const id in a.bones) for (const prop of Object.keys(a.bones[id])) for (const k of (a.bones[id] as Record<string, { time: number }[]>)[prop]) out.push({ kind: 'bone', target: id, prop, time: k.time });
  for (const id in a.slots) for (const prop of Object.keys(a.slots[id])) for (const k of (a.slots[id] as Record<string, { time: number }[]>)[prop]) out.push({ kind: 'slot', target: id, prop, time: k.time });
  for (const id in a.ik) for (const k of a.ik[id]) out.push({ kind: 'ik', target: id, prop: '', time: k.time });
  for (const id in a.transform) for (const k of a.transform[id]) out.push({ kind: 'transform', target: id, prop: '', time: k.time });
  for (const id in a.slider) for (const prop of Object.keys(a.slider[id])) for (const k of (a.slider[id] as Record<string, { time: number }[]>)[prop]) out.push({ kind: 'slider', target: id, prop, time: k.time });
  for (const skinId in a.deform) for (const slotId in a.deform[skinId]) for (const att in a.deform[skinId][slotId]) for (const k of a.deform[skinId][slotId][att]) out.push({ kind: 'deform', target: slotId, prop: deformProp(skinId, att), time: k.time });
  for (const k of a.drawOrder) out.push({ kind: 'drawOrder', target: '', prop: '', time: k.time });
  for (const k of a.events) out.push({ kind: 'event', target: '', prop: '', time: k.time });
  return out;
}

// ------------------------------------------------------------------ the operations

export type Op = { name: string; run: (c: Ctx) => void };

export const ops: Op[] = [
  // ---- bones
  { name: 'createBone', run: (c) => { const p = c.pick(doc().bones)!; const x = c.num(-200, 200); const y = c.num(-200, 200); A.createBoneWorld({ parent: p.id, x, y, tipX: x + c.num(-90, 90), tipY: y + c.num(-90, 90) }); } },
  { name: 'renameBone', run: (c) => { const b = c.pick(doc().bones)!; A.renameBone(b.id, c.pick(NAMES)!); } },
  { name: 'deleteBones', run: (c) => { const n = 1 + Math.floor(c.r() * 2); A.deleteBones(Array.from({ length: n }, () => c.pick(doc().bones)!.id)); } },
  { name: 'reparentBone', run: (c) => { const b = c.pick(doc().bones)!; const p = c.chance(0.1) ? null : c.pick(doc().bones)!.id; A.reparentBone(b.id, p); } },
  { name: 'setBoneProps', run: (c) => { const b = c.pick(doc().bones)!; A.setBoneProps(b.id, { length: c.num(0, 120), inherit: c.pick(INHERIT_MODES)!, hidden: c.chance(0.2) }); } },
  { name: 'setBonePose', run: (c) => { const b = c.pick(doc().bones)!; A.setBonePose([{ id: b.id, props: c.chance(0.5) ? { rotation: c.num(-180, 180) } : { x: c.num(-100, 100), y: c.num(-100, 100), scaleX: c.num(-2, 2), scaleY: c.num(0.2, 2), shearX: c.num(-30, 30) } }]); } },
  { name: 'keySelectedBones', run: (c) => { A.selectBone(c.pick(doc().bones)!.id); A.keySelectedBones(c.chance(0.5) ? ['rotate'] : undefined); } },
  // ---- slots / images / attachments
  { name: 'addImageToScene', run: (c) => { const img = c.pick(project().images); if (img) A.addImageToScene(img.name, c.num(-150, 150), c.num(-50, 250), c.chance(0.5) ? c.pick(doc().bones)!.id : null); } },
  { name: 'setSlotProps', run: (c) => { const s = c.pick(doc().slots); if (s) A.setSlotProps(s.id, { blend: c.pick(BLEND_MODES)!, hidden: c.chance(0.2), dark: c.chance(0.3) ? [c.r(), c.r(), c.r()] : null }); } },
  { name: 'renameSlot', run: (c) => { const s = c.pick(doc().slots); if (s) A.renameSlot(s.id, c.pick(NAMES)!); } },
  { name: 'deleteSlots', run: (c) => { const s = c.pick(doc().slots); if (s) A.deleteSlots([s.id]); } },
  { name: 'moveSlot', run: (c) => { const s = c.pick(doc().slots); if (s) A.moveSlot(s.id, Math.floor(c.r() * (doc().slots.length + 1))); } },
  { name: 'setSlotBone', run: (c) => { const s = c.pick(doc().slots); if (s) A.setSlotBone(s.id, c.pick(doc().bones)!.id); } },
  { name: 'setSlotAttachment', run: (c) => { const s = c.pick(doc().slots); if (!s) return; const names = Object.keys(doc().skins[0].attachments[s.id] ?? {}); A.setSlotAttachment(s.id, c.chance(0.2) ? null : (c.pick(names) ?? null)); } },
  { name: 'setSlotColor', run: (c) => { const s = c.pick(doc().slots); if (s) A.setSlotColor(s.id, [c.r(), c.r(), c.r(), c.r()]); } },
  { name: 'setSlotColors', run: (c) => { const s = c.pick(doc().slots); if (s) A.setSlotColor(s.id, [c.r(), c.r(), c.r(), c.r()], [c.r(), c.r(), c.r()]); } }, // light + dark (two-color tinting)
  { name: 'deleteAttachment', run: (c) => { const a = c.pick([...meshes(), ...regions(), ...polygons(), ...points()]); if (a) A.deleteAttachment(a.slotId, a.name); } },
  { name: 'setAttachmentProps', run: (c) => { const a = c.pick(regions()); if (a) A.setAttachmentProps(a.slotId, a.name, { x: c.num(-40, 40), rotation: c.num(-90, 90), scaleX: c.num(0.5, 2) }); } },
  // ---- clipping / bounding box / point attachments
  { name: 'createPolygon', run: (c) => { A.selectBone(c.pick(doc().bones)!.id); const n = 3 + Math.floor(c.r() * 4); const pts = Array.from({ length: n }, () => [c.num(-150, 150), c.num(-50, 250)] as [number, number]); P.createPolygon(c.chance(0.5) ? 'clipping' : 'boundingbox', pts); } },
  { name: 'createPoint', run: (c) => { A.selectBone(c.pick(doc().bones)!.id); P.createPoint(c.num(-150, 150), c.num(-50, 250)); } },
  { name: 'movePolygonVertices', run: (c) => { const a = c.pick(polygons()); if (!a) return; const n = polygonVertexCount(P.getPolygon(a.slotId, a.name)!); P.movePolygonVertices(a.slotId, a.name, [{ index: Math.floor(c.r() * n), x: c.num(-100, 100), y: c.num(-100, 200) }]); } },
  { name: 'addPolygonVertex', run: (c) => { const a = c.pick(polygons()); if (a) P.addPolygonVertex(a.slotId, a.name, c.num(-100, 100), c.num(-100, 200)); } },
  { name: 'deletePolygonVertices', run: (c) => { const a = c.pick(polygons()); if (!a) return; const n = polygonVertexCount(P.getPolygon(a.slotId, a.name)!); P.deletePolygonVertices(a.slotId, a.name, [Math.floor(c.r() * n), Math.floor(c.r() * n)]); } },
  { name: 'setClipping', run: (c) => { const a = c.pick(polygons().filter((x) => x.type === 'clipping')); if (a) A.setAttachmentProps(a.slotId, a.name, { end: c.chance(0.25) ? null : (c.pick(doc().slots)?.id ?? null), convex: c.chance(0.5), inverse: c.chance(0.4) }); } },
  { name: 'setPointProps', run: (c) => { const a = c.pick(points()); if (a) A.setAttachmentProps(a.slotId, a.name, { x: c.num(-50, 50), y: c.num(-50, 50), rotation: c.num(-180, 180) }); } },
  // ---- skins / events
  { name: 'createSkin', run: (c) => { A.createSkin(c.pick(NAMES)); } },
  { name: 'renameSkin', run: (c) => { const s = c.pick(doc().skins)!; A.renameSkin(s.id, c.pick(NAMES)!); } },
  { name: 'deleteSkin', run: (c) => { A.deleteSkin(c.pick(doc().skins)!.id); } },
  { name: 'setSkinImage', run: (c) => { const s = c.pick(doc().skins.slice(1)); const r = c.pick(regions()); const img = c.pick(project().images); if (s && r && img) A.setSkinImage(s.id, r.slotId, r.name, img.name); } },
  { name: 'removeSkinImage', run: (c) => { const s = c.pick(doc().skins.slice(1)); const r = c.pick(regions()); if (s && r) A.removeSkinImage(s.id, r.slotId, r.name); } },
  { name: 'setActiveSkin', run: (c) => { A.setActiveSkin(c.chance(0.3) ? null : c.pick(doc().skins)!.id); } },
  { name: 'createEvent', run: (c) => { A.createEvent(c.pick(NAMES)); } },
  { name: 'updateEvent', run: (c) => { const e = c.pick(doc().events); if (e) A.updateEvent(e.id, { name: c.pick(NAMES)!, int: c.num(-5, 5), float: c.num(-3, 3), string: c.pick(NAMES)! }); } },
  { name: 'deleteEvent', run: (c) => { const e = c.pick(doc().events); if (e) A.deleteEvent(e.id); } },
  { name: 'keyEvent', run: (c) => { const e = c.pick(doc().events); if (e) { A.setMode('animate'); A.keyEvent(e.id); } } },
  // ---- meshes and weights
  { name: 'convertToMesh', run: (c) => { const r = c.pick(regions()); if (r) M.convertToMesh(r.slotId, r.name, 'quad'); } },
  { name: 'addMeshVertex', run: (c) => { const m = c.pick(meshes()); if (!m) return; const { mats, slotMat } = M.setupMats(); const w = meshWorldPositions(M.getMesh(m.slotId, m.name)!, slotMat(m.slotId), mats); const i = Math.floor(c.r() * (w.length / 2)); M.addMeshVertex(m.slotId, m.name, w[i * 2] + c.num(-30, 30), w[i * 2 + 1] + c.num(-30, 30)); } },
  { name: 'deleteMeshVertices', run: (c) => { const m = c.pick(meshes()); if (!m) return; const n = M.getMesh(m.slotId, m.name)!.uvs.length / 2; M.deleteMeshVertices(m.slotId, m.name, [Math.floor(c.r() * n), Math.floor(c.r() * n)]); } },
  { name: 'retriangulateMesh', run: (c) => { const m = c.pick(meshes()); if (m) M.retriangulateMesh(m.slotId, m.name); } },
  { name: 'moveMeshVertices', run: (c) => { const m = c.pick(meshes()); if (!m) return; const n = M.getMesh(m.slotId, m.name)!.uvs.length / 2; M.moveMeshVertices(m.slotId, m.name, [{ index: Math.floor(c.r() * n), x: c.num(-100, 100), y: c.num(-100, 100) }]); } },
  { name: 'bindMeshToBones', run: (c) => { const m = c.pick(meshes()); if (m) M.bindMeshToBones(m.slotId, m.name, Array.from({ length: 1 + Math.floor(c.r() * 3) }, () => c.pick(doc().bones)!.id)); } },
  { name: 'unbindMeshFromBones', run: (c) => { const m = c.pick(meshes()); if (m) M.unbindMeshFromBones(m.slotId, m.name); } },
  { name: 'autoWeightMesh', run: (c) => { const m = c.pick(meshes()); if (m) M.autoWeightMesh(m.slotId, m.name); } },
  { name: 'smoothMeshWeights', run: (c) => { const m = c.pick(meshes()); if (m) M.smoothMeshWeights(m.slotId, m.name, 1 + Math.floor(c.r() * 3)); } },
  { name: 'paintWeights', run: (c) => { const m = c.pick(meshes()); if (!m) return; const bone = c.pick(doc().bones)!.id; uiStore.patch({ brush: { size: c.num(10, 300), strength: c.num(0.1, 1), mode: c.pick(['add', 'subtract', 'smooth', 'replace'] as const)!, bone } }); const { mats, slotMat } = M.setupMats(); const w = meshWorldPositions(M.getMesh(m.slotId, m.name)!, slotMat(m.slotId), mats); const i = Math.floor(c.r() * (w.length / 2)); M.paintWeights(m.slotId, m.name, { x: w[i * 2], y: w[i * 2 + 1] }, bone); } },
  { name: 'setDeformKey', run: (c) => { A.setMode('animate'); const sc = getScene(); const cands = sc.skeleton.slots.filter((s) => sc.skeleton.slotAttachment(s)?.kind === 'mesh'); const s = c.pick(cands); if (!s) return; const att = sc.skeleton.slotAttachment(s)!; const base = M.currentDeform(s.data.id); if (!base) return; M.setDeformKey(s.data.id, att.name, base, [{ index: Math.floor(c.r() * (att.kind === 'mesh' ? att.vertexCount : 1)), dx: c.num(-20, 20), dy: c.num(-20, 20) }]); } },
  // ---- constraints
  { name: 'createIkFromDrag', run: (c) => { const end = c.pick(doc().bones)!; const target = c.chance(0.5) ? c.pick(doc().bones)!.id : null; I.createIkFromDrag(end.id, target, c.num(-150, 150), c.num(-50, 250), c.chance(0.3)); } },
  { name: 'createTransformConstraint', run: (c) => { const target = c.pick(doc().bones)!; const source = c.pick(doc().bones)!; T.createTransformConstraint([target.id], source.id, c.pick(['rotation', 'mirror', 'position', 'scale', 'rotateToX'] as const)!); } },
  { name: 'deleteConstraint', run: (c) => { const k = c.pick(doc().constraints); if (k) I.deleteConstraint(k.id); } },
  { name: 'moveConstraint', run: (c) => { const k = c.pick(doc().constraints); if (k) I.moveConstraint(k.id, c.chance(0.5) ? -1 : 1); } },
  { name: 'renameConstraint', run: (c) => { const k = c.pick(doc().constraints); if (k) I.renameConstraint(k.id, c.pick(NAMES)!); } },
  { name: 'setIkValues', run: (c) => { const k = c.pick(doc().constraints.filter((x) => x.type === 'ik')); if (k) I.setIkValues(k.id, { mix: c.r(), softness: c.num(0, 30), bendPositive: c.chance(0.5), stretch: c.chance(0.3), compress: c.chance(0.3) }); } },
  { name: 'setConstraintSetup', run: (c) => { const k = c.pick(doc().constraints.filter((x) => x.type === 'ik')); if (k) I.setConstraintSetup(k.id, { mix: c.r(), softness: c.num(0, 30), bendPositive: c.chance(0.5) }); } },
  { name: 'createSlider', run: (c) => { SL.createSlider(c.chance(0.6) ? c.pick(doc().bones)!.id : null); } },
  { name: 'updateSlider', run: (c) => { const s = c.pick(doc().constraints.filter((x) => x.type === 'slider')); if (s) SL.updateSlider(s.id, { additive: c.chance(0.5), loop: c.chance(0.5), local: c.chance(0.5), property: c.pick(TRANSFORM_PROPS)!, from: c.num(-50, 50), to: c.num(0, 1), scale: c.num(-0.05, 0.05), animation: c.chance(0.85) ? (c.pick(doc().animations)?.id ?? null) : null, bone: c.chance(0.7) ? c.pick(doc().bones)!.id : null, mix: c.r(), time: c.num(0, 2) }); } },
  { name: 'setSliderValues', run: (c) => { const s = c.pick(doc().constraints.filter((x) => x.type === 'slider')); if (s) SL.setSliderValues(s.id, { mix: c.r(), ...(c.chance(0.5) ? { time: c.num(0, 2) } : {}) }); } },
  { name: 'setTransformMix', run: (c) => { const k = c.pick(doc().constraints.filter((x) => x.type === 'transform')); if (k) T.setTransformMix(k.id, { [c.pick(TRANSFORM_PROPS)!]: c.r(), ...(c.chance(0.3) ? { [c.pick(TRANSFORM_PROPS)!]: c.num(0, 1.5) } : {}) }); } },
  { name: 'updateTransform', run: (c) => { const k = c.pick(doc().constraints.filter((x) => x.type === 'transform')); if (k) T.updateTransform(k.id, (t) => { t.clamp = c.chance(0.5); t.additive = c.chance(0.5); t.localTarget = c.chance(0.5); t.mix.rotate = c.r(); }); } },
  // ---- animations / keys
  { name: 'setMode', run: (c) => { A.setMode(c.chance(0.6) ? 'animate' : 'setup'); } },
  { name: 'createAnimation', run: (c) => { A.createAnimation(c.pick(NAMES), c.num(0.2, 3)); } },
  { name: 'selectAnimation', run: (c) => { const a = c.pick(doc().animations); if (a) A.selectAnimation(a.id); } },
  { name: 'duplicateAnimation', run: (c) => { const a = c.pick(doc().animations); if (a) A.duplicateAnimation(a.id); } },
  { name: 'renameAnimation', run: (c) => { const a = c.pick(doc().animations); if (a) A.renameAnimation(a.id, c.pick(NAMES)!); } },
  { name: 'deleteAnimation', run: (c) => { const a = c.pick(doc().animations); if (a) A.deleteAnimation(a.id); } },
  { name: 'setAnimationDuration', run: (c) => { const a = c.pick(doc().animations); if (a) A.setAnimationDuration(a.id, c.num(0, 3)); } },
  { name: 'setFps', run: (c) => { A.setFps(c.pick([12, 24, 30, 60, 240, 0, 1000])!); } },
  { name: 'setTime', run: (c) => { A.setTime(c.num(0, 3), c.chance(0.7)); } },
  { name: 'moveKeysBy', run: (c) => { const a = A.currentAnimation(); if (!a) return; const refs = allKeyRefs(a); const k = c.pick(refs); if (k) A.moveKeysBy(refs.filter((r) => r.kind === k.kind && r.target === k.target && r.prop === k.prop && c.chance(0.6)).concat(k), c.num(-1, 1)); } },
  { name: 'deleteKeys', run: (c) => { const a = A.currentAnimation(); if (!a) return; const refs = allKeyRefs(a); A.deleteKeys(refs.filter(() => c.chance(0.15))); } },
  { name: 'setKeysCurve', run: (c) => { const a = A.currentAnimation(); if (!a) return; const refs = allKeyRefs(a).filter((r) => r.kind !== 'drawOrder' && r.kind !== 'event' && r.prop !== 'attachment'); const k = c.pick(refs); if (k) A.setKeysCurve([k], c.pick(['linear', 'stepped', 'bezier', [0.1, 0.2, 0.9, 0.8]] as const)! as 'linear'); } },
  { name: 'setKeyChannelValue', run: (c) => { const a = A.currentAnimation(); if (!a) return; const refs = allKeyRefs(a).filter((r) => r.kind === 'bone' || r.kind === 'ik' || r.kind === 'slider' || r.kind === 'transform'); const k = c.pick(refs); if (k) A.setKeyChannelValue(k, 0, c.num(-50, 50)); } },
  { name: 'setKeyCurveHandle', run: (c) => { const a = A.currentAnimation(); if (!a) return; const refs = allKeyRefs(a).filter((r) => r.kind === 'bone' || r.kind === 'ik' || r.kind === 'deform' || r.kind === 'transform'); const k = c.pick(refs); if (k) A.setKeyCurveHandle(k, 0, c.chance(0.5) ? 1 : 2, c.r(), c.num(-1, 2)); } },
  { name: 'copyPasteKeys', run: (c) => { const a = A.currentAnimation(); if (!a) return; const refs = allKeyRefs(a).filter((r) => r.kind !== 'drawOrder'); const k = c.pick(refs); if (!k) return; A.copyKeys([k]); A.pasteKeys(c.num(0, 2)); } },
  // ---- history
  { name: 'undo', run: () => docStore.undo() },
  { name: 'redo', run: () => docStore.redo() },
];

// ------------------------------------------------------------------ invariants

function finiteSkeleton(p: Project, label: string) {
  const data = compileSkeleton(p.skeleton);
  const sk = createSkeleton(data);
  const poses: [Animation | null, number][] = [[null, 0]];
  for (const a of p.skeleton.animations) poses.push([a, 0], [a, a.duration * 0.5], [a, a.duration]);
  for (const [anim, t] of poses) {
    applyAnimation(sk, anim, t);
    sk.updateWorldTransform();
    for (const b of sk.bones) for (const v of [b.a, b.b, b.c, b.d, b.worldX, b.worldY]) if (!Number.isFinite(v)) throw new Error(`${label}: non-finite matrix on bone "${b.data.name}" (animation ${anim?.name ?? 'setup'} t=${t})`);
  }
}

/**
 * Bones whose pose hangs on a knife-edge: a transform constraint or slider that reads a WORLD rotation sitting on the
 * 0/360 wrap gets 0 from one runtime and 360 from the other, depending on ~1e-6 degrees of float noise. That is how
 * Spine's formula behaves (the official runtimes disagree among themselves), not a solver bug, so such bones are skipped.
 */
function ambiguousBones(ours: ReturnType<typeof createSkeleton>, official: any): Set<number> {
  const out = new Set<number>();
  const mark = (b: (typeof ours.bones)[number]) => {
    out.add(b.data.index);
    for (const c of b.children) mark(c);
  };
  const nearWrap = (b: (typeof ours.bones)[number]) => {
    let a = (Math.atan2(b.c, b.a) * 180) / Math.PI;
    if (a < 0) a += 360;
    return a < 1e-3 || a > 360 - 1e-3;
  };
  for (const c of ours.constraints) {
    if (c.kind === 'transform' && !c.data.localSource && c.data.properties.some((p) => p.prop === 'rotate') && nearWrap(c.source)) for (const b of c.bones) mark(b);
    if (c.kind === 'slider') {
      const o = official.constraints.find((x: any) => x.data.name === c.data.name);
      if (o && Math.abs(o.appliedPose.time - c.time) > 1e-2) for (const i of c.data.animatedBones) mark(ours.bones[i]);
    }
  }
  return out;
}

export interface Mismatch {
  bone: string;
  what: string;
  ours: number;
  official: number;
  animation: string;
  time: number;
}

/** First difference between our solver and the official runtime on what the editor would export right now. */
export function parityMismatch(p: Project): Mismatch | null {
  const { skeletonData: sd } = exportAndLoad(p);
  const data = compileSkeleton(p.skeleton);
  for (const anim of p.skeleton.animations) {
    const exported = sd.findAnimation(anim.name);
    if (!exported) continue;
    const end = Math.min(anim.duration, exported.duration);
    // The official runtime keeps key times in Float32Array (1.2 -> 1.20000004), so sampling EXACTLY on a key time is
    // ambiguous. Probe slightly off the frame grid instead.
    for (const t of [0, end * 0.37 + 0.00137, end * 0.8 + 0.00137, end - 0.00137]) {
      if (t < 0 || t > end) continue;
      const official = new S.Skeleton(sd);
      official.setupPose();
      const state = new S.AnimationState(new S.AnimationStateData(sd));
      state.setAnimation(0, anim.name, false);
      state.update(t);
      state.apply(official);
      official.updateWorldTransform(S.Physics.update);
      const ours = createSkeleton(data);
      applyAnimation(ours, anim, t);
      ours.updateWorldTransform();
      const ambiguous = ambiguousBones(ours, official);
      for (const ob of official.bones) {
        const id = p.skeleton.bones.find((b) => b.name === ob.data.name)!.id;
        const mine = ours.bones[data.boneIndex.get(id)!];
        if (ambiguous.has(mine.data.index)) continue;
        const q = ob.appliedPose;
        // The matrix elements are compared relative to the size of the whole matrix: an element can be a small difference of
        // large terms (a = 3.5 next to b = 75), and the exporter's rounding (5 decimals for mixes, 7 digits for slider times)
        // is amplified by a slider with mix 48 into 0.01 degrees of a 3492 degree rotation — 3e-6 relative, harmless.
        const mag = Math.max(Math.abs(q.a), Math.abs(q.b), Math.abs(q.c), Math.abs(q.d));
        // The position is a sum of terms the size of (local offset x parent matrix): a bone 7000 units out on a parent with a
        // 1e-5 relative difference (an IK solve, a slider mix of 48) is off by a few tenths, which is still the same pose.
        const parentMag = ob.parent ? Math.max(Math.abs(ob.parent.appliedPose.a), Math.abs(ob.parent.appliedPose.b), Math.abs(ob.parent.appliedPose.c), Math.abs(ob.parent.appliedPose.d)) : 1;
        const wscale = 0.004 * (Math.abs(mine.ax) + Math.abs(mine.ay)) * parentMag;
        const pairs: [string, number, number, number][] = [['a', mine.a, q.a, mag], ['b', mine.b, q.b, mag], ['c', mine.c, q.c, mag], ['d', mine.d, q.d, mag], ['worldX', mine.worldX, q.worldX, wscale], ['worldY', mine.worldY, q.worldY, wscale]];
        for (const [what, x, y, scale] of pairs) if (!(Math.abs(x - y) <= 5e-3 * Math.max(1, Math.abs(x), Math.abs(y), scale))) return { bone: ob.data.name, what, ours: x, official: y, animation: anim.name, time: t };
      }
      // (a slider whose driver sits on the 0/360 wrap applies its animation at time 0 in one runtime and at 360 in the other)
      const colors = ambiguous.size ? null : colorMismatch(p, ours, official);
      if (colors) return { ...colors, animation: anim.name, time: t };
      const shapes = attachmentMismatch(p, ours, official, ambiguous);
      if (shapes) return { ...shapes, animation: anim.name, time: t };
    }
  }
  return null;
}

/**
 * Slot colors, light and dark. They travel as 8-bit hex in the JSON and a bezier can extrapolate the rounding error, hence the
 * tolerance: a wrong channel, clamp or mix is off by far more.
 */
function colorMismatch(p: Project, ours: ReturnType<typeof createSkeleton>, official: any): Omit<Mismatch, 'animation' | 'time'> | null {
  for (const os of official.slots) {
    const slotDoc = p.skeleton.slots.find((s) => s.name === os.data.name);
    const slot = slotDoc && ours.slotById(slotDoc.id);
    if (!slot) continue;
    const c = os.appliedPose.color;
    const dk = os.appliedPose.darkColor;
    const pairs: [string, number, number][] = [['color.r', slot.color[0], c.r], ['color.g', slot.color[1], c.g], ['color.b', slot.color[2], c.b], ['color.a', slot.color[3], c.a]];
    if (dk) pairs.push(['dark.r', slot.dark ? slot.dark[0] : NaN, dk.r], ['dark.g', slot.dark ? slot.dark[1] : NaN, dk.g], ['dark.b', slot.dark ? slot.dark[2] : NaN, dk.b]);
    else if (slot.dark) pairs.push(['dark (the official slot has none)', 1, 0]);
    for (const [what, x, y] of pairs) if (!(Math.abs(x - y) <= 1.5e-2)) return { bone: `slot "${os.data.name}"`, what, ours: x, official: y };
  }
  return null;
}

/** Bone indices that influence a weighted attachment (`bones` = per vertex [count, bone…] as compiled by `compileSkeleton`). */
function influencingBones(bones: Int32Array, vertexCount: number): number[] {
  const out: number[] = [];
  for (let i = 0, v = 0; i < vertexCount; i++) {
    const count = bones[v++];
    for (let k = 0; k < count; k++) out.push(bones[v++]);
  }
  return out;
}

/** Clipping polygons, bounding boxes and points: world geometry and flags against the official runtime. */
function attachmentMismatch(p: Project, ours: ReturnType<typeof createSkeleton>, official: any, ambiguous: Set<number>): Omit<Mismatch, 'animation' | 'time'> | null {
  for (const os of official.slots) {
    const oa = os.appliedPose.attachment;
    const kind = oa instanceof S.ClippingAttachment ? 'clipping' : oa instanceof S.BoundingBoxAttachment ? 'boundingbox' : oa instanceof S.PointAttachment ? 'point' : null;
    if (!kind) continue;
    const slotDoc = p.skeleton.slots.find((s) => s.name === os.data.name);
    const slot = slotDoc && ours.slotById(slotDoc.id);
    if (!slot) continue;
    const label = `slot "${os.data.name}" ${kind}`;
    const att = ours.slotAttachment(slot);
    if (!att || att.kind !== kind) return { bone: label, what: `attachment kind (ours ${att?.kind ?? 'none'})`, ours: 0, official: 1 };
    const driving = [slot.data.bone, ...(att.kind !== 'point' && att.bones ? influencingBones(att.bones, att.vertexCount) : [])];
    if (driving.some((i) => ambiguous.has(i))) continue;
    // A bone matrix is only guaranteed to ~5e-3 of its own size (see `parityMismatch`), so a vertex that is a small number
    // made of large terms (matrix size x local extent + translation) is compared against the size of those terms.
    let extent = 0;
    if (att.kind === 'point') extent = Math.max(Math.abs(att.x), Math.abs(att.y));
    else for (let i = 0; i < att.positions.length; i++) if (!att.weighted || i % 3 !== 2) extent = Math.max(extent, Math.abs(att.positions[i]));
    let terms = 0;
    for (const bi of new Set(driving)) {
      const b = ours.bones[bi];
      terms = Math.max(terms, Math.max(Math.abs(b.a), Math.abs(b.b), Math.abs(b.c), Math.abs(b.d)) * extent + Math.abs(b.worldX) + Math.abs(b.worldY));
    }
    const near = (x: number, y: number) => Math.abs(x - y) <= 5e-3 * Math.max(1, Math.abs(x), Math.abs(y), terms);
    if (att.kind === 'point') {
      const pos = oa.computeWorldPosition(os.bone.appliedPose, new S.Vector2());
      const mine = pointWorld(att, slot.bone);
      if (!near(mine.x, pos.x)) return { bone: label, what: 'x', ours: mine.x, official: pos.x };
      if (!near(mine.y, pos.y)) return { bone: label, what: 'y', ours: mine.y, official: pos.y };
      const rot = oa.computeWorldRotation(os.bone.appliedPose);
      const d = ((((mine.rotation - rot + 180) % 360) + 360) % 360) - 180;
      if (Math.abs(d) > 0.1) return { bone: label, what: 'rotation', ours: mine.rotation, official: rot }; // 0.1° = 1.7e-3 rad: ill-conditioned matrices (see above)
      continue;
    }
    const n = oa.worldVerticesLength;
    if (att.vertexCount * 2 !== n) return { bone: label, what: 'vertex count', ours: att.vertexCount, official: n / 2 };
    const out = new Array(n).fill(0);
    oa.computeWorldVertices(official, os, 0, n, out, 0, 2);
    const mine = new Float32Array(n);
    meshWorldVertices(ours, slot, att, null, mine);
    for (let i = 0; i < n; i++) if (!near(mine[i], out[i])) return { bone: label, what: `vertex[${i}]`, ours: mine[i], official: out[i] };
    if (att.kind === 'clipping') {
      const endName = att.end ? (p.skeleton.slots.find((s) => s.id === att.end)?.name ?? null) : null;
      if ((oa.endSlot?.name ?? null) !== endName) return { bone: label, what: `end slot (ours ${endName}, official ${oa.endSlot?.name ?? null})`, ours: 0, official: 1 };
      if (oa.convex !== att.convex || oa.inverse !== att.inverse) return { bone: label, what: 'convex / inverse flag', ours: Number(att.convex) * 2 + Number(att.inverse), official: Number(oa.convex) * 2 + Number(oa.inverse) };
    }
  }
  return null;
}

function parity(p: Project, label: string) {
  const m = parityMismatch(p);
  if (m) throw new Error(`${label}: bone "${m.bone}".${m.what} ours=${m.ours} official=${m.official} (animation ${m.animation} t=${m.time})`);
}

/** What the selection may refer to: after any action (undo included) no panel is asked about a slot / bone / constraint that is gone. */
function checkSelection(label: string) {
  const sel = uiStore.get().selection;
  const d = doc();
  if (sel.slot && !d.slots.some((s) => s.id === sel.slot)) throw new Error(`${label}: the selection refers to a missing slot`);
  if (sel.attachment && !(sel.slot && d.skins[0]?.attachments[sel.slot]?.[sel.attachment])) throw new Error(`${label}: the selection refers to a missing attachment`);
  for (const id of sel.bones) if (!d.bones.some((b) => b.id === id)) throw new Error(`${label}: the selection refers to a missing bone`);
  if (sel.constraint && !d.constraints.some((c) => c.id === sel.constraint)) throw new Error(`${label}: the selection refers to a missing constraint`);
}

export function check(label: string) {
  const p = project();
  const issues = validateProject(p);
  if (issues.length) throw new Error(`${label}: the document needs repair:\n  - ${issues.join('\n  - ')}`);
  checkSelection(label);
  try {
    exportAndLoad(p);
  } catch (e) {
    throw new Error(`${label}: the official loader rejected the export: ${(e as Error).message}`);
  }
  finiteSkeleton(p, label);
  const bad = findNonFinite(exportSpineJson(p.skeleton), 'export');
  if (bad) throw new Error(`${label}: non-finite number in the export at ${bad}`);
}

/** Path of the first NaN / Infinity inside a JSON-like tree (JSON.stringify would silently turn them into null). */
function findNonFinite(value: unknown, path: string): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const r = findNonFinite(value[i], `${path}[${i}]`);
      if (r) return r;
    }
  } else if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      const r = findNonFinite((value as Record<string, unknown>)[k], `${path}.${k}`);
      if (r) return r;
    }
  }
  return null;
}

// ------------------------------------------------------------------ the runs

let sanitizerInstalled = false;

export function freshSession() {
  if (!sanitizerInstalled) {
    docStore.subscribe(A.sanitizeSelection); // the app does the same (App.tsx)
    sanitizerInstalled = true;
  }
  const f = buildFixture();
  addAttachmentRig(f.project); // clipping / bounding boxes (also weighted) / a point, so edits meet them from the first step
  docStore.replace(f.project);
  uiStore.patch({ mode: 'setup', tool: 'select', animationId: f.project.skeleton.animations[0].id, skinId: null, time: 0, selection: emptySelection, overrides: {}, autoKey: true, playing: false, defaultCurve: 'bezier' });
  return f;
}

/** Plays `steps` random actions of one session and returns what was done (throws on the first violated invariant). */
export function playSession(seed: number, steps: number, opts: { parity?: boolean; history?: boolean } = {}): string[] {
  freshSession();
  const initial = structuredClone(docStore.get());
  const c = makeCtx(seed);
  const log: string[] = [];
  for (let step = 0; step < steps; step++) {
    const op = c.pick(ops)!;
    log.push(op.name);
    try {
      op.run(c);
    } catch (e) {
      throw new Error(`seed ${seed}, step ${step} "${op.name}" threw: ${(e as Error).stack}\nsteps: ${log.join(', ')}`);
    }
    try {
      check(`seed ${seed}, step ${step} after "${op.name}"`);
    } catch (e) {
      throw new Error(`${(e as Error).message}\nsteps: ${log.join(', ')}`);
    }
  }
  if (opts.parity !== false) {
    try {
      parity(docStore.get(), `seed ${seed} final state`);
    } catch (e) {
      throw new Error(`${(e as Error).message}\nsteps: ${log.join(', ')}`);
    }
  }
  if (opts.history !== false) {
    // history: go to the newest state, undo everything -> exactly the starting document, redo everything -> the newest state again
    let guard = 0;
    while (docStore.canRedo && guard++ < 1000) docStore.redo();
    const newest = structuredClone(docStore.get());
    try {
      check(`seed ${seed} newest state of the history`);
    } catch (e) {
      throw new Error(`${(e as Error).message}\nsteps: ${log.join(', ')}`);
    }
    guard = 0;
    while (docStore.canUndo && guard++ < 1000) docStore.undo();
    expect(docStore.get(), `seed ${seed}: undoing everything\nsteps: ${log.join(', ')}`).toEqual(initial);
    guard = 0;
    while (docStore.canRedo && guard++ < 1000) docStore.redo();
    expect(docStore.get(), `seed ${seed}: redoing everything\nsteps: ${log.join(', ')}`).toEqual(newest);
  }
  return log;
}
