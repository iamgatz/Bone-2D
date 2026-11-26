/**
 * A character in a game: the skeleton of an export, the animation it plays (with a mix from the one before), its events and the places
 * of its bones. No DOM in here; `index.ts` loads the pictures and draws.
 */
import { applyAnimation, applyPhysicsResets, eventsBetween } from '@/core/animate';
import type { Animation, SkeletonDoc } from '@/core/model';
import { advancePlayback, playOf, playSpan } from '@/core/playback';
import type { PlayMode } from '@/core/playback';
import { composeSkins, compileSkeleton, createSkeleton } from '@/core/skeleton';
import { capturePose, mixPose } from './mix';
import type { Pose } from './mix';

/** The file the editor saves for a game. */
export interface CharacterData {
  bone2d: 1;
  name: string;
  skeleton: SkeletonDoc;
  /** Picture name -> data URI, or an address next to the file. */
  images: Record<string, string>;
  /** Smooth pictures (false: sharp pixels). */
  smooth: boolean;
}

export interface PlayOptions {
  /** Start again at the end (default: what the animation says in the editor). */
  loop?: boolean;
  /** Seconds over which the pose goes over from what was shown to the new animation (default 0.2, none for the first). */
  mix?: number;
  /** 1 = as made, 2 = twice as fast. */
  speed?: number;
}

/** An event key of the animation that was passed. */
export interface GameEvent {
  name: string;
  int: number;
  float: number;
  string: string;
  animation: string;
}

export interface BonePlace {
  x: number;
  y: number;
  /** Degrees, counter-clockwise from the x axis. */
  rotation: number;
  length: number;
}

interface Track {
  animation: Animation;
  time: number;
  dir: 1 | -1;
  mode: PlayMode;
  speed: number;
  /** Nothing of it has been shown yet: its first moment still has to give its events. */
  fresh: boolean;
  done: boolean;
}

const DEFAULT_MIX = 0.2;

