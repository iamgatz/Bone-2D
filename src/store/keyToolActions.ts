/** Favor and Scale time on the selected keys (see core/keytools.ts). One step of the history each. */
import { KEY_EPS } from '@/core/edit';
import { favorKeys, neutralOf, scaledTimes } from '@/core/keytools';
import type { FavorMode } from '@/core/keytools';
import { decodeKey, encodeKey, resolveKeys } from '@/core/keyrefs';
import type { KeyRef } from '@/core/keyrefs';
import { currentAnimation } from './actions';
import { docStore } from './doc';
import { toast, uiStore } from './ui';

type TimeKey = { time: number; value?: number[] };

/** The selected keys, as refs that resolve in the animation. */
function selectedRefs(): KeyRef[] {
  return uiStore.get().selectedKeys.map(decodeKey);
}

/** Moves the values of the selected keys toward their neighbours (or the setup pose). Returns how many keys changed. */
export function favorSelectedKeys(mode: FavorMode, amount: number): number {
  const anim = currentAnimation();
  const refs = selectedRefs();
  if (!anim || !refs.length) {
    toast('Select keys in the timeline first');
    return 0;
  }
  let changed = 0;
  docStore.update('Favor keys', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    const groups = new Map<TimeKey[], { ref: KeyRef; at: number[] }>();
    for (const ref of refs) {
      if (ref.kind === 'deform' || ref.kind === 'sequence' || ref.prop === 'reset' || ref.prop === 'attachment') continue;
      const keys = resolveKeys(a, ref) as TimeKey[] | undefined;
      const i = keys?.findIndex((k) => Math.abs(k.time - ref.time) <= KEY_EPS) ?? -1;
      if (!keys || i < 0) continue;
      const g = groups.get(keys) ?? { ref, at: [] };
      g.at.push(i);
      groups.set(keys, g);
    }
    for (const [keys, { ref, at }] of groups) {
      const channels = keys[0]?.value?.length ?? 0;
      changed += favorKeys(keys, at, mode, amount, mode === 'neutral' ? neutralOf(ref.kind, ref.prop, channels) : undefined);
    }
  });
  if (!changed) toast(mode === 'neutral' ? 'Nothing to move: this works on bone keys' : 'Nothing to move: a key needs a neighbour on that side', 'info');
  return changed;
}

/** Stretches the times of the selected keys around the earliest one. Returns how many keys moved (0 when the result would cross other keys). */
export function scaleSelectedKeyTimes(factor: number): number {
  const anim = currentAnimation();
  const refs = selectedRefs();
  if (!anim || !refs.length) {
    toast('Select keys in the timeline first');
    return 0;
  }
  const pivot = Math.min(...refs.map((r) => r.time));
  const fps = docStore.get().skeleton.fps;
  let moved = 0;
  let refused = false;
  const next: KeyRef[] = [];
  docStore.update('Scale key times', (d) => {
    const a = d.skeleton.animations.find((x) => x.id === anim.id);
    if (!a) return;
    const groups = new Map<TimeKey[], { ref: KeyRef; at: number[] }>();
    for (const ref of refs) {
      const keys = resolveKeys(a, ref) as TimeKey[] | undefined;
      const i = keys?.findIndex((k) => Math.abs(k.time - ref.time) <= KEY_EPS) ?? -1;
      if (!keys || i < 0) continue;
      const g = groups.get(keys) ?? { ref, at: [] };
      if (!g.at.includes(i)) g.at.push(i);
      groups.set(keys, g);
    }
    // every timeline has to work out, or nothing moves
    const plans = [...groups].map(([keys, g]) => ({ keys, ref: g.ref, at: g.at, times: scaledTimes(keys, g.at, factor, pivot, fps) }));
    if (plans.some((p) => !p.times)) {
      refused = true;
      return;
    }
    for (const { keys, ref, at, times } of plans) {
      at.forEach((i, n) => {
        if (Math.abs(keys[i].time - times![n]) > 1e-9) moved++;
        keys[i].time = times![n];
        next.push({ ...ref, time: times![n] });
      });
    }
    const last = Math.max(0, ...plans.flatMap((p) => p.keys.map((k) => k.time)));
    if (last > a.duration) a.duration = last;
  });
  if (refused) {
    toast('The keys would meet another key or go below 0: scale less, or select more keys', 'info');
    return 0;
  }
  uiStore.patch({ selectedKeys: next.map(encodeKey) });
  return moved;
}
