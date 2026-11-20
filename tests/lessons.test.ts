/** The lessons: the data is complete in both languages, every step condition says what it should, and the store follows the editor. */
import { beforeEach, describe, expect, it } from 'vitest';
import { FOX_LESSON, LESSONS, MESH_LESSON, RIG_LESSON, lessonById, progressOf } from '../src/core/lessons';
import type { LessonState } from '../src/core/lessons';
import { meshFromRegion } from '../src/core/mesh';
import { emptyProject, newAnimation, newBone, newSlot } from '../src/core/model';
import type { RegionAttachment } from '../src/core/model';
import { selectBone, selectSlot, setMode } from '../src/store/actions';
import { setBonePose } from '../src/store/boneActions';
import { docStore } from '../src/store/doc';
import { learnStore, offerLesson, readLearn, skipStep, startLesson, stopLesson } from '../src/store/learn';
import { emptySelection, uiStore } from '../src/store/ui';

const state = (over: Partial<LessonState> = {}): LessonState => ({
  mode: 'setup',
  selectedBones: 0,
  edits: 0,
  keys: 0,
  playing: false,
  images: 0,
  bones: 1,
  ownSlots: 0,
  slotSelected: false,
  meshes: 0,
  weightedMeshes: 0,
  seenWeightsTool: false,
  seenPlaying: false,
  seenExport: false,
  ...over,
});

const TARGETS = ['tree', 'viewport', 'inspector', 'mode', 'play', 'export', 'images'];
const russian = (s: string) => /[а-яё]/i.test(s);

describe('lesson data', () => {
  it('has every text in both languages, unique ids and known targets', () => {
    const ids = new Set<string>();
    for (const lesson of LESSONS) {
      expect(ids.has(lesson.id)).toBe(false);
      ids.add(lesson.id);
      for (const t of [lesson.title, lesson.intro, lesson.outro]) {
        expect(t.en.trim().length).toBeGreaterThan(3);
        expect(russian(t.ru), `Russian text: ${t.ru}`).toBe(true);
        expect(russian(t.en), `English text: ${t.en}`).toBe(false);
      }
      const stepIds = new Set<string>();
      for (const step of lesson.steps) {
        expect(stepIds.has(step.id)).toBe(false);
        stepIds.add(step.id);
        expect(TARGETS).toContain(step.target);
        for (const t of [step.title, step.text]) {
          expect(t.en.trim().length).toBeGreaterThan(3);
          expect(russian(t.ru), `Russian text: ${t.ru}`).toBe(true);
          expect(russian(t.en), `English text: ${t.en}`).toBe(false);
        }
      }
    }
    expect(lessonById('fox')).toBe(FOX_LESSON);
    expect(lessonById('nope')).toBeUndefined();
  });
});

describe('the steps of the fox lesson', () => {
  const base = state({ edits: 3, keys: 10 });
  const done = (id: string, s: LessonState) => FOX_LESSON.steps.find((x) => x.id === id)!.done(s, base);

  it('pick a bone: a bone is selected', () => {
    expect(done('select', state())).toBe(false);
    expect(done('select', state({ selectedBones: 1 }))).toBe(true);
  });
  it('change it: only an edit made after the lesson began counts, not one that was there before', () => {
    expect(done('edit', state({ edits: 3 }))).toBe(false);
    expect(done('edit', state({ edits: 4 }))).toBe(true);
  });
  it('animate: the mode is Animate, however it got there', () => {
    expect(done('animate', state())).toBe(false);
    expect(done('animate', state({ mode: 'animate' }))).toBe(true);
  });
  it('play: playback was on at some moment, it may be off again', () => {
    expect(done('play', state({ playing: false }))).toBe(false);
    expect(done('play', state({ seenPlaying: true }))).toBe(true);
  });
  it('key: the skeleton has more keys than when the lesson began', () => {
    expect(done('key', state({ keys: 10 }))).toBe(false);
    expect(done('key', state({ keys: 11 }))).toBe(true);
  });
  it('export: the Export window was opened', () => {
    expect(done('export', state())).toBe(false);
    expect(done('export', state({ seenExport: true }))).toBe(true);
  });
});

