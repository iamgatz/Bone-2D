/** The Metrics window's problems: one click puts a warning right (one history step), "fix all" does the safe ones together (see core/problems.ts). */
import { fixAllSafe, fixProblem } from '@/core/problems';
import { projectWarnings } from '@/core/stats';
import type { Warning } from '@/core/stats';
import { setSelection } from './actions';
import { docStore } from './doc';
import { toast, uiStore } from './ui';

/** The editor shows an animation that was just deleted: it moves to the first one that is left, or back to Setup. */
function keepAnimationValid() {
  const ui = uiStore.get();
  const animations = docStore.get().skeleton.animations;
  if (!ui.animationId || animations.some((a) => a.id === ui.animationId)) return;
  const next = animations[0]?.id ?? null;
  uiStore.patch({ animationId: next, time: 0, playing: false, overrides: {}, selectedKeys: [], mode: next ? ui.mode : 'setup' });
}

/** Fixes one warning. Returns true when the project changed. */
export function fixWarning(w: Warning): boolean {
  let done = false;
  docStore.update('Fix problem', (d) => {
    done = fixProblem(d, w);
  });
  if (!done) {
    toast('Nothing to fix: it was already put right', 'info');
    return false;
  }
  keepAnimationValid();
  return true;
}

/** Fixes every warning that has a safe fix, in one step. Returns how many were fixed. */
export function fixAllSafeWarnings(): number {
  let n = 0;
  docStore.update('Fix problems', (d) => {
    n = fixAllSafe(d, projectWarnings(d));
  });
  toast(n ? `Fixed ${n} problem${n === 1 ? '' : 's'}` : 'Nothing to fix', n ? 'ok' : 'info');
  return n;
}

/** A click on a warning: takes you to the thing it is about, where that can be shown. */
export function revealWarning(w: Warning): void {
  const ref = w.ref;
  if (!ref) return;
  if (ref.animation && w.kind === 'emptyAnimation') uiStore.patch({ animationId: ref.animation, time: 0, playing: false, overrides: {}, selectedKeys: [] });
  else if (ref.slot) setSelection({ slot: ref.slot, attachment: ref.name ?? null, bones: uiStore.get().selection.bones });
}
