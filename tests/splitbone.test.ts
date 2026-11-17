/** Split bone: lengths, nested chain and side-by-side siblings, children follow in the nested case, one history step. */
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject, newBone } from '@/core/model';
import { splitLengths } from '@/core/split';
import { getSetupSkeleton } from '@/editor/scene';
import { docStore } from '@/store/doc';
import { splitBone } from '@/store/splitActions';
import { uiStore } from '@/store/ui';

function rig() {
  const p = emptyProject();
  p.skeleton.bones = [];
  const root = newBone({ name: 'root' });
  const arm = newBone({ name: 'arm', parent: root.id, x: 10, y: 5, rotation: 30, length: 100 });
  const hand = newBone({ name: 'hand', parent: arm.id, x: 100, length: 20 });
  const mid = newBone({ name: 'mid', parent: arm.id, x: 55, y: 7, rotation: 10, length: 10 });
  p.skeleton.bones.push(root, arm, hand, mid);
  docStore.replace(p);
  uiStore.patch({ mode: 'setup' });
  return { root, arm, hand, mid };
}
const tip = (name: string) => {
  const s = getSetupSkeleton();
  const b = s.bones.find((x) => x.data.name === name)!;
  return [b.worldX, b.worldY, b.a, b.c];
};

describe('split bone', () => {
  beforeEach(() => void rig());

  it('lengths add up: equal and Fibonacci (longest first)', () => {
    expect(splitLengths(90, 3, false)).toEqual([30, 30, 30]);
    const f = splitLengths(120, 5, true);
    expect(f.map((x) => Math.round(x * 100) / 100)).toEqual([50, 30, 20, 10, 10]);
    expect(f.reduce((s, x) => s + x, 0)).toBeCloseTo(120, 9);
  });

  it('nested: a chain along the original, same total length and direction, one undo step', () => {
    const { arm } = rig();
    const undo0 = docStore.canUndo;
    const ids = splitBone(arm.id, 4, { nested: true, fibonacci: false });
    expect(ids.length).toBe(3);
    const bones = docStore.get().skeleton.bones;
    expect(bones.find((b) => b.id === arm.id)!.length).toBeCloseTo(25, 9);
    expect(bones.find((b) => b.id === ids[0])!.parent).toBe(arm.id);
    expect(bones.find((b) => b.id === ids[1])!.parent).toBe(ids[0]);
    expect(bones.find((b) => b.id === ids[2])!.parent).toBe(ids[1]);
    // the last part starts 75 along the arm and ends at the old tip
    const armW = tip('arm');
    const last = getSetupSkeleton().boneById(ids[2])!;
    expect(last.worldX).toBeCloseTo(armW[0] + 75 * armW[2], 6);
    expect(last.worldY).toBeCloseTo(armW[1] + 75 * armW[3], 6);
    const tipLen = Math.hypot(last.worldX + last.a * 25 - (armW[0] + 100 * armW[2]), last.worldY + last.c * 25 - (armW[1] + 100 * armW[3]));
    expect(tipLen).toBeCloseTo(0, 6);
    docStore.undo();
    expect(docStore.get().skeleton.bones.length).toBe(4);
    expect(docStore.get().skeleton.bones.find((b) => b.id === arm.id)!.length).toBe(100);
    expect(docStore.canUndo).toBe(undo0);
  });

  it('nested: children move to the part they sit on and stay where they are in the world', () => {
    const { arm, hand, mid } = rig();
    const before = [tip('hand'), tip('mid')];
    const ids = splitBone(arm.id, 4, { nested: true, fibonacci: false });
    const bones = docStore.get().skeleton.bones;
    expect(bones.find((b) => b.id === hand.id)!.parent).toBe(ids[2]);
    expect(bones.find((b) => b.id === mid.id)!.parent).toBe(ids[1]); // x = 55 sits on the third part (50..75)
    const after = [tip('hand'), tip('mid')];
    for (let i = 0; i < 2; i++) for (let k = 0; k < 4; k++) expect(after[i][k]).toBeCloseTo(before[i][k], 6);
  });

  it('side by side: siblings under the parent, shifted along the bone, children stay', () => {
    const { arm, root, hand } = rig();
    const ids = splitBone(arm.id, 3, { nested: false, fibonacci: false });
    const bones = docStore.get().skeleton.bones;
    for (const id of ids) expect(bones.find((b) => b.id === id)!.parent).toBe(root.id);
    expect(bones.find((b) => b.id === hand.id)!.parent).toBe(arm.id);
    const armW = tip('arm');
    const second = getSetupSkeleton().boneById(ids[0])!;
    expect(second.worldX).toBeCloseTo(armW[0] + (100 / 3) * armW[2], 6);
    expect(second.worldY).toBeCloseTo(armW[1] + (100 / 3) * armW[3], 6);
    expect(second.rotation).toBeCloseTo(30, 9);
  });

  it('refuses: root side by side, a bone without length, silly counts; no history step', () => {
    const { root, arm } = rig();
    const undo0 = docStore.canUndo;
    expect(splitBone(root.id, 3, { nested: false, fibonacci: false })).toEqual([]);
    expect(splitBone(arm.id, 1, { nested: true, fibonacci: false })).toEqual([]);
    expect(splitBone(arm.id, 99, { nested: true, fibonacci: false })).toEqual([]);
    docStore.update('zero', (d) => {
      d.skeleton.bones.find((b) => b.id === arm.id)!.length = 0;
    });
    expect(splitBone(arm.id, 3, { nested: true, fibonacci: false })).toEqual([]);
    docStore.undo();
    expect(docStore.canUndo).toBe(undo0);
  });

  it('new names do not clash', () => {
    const { arm } = rig();
    splitBone(arm.id, 3, { nested: true, fibonacci: true });
    const names = docStore.get().skeleton.bones.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
