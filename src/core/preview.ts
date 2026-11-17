/**
 * The Preview window: plays animations the way a game would, one after another with a crossfade (Spine's mix duration) between them.
 * The mix table (a default time and times for pairs of animations) is editor data like the pose library: not part of the Spine export,
 * because Spine keeps it in the runtime code (`AnimationStateData.setMix`).
 * Pure functions and a small player here; the panel draws.
 */
import { applyAnimation, eventsBetween } from './animate';
import type { Animation, EventKey, Id, Project } from './model';
import type { Skeleton } from './skeleton';

export interface MixTable {
  /** Seconds the crossfade lasts for a pair that has no entry. */
  default: number;
  pairs: { from: Id; to: Id; time: number }[];
}

export const MAX_MIX = 10;

/** The crossfade time from one animation to another. */
export function mixTime(m: MixTable | undefined, from: Id, to: Id): number {
  if (!m) return 0;
  const p = m.pairs.find((x) => x.from === from && x.to === to);
  return p ? p.time : m.default;
}

const clampTime = (t: unknown) => (typeof t === 'number' && isFinite(t) ? Math.max(0, Math.min(MAX_MIX, t)) : 0);

/** A mix table from anything (a loaded file): only known animations, one entry per pair, times in range; undefined when nothing is left. */
export function cleanMixes(raw: unknown, animIds: ReadonlySet<Id>): MixTable | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { default?: unknown; pairs?: unknown };
  const out: MixTable = { default: clampTime(r.default), pairs: [] };
  const seen = new Set<string>();
  if (Array.isArray(r.pairs)) {
    for (const p of r.pairs as { from?: unknown; to?: unknown; time?: unknown }[]) {
      if (!p || typeof p.from !== 'string' || typeof p.to !== 'string' || !animIds.has(p.from) || !animIds.has(p.to)) continue;
      const key = `${p.from}\u0000${p.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.pairs.push({ from: p.from, to: p.to, time: clampTime(p.time) });
    }
  }
  return out.default === 0 && !out.pairs.length ? undefined : out;
}

/** The table with the time of one pair set; a time equal to the default removes the entry. */
export function withMix(m: MixTable | undefined, from: Id, to: Id, time: number): MixTable {
  const base: MixTable = m ? { default: m.default, pairs: m.pairs.filter((p) => !(p.from === from && p.to === to)) } : { default: 0, pairs: [] };
  const t = clampTime(time);
  if (t !== base.default) base.pairs.push({ from, to, time: t });
  return base;
}

export function withDefaultMix(m: MixTable | undefined, time: number): MixTable {
  const t = clampTime(time);
  const base: MixTable = m ? { default: t, pairs: m.pairs.filter((p) => p.time !== t) } : { default: t, pairs: [] };
  return base;
}

/** The table without the entries of an animation (it was deleted). */
export function withoutAnimation(m: MixTable | undefined, id: Id): MixTable | undefined {
  if (!m) return m;
  const pairs = m.pairs.filter((p) => p.from !== id && p.to !== id);
  return pairs.length === m.pairs.length ? m : { default: m.default, pairs };
}

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * Poses the bones as `to` at `toTime` crossfaded with `from` at `fromTime` (alpha 0 = all `from`, 1 = all `to`); slots, deform and constraints
 * follow `to`. Rotation takes the short way round, as the Spine runtime does. Does not compute world transforms.
 */
export function poseMixed(sk: Skeleton, from: { anim: Animation | null; time: number } | null, to: { anim: Animation | null; time: number }, alpha: number) {
  if (!from || alpha >= 1) {
    applyAnimation(sk, to.anim, to.time);
    return;
  }
  applyAnimation(sk, from.anim, from.time);
  const was = sk.bones.map((b) => [b.x, b.y, b.rotation, b.scaleX, b.scaleY, b.shearX, b.shearY]);
  applyAnimation(sk, to.anim, to.time);
  const a = Math.max(0, alpha);
  sk.bones.forEach((b, i) => {
    const f = was[i];
    b.x = f[0] + (b.x - f[0]) * a;
    b.y = f[1] + (b.y - f[1]) * a;
    b.rotation = f[2] + wrap180(b.rotation - f[2]) * a;
    b.scaleX = f[3] + (b.scaleX - f[3]) * a;
    b.scaleY = f[4] + (b.scaleY - f[4]) * a;
    b.shearX = f[5] + (b.shearX - f[5]) * a;
    b.shearY = f[6] + (b.shearY - f[6]) * a;
  });
}

/** Plays one animation at a time and crossfades to the next. */
export class PreviewPlayer {
  anim: Animation | null = null;
  time = 0;
  loop = true;
  speed = 1;
  playing = true;
  private from: { anim: Animation | null; time: number } | null = null;
  private mixLeft = 0;
  private mixLength = 0;

  /** Starts `next` (null = the setup pose); the crossfade lasts the time the table says for the pair. */
  play(next: Animation | null, mixes?: MixTable) {
    const t = this.anim && next && this.anim.id !== next.id ? mixTime(mixes, this.anim.id, next.id) : 0;
    this.from = t > 0 ? { anim: this.anim, time: this.time } : null;
    this.mixLength = this.mixLeft = t;
    this.anim = next;
    this.time = 0;
  }

  /** How far the crossfade is (1 = finished or none). */
  get alpha(): number {
    return this.mixLength > 0 && this.from ? 1 - this.mixLeft / this.mixLength : 1;
  }

  /** Moves time forward by `dt` real seconds; returns the events that fired. */
  advance(dt: number): EventKey[] {
    if (!this.playing) return [];
    const step = dt * this.speed;
    if (this.from) {
      this.from.time += step;
      this.mixLeft -= dt;
      if (this.mixLeft <= 0) this.from = null;
    }
    const a = this.anim;
    if (!a) return [];
    const last = this.time;
    const next = last + step;
    const fired: EventKey[] = [];
    if (a.duration <= 0) {
      this.time = 0;
      return fired;
    }
    if (next > a.duration) {
      fired.push(...eventsBetween(a, last, a.duration));
      if (this.loop) {
        this.time = next % a.duration;
        fired.push(...eventsBetween(a, -1, this.time));
      } else this.time = a.duration;
    } else {
      this.time = next;
      fired.push(...eventsBetween(a, last, next));
    }
    return fired;
  }

  /** Poses the skeleton for the current moment. */
  pose(sk: Skeleton) {
    poseMixed(sk, this.from, { anim: this.anim, time: this.time }, this.alpha);
  }
}

/** The sound of an event is looked up by the file name without folders and extension: "sfx/step.ogg" and "step" are the same sound. */
export function soundKey(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? '';
  return name.replace(/\.[^.]+$/, '').toLowerCase();
}

export function repairMixes(project: Project): boolean {
  const ids = new Set(project.skeleton.animations.map((a) => a.id));
  const clean = cleanMixes(project.mixes, ids);
  const changed = JSON.stringify(clean) !== JSON.stringify(project.mixes);
  if (clean) project.mixes = clean;
  else delete project.mixes;
  return changed;
}
