/** Pasting copied keys onto the bone that is selected now (the swing of one arm onto the other). */
import { beforeEach, describe, expect, it } from 'vitest';
import { retargetClip } from '../src/core/keyrefs';
import { validateProject } from '../src/core/validate';
import * as A from '../src/store/actions';
import { docStore } from '../src/store/doc';
import { emptySelection, uiStore } from '../src/store/ui';
import { buildFixture } from './fixture';

const bone = (target: string) => ({ kind: 'bone' as const, target, prop: 'rotate', time: 0 });
const slot = (target: string) => ({ kind: 'slot' as const, target, prop: 'rgba', time: 0 });

describe('retargetClip', () => {
  it('moves the keys of one bone onto the selected bone, and copies them for several', () => {
    expect(retargetClip([bone('a'), bone('a')], ['b'], null).map((c) => c.target)).toEqual(['b', 'b']);
    expect(retargetClip([bone('a')], ['b', 'c'], null).map((c) => c.target)).toEqual(['b', 'c']);
  });

  it('keeps them where they are when the same bone is selected, nothing is, or the copy came from several bones', () => {
    expect(retargetClip([bone('a')], ['a'], null).map((c) => c.target)).toEqual(['a']);
    expect(retargetClip([bone('a')], [], null).map((c) => c.target)).toEqual(['a']);
    expect(retargetClip([bone('a'), bone('b')], ['c'], null).map((c) => c.target)).toEqual(['a', 'b']);
  });

  it('does the same for the keys of one slot', () => {
    expect(retargetClip([slot('s1')], [], 's2').map((c) => c.target)).toEqual(['s2']);
    expect(retargetClip([slot('s1')], [], 's1').map((c) => c.target)).toEqual(['s1']);
  });
});

describe('pasting keys', () => {
  const doc = () => docStore.get().skeleton;
  beforeEach(() => {
    const f = buildFixture();
    docStore.replace(f.project);
    uiStore.patch({ mode: 'animate', tool: 'select', animationId: f.project.skeleton.animations[0].id, skinId: null, time: 0, selection: emptySelection, overrides: {}, autoKey: true, playing: false });
  });

  it('puts the keys of one arm on the other bone, shifted to the playhead', () => {
    const [, , , upper, lower] = doc().bones;
    A.selectBone(upper.id);
    A.setTime(0.2);
    A.setBonePose([{ id: upper.id, props: { rotation: 41 } }]);
    A.setTime(0.6);
    A.setBonePose([{ id: upper.id, props: { rotation: -12 } }]);
    const anim = () => A.currentAnimation()!;
    const mine = anim().bones[upper.id].rotate!.filter((k) => k.time >= 0.19 && k.time <= 0.61);
    A.copyKeys(mine.map((k) => ({ kind: 'bone' as const, target: upper.id, prop: 'rotate', time: k.time })));
    A.selectBone(lower.id);
    A.setTime(1);
    const pasted = A.pasteKeys(1);
    expect(pasted.length).toBe(mine.length);
    expect(pasted.every((p) => p.target === lower.id)).toBe(true);
    const copy = anim().bones[lower.id].rotate!;
    expect(copy.map((k) => k.value[0])).toEqual(expect.arrayContaining(mine.map((k) => k.value[0]))); // relative to the setup pose, so the same swing
    expect(Math.min(...pasted.map((p) => p.time))).toBeCloseTo(1, 4);
    expect(validateProject(docStore.get())).toEqual([]);
    docStore.undo();
    expect(anim().bones[lower.id]?.rotate?.some((k) => k.value[0] === mine[0].value[0]) ?? false).toBe(false);
  });

  it('still pastes onto the same bone when it is the one selected', () => {
    const upper = doc().bones[3];
    A.selectBone(upper.id);
    A.setTime(0.3);
    A.setBonePose([{ id: upper.id, props: { rotation: 20 } }]);
    A.copyKeys([{ kind: 'bone', target: upper.id, prop: 'rotate', time: 0.3 }]);
    const pasted = A.pasteKeys(0.9);
    expect(pasted.map((p) => p.target)).toEqual([upper.id]);
  });

  it('two-colour keys pasted onto a slot without a dark colour become plain colour keys, curve included', () => {
    const [from, to] = doc().slots;
    const anim = A.currentAnimation()!;
    docStore.update('prepare', (d) => {
      d.skeleton.slots.find((x) => x.id === from.id)!.dark = [0, 0, 0];
      d.skeleton.slots.find((x) => x.id === to.id)!.dark = null;
      const a = d.skeleton.animations.find((x) => x.id === anim.id)!;
      const curve = Array.from({ length: 7 }, () => [1 / 3, 1 / 3, 2 / 3, 2 / 3]).flat();
      (a.slots[from.id] ??= {}).rgba2 = [
        { time: 0.1, value: [1, 1, 1, 1, 0, 0, 0], curve },
        { time: 0.5, value: [0.5, 0.5, 0.5, 1, 0.1, 0.1, 0.1] },
      ];
    });
    A.copyKeys([{ kind: 'slot', target: from.id, prop: 'rgba2', time: 0.1 }]);
    A.selectSlot(to.id);
    const pasted = A.pasteKeys(0.3);
    expect(pasted.map((p) => p.prop)).toEqual(['rgba']);
    const key = A.currentAnimation()!.slots[to.id].rgba![0];
    expect(key.value.length).toBe(4);
    expect(Array.isArray(key.curve) ? key.curve.length : 16).toBe(16);
    expect(validateProject(docStore.get())).toEqual([]);
  });
});
