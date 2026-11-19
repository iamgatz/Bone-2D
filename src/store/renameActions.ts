/** Find and replace for names (see core/rename.ts): one history step, with a message of what changed and what could not. */
import { applyRename, planRename } from '@/core/rename';
import type { FindReplaceOptions, RenamePlan } from '@/core/rename';
import { docStore } from './doc';
import { toast } from './ui';

/** What the replacement would do now, without doing it (the panel shows the count while typing). */
export function previewRename(opts: FindReplaceOptions): RenamePlan {
  return planRename(docStore.get().skeleton, opts);
}

/** Does it. Returns how many names changed. */
export function findReplaceNames(opts: FindReplaceOptions): number {
  const plan = planRename(docStore.get().skeleton, opts);
  if (plan.invalid) {
    toast('That regular expression does not parse', 'error');
    return 0;
  }
  if (!plan.changes.length) {
    toast(plan.skipped.length ? `Nothing renamed: ${plan.skipped.length} would clash or become empty` : 'No name matches', 'info');
    return 0;
  }
  let n = 0;
  docStore.update('Find and replace', (d) => {
    n = applyRename(d.skeleton, plan.changes);
  });
  toast(plan.skipped.length ? `Renamed ${n} names, skipped ${plan.skipped.length} that would clash or become empty` : `Renamed ${n} names`, 'ok');
  return n;
}
