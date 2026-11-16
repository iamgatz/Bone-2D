/** Applies an animation (bone, slot, IK, deform, draw order timelines) to a skeleton pose at a given time. */
import { deformProgress, findKeyIndex, sampleKeys } from './curve';
import type { Animation, Id, Key, Timeline } from './model';
import type { Skeleton, Slot } from './skeleton';

const tmp: number[] = [0, 0, 0, 0, 0, 0];

/** Last key time of an animation (or 0). */
export function animationEndTime(anim: Animation): number {
  let end = 0;
  const scan = (keys: ReadonlyArray<{ time: number }> | undefined) => {
    if (keys && keys.length) end = Math.max(end, keys[keys.length - 1].time);
  };
  for (const id in anim.bones) {
    const t = anim.bones[id];
    scan(t.rotate);
    scan(t.translate);
    scan(t.scale);
    scan(t.shear);
  }
  for (const id in anim.slots) {
    const t = anim.slots[id];
    scan(t.attachment);
    scan(t.rgba);
  }
  for (const id in anim.ik) scan(anim.ik[id]);
  for (const id in anim.transform ?? {}) scan(anim.transform[id]);
  for (const id in anim.slider ?? {}) {
    scan(anim.slider[id].time);
    scan(anim.slider[id].mix);
  }
  for (const skin in anim.deform) for (const slot in anim.deform[skin]) for (const att in anim.deform[skin][slot]) scan(anim.deform[skin][slot][att]);
  scan(anim.drawOrder);
  scan(anim.events);
  return end;
}

/** Poses `skeleton` for `anim` at `time` starting from the setup pose. Does not compute world transforms. */
export function applyAnimation(skeleton: Skeleton, anim: Animation | null, time: number) {
  skeleton.setToSetupPose();
  if (!anim) return;

  for (const boneId in anim.bones) {
    const bone = skeleton.boneById(boneId);
    if (!bone) continue;
    const tl = anim.bones[boneId];
    const d = bone.data;
    if (tl.rotate && tl.rotate.length && sampleKeys(tl.rotate, time, tmp)) bone.rotation = d.rotation + tmp[0];
    if (tl.translate && tl.translate.length && sampleKeys(tl.translate, time, tmp)) {
      bone.x = d.x + tmp[0];
      bone.y = d.y + tmp[1];
    }
    if (tl.scale && tl.scale.length && sampleKeys(tl.scale, time, tmp)) {
      bone.scaleX = d.scaleX * tmp[0];
      bone.scaleY = d.scaleY * tmp[1];
    }
    if (tl.shear && tl.shear.length && sampleKeys(tl.shear, time, tmp)) {
      bone.shearX = d.shearX + tmp[0];
      bone.shearY = d.shearY + tmp[1];
    }
  }

  for (const slotId in anim.slots) {
    const slot = skeleton.slotById(slotId);
    if (!slot) continue;
    const tl = anim.slots[slotId];
    if (tl.attachment && tl.attachment.length) {
      const i = findKeyIndex(tl.attachment, time);
      if (i >= 0) slot.attachmentName = tl.attachment[i].name;
    }
    if (tl.rgba && tl.rgba.length && sampleKeys(tl.rgba, time, tmp)) {
      slot.color = [tmp[0], tmp[1], tmp[2], tmp[3]];
    }
  }

  for (const cid in anim.ik) {
    const c = skeleton.ikById(cid);
    const keys = anim.ik[cid];
    if (!c || !keys.length) continue;
    if (sampleKeys(keys, time, tmp)) {
      c.mix = tmp[0];
      c.softness = tmp[1];
      const k = keys[findKeyIndex(keys, time)];
      c.bendDirection = k.bendPositive ? 1 : -1;
      c.compress = k.compress;
      c.stretch = k.stretch;
    }
  }

  for (const cid in anim.transform ?? {}) {
    const c = skeleton.transformById(cid);
    const keys = anim.transform[cid];
    if (!c || !keys.length) continue;
    if (sampleKeys(keys, time, tmp)) c.mix = [tmp[0], tmp[1], tmp[2], tmp[3], tmp[4], tmp[5]];
  }

  for (const cid in anim.slider ?? {}) {
    const c = skeleton.sliderById(cid);
    if (!c) continue;
    const tl = anim.slider[cid];
    if (tl.time?.length && sampleKeys(tl.time, time, tmp)) c.time = tmp[0];
    if (tl.mix?.length && sampleKeys(tl.mix, time, tmp)) c.mix = tmp[0];
  }

  if (anim.drawOrder.length) {
    const i = findKeyIndex(anim.drawOrder, time);
    if (i >= 0) {
      const order: Slot[] = [];
      const seen = new Set<Slot>();
      for (const sid of anim.drawOrder[i].order) {
        const s = skeleton.slotById(sid);
        if (s && !seen.has(s)) {
          order.push(s);
          seen.add(s);
        }
      }
      for (const s of skeleton.slots) if (!seen.has(s)) order.push(s);
      skeleton.drawOrder = order;
    }
  }

  for (const skinId in anim.deform) {
    const skin = skeleton.data.skinById.get(skinId);
    if (!skin) continue;
    for (const slotId in anim.deform[skinId]) {
      const slot = skeleton.slotById(slotId);
      if (!slot) continue;
      const perAtt = anim.deform[skinId][slotId];
      for (const attName in perAtt) {
        const keys = perAtt[attName];
        if (!keys.length) continue;
        const att = skin.attachments[slot.data.index]?.get(attName);
        if (!att || att !== skeleton.slotAttachment(slot)) continue;
        const out = sampleDeform(keys, time);
        if (out) slot.deform = out;
      }
    }
  }
}

