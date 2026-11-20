/**
 * The interactive lessons (core/lessons.ts) as they run in the editor: which one is on, where it started, what the person skipped. The state
 * of the lesson is read from the other stores whenever they change. Only what the person finished is remembered (in this browser, nowhere
 * else); a running lesson is not kept over a reload.
 */
import { countKeys } from '@/core/stats';
import { lessonById, progressOf } from '@/core/lessons';
import type { LessonProgress, LessonState } from '@/core/lessons';
import { docStore } from './doc';
import { loadSample } from './sample';
import { createStore, useStore } from './store';
import { uiStore } from './ui';

export interface LearnState {
  /** The lesson that is running (its id), or null. */
  active: string | null;
  /** The editor as it was when the lesson started: steps that ask for a change compare with it. */
  base: LessonState | null;
  skipped: string[];
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

// counting the keys of a big rig on every frame of a playback would be a waste: it is redone when the document is another one
let keysOf: ReturnType<typeof docStore.get> | null = null;
let keyTotal = 0;

function snapshot(): LessonState {
  const ui = uiStore.get();
  const doc = docStore.get();
  if (doc !== keysOf) {
    keysOf = doc;
    keyTotal = doc.skeleton.animations.reduce((n, a) => n + countKeys(a), 0);
  }
  return {
    mode: ui.mode,
    selectedBones: ui.selection.bones.length,
    edits,
    keys: keyTotal,
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
  const progress = progressOf(lesson, snapshot(), s.base, s.skipped);
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
    if (learnStore.get().active) edits++;
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
  learnStore.patch({ active: id, base: snapshot(), skipped: [], collapsed: false, progress: null });
  refresh();
}

export function stopLesson() {
  learnStore.patch({ active: null, base: null, skipped: [], progress: null });
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

/** Lesson 1 on request. An empty project gets the demo rig first; anything else is left as it is, the lesson works on what is open. */
export async function openLesson(id: string) {
  const sk = docStore.get().skeleton;
  if (sk.bones.length <= 1 && sk.slots.length === 0 && sk.animations.length === 0) await loadSample();
  startLesson(id);
}

export function useLearn<S>(selector: (s: LearnState) => S): S {
  return useStore(learnStore, selector);
}
