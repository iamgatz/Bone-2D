import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newAnimation } from '../src/core/model';
import { startPlaybackLoop } from '../src/editor/playback';
import { docStore } from '../src/store/doc';
import { uiStore } from '../src/store/ui';

/** Deterministic requestAnimationFrame: tests advance time by hand. */
let queue: ((t: number) => void)[] = [];
let clock = 1000;
const step = (ms: number) => {
  clock += ms;
  const run = queue;
  queue = [];
  for (const cb of run) cb(clock);
};

describe('playback loop', () => {
  let stop: () => void;
  let animId = '';

  beforeEach(() => {
    queue = [];
    clock = 1000;
    (globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (cb: (t: number) => void) => queue.push(cb);
    (globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = () => {
      queue = [];
    };
    (globalThis as unknown as { performance: { now: () => number } }).performance = { now: () => clock };
    const anim = newAnimation('a', 1);
    animId = anim.id;
    docStore.update('add', (d) => void d.skeleton.animations.push(anim));
    uiStore.patch({ animationId: animId, time: 0, playing: true, loop: true, speed: 1, mode: 'animate' });
    stop = startPlaybackLoop();
  });
  afterEach(() => stop());

  it('advances the playhead in real time', () => {
    for (let i = 0; i < 30; i++) step(16);
    expect(uiStore.get().time).toBeGreaterThan(0.45);
    expect(uiStore.get().time).toBeLessThan(0.5);
  });

  it('honours speed', () => {
    uiStore.patch({ speed: 2 });
    for (let i = 0; i < 20; i++) step(20); // 0.4 s of wall time at 2x
    expect(uiStore.get().time).toBeCloseTo(0.8, 2);
  });

  it('loops at the end of the animation', () => {
    for (let i = 0; i < 80; i++) step(16); // 1.28s of play for a 1s animation
    const t = uiStore.get().time;
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(0.5);
    expect(uiStore.get().playing).toBe(true);
  });

  it('stops at the end when not looping', () => {
    uiStore.patch({ loop: false });
    for (let i = 0; i < 80; i++) step(16);
    expect(uiStore.get().playing).toBe(false);
    expect(uiStore.get().time).toBe(1);
  });

  it('does nothing while paused', () => {
    uiStore.patch({ playing: false });
    for (let i = 0; i < 10; i++) step(16);
    expect(uiStore.get().time).toBe(0);
  });
});
