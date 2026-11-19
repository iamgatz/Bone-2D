/** Checkpoints of the open project, kept for the session: mark one, compare the pose with it in the viewport, go back to it (one undoable step). */
import { MAX_CHECKPOINTS, diffSkeletons, nextCheckpointName, restoredImages, summarizeChanges } from '@/core/checkpoints';
import type { Change, Checkpoint } from '@/core/checkpoints';
import { activeIndex } from '@/core/skeletons';
import { docStore } from './doc';
import { readProjectFile } from './project';
import { createStore, useStore } from './store';
import { emptySelection, toast, uiStore } from './ui';

interface State {
  /** The project the list belongs to (`docStore.epoch`): another project put in place empties it. */
  epoch: number;
  list: Checkpoint[];
}

export const checkpointStore = createStore<State>({ epoch: docStore.epoch, list: [] });
export const useCheckpointList = (): Checkpoint[] => useStore(checkpointStore, (s) => s.list);

// a project opened over this one makes its checkpoints stale
docStore.subscribe(() => {
  if (checkpointStore.get().epoch === docStore.epoch) return;
  checkpointStore.set({ epoch: docStore.epoch, list: [] });
  if (uiStore.get().compare) uiStore.patch({ compare: null });
});

/** The checkpoints of the skeleton being edited (a project can hold several skeletons; the list keeps all of them). */
export const checkpointsOfActive = (list: readonly Checkpoint[] = checkpointStore.get().list): Checkpoint[] => {
  const at = activeIndex(docStore.get());
  return list.filter((c) => c.at === at);
};

let counter = 1;

/** Marks the skeleton as it is now. Resolves to the checkpoint (null when the limit made no room, which does not happen: the oldest is dropped). */
export function markCheckpoint(name?: string, now = Date.now()): Checkpoint {
  const p = docStore.get();
  const at = activeIndex(p);
  const mine = checkpointsOfActive();
  const cp: Checkpoint = { id: `cp${now.toString(36)}${counter++}`, name: name?.trim() || nextCheckpointName(mine), time: now, at, skeleton: p.skeleton, images: p.images, mixes: p.mixes };
  addCheckpoint(cp, mine);
  return cp;
}

/** Puts a checkpoint in the list; the oldest ones of the skeleton go when there are more than the limit. */
function addCheckpoint(cp: Checkpoint, mine: Checkpoint[]) {
  let list = [...checkpointStore.get().list, cp];
  const over = mine.length + 1 - MAX_CHECKPOINTS;
  if (over > 0) {
    const drop = new Set(mine.slice(0, over).map((c) => c.id));
    list = list.filter((c) => !drop.has(c.id));
    if (uiStore.get().compare && drop.has(uiStore.get().compare!)) uiStore.patch({ compare: null });
  }
  checkpointStore.set({ epoch: docStore.epoch, list });
}

/**
 * Compare with a project file: the skeleton of another version of the project (a teammate's copy, an older save) becomes a checkpoint that
 * is shown under the current pose, with the list of what differs. Things are matched by id, so it fits copies of the same project; a file of
 * another project lists everything as added and removed. The checkpoint cannot be restored (its pictures are not loaded). Returns the changes,
 * or null when the text is not a project file.
 */
export function compareWithProjectText(text: string, fileName = ''): Change[] | null {
  const project = readProjectFile(text);
  if (!project) {
    toast('This is not a Bone 2D project file', 'error');
    return null;
  }
  const now = Date.now();
  const current = docStore.get();
  const label = fileName.trim() || 'file';
  const cp: Checkpoint = { id: `cp${now.toString(36)}${counter++}`, name: label, time: now, at: activeIndex(current), skeleton: project.skeleton, images: project.images, mixes: project.mixes, fromFile: label };
  addCheckpoint(cp, checkpointsOfActive());
  uiStore.patch({ compare: cp.id });
  const changes = diffSkeletons(cp.skeleton, current.skeleton);
  const sum = summarizeChanges(changes);
  toast(changes.length ? `Compared with ${label}: +${sum.added} −${sum.removed} ~${sum.changed}` : `${label} has the same skeleton`, changes.length ? 'ok' : 'info');
  return changes;
}

/** Asks for a project file and compares the open skeleton with it. */
export function pickProjectToCompare() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.bone2d,.marrow,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (file) compareWithProjectText(await file.text(), file.name);
  };
  input.click();
}

export function deleteCheckpoint(id: string) {
  checkpointStore.set((s) => ({ ...s, list: s.list.filter((c) => c.id !== id) }));
  if (uiStore.get().compare === id) uiStore.patch({ compare: null });
}

export function renameCheckpoint(id: string, name: string) {
  const text = name.trim();
  if (!text) return;
  checkpointStore.set((s) => ({ ...s, list: s.list.map((c) => (c.id === id ? { ...c, name: text } : c)) }));
}

/** Shows the pose of a checkpoint under the current one (the same animation at the same time), or turns it off when it is already shown. */
export function toggleCompare(id: string | null) {
  const now = uiStore.get().compare;
  uiStore.patch({ compare: id === null || id === now ? null : id });
}

/** Puts the skeleton back as it was at the checkpoint. One step of the history, so Undo brings the work back. Returns whether anything changed. */
export function restoreCheckpoint(id: string): boolean {
  const cp = checkpointStore.get().list.find((c) => c.id === id);
  if (!cp) return false;
  if (cp.fromFile) {
    toast('A project file cannot be restored here: open it as a project', 'error');
    return false;
  }
  if (cp.at !== activeIndex(docStore.get())) {
    toast('That checkpoint belongs to another skeleton', 'error');
    return false;
  }
  if (docStore.get().skeleton === cp.skeleton && docStore.get().images === cp.images && docStore.get().mixes === cp.mixes) {
    toast('Nothing has changed since this checkpoint', 'info');
    return false;
  }
  docStore.update(`Back to ${cp.name}`, (d) => {
    d.skeleton = cp.skeleton;
    d.images = restoredImages(cp.images, d.images);
    if (cp.mixes) d.mixes = cp.mixes;
    else delete d.mixes;
  });
  const doc = docStore.get().skeleton;
  const ui = uiStore.get();
  const hasAnim = (a: string | null) => !!a && doc.animations.some((x) => x.id === a);
  const animationId = hasAnim(ui.animationId) ? ui.animationId : (doc.animations[0]?.id ?? null);
  uiStore.patch({
    selection: emptySelection,
    animationId,
    mode: animationId ? ui.mode : 'setup',
    skinId: ui.skinId && doc.skins.some((s) => s.id === ui.skinId) ? ui.skinId : null,
    skinMix: ui.skinMix.filter((s) => doc.skins.some((x) => x.id === s)),
    reference: ui.reference === 'setup' || hasAnim(ui.reference) ? ui.reference : null,
    overrides: {},
    selectedKeys: [],
    playing: false,
  });
  return true;
}
