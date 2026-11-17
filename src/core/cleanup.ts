/**
 * Clean Up: removes the keys that change nothing. A key in the middle of a run of keys with the same value is dead weight
 * (the value is constant across it whatever the curves are). The first and the last key of a timeline are kept: they hold the pose at
 * the ends of the animation, and a timeline that rests on the setup pose is kept too, because a layered animation (a runtime's upper track) relies on it.
 */
import type { Animation, Key } from './model';

const EPS = 1e-6;

const sameValue = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= EPS);

const isNumberKey = (k: unknown): k is Key => !!k && typeof k === 'object' && typeof (k as Key).time === 'number' && Array.isArray((k as Key).value);

/** Removes the middle key of every run of three or more equal keys. Returns how many were removed. */
export function dropFlatKeys(keys: Key[]): number {
  let removed = 0;
  for (let i = keys.length - 2; i >= 1; i--) {
    if (sameValue(keys[i - 1].value, keys[i].value) && sameValue(keys[i].value, keys[i + 1].value)) {
      keys.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

/** Cleans an animation in place; returns the number of keys removed. */
export function cleanUpAnimation(anim: Animation): number {
  let removed = 0;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      if (v.length && v.every(isNumberKey)) removed += dropFlatKeys(v as Key[]);
      else v.forEach(walk);
    } else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(anim.bones);
  walk(anim.slots);
  walk(anim.deform);
  walk(anim.transform);
  walk(anim.slider);
  walk(anim.path);
  walk(anim.physics);
  return removed;
}
