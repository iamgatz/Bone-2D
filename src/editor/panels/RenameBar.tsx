import { useMemo, useState } from 'react';
import { NAME_KINDS } from '@/core/rename';
import type { NameKind } from '@/core/rename';
import { useProject } from '@/store/doc';
import { findReplaceNames, previewRename } from '@/store/renameActions';
import { Button } from '../ui/controls';

const KIND_LABEL: Record<NameKind, string> = { bone: 'Bones', slot: 'Slots', skin: 'Skins', event: 'Events', constraint: 'Constraints', animation: 'Animations' };

/** Find and replace for names, under the Hierarchy filter: the count of what would change shows while typing, Replace does it as one step. */
export function RenameBar() {
  const doc = useProject().skeleton;
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [regex, setRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [firstOnly, setFirstOnly] = useState(false);
  const [kinds, setKinds] = useState<NameKind[]>(['bone', 'slot']);
  const opts = { find, replace, regex, matchCase, firstOnly, kinds };
  // `doc` is a dependency on purpose: the count follows the document
  const plan = useMemo(() => previewRename(opts), [doc, find, replace, regex, matchCase, firstOnly, kinds]); // eslint-disable-line react-hooks/exhaustive-deps
  const flip = (k: NameKind) => setKinds((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));
  const stop = (e: React.KeyboardEvent) => e.stopPropagation();
  return (
    <div className="rename-bar">
      <input value={find} placeholder="Find" onChange={(e) => setFind(e.target.value)} onKeyDown={stop} />
      <input value={replace} placeholder="Replace with" onChange={(e) => setReplace(e.target.value)} onKeyDown={stop} />
      <div className="rename-opts">
        <label title="The text to find is a regular expression; $1 in the replacement is the first group">
          <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} /> Regex
        </label>
        <label title="Capital and small letters differ">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case
        </label>
        <label title="Only the first match inside each name">
          <input type="checkbox" checked={firstOnly} onChange={(e) => setFirstOnly(e.target.checked)} /> First only
        </label>
      </div>
      <div className="rename-opts">
        {NAME_KINDS.map((k) => (
          <label key={k}>
            <input type="checkbox" checked={kinds.includes(k)} onChange={() => flip(k)} /> {KIND_LABEL[k]}
          </label>
        ))}
      </div>
      <div className="rename-go">
        <span className="hint-text">{plan.invalid ? 'Not a valid expression' : find ? `${plan.changes.length} to rename${plan.skipped.length ? `, ${plan.skipped.length} skipped` : ''}` : ' '}</span>
        <Button small primary disabled={!plan.changes.length} title="Rename every name that matches, as one step of the history" onClick={() => void findReplaceNames(opts)}>
          Replace
        </Button>
      </div>
    </div>
  );
}
