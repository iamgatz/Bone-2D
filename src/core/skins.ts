/**
 * Skin operations on a skeleton document (a draft or a plain object): copy a skin, choose which bones and constraints belong to it
 * ("skin scope", Spine's skin bones / skin constraints) and which of its attachments override the default skin's ones.
 */
import { freshName } from './edit';
import { uid } from './ids';
import type { Attachment, Id, SkeletonDoc, Skin } from './model';

export type ScopeKind = 'bone' | 'constraint';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The default skin is the first one; it is never a scope or an override. */
export const isDefaultSkin = (doc: SkeletonDoc, skinId: Id): boolean => doc.skins[0]?.id === skinId;

/**
 * Copies a skin: every attachment, the scope and the deform timelines of every animation. The copy goes right after the original
 * (never in front of the default skin). Returns the new skin, or null when there is no such skin or it is the default one.
 */
export function duplicateSkin(doc: SkeletonDoc, skinId: Id): Skin | null {
  const index = doc.skins.findIndex((s) => s.id === skinId);
  if (index <= 0) return null;
  const src = doc.skins[index];
  const copy: Skin = { id: uid(), name: freshName(`${src.name} copy`, doc.skins), attachments: clone(src.attachments), bones: [...src.bones], constraints: [...src.constraints] };
  doc.skins.splice(index + 1, 0, copy);
  // a linked mesh that follows a mesh of the skin that is copied follows the one of the copy
  for (const slotId in copy.attachments) for (const name in copy.attachments[slotId]) {
    const att = copy.attachments[slotId][name];
    if (att.type === 'mesh' && att.link?.skin === src.id) att.link.skin = copy.id;
  }
  for (const anim of doc.animations) {
    const deform = anim.deform[src.id];
    if (deform) anim.deform[copy.id] = clone(deform);
    const sequence = anim.sequence?.[src.id];
    if (sequence) (anim.sequence ??= {})[copy.id] = clone(sequence);
  }
  return copy;
}

/** True when the bone, or a bone above it, is "skin required": a bone below a required one is required too (the runtime has no matrix for it otherwise). */
export function boneRequiresSkin(doc: SkeletonDoc, boneId: Id): boolean {
  const byId = new Map(doc.bones.map((b) => [b.id, b] as const));
  let cur = byId.get(boneId);
  for (let steps = 0; cur && steps <= doc.bones.length; steps++) {
    if (cur.skinRequired) return true;
    cur = cur.parent ? byId.get(cur.parent) : undefined;
  }
  return false;
}

/**
 * Marks a bone or constraint as one that is only active in the skins that list it (or lifts the mark and removes it from every skin).
 * A bone drags its children along when marked, and its parents when freed, so a bone is never left active below one that is not.
 */
export function setSkinRequired(doc: SkeletonDoc, kind: ScopeKind, id: Id, required: boolean): void {
  if (kind === 'constraint') {
    const c = doc.constraints.find((x) => x.id === id);
    if (!c) return;
    c.skinRequired = required;
    if (!required) for (const skin of doc.skins) removeFrom(skin.constraints, id);
    return;
  }
  const byId = new Map(doc.bones.map((b) => [b.id, b] as const));
  const bone = byId.get(id);
  if (!bone) return;
  const touched = new Set<Id>();
  if (required) {
    // the bone and everything below it (bones come parents first)
    for (const b of doc.bones) if (b.id === id || (b.parent && touched.has(b.parent))) touched.add(b.id);
    for (const b of doc.bones) if (touched.has(b.id)) b.skinRequired = true;
  } else {
    // the bone and every bone above it
    for (let cur: typeof bone | undefined = bone, steps = 0; cur && steps <= doc.bones.length; steps++) {
      touched.add(cur.id);
      cur.skinRequired = false;
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    for (const skin of doc.skins) skin.bones = skin.bones.filter((b) => !touched.has(b));
  }
}

function removeFrom(list: Id[], id: Id) {
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
}

/** Lists a bone or constraint in a skin's scope, or removes it. Only a "skin required" item can be in a scope. */
export function setSkinScope(doc: SkeletonDoc, skinId: Id, kind: ScopeKind, id: Id, on: boolean): void {
  if (isDefaultSkin(doc, skinId)) return;
  const skin = doc.skins.find((s) => s.id === skinId);
  if (!skin) return;
  const list = kind === 'bone' ? skin.bones : skin.constraints;
  if (on) {
    const allowed = kind === 'bone' ? boneRequiresSkin(doc, id) : !!doc.constraints.find((c) => c.id === id)?.skinRequired;
    if (!allowed) return;
    if (!list.includes(id)) list.push(id);
  } else {
    removeFrom(list, id);
  }
}

/** Whether a slot's attachment is overridden by a skin, comes from the default skin, or does not exist at all. */
export type OverrideState = 'own' | 'inherited' | 'none';

export function overrideState(doc: SkeletonDoc, skinId: Id, slotId: Id, name: string): OverrideState {
  const skin = doc.skins.find((s) => s.id === skinId);
  if (skin && skin !== doc.skins[0] && skin.attachments[slotId]?.[name]) return 'own';
  return doc.skins[0]?.attachments[slotId]?.[name] ? 'inherited' : 'none';
}

/**
 * Gives a skin its own copy of a default attachment (to edit or to swap its image), or drops the copy so the default shows again.
 * Returns the new state.
 */
export function toggleOverride(doc: SkeletonDoc, skinId: Id, slotId: Id, name: string): OverrideState {
  const skin = doc.skins.find((s) => s.id === skinId);
  const state = overrideState(doc, skinId, slotId, name);
  if (!skin || skin === doc.skins[0] || state === 'none') return state;
  if (state === 'own') {
    const slotAtts = skin.attachments[slotId];
    delete slotAtts[name];
    if (!Object.keys(slotAtts).length) delete skin.attachments[slotId];
    return 'inherited';
  }
  const source: Attachment = doc.skins[0].attachments[slotId][name];
  (skin.attachments[slotId] ??= {})[name] = clone(source);
  return 'own';
}

/** How many attachments a skin overrides. */
export function overrideCount(skin: Skin): number {
  let n = 0;
  for (const atts of Object.values(skin.attachments)) n += Object.keys(atts).length;
  return n;
}
