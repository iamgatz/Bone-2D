/** Addressing keyframes inside an animation (used by timeline selection, copy/paste, move, delete). */
import { KEY_EPS, sortKeys } from './edit';
import type { Animation, Id } from './model';

export type KeyKind = 'bone' | 'slot' | 'ik' | 'deform' | 'drawOrder' | 'event' | 'slider' | 'transform' | 'path' | 'physics';

export interface KeyRef {
  kind: KeyKind;
  /** bone id / slot id / constraint id / slot id (deform) / '' */
  target: Id;
  /** timeline name: rotate|translate|scale|shear|attachment|rgba|'' ; deform: "skinId\u0001attachment" */
  prop: string;
  time: number;
}

export function encodeKey(r: KeyRef): string {
  return JSON.stringify([r.kind, r.target, r.prop, Math.round(r.time * 10000) / 10000]);
}

export function decodeKey(s: string): KeyRef {
  const [kind, target, prop, time] = JSON.parse(s) as [KeyKind, Id, string, number];
  return { kind, target, prop, time };
}

type AnyKeys = { time: number }[];

/** The live key array a ref points to (creating nothing). */
export function resolveKeys(anim: Animation, ref: Pick<KeyRef, 'kind' | 'target' | 'prop'>): AnyKeys | undefined {
  switch (ref.kind) {
    case 'bone':
      return (anim.bones[ref.target] as Record<string, AnyKeys | undefined> | undefined)?.[ref.prop];
    case 'slot':
      return (anim.slots[ref.target] as Record<string, AnyKeys | undefined> | undefined)?.[ref.prop];
    case 'ik':
      return anim.ik[ref.target];
    case 'transform':
      return anim.transform?.[ref.target];
    case 'slider':
      return (anim.slider?.[ref.target] as Record<string, AnyKeys | undefined> | undefined)?.[ref.prop];
    case 'path':
      return (anim.path?.[ref.target] as Record<string, AnyKeys | undefined> | undefined)?.[ref.prop];
    case 'deform': {
      const [skinId, att] = ref.prop.split('\u0001');
      return anim.deform[skinId]?.[ref.target]?.[att];
    }
    case 'physics':
      return (anim.physics?.[ref.target] as Record<string, AnyKeys | undefined> | undefined)?.[ref.prop];
    case 'drawOrder':
      return anim.drawOrder;
    case 'event':
      return anim.events;
  }
}

export function deformProp(skinId: Id, attachment: string): string {
  return `${skinId}\u0001${attachment}`;
}

export function removeKeys(anim: Animation, refs: KeyRef[]) {
  for (const ref of refs) {
    const keys = resolveKeys(anim, ref);
    if (!keys) continue;
    const i = keys.findIndex((k) => Math.abs(k.time - ref.time) <= KEY_EPS);
    if (i >= 0) keys.splice(i, 1);
  }
  pruneEmpty(anim);
}

/** Shifts the referenced keys by dt (clamped to >= 0). Keys landing on an unmoved key replace it. Returns the refs after the move. */
export function moveKeys(anim: Animation, refs: KeyRef[], dt: number, ripple = false): KeyRef[] {
  const groups = new Map<AnyKeys, { kind: KeyKind; times: number[]; moved: Map<number, number> }>();
  for (const ref of refs) {
    const keys = resolveKeys(anim, ref);
    if (!keys) continue;
    const g = groups.get(keys) ?? { kind: ref.kind, times: [], moved: new Map<number, number>() };
    g.times.push(ref.time);
    groups.set(keys, g);
  }
  let minTime = Infinity;
  for (const r of refs) minTime = Math.min(minTime, r.time);
  const shift = Math.max(dt, -minTime);
  for (const [keys, g] of groups) {
    const moved = new Set<{ time: number }>();
    // ripple: the keys after the last moved one of this timeline travel with them (Spine's Shift)
    const last = Math.max(...g.times);
    const later = ripple ? keys.filter((k) => k.time > last + KEY_EPS) : [];
    for (const k of keys) {
      const from = g.times.find((t) => Math.abs(t - k.time) <= KEY_EPS);
      if (from !== undefined) {
        k.time = Math.max(0, k.time + shift);
        g.moved.set(from, k.time);
        moved.add(k);
      }
    }
    for (const key of later) {
      key.time = Math.max(0, key.time + shift);
      moved.add(key);
    }
    // a key that lands on an unmoved key replaces it (event keys may legitimately share a time)
    if (g.kind !== 'event') {
      for (let i = keys.length - 1; i >= 0; i--) {
        const k = keys[i];
        if (!moved.has(k) && [...moved].some((m) => Math.abs(m.time - k.time) <= KEY_EPS)) keys.splice(i, 1);
      }
    }
    sortKeys(keys);
  }
  // one result per input ref, in the input order; a ref whose key was not found is returned unchanged
  return refs.map((ref) => {
    const keys = resolveKeys(anim, ref);
    const to = keys ? groups.get(keys)?.moved.get(ref.time) : undefined;
    return { ...ref, time: to ?? ref.time };
  });
}

/** Removes empty timelines so the dopesheet and export stay clean. */
export function pruneEmpty(anim: Animation) {
  for (const id in anim.bones) {
    const t = anim.bones[id] as Record<string, AnyKeys | undefined>;
    for (const p of Object.keys(t)) if (!t[p] || t[p]!.length === 0) delete t[p];
    if (Object.keys(t).length === 0) delete anim.bones[id];
  }
  for (const id in anim.slots) {
    const t = anim.slots[id] as Record<string, AnyKeys | undefined>;
    for (const p of Object.keys(t)) if (!t[p] || t[p]!.length === 0) delete t[p];
    if (Object.keys(t).length === 0) delete anim.slots[id];
  }
  for (const id in anim.ik) if (anim.ik[id].length === 0) delete anim.ik[id];
  for (const id in anim.transform ?? {}) if (anim.transform[id].length === 0) delete anim.transform[id];
  for (const id in anim.slider ?? {}) {
    const t = anim.slider[id] as Record<string, AnyKeys | undefined>;
    for (const p of Object.keys(t)) if (!t[p] || t[p]!.length === 0) delete t[p];
    if (Object.keys(t).length === 0) delete anim.slider[id];
  }
  for (const id in anim.path ?? {}) {
    const t = anim.path[id] as Record<string, AnyKeys | undefined>;
    for (const p of Object.keys(t)) if (!t[p] || t[p]!.length === 0) delete t[p];
    if (Object.keys(t).length === 0) delete anim.path[id];
  }
  for (const id in anim.physics ?? {}) {
    const t = anim.physics[id] as Record<string, AnyKeys | undefined>;
    for (const p of Object.keys(t)) if (!t[p] || t[p]!.length === 0) delete t[p];
    if (Object.keys(t).length === 0) delete anim.physics[id];
  }
  for (const skin in anim.deform) {
    for (const slot in anim.deform[skin]) {
      for (const att in anim.deform[skin][slot]) if (anim.deform[skin][slot][att].length === 0) delete anim.deform[skin][slot][att];
      if (Object.keys(anim.deform[skin][slot]).length === 0) delete anim.deform[skin][slot];
    }
    if (Object.keys(anim.deform[skin]).length === 0) delete anim.deform[skin];
  }
}