describe('progress', () => {
  const base = state();
  it('starts at the first step and counts nothing done', () => {
    const p = progressOf(FOX_LESSON, state(), base, []);
    expect(p.current).toBe(0);
    expect(p.doneCount).toBe(0);
    expect(p.marks.every((m) => m === 'todo')).toBe(true);
  });
  it('does not depend on the order: a later step done first is done, and the first step is still in front', () => {
    const p = progressOf(FOX_LESSON, state({ mode: 'animate' }), base, []);
    expect(p.marks[2]).toBe('done');
    expect(p.current).toBe(0);
    expect(p.doneCount).toBe(1);
  });
  it('a step that was done stays done when the editor leaves its state (kept), a skipped one does not', () => {
    const p = progressOf(FOX_LESSON, state(), base, ['edit'], ['select', 'edit']);
    expect(p.marks[0]).toBe('done');
    expect(p.marks[1]).toBe('done');
    expect(p.current).toBe(2);
  });
  it('a skipped step moves the lesson on, and becomes done when the editor gets there by itself', () => {
    const skipped = progressOf(FOX_LESSON, state(), base, ['select']);
    expect(skipped.marks[0]).toBe('skipped');
    expect(skipped.current).toBe(1);
    expect(skipped.doneCount).toBe(0);
    const later = progressOf(FOX_LESSON, state({ selectedBones: 2 }), base, ['select']);
    expect(later.marks[0]).toBe('done');
  });
  it('is over (current -1) when every step is done or skipped', () => {
    const all = state({ selectedBones: 1, edits: 1, mode: 'animate', seenPlaying: true, keys: 1, seenExport: true });
    const p = progressOf(FOX_LESSON, all, base, []);
    expect(p.current).toBe(-1);
    expect(p.doneCount).toBe(FOX_LESSON.steps.length);
    const every = FOX_LESSON.steps.map((s) => s.id);
    expect(progressOf(FOX_LESSON, state(), base, every).current).toBe(-1);
  });
});

describe('what is remembered', () => {
  it('keeps only known lesson ids and a real boolean', () => {
    expect(readLearn(JSON.stringify({ finished: ['fox', 'zzz', 4], offered: true }))).toEqual({ finished: ['fox'], offered: true });
    expect(readLearn('not json')).toEqual({ finished: [], offered: false });
    expect(readLearn(null)).toEqual({ finished: [], offered: false });
    expect(readLearn(JSON.stringify({ offered: 'yes' })).offered).toBe(false);
  });
});

describe('the lesson in the store follows the editor', () => {
  beforeEach(() => {
    stopLesson();
    learnStore.patch({ finished: [], offered: false });
    const p = emptyProject('lesson');
    const arm = newBone({ name: 'arm', parent: p.skeleton.bones[0].id, length: 40 });
    p.skeleton.bones.push(arm);
    p.skeleton.animations.push(newAnimation('wave', 1));
    docStore.replace(p);
    uiStore.patch({
      mode: 'setup',
      selection: emptySelection,
      playing: false,
      exportOpen: false,
      animationId: null,
      time: 0,
      overrides: {},
    });
  });

  it('walks through the whole lesson with the real actions of the editor, and remembers that it was finished', () => {
    const arm = docStore.get().skeleton.bones[1].id;
    startLesson('fox');
    expect(learnStore.get().progress?.current).toBe(0);

    selectBone(arm);
    expect(learnStore.get().progress?.current).toBe(1);

    setBonePose([{ id: arm, props: { rotation: 20 } }]);
    expect(learnStore.get().progress?.marks[1]).toBe('done');

    setMode('animate');
    expect(learnStore.get().progress?.marks[2]).toBe('done');

    uiStore.patch({ playing: true });
    uiStore.patch({ playing: false });
    expect(learnStore.get().progress?.marks[3]).toBe('done'); // it stays done after the playback stopped

    setBonePose([{ id: arm, props: { rotation: 45 } }]); // Auto key is on: the pose becomes a key
    expect(learnStore.get().progress?.marks[4]).toBe('done');

    expect(learnStore.get().finished).toEqual([]);
    uiStore.patch({ exportOpen: true });
    const p = learnStore.get().progress!;
    expect(p.current).toBe(-1);
    expect(p.doneCount).toBe(FOX_LESSON.steps.length);
    expect(learnStore.get().finished).toEqual(['fox']);
  });

  it('what was done before the lesson began does not count for the steps that ask for a change', () => {
    const arm = docStore.get().skeleton.bones[1].id;
    setMode('animate');
    setBonePose([{ id: arm, props: { rotation: 10 } }]);
    startLesson('fox');
    const marks = learnStore.get().progress!.marks;
    expect(marks[2]).toBe('done'); // the mode is Animate now: the state counts
    expect(marks[1]).toBe('todo'); // an earlier edit does not
    expect(marks[4]).toBe('todo'); // nor an earlier key
  });

  it('skip moves on, stop clears the lesson, and a lesson that started by itself is not forced again', () => {
    startLesson('fox');
    skipStep();
    expect(learnStore.get().progress?.current).toBe(1);
    stopLesson();
    expect(learnStore.get().active).toBeNull();
    expect(learnStore.get().progress).toBeNull();

    offerLesson('fox');
    expect(learnStore.get().active).toBe('fox');
    stopLesson();
    offerLesson('fox');
    expect(learnStore.get().active).toBeNull();
  });
});

