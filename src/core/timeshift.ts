/**
 * Insert time / Delete time: the whole animation is cut at the playhead and pulled apart or pushed together. Every key of every timeline
 * (bones, slots, constraints, deform, sequences, draw order, events), the markers and the play range after the cut move by the same amount.
 * Making a pause in the middle of a walk, or closing the hole a deleted pose left, is one step instead of selecting every key and shifting them.
 * Asked for by animators of other editors (Live2D: "insert and delete empty keyframes on the timeline, later keys shifting to fill or close the gap").
 * No DOM.
 */
import type { Animation } from './model';

const EPS = 1e-4;

/** Every list of keys of the animation (arrays of objects with a numeric `time`), found the way Clean Up and the key counter find them. */
function keyLists(anim: Animation): { time: number }[][] {
  const lists: { time: number }[][] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object' && v[0] !== null && typeof (v[0] as { time?: unknown }).time === 'number') lists.push(v as { time: number }[]);
      else v.forEach(walk);
    } else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(anim.bones);
  walk(anim.slots);
  walk(anim.deform);
  walk(anim.sequence);
  walk(anim.ik);
  walk(anim.transform);
  walk(anim.slider);
  walk(anim.path);
  walk(anim.physics);
  walk(anim.drawOrder);
  walk(anim.drawOrderFolder);
  walk(anim.events);
  return lists;
}

const round = (t: number) => Math.round(t * 1e6) / 1e6;

export interface TimeShift {
  /** How many keys moved, were removed, or markers moved. */
  moved: number;
  removed: number;
  /** The animation got this long (or short). */
  duration: number;
}

/**
 * Inserts `seconds` of empty time at `at`: everything at `at` or later moves `seconds` later and the animation grows by as much.
 * Keys and markers before `at` stay. Returns what changed.
 */
export function insertTime(anim: Animation, at: number, seconds: number): TimeShift {
  let moved = 0;
  if (!(seconds > 0) || !Number.isFinite(at) || at < 0) return { moved, removed: 0, duration: anim.duration };
  for (const keys of keyLists(anim)) {
    for (const k of keys) {
      if (k.time >= at - EPS) {
        k.time = round(k.time + seconds);
        moved++;
      }
    }
  }
  for (const m of anim.markers ?? []) {
    if (m.time >= at - EPS) {
      m.time = round(m.time + seconds);
      moved++;
    }
  }
  const range = anim.play?.range;
  if (range) {
    // a play range that spans the cut gets longer; one that starts after it moves
    anim.play!.range = [range[0] >= at - EPS ? round(range[0] + seconds) : range[0], range[1] >= at - EPS ? round(range[1] + seconds) : range[1]];
  }
  anim.duration = round(anim.duration + seconds);
  return { moved, removed: 0, duration: anim.duration };
}

/**
 * Deletes `seconds` of time from `at`: the keys inside [at, at + seconds) are removed, the later ones move `seconds` earlier, and the
 * animation gets shorter by as much (never below `minDuration`, so a last key is never cut off). Markers inside the span collapse onto `at`.
 * The span is cut to what the animation has after `at`.
 */
export function deleteTime(anim: Animation, at: number, seconds: number, minDuration: number): TimeShift {
  if (!(seconds > 0) || !Number.isFinite(at) || at < 0 || at >= anim.duration) return { moved: 0, removed: 0, duration: anim.duration };
  const span = Math.min(seconds, anim.duration - at);
  const end = at + span;
  let moved = 0;
  let removed = 0;
  for (const keys of keyLists(anim)) {
    for (let i = keys.length - 1; i >= 0; i--) {
      const t = keys[i].time;
      if (t >= at - EPS && t < end - EPS) {
        keys.splice(i, 1);
        removed++;
      } else if (t >= end - EPS) {
        keys[i].time = round(Math.max(at, t - span));
        moved++;
      }
    }
  }
  for (const m of anim.markers ?? []) {
    if (m.time >= end - EPS) {
      m.time = round(m.time - span);
      moved++;
    } else if (m.time > at) {
      m.time = at;
      moved++;
    }
  }
  const range = anim.play?.range;
  if (range) {
    const pull = (t: number) => (t >= end - EPS ? round(t - span) : t > at ? at : t);
    const next: [number, number] = [pull(range[0]), pull(range[1])];
    anim.play!.range = next[1] - next[0] > EPS ? next : null;
  }
  anim.duration = round(Math.max(minDuration, anim.duration - span));
  return { moved, removed, duration: anim.duration };
}
