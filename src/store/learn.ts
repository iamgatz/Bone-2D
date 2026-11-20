/**
 * The interactive lessons (core/lessons.ts) as they run in the editor: which one is on, where it started, what the person skipped. The state
 * of the lesson is read from the other stores whenever they change. Only what the person finished is remembered (in this browser, nowhere
 * else); a running lesson is not kept over a reload.
 */
import { countKeys } from '@/core/stats';
import { lessonById, progressOf } from '@/core/lessons';
import type { LessonHelper, LessonProgress, LessonState } from '@/core/lessons';
import { drawDemoImages } from './demo/art';
import { docStore } from './doc';
import { importImageFiles } from './imageImportActions';
import { loadSample } from './sample';
import { createStore, useStore } from './store';
import { uiStore } from './ui';

export interface LearnState {
  /** The lesson that is running (its id), or null. */
  active: string | null;
  /** The editor as it was when the lesson started: steps that ask for a change compare with it. */
  base: LessonState | null;
  skipped: string[];
  /** Steps that were done at some moment: they stay done even when the editor leaves the state they asked for. */
  kept: string[];
  /** Only the title bar is shown. */
  collapsed: boolean;
  progress: LessonProgress | null;
  /** Lessons that were taken to the end (or the end was reached by skipping). */
  finished: string[];
  /** A lesson was started by itself once (after the first demo): it is not forced again. */
  offered: boolean;
}

const KEY = 'bone2d.learn';

/** Takes stored text for what it is worth: what is not valid stays at the default. */
export function readLearn(raw: string | null): Pick<LearnState, 'finished' | 'offered'> {
  const out = { finished: [] as string[], offered: false };
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as { finished?: unknown; offered?: unknown };
    if (Array.isArray(data.finished)) out.finished = data.finished.filter((id): id is string => typeof id === 'string' && !!lessonById(id));
    if (typeof data.offered === 'boolean') out.offered = data.offered;
  } catch {
    /* damaged: defaults */
  }
  return out;
}

function load() {
  try {
    return readLearn(localStorage.getItem(KEY));
  } catch {
    return readLearn(null);
  }
}

export const learnStore = createStore<LearnState>({
  active: null,
  base: null,
  skipped: [],
  kept: [],
  collapsed: false,
  progress: null,
  ...load(),
});

function remember() {
  const { finished, offered } = learnStore.get();
  try {
    localStorage.setItem(KEY, JSON.stringify({ finished, offered }));
  } catch {
    /* not persisted */
  }
}

// What the editor did since the lesson started: counted here because the stores only hold the present.
let edits = 0;
let lastDoc = docStore.get();
let seenPlaying = false;
let seenExport = false;
let seenWeightsTool = false;

// counting the keys of a big rig on every frame of a playback would be a waste: it is redone when the document is another one
let countedDoc: ReturnType<typeof docStore.get> | null = null;
let keyTotal = 0;
let ownSlotTotal = 0;
let meshTotal = 0;
let weightedTotal = 0;
let ikTotal = 0;
// IK: the number of constraints when the lesson began, and the count of document edits when a new one first appeared
let baseIk: number | null = null;
let editsAtIk: number | null = null;
// the kind of change the last step of the history was (counted from its label): a lesson about curves needs the kind, not just "an edit"
let interpEdits = 0;
let handleEdits = 0;
let seenGraph = false;

function snapshot(): LessonState {
  const ui = uiStore.get();
  const doc = docStore.get();
  if (doc !== countedDoc) {
    countedDoc = doc;
    keyTotal = doc.skeleton.animations.reduce((n, a) => n + countKeys(a), 0);
    const roots = new Set(doc.skeleton.bones.filter((b) => !b.parent).map((b) => b.id));
    ownSlotTotal = doc.skeleton.slots.filter((sl) => !roots.has(sl.bone)).length;
    ikTotal = doc.skeleton.constraints.filter((c) => c.type === 'ik').length;
    meshTotal = 0;
    weightedTotal = 0;
    for (const skin of doc.skeleton.skins)
      for (const bySlot of Object.values(skin.attachments))
        for (const att of Object.values(bySlot))
          if (att.type === 'mesh') {
            meshTotal++;
            if (att.weights) weightedTotal++;
          }
  }
  if (baseIk !== null && editsAtIk === null && ikTotal > baseIk) editsAtIk = edits;
  return {
    mode: ui.mode,
    selectedBones: ui.selection.bones.length,
    edits,
    keys: keyTotal,
    images: doc.images.length,
    bones: doc.skeleton.bones.length,
    ownSlots: ownSlotTotal,
    slotSelected: ui.selection.slot !== null,
    meshes: meshTotal,
    weightedMeshes: weightedTotal,
    ikConstraints: ikTotal,
    editsSinceIk: editsAtIk === null ? 0 : edits - editsAtIk,
    seenWeightsTool,
    selectedKeys: ui.selectedKeys.length,
    interpEdits,
    handleEdits,
    seenGraph,
    playing: ui.playing,
    seenPlaying,
    seenExport,
  };
}

