/** Picking bones together with a picture (for binding), and what Delete removes then: never the bone a picked picture sits on. */
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject, newBone, newSlot } from '../src/core/model';
import type { Attachment, Project, Slot } from '../src/core/model';
import { deleteSelected, selectBone, selectSlot, setSelection, toggleExtraSlot } from '../src/store/actions';
import { docStore } from '../src/store/doc';
import { uiStore } from '../src/store/ui';

const picture = (name: string) =>
  ({
    type: 'region',
    name,
    path: name,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    width: 10,
    height: 10,
    color: [1, 1, 1, 1],
  }) as unknown as Attachment;

let arm = '';
let hip = '';
let leg = '';
let one: Slot;
let two: Slot;
let other: Slot;

/** root > arm, hip, leg; the slot `one` (one picture) and `two` (two pictures) sit on arm, `other` on hip. */
function rig(): Project {
  const p = emptyProject('rig');
  const root = p.skeleton.bones[0];
  const a = newBone({ name: 'arm', parent: root.id, length: 10 });
  const h = newBone({ name: 'hip', parent: root.id, length: 10 });
  const l = newBone({ name: 'leg', parent: root.id, length: 10 });
  p.skeleton.bones.push(a, h, l);
  [arm, hip, leg] = [a.id, h.id, l.id];
  one = newSlot({ name: 'one', bone: a.id });
  two = newSlot({ name: 'two', bone: a.id });
  other = newSlot({ name: 'other', bone: h.id });
  one.attachment = 'a';
  two.attachment = 'x';
  other.attachment = 'o';
  p.skeleton.slots.push(one, two, other);
  p.skeleton.skins[0].attachments = {
    [one.id]: { a: picture('a') },
    [two.id]: { x: picture('x'), y: picture('y') },
    [other.id]: { o: picture('o') },
  };
  return p;
}

const sel = () => uiStore.get().selection;
const doc = () => docStore.get().skeleton;
const boneIds = () => doc().bones.map((b) => b.id);
const slotNames = () => doc().slots.map((s) => s.name);

beforeEach(() => {
  docStore.replace(rig());
  setSelection({});
});

describe('adding to the selection', () => {
  it('Shift on a bone keeps the picked picture and adds the bone, and takes it out again', () => {
    selectSlot(one.id, 'a');
    expect(sel().bones).toEqual([arm]);
    selectBone(hip, true);
    expect(sel()).toMatchObject({ slot: one.id, attachment: 'a', bones: [arm, hip] });
    selectBone(arm, true);
    expect(sel()).toMatchObject({ slot: one.id, bones: [hip] });
  });

  it('a plain click on a bone selects only the bone', () => {
    selectSlot(one.id, 'a');
    selectBone(hip);
    expect(sel()).toMatchObject({ slot: null, attachment: null, bones: [hip] });
  });

  it('Shift on a picture keeps bones that were picked on their own', () => {
    selectBone(hip);
    selectBone(leg, true);
    selectSlot(one.id, 'a', true);
    expect(sel()).toMatchObject({ slot: one.id, bones: [hip, leg] });
  });

  it('without Shift, or from another picture, the picture brings its own bone', () => {
    selectBone(hip);
    selectSlot(one.id, 'a');
    expect(sel().bones).toEqual([arm]);
    selectSlot(other.id, 'o', true);
    expect(sel()).toMatchObject({ slot: other.id, bones: [hip] });
  });
});

describe('deleteSelected', () => {
  it('removes the picked picture and no bone, and a second press removes nothing more', () => {
    selectSlot(one.id, 'a');
    deleteSelected();
    expect(slotNames()).toEqual(['two', 'other']);
    expect(boneIds()).toContain(arm);
    expect(sel()).toMatchObject({ slot: null, bones: [] });
    deleteSelected();
    expect(slotNames()).toEqual(['two', 'other']);
    expect(boneIds()).toContain(arm);
  });

  it('removes one picture of a slot that holds several, and keeps the slot', () => {
    selectSlot(two.id, 'x');
    deleteSelected();
    expect(Object.keys(doc().skins[0].attachments[two.id])).toEqual(['y']);
    expect(slotNames()).toEqual(['one', 'two', 'other']);
    expect(boneIds()).toContain(arm);
  });

  it('removes the slot when the slot itself is picked with no picture shown', () => {
    selectSlot(two.id, null);
    deleteSelected();
    expect(slotNames()).toEqual(['one', 'other']);
  });

  it('removes every picked slot', () => {
    selectSlot(one.id, 'a');
    toggleExtraSlot(other.id);
    deleteSelected();
    expect(slotNames()).toEqual(['two']);
    expect(boneIds()).toEqual(expect.arrayContaining([arm, hip]));
  });

  it('keeps bones that were added to the picture, which a second press then removes', () => {
    selectSlot(one.id, 'a');
    selectBone(leg, true);
    deleteSelected();
    expect(slotNames()).toEqual(['two', 'other']);
    expect(boneIds()).toContain(leg);
    expect(sel().bones).toEqual([arm, leg]);
  });

  it('removes bones when no picture is picked, and does nothing with nothing picked', () => {
    selectBone(leg);
    deleteSelected();
    expect(boneIds()).not.toContain(leg);
    const before = boneIds();
    setSelection({});
    deleteSelected();
    expect(boneIds()).toEqual(before);
  });
});