describe('the steps of the rig lesson', () => {
  const base = state({ images: 2, bones: 3, ownSlots: 1, keys: 4 });
  const done = (id: string, s: LessonState) => RIG_LESSON.steps.find((x) => x.id === id)!.done(s, base);

  it('pictures: more pictures than when the lesson began', () => {
    expect(done('pictures', state({ images: 2 }))).toBe(false);
    expect(done('pictures', state({ images: 3 }))).toBe(true);
  });
  it('bone: more bones than when the lesson began', () => {
    expect(done('bone', state({ bones: 3 }))).toBe(false);
    expect(done('bone', state({ bones: 4 }))).toBe(true);
  });
  it('attach: a picture sits on a bone that is not a root, and one that was already there does not count', () => {
    expect(done('attach', state({ ownSlots: 1 }))).toBe(false);
    expect(done('attach', state({ ownSlots: 2 }))).toBe(true);
  });
  it('animate, key and play work as in the first lesson', () => {
    expect(done('animate', state({ mode: 'animate' }))).toBe(true);
    expect(done('key', state({ keys: 5 }))).toBe(true);
    expect(done('key', state({ keys: 4 }))).toBe(false);
    expect(done('play', state({ seenPlaying: true }))).toBe(true);
  });
  it('is offered after the first lesson, and only the first step has a button', () => {
    expect(FOX_LESSON.next).toBe('rig');
    expect(lessonById(FOX_LESSON.next!)).toBe(RIG_LESSON);
    expect(RIG_LESSON.next).toBe('mesh');
    expect(RIG_LESSON.steps.filter((s) => s.helper).map((s) => s.id)).toEqual(['pictures']);
  });
});

describe('the rig lesson in the store', () => {
  beforeEach(() => {
    stopLesson();
    learnStore.patch({ finished: [], offered: false });
    docStore.replace(emptyProject('rig'));
    uiStore.patch({
      mode: 'setup',
      selection: emptySelection,
      playing: false,
      exportOpen: false,
      animationId: null,
      time: 0,
      overrides: {},
    });
  });

  it('follows a picture, a bone, a picture put on that bone, and the keys of the turn', () => {
    startLesson('rig');
    expect(learnStore.get().progress?.current).toBe(0);

    docStore.update('Import image', (d) => {
      d.images.push({ id: 'img1', name: 'body', width: 40, height: 60 });
    });
    expect(learnStore.get().progress?.marks[0]).toBe('done');

    let arm = '';
    docStore.update('Create bone', (d) => {
      const b = newBone({ name: 'arm', parent: d.skeleton.bones[0].id, length: 40 });
      arm = b.id;
      d.skeleton.bones.push(b);
    });
    expect(learnStore.get().progress?.marks[1]).toBe('done');
    expect(learnStore.get().progress?.marks[2]).toBe('todo');

    docStore.update('Add image', (d) => {
      d.skeleton.slots.push(newSlot({ name: 'body', bone: arm, attachment: 'body' }));
    });
    expect(learnStore.get().progress?.marks[2]).toBe('done');

    setMode('animate');
    selectBone(arm);
    setBonePose([{ id: arm, props: { rotation: 30 } }]);
    expect(learnStore.get().progress?.marks[4]).toBe('done');
    uiStore.patch({ playing: true });
    expect(learnStore.get().progress?.current).toBe(-1);
    expect(learnStore.get().finished).toEqual(['rig']);
  });

  it('a slot on the root bone is not a picture that moves with a bone of its own', () => {
    startLesson('rig');
    docStore.update('Add image', (d) => {
      d.skeleton.slots.push(newSlot({ name: 'bg', bone: d.skeleton.bones[0].id, attachment: 'bg' }));
    });
    expect(learnStore.get().progress?.marks[2]).toBe('todo');
  });
});