const sameProgress = (a: LessonProgress | null, b: LessonProgress) =>
  !!a && a.current === b.current && a.doneCount === b.doneCount && a.marks.join() === b.marks.join();

/** Reads the editor again and updates the lesson; does nothing when none is running. */
function refresh() {
  const s = learnStore.get();
  const lesson = s.active ? lessonById(s.active) : undefined;
  if (!lesson || !s.base) return;
  const ui = uiStore.get();
  if (ui.playing) seenPlaying = true;
  if (ui.exportOpen) seenExport = true;
  if (ui.tool === 'weights') seenWeightsTool = true;
  if (ui.timelineView === 'graph') seenGraph = true;
  const progress = progressOf(lesson, snapshot(), s.base, s.skipped, s.kept);
  const fresh = lesson.steps.filter((st, i) => progress.marks[i] === 'done' && !s.kept.includes(st.id)).map((st) => st.id);
  if (fresh.length) learnStore.patch({ kept: [...s.kept, ...fresh] });
  if (sameProgress(s.progress, progress)) return;
  learnStore.patch({ progress });
  if (progress.current === -1 && !s.finished.includes(lesson.id)) {
    learnStore.patch({ finished: [...s.finished, lesson.id] });
    remember();
  }
}

docStore.subscribe(() => {
  const doc = docStore.get();
  if (doc !== lastDoc) {
    lastDoc = doc;
    if (learnStore.get().active) {
      edits++;
      const label = docStore.undoLabel;
      if (label === 'Set interpolation' || label === 'Automatic curve') interpEdits++;
      else if (label === 'Edit curve') handleEdits++;
    }
  }
  refresh();
});
uiStore.subscribe(refresh);

/** Starts a lesson on what is open now. */
export function startLesson(id: string) {
  if (!lessonById(id)) return;
  edits = 0;
  lastDoc = docStore.get();
  seenPlaying = false;
  seenExport = false;
  seenWeightsTool = false;
  interpEdits = 0;
  handleEdits = 0;
  seenGraph = false;
  baseIk = null;
  editsAtIk = null;
  const base = snapshot();
  baseIk = base.ikConstraints;
  learnStore.patch({ active: id, base, skipped: [], kept: [], collapsed: false, progress: null });
  refresh();
}

export function stopLesson() {
  learnStore.patch({ active: null, base: null, skipped: [], kept: [], progress: null });
}

/** The step in front is set aside; it comes back as done when the editor gets into its state by itself. */
export function skipStep() {
  const s = learnStore.get();
  const lesson = s.active ? lessonById(s.active) : undefined;
  const step = lesson && s.progress && s.progress.current >= 0 ? lesson.steps[s.progress.current] : undefined;
  if (!step) return;
  learnStore.patch({ skipped: [...s.skipped, step.id] });
  refresh();
}

export function setLearnCollapsed(collapsed: boolean) {
  learnStore.patch({ collapsed });
}

/** The first time the demo is opened a lesson starts by itself; after that only the person's own request starts one. */
export function offerLesson(id: string) {
  const s = learnStore.get();
  if (s.offered || s.finished.includes(id)) return;
  learnStore.patch({ offered: true });
  remember();
  startLesson(id);
}

/** A lesson on request. The fox lesson on an empty project gets the demo rig first; anything else is left as it is: a lesson works on what is open. */
export async function openLesson(id: string) {
  const sk = docStore.get().skeleton;
  if (id === 'fox' && sk.bones.length <= 1 && sk.slots.length === 0 && sk.animations.length === 0) await loadSample();
  startLesson(id);
}

/** What a button of a lesson step does. */
export async function runLessonHelper(id: LessonHelper) {
  if (id === 'samplePictures') {
    // two pictures of the demo fox (body and tail), added like dropped files
    const all = await drawDemoImages();
    const want = ['fox-body', 'fox-tail'].map((n) => all.find((p) => p.name === n)).filter((p) => !!p);
    const chosen = want.length === 2 ? want : all.slice(0, 2);
    await importImageFiles(chosen.map((p) => new File([p.blob], `${p.name}.png`, { type: 'image/png' })));
  }
}

export function useLearn<S>(selector: (s: LearnState) => S): S {
  return useStore(learnStore, selector);
}