export function createCharacter(data: CharacterData) {
  if (data?.bone2d !== 1) throw new Error('Not a Bone 2D character file');
  const doc = data.skeleton;
  const compiled = compileSkeleton(doc);
  const skeleton = createSkeleton(compiled, null);

  let track: Track | null = null;
  /** What the pose is mixed from: an animation that plays on, or a pose that stands still. */
  let before: Track | Pose | null = null;
  let mixed = 0;
  let mixTime = 0;
  let queue: { name: string; options: PlayOptions }[] = [];
  /** The next pose starts the physics from rest. */
  let rest = true;
  const held = new Map<string, [number, number]>();
  const shown = new Map<string, string | null>();

  const animationNamed = (name: string) => {
    const found = doc.animations.find((a) => a.name === name);
    if (!found) throw new Error(`No animation "${name}". There are: ${doc.animations.map((a) => a.name).join(', ')}`);
    return found;
  };
  const boneNamed = (name: string) => skeleton.bones.find((b) => b.data.name === name);

  const events = (t: Track, from: number, to: number) => {
    for (const key of eventsBetween(t.animation, from, to)) {
      const def = doc.events.find((e) => e.id === key.event);
      if (!def) continue;
      character.onEvent?.({
        name: def.name,
        int: key.int ?? def.int,
        float: key.float ?? def.float,
        string: key.string ?? def.string,
        animation: t.animation.name,
      });
    }
  };

  /** Moves a track on by `dt` seconds; with `tell`, the events it passes are given out. */
  const advance = (t: Track, dt: number, tell: boolean) => {
    const [lo, hi] = playSpan(t.animation.duration, t.mode.range);
    if (t.fresh && tell) events(t, t.time - 1e-9, t.time);
    t.fresh = false;
    if (t.done) return;
    const from = t.time;
    const dir = t.dir;
    const next = advancePlayback({ time: t.time, dir: t.dir }, dt * t.speed, t.animation.duration, t.mode);
    t.time = next.time;
    t.dir = next.dir;
    t.done = next.stopped;
    if (!tell || t.dir !== dir || dir < 0) return;
    if (next.time >= from) events(t, from, next.time);
    else {
      events(t, from, hi);
      events(t, lo - 1e-9, next.time);
    }
  };

  const apply = (t: Track | null) => {
    applyAnimation(skeleton, t?.animation ?? null, t?.time ?? 0);
    for (const [slot, attachment] of shown) {
      const s = skeleton.slots.find((x) => x.data.name === slot);
      if (s) s.attachmentName = attachment;
    }
  };

  /** What the animations ask for right now, before the constraints have their say. */
  const compose = () => {
    if (!before) return apply(track);
    let from: Pose;
    if ('animation' in before) {
      apply(before);
      from = capturePose(skeleton);
    } else from = before;
    apply(track);
    mixPose(skeleton, from, mixed / mixTime);
  };

  const pose = (dt: number, previousTime: number) => {
    compose();
    for (const [name, [x, y]] of held) {
      const bone = boneNamed(name);
      if (!bone) continue;
      // the place in the frame of the parent, as the parent stood a moment ago
      [bone.x, bone.y] = bone.parent
        ? bone.parent.worldToLocal(x, y)
        : [(x - skeleton.x) / skeleton.scaleX, (y - skeleton.y) / skeleton.scaleY];
    }
    if (rest) {
      rest = false;
      skeleton.updateWorldTransform('reset');
      return;
    }
    if (track) {
      const now = track.time;
      if (now >= previousTime) applyPhysicsResets(skeleton, track.animation, previousTime, now);
      else {
        applyPhysicsResets(skeleton, track.animation, previousTime, track.animation.duration);
        applyPhysicsResets(skeleton, track.animation, -1, now);
      }
    }
    skeleton.update(dt);
    skeleton.updateWorldTransform('update');
  };

  const start = (name: string, options: PlayOptions) => {
    const animation = animationNamed(name);
    const settings = playOf(animation);
    const mode = { ...settings, loop: options.loop ?? settings.loop };
    const mix = Math.max(0, options.mix ?? DEFAULT_MIX);
    if (track && mix > 0) {
      // in the middle of a mix the pose on screen is the starting point; otherwise the old animation plays on while it fades
      if (before) {
        // asked for again: after an update the skeleton holds what the constraints made of it
        compose();
        before = capturePose(skeleton);
      } else before = track;
      mixed = 0;
      mixTime = mix;
    } else before = null;
    track = {
      animation,
      time: playSpan(animation.duration, mode.range)[0],
      dir: 1,
      mode,
      speed: options.speed ?? 1,
      fresh: true,
      done: false,
    };
  };

  const character = {
    /** The names of the animations and of the skins in the file. */
    animations: doc.animations.map((a) => a.name),
    skins: doc.skins.slice(1).map((s) => s.name),
    data,
    /** The pictures, by name: filled by `loadCharacter`. */
    images: new Map<string, CanvasImageSource>(),
    /** The posed skeleton, for what the functions here do not cover. */
    skeleton,
    onEvent: null as ((event: GameEvent) => void) | null,
    /** Called once when an animation that does not loop reaches its end. */
    onEnd: null as ((animation: string) => void) | null,

    /** Where the feet are (the origin of the skeleton), y up. */
    get x() {
      return skeleton.x;
    },
    set x(v: number) {
      skeleton.x = v;
    },
    get y() {
      return skeleton.y;
    },
    set y(v: number) {
      skeleton.y = v;
    },
    /** 1 = the size it was made. A negative number mirrors it, to face the other way. */
    get scaleX() {
      return skeleton.scaleX;
    },
    set scaleX(v: number) {
      skeleton.scaleX = v;
    },
    get scaleY() {
      return skeleton.scaleY;
    },
    set scaleY(v: number) {
      skeleton.scaleY = v;
    },

    /** The animation that plays, null before the first one. */
    get animation() {
      return track?.animation.name ?? null;
    },
    /** Seconds into it. */
    get time() {
      return track?.time ?? 0;
    },

    /** Plays an animation, now. Whatever waited in the queue is forgotten. */
    play(name: string, options: PlayOptions = {}) {
      queue = [];
      start(name, options);
    },
    /** Plays an animation when the current one reaches its end (a looping one: at the end of this round). */
    playNext(name: string, options: PlayOptions = {}) {
      animationNamed(name);
      if (!track) start(name, options);
      else queue.push({ name, options });
    },

    /** Moves time on by `seconds` and poses the skeleton. Call it once a frame. */
    update(seconds: number) {
      const dt = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
      const previousTime = track?.time ?? 0;
      let ended: string | null = null;
      if (track) {
        const wasDone = track.done;
        const was = track.time;
        advance(track, dt, true);
        const wrapped = track.mode.loop && !track.mode.pingPong && track.time < was;
        if (queue.length && (track.done || wrapped)) {
          const next = queue.shift()!;
          if (track.done && !wasDone) ended = track.animation.name;
          start(next.name, next.options);
          advance(track, 0, true);
        } else if (track.done && !wasDone) ended = track.animation.name;
      }
      if (before) {
        if ('animation' in before) advance(before, dt, false);
        mixed += dt;
        if (mixed >= mixTime) before = null;
      }
      pose(dt, previousTime);
      if (ended) character.onEnd?.(ended);
    },

    /** Shows one skin, several worn together, or (null) the default one. */
    setSkin(names: string | string[] | null) {
      const wanted = names === null ? [] : [names].flat();
      const ids = wanted.map((name) => {
        const skin = doc.skins.find((s) => s.name === name);
        if (!skin) throw new Error(`No skin "${name}". There are: ${character.skins.join(', ')}`);
        return skin.id;
      });
      skeleton.setSkin(ids.length ? composeSkins(compiled, ids) : null);
    },
    /** Puts a picture of its own into a slot (null empties it), whatever the animation says; undefined gives the slot back. */
    setAttachment(slot: string, attachment: string | null | undefined) {
      if (attachment === undefined) shown.delete(slot);
      else shown.set(slot, attachment);
    },

    /** Where a bone is, in the coordinates of the game; null when there is no bone of that name. */
    bone(name: string): BonePlace | null {
      const b = boneNamed(name);
      if (!b) return null;
      return {
        x: b.worldX,
        y: b.worldY,
        rotation: (Math.atan2(b.c, b.a) * 180) / Math.PI,
        length: Math.hypot(b.tipX - b.worldX, b.tipY - b.worldY),
      };
    },
    /** Holds a bone at a place: the target of an IK chain to aim or to reach. */
    moveBone(name: string, x: number, y: number) {
      if (!boneNamed(name)) throw new Error(`No bone "${name}"`);
      held.set(name, [x, y]);
    },
    /** Gives a held bone back to the animation. */
    releaseBone(name: string) {
      held.delete(name);
    },
    /** The box the pictures cover right now. */
    bounds(): { x: number; y: number; width: number; height: number } | null {
      const b = skeleton.getBounds();
      return b ? { x: b[0], y: b[1], width: b[2], height: b[3] } : null;
    },
    /** Lets the physics start from rest again: after the character was moved to a new place at once. */
    resetPhysics() {
      rest = true;
    },
  };
  character.update(0);
  rest = true;
  return character;
}

export type Character = ReturnType<typeof createCharacter>;