describe('the steps of the mesh lesson', () => {
  const base = state({ meshes: 2, weightedMeshes: 1, keys: 3 });
  const done = (id: string, s: LessonState) => MESH_LESSON.steps.find((x) => x.id === id)!.done(s, base);

  it('slot: a picture is selected', () => {
    expect(done('slot', state())).toBe(false);
    expect(done('slot', state({ slotSelected: true }))).toBe(true);
  });
  it('mesh: more meshes than when the lesson began (the ones that were there do not count)', () => {
    expect(done('mesh', state({ meshes: 2 }))).toBe(false);
    expect(done('mesh', state({ meshes: 3 }))).toBe(true);
  });
  it('bind: more weighted meshes than at the start', () => {
    expect(done('bind', state({ meshes: 5, weightedMeshes: 1 }))).toBe(false);
    expect(done('bind', state({ weightedMeshes: 2 }))).toBe(true);
  });
  it('weights: the brush was the tool at some moment, even if it is not now', () => {
    expect(done('weights', state())).toBe(false);
    expect(done('weights', state({ seenWeightsTool: true }))).toBe(true);
  });
  it('animate and bend: the mode, and more keys than at the start', () => {
    expect(done('animate', state({ mode: 'animate' }))).toBe(true);
    expect(done('bend', state({ keys: 3 }))).toBe(false);
    expect(done('bend', state({ keys: 4 }))).toBe(true);
  });
  it('comes after the rig lesson and is the last one for now', () => {
    expect(RIG_LESSON.next).toBe('mesh');
    expect(lessonById('mesh')).toBe(MESH_LESSON);
    expect(MESH_LESSON.next).toBeUndefined();
  });
});

describe('the mesh lesson in the store', () => {
  beforeEach(() => {
    stopLesson();
    learnStore.patch({ finished: [], offered: false });
    const p = emptyProject('mesh');
    const arm = newBone({ name: 'arm', parent: p.skeleton.bones[0].id, length: 40 });
    p.skeleton.bones.push(arm);
    const slot = newSlot({ name: 'pic', bone: arm.id, attachment: 'pic' });
    p.skeleton.slots.push(slot);
    const region: RegionAttachment = {
      type: 'region',
      name: 'pic',
      path: 'pic',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: 40,
      height: 60,
      color: [1, 1, 1, 1],
    };
    p.skeleton.skins[0].attachments[slot.id] = { pic: region };
    docStore.replace(p);
    uiStore.patch({ mode: 'setup', tool: 'select', selection: emptySelection, playing: false, animationId: null, time: 0, overrides: {} });
  });

  it('follows a selected picture, a mesh, a binding, the brush and the keys of a bend', () => {
    const doc = docStore.get().skeleton;
    const slot = doc.slots[0];
    const arm = doc.bones[1].id;
    startLesson('mesh');
    expect(learnStore.get().progress?.current).toBe(0);

    selectSlot(slot.id);
    expect(learnStore.get().progress?.marks[0]).toBe('done');

    docStore.update('Convert to mesh', (d) => {
      d.skeleton.skins[0].attachments[slot.id].pic = meshFromRegion(d.skeleton.skins[0].attachments[slot.id].pic as RegionAttachment);
    });
    expect(learnStore.get().progress?.marks[1]).toBe('done');
    expect(learnStore.get().progress?.marks[2]).toBe('todo');

    docStore.update('Bind mesh', (d) => {
      const m = d.skeleton.skins[0].attachments[slot.id].pic;
      if (m.type === 'mesh') m.weights = Array.from({ length: m.uvs.length / 2 }, () => [[arm, 0, 0, 1]]);
    });
    expect(learnStore.get().progress?.marks[2]).toBe('done');

    uiStore.patch({ tool: 'weights' });
    uiStore.patch({ tool: 'select' });
    expect(learnStore.get().progress?.marks[3]).toBe('done'); // it stays done after the tool changed

    setMode('animate');
    selectBone(arm);
    setBonePose([{ id: arm, props: { rotation: 30 } }]);
    expect(learnStore.get().progress?.current).toBe(-1);
    expect(learnStore.get().finished).toEqual(['mesh']);
  });
});
