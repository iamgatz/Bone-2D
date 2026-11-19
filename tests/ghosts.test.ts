/** Ghosting: ghosts at the keys, shifted, as a flat colour, over the pose; and the stored preferences for them. */
import { describe, expect, it } from 'vitest';
import { newAnimation } from '../src/core/model';
import type { Project } from '../src/core/model';
import { ghostsFor, keyGhostTimes, keyTimes } from '../src/editor/ghosts';
import { getScene } from '../src/editor/scene';
import { docStore } from '../src/store/doc';
import { DEFAULT_SETTINGS, readSettings } from '../src/store/settings';
import { uiStore } from '../src/store/ui';
import { buildFixture } from './fixture';

function rig() {
  const { project } = buildFixture();
  const doc = project.skeleton;
  const [b1, b2] = [doc.bones[0], doc.bones[1]];
  const anim = newAnimation('walk', 2);
  anim.bones[b1.id] = { rotate: [{ time: 0, value: [0] }, { time: 0.5, value: [30] }, { time: 1.5, value: [0] }] };
  anim.bones[b2.id] = { rotate: [{ time: 0.25, value: [0] }, { time: 1, value: [20] }] };
  doc.animations.push(anim);
  docStore.replace(project as Project);
  uiStore.patch({ mode: 'animate', animationId: anim.id, time: 0.6 });
  return { doc, anim, b1, b2 };
}

describe('keyTimes', () => {
  it('lists the distinct key times, sorted, of everything or of the given bones only', () => {
    const { anim, b1, b2 } = rig();
    expect(keyTimes(anim)).toEqual([0, 0.25, 0.5, 1, 1.5]);
    expect(keyTimes(anim, { bones: [b1.id] })).toEqual([0, 0.5, 1.5]);
    expect(keyTimes(anim, { bones: [b2.id] })).toEqual([0.25, 1]);
    expect(keyTimes(anim, { bones: [] })).toEqual([0, 0.25, 0.5, 1, 1.5]);
  });
});

describe('keyGhostTimes', () => {
  const keys = [0, 0.25, 0.5, 1, 1.5];
  it('takes the nearest keys before and after, and none on the playhead', () => {
    const g = keyGhostTimes(0.5, keys, { before: 2, after: 1, gap: 1 });
    expect(g.map((x) => [x.side, x.index, x.time])).toEqual([
      ['before', 1, 0.25],
      ['before', 2, 0],
      ['after', 1, 1],
    ]);
  });
  it('gives nothing past the ends and nothing for zero ghosts', () => {
    expect(keyGhostTimes(0, keys, { before: 3, after: 0, gap: 1 })).toEqual([]);
    expect(keyGhostTimes(2, keys, { before: 0, after: 2, gap: 1 })).toEqual([]);
  });
});

describe('ghostsFor with the new looks', () => {
  it('poses a ghost at each key, shifted away from the playhead, flat and over the pose for the x-ray', () => {
    const { anim, b1 } = rig();
    const scene = getScene();
    const cfg = { before: 1, after: 1, gap: 3, mode: 'keys' as const, offsetX: 10, offsetY: -5, style: 'xray' as const };
    const g = ghostsFor(scene, anim, 0.6, 30, cfg, true, null);
    expect(g).toHaveLength(2);
    // before the playhead the shift goes the other way
    expect(g[0].offset).toEqual([-10, 5]);
    expect(g[1].offset).toEqual([10, -5]);
    expect(g.every((x) => x.flat && x.top)).toBe(true);
    // the ghost before is posed at the key at 0.5 (30 degrees), the one after at 1 (interpolated 30 → 0)
    expect(g[0].skeleton.boneById(b1.id)!.rotation).toBeCloseTo(b1.rotation + 30, 6);
    expect(g[1].skeleton.boneById(b1.id)!.rotation).toBeCloseTo(b1.rotation + 15, 6);
  });
  it('leaves the old look as it was: pictures, no shift, under the pose', () => {
    const { anim } = rig();
    const g = ghostsFor(getScene(), anim, 0.6, 30, { before: 1, after: 1, gap: 3 }, true, null);
    expect(g.every((x) => !x.flat && !x.top && x.offset === undefined)).toBe(true);
  });
  it('uses the colours it is given, and "over the pose" for pictures', () => {
    const { anim } = rig();
    const g = ghostsFor(getScene(), anim, 0.6, 30, { before: 1, after: 1, gap: 3, top: true, colorBefore: [1, 0, 0], colorAfter: [0, 1, 0] }, true, null);
    expect(g[0].tint).toEqual([1, 0, 0, 1]);
    expect(g[1].tint).toEqual([0, 1, 0, 1]);
    expect(g.every((x) => x.top && !x.flat)).toBe(true);
  });
});

describe('preferences for ghosting', () => {
  it('keep valid values and fall back on the rest', () => {
    expect(readSettings(JSON.stringify({ onionMode: 'keys', onionStyle: 'xray', onionOffsetX: 12, onionOffsetY: -4, onionTop: true, onionColorBefore: [0, 1, 0] }))).toMatchObject({
      onionMode: 'keys',
      onionStyle: 'xray',
      onionOffsetX: 12,
      onionOffsetY: -4,
      onionTop: true,
      onionColorBefore: [0, 1, 0],
    });
    const bad = readSettings(JSON.stringify({ onionMode: 'all', onionStyle: 'glow', onionOffsetX: 'a', onionOffsetY: 1e9, onionTop: 1, onionColorAfter: [2, 0, 0] }));
    expect(bad).toEqual(DEFAULT_SETTINGS);
  });
});
