/**
 * What is in a project, in numbers, and what looks forgotten: the Metrics window reads this. No DOM; the checks are cheap and only report, they never change the document.
 */
import type { Animation, Attachment, Project } from './model';
import { attachmentPictures } from './sequence';

export interface Stats {
  bones: number;
  slots: number;
  skins: number;
  animations: number;
  events: number;
  images: number;
  constraints: Record<string, number>;
  attachments: Record<string, number>;
  /** Vertices and triangles of all meshes of the default skin and the others together. */
  vertices: number;
  triangles: number;
  weightedVertices: number;
  keys: number;
  /** Longest animation, in seconds. */
  longest: number;
}

export type WarningKind = 'unusedImage' | 'emptyAnimation' | 'emptySlot' | 'tooManyInfluences' | 'duplicatePath' | 'missingFrame';

export interface Warning {
  kind: WarningKind;
  /** The thing the warning is about (an image, animation or slot name). */
  subject: string;
}

/** Counts the keys of an animation: every array of objects that have a numeric `time`. */
export function countKeys(anim: Animation): number {
  let n = 0;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object' && v[0] !== null && typeof (v[0] as { time?: unknown }).time === 'number') n += v.length;
      else v.forEach(walk);
    } else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk({ ...anim, id: undefined, name: undefined });
  return n;
}

function* attachmentsOf(project: Project): Generator<Attachment> {
  for (const skin of project.skeleton.skins) for (const bySlot of Object.values(skin.attachments)) yield* Object.values(bySlot);
}

export function projectStats(project: Project): Stats {
  const doc = project.skeleton;
  const constraints: Record<string, number> = {};
  for (const c of doc.constraints) constraints[c.type] = (constraints[c.type] ?? 0) + 1;
  const attachments: Stats['attachments'] = {};
  let vertices = 0;
  let triangles = 0;
  let weightedVertices = 0;
  for (const a of attachmentsOf(project)) {
    attachments[a.type] = (attachments[a.type] ?? 0) + 1;
    if (a.type === 'mesh') {
      vertices += a.weights ? a.weights.length : a.vertices.length / 2;
      triangles += a.triangles.length / 3;
      if (a.weights) weightedVertices += a.weights.length;
    }
  }
  let keys = 0;
  let longest = 0;
  for (const a of doc.animations) {
    keys += countKeys(a);
    longest = Math.max(longest, a.duration);
  }
  return { bones: doc.bones.length, slots: doc.slots.length, skins: doc.skins.length, animations: doc.animations.length, events: doc.events.length, images: project.images.length, constraints, attachments, vertices, triangles, weightedVertices, keys, longest };
}

/** The most influences one vertex may have in the export (the Spine runtimes read any number, but 4 is what the editor and GPUs expect). */
export const MAX_INFLUENCES = 4;

export function projectWarnings(project: Project): Warning[] {
  const out: Warning[] = [];
  const used = new Set<string>();
  const seen = new Map<string, number>();
  for (const a of attachmentsOf(project)) {
    if (a.type === 'region' || a.type === 'mesh') {
      for (const picture of attachmentPictures(a)) used.add(picture);
      seen.set(a.path, (seen.get(a.path) ?? 0) + 1);
      const have = new Set(project.images.map((i) => i.name));
      if (a.sequence && attachmentPictures(a).some((p) => !have.has(p))) out.push({ kind: 'missingFrame', subject: a.name });
    }
    if (a.type === 'mesh' && a.weights?.some((w) => w.length > MAX_INFLUENCES)) out.push({ kind: 'tooManyInfluences', subject: a.name });
  }
  for (const img of project.images) if (!used.has(img.name)) out.push({ kind: 'unusedImage', subject: img.name });
  for (const anim of project.skeleton.animations) if (countKeys(anim) === 0) out.push({ kind: 'emptyAnimation', subject: anim.name });
  const filled = new Set<string>();
  for (const skin of project.skeleton.skins) for (const [slot, by] of Object.entries(skin.attachments)) if (Object.keys(by).length) filled.add(slot);
  for (const s of project.skeleton.slots) if (!filled.has(s.id)) out.push({ kind: 'emptySlot', subject: s.name });
  return out;
}