/**
 * Applies `anim` on top of the CURRENT pose (Spine's `MixFrom.current`), the way a slider does: values blend from where
 * they are towards the animation by `alpha`, or are added when `additive`. Bones are edited through their applied local
 * transform, so `bone.modifyLocal()` has to be called first (the slider does). Events are ignored.
 */
export function applyAnimationOnto(skeleton: Skeleton, anim: Animation, time: number, alpha: number, additive: boolean, loop: boolean) {
  if (loop && anim.duration !== 0) time %= anim.duration;

  for (const boneId in anim.bones) {
    const bone = skeleton.boneById(boneId);
    if (!bone || !bone.active) continue;
    const tl = anim.bones[boneId];
    const d = bone.data;
    if (tl.rotate?.length && sampleKeys(tl.rotate, time, tmp)) bone.arotation += (additive ? tmp[0] : tmp[0] + d.rotation - bone.arotation) * alpha;
    if (tl.translate?.length && sampleKeys(tl.translate, time, tmp)) {
      bone.ax += (additive ? tmp[0] : d.x + tmp[0] - bone.ax) * alpha;
      bone.ay += (additive ? tmp[1] : d.y + tmp[1] - bone.ay) * alpha;
    }
    if (tl.scale?.length && sampleKeys(tl.scale, time, tmp)) {
      const x = tmp[0] * d.scaleX;
      const y = tmp[1] * d.scaleY;
      if (alpha === 1 && !additive) {
        bone.ascaleX = x;
        bone.ascaleY = y;
      } else if (additive) {
        bone.ascaleX += (x - d.scaleX) * alpha;
        bone.ascaleY += (y - d.scaleY) * alpha;
      } else {
        const bx = Math.abs(bone.ascaleX) * Math.sign(x);
        const by = Math.abs(bone.ascaleY) * Math.sign(y);
        bone.ascaleX = bx + (x - bx) * alpha;
        bone.ascaleY = by + (y - by) * alpha;
      }
    }
    if (tl.shear?.length && sampleKeys(tl.shear, time, tmp)) {
      bone.ashearX += (additive ? tmp[0] : d.shearX + tmp[0] - bone.ashearX) * alpha;
      bone.ashearY += (additive ? tmp[1] : d.shearY + tmp[1] - bone.ashearY) * alpha;
    }
  }

  for (const slotId in anim.slots) {
    const slot = skeleton.slotById(slotId);
    if (!slot || !slot.bone.active) continue;
    const tl = anim.slots[slotId];
    if (tl.attachment?.length) {
      const i = findKeyIndex(tl.attachment, time);
      if (i >= 0) slot.attachmentName = tl.attachment[i].name;
    }
    if (tl.rgba?.length && sampleKeys(tl.rgba, time, tmp)) {
      if (alpha === 1) slot.color = [tmp[0], tmp[1], tmp[2], tmp[3]];
      else for (let j = 0; j < 4; j++) slot.color[j] += (tmp[j] - slot.color[j]) * alpha;
    }
  }

  for (const cid in anim.ik) {
    const c = skeleton.ikById(cid);
    const keys = anim.ik[cid];
    if (!c || !c.active || !keys.length) continue;
    if (sampleKeys(keys, time, tmp)) {
      c.mix += (tmp[0] - c.mix) * alpha;
      c.softness += (tmp[1] - c.softness) * alpha;
      const k = keys[findKeyIndex(keys, time)];
      c.bendDirection = k.bendPositive ? 1 : -1;
      c.compress = k.compress;
      c.stretch = k.stretch;
    }
  }

  for (const cid in anim.transform ?? {}) {
    const c = skeleton.transformById(cid);
    const keys = anim.transform[cid];
    if (!c || !c.active || !keys.length) continue;
    if (sampleKeys(keys, time, tmp)) for (let j = 0; j < 6; j++) c.mix[j] += (additive ? tmp[j] : tmp[j] - c.mix[j]) * alpha;
  }

  for (const cid in anim.slider ?? {}) {
    const c = skeleton.sliderById(cid);
    if (!c || !c.active) continue;
    const tl = anim.slider[cid];
    if (tl.time?.length && sampleKeys(tl.time, time, tmp)) c.time += (additive ? tmp[0] : tmp[0] - c.time) * alpha;
    if (tl.mix?.length && sampleKeys(tl.mix, time, tmp)) c.mix += (additive ? tmp[0] : tmp[0] - c.mix) * alpha;
  }

  if (anim.drawOrder.length) {
    const i = findKeyIndex(anim.drawOrder, time);
    if (i >= 0) {
      const order: Slot[] = [];
      const seen = new Set<Slot>();
      for (const sid of anim.drawOrder[i].order) {
        const s = skeleton.slotById(sid);
        if (s && !seen.has(s)) {
          order.push(s);
          seen.add(s);
        }
      }
      for (const s of skeleton.slots) if (!seen.has(s)) order.push(s);
      skeleton.drawOrder = order;
    }
  }

  for (const skinId in anim.deform) {
    const skin = skeleton.data.skinById.get(skinId);
    if (!skin) continue;
    for (const slotId in anim.deform[skinId]) {
      const slot = skeleton.slotById(slotId);
      if (!slot || !slot.bone.active) continue;
      const perAtt = anim.deform[skinId][slotId];
      for (const attName in perAtt) {
        const keys = perAtt[attName];
        if (!keys.length) continue;
        const att = skin.attachments[slot.data.index]?.get(attName);
        if (!att || att.kind !== 'mesh' || att !== skeleton.slotAttachment(slot)) continue;
        const out = sampleDeform(keys, time);
        if (!out || out.length !== att.deformLength) continue;
        const current = slot.deform.length === att.deformLength ? slot.deform : new Array<number>(att.deformLength).fill(0);
        slot.deform = current.map((c, i) => c + (additive ? out[i] : out[i] - c) * alpha);
      }
    }
  }
}

/** Interpolates per vertex deform deltas. Returns null before the first key. */
export function sampleDeform(keys: Timeline, time: number): number[] | null {
  const i = findKeyIndex(keys, time);
  if (i < 0) return null;
  const k = keys[i];
  if (i === keys.length - 1 || k.curve === 'stepped') return k.value.slice();
  const k2 = keys[i + 1];
  const dt = k2.time - k.time;
  const u = dt > 0 ? (time - k.time) / dt : 0;
  const p = deformProgress(k, u);
  const n = Math.max(k.value.length, k2.value.length);
  const out = new Array<number>(n);
  for (let j = 0; j < n; j++) {
    const a = k.value[j] ?? 0;
    const b = k2.value[j] ?? 0;
    out[j] = a + (b - a) * p;
  }
  return out;
}

/** Events whose time lies in (from, to]. Handles looping by the caller. */
export function eventsBetween(anim: Animation, from: number, to: number) {
  return anim.events.filter((e) => e.time > from && e.time <= to);
}

/** Pose helper: setup/animation + world transforms in one call. */
export function poseSkeleton(skeleton: Skeleton, anim: Animation | null, time: number) {
  applyAnimation(skeleton, anim, time);
  skeleton.updateWorldTransform();
}

export type { Id, Key };
