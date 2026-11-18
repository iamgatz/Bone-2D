/** Checkpoints of the open project, kept for the session: mark one, compare the pose with it in the viewport, go back to it (one undoable step). */
import { MAX_CHECKPOINTS, nextCheckpointName, restoredImages } from '@/core/checkpoints';
import type { Checkpoint } from '@/core/checkpoints';
import { activeIndex } from '@/core/skeletons';
import { docStore } from './doc';
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
  let list = [...checkpointStore.get().list, cp];
  const over = mine.length + 1 - MAX_CHECKPOINTS;
  if (over > 0) {
    // the oldest ones of this skeleton go
    const drop = new Set(mine.slice(0, over).map((c) => c.id));
    list = list.filter((c) => !drop.has(c.id));
    if (uiStore.get().compare && drop.has(uiStore.get().compare!)) uiStore.patch({ compare: null });
  }
  checkpointStore.set({ epoch: docStore.epoch, list });
  return cp;
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
