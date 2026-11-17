import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Id } from '@/core/model';
import { useProject } from '@/store/doc';
import { deleteConstraint, moveConstraint, renameConstraint } from '@/store/ikActions';
import { IconButton, TextField } from '../ui/controls';
import { Section } from '../ui/Section';
import type { SectionKind } from '../ui/Section';

/** The top of the inspector of any constraint: its kind, the buttons that move it in the order of application and delete it, and its name. */
export function ConstraintHeader(props: { id: Id; title: string; icon: LucideIcon; kind: SectionKind; deleteTitle?: string }) {
  const project = useProject();
  const constraints = project.skeleton.constraints;
  const c = constraints.find((x) => x.id === props.id);
  if (!c) return null;
  const index = constraints.indexOf(c);
  return (
    <Section
      id="constraint.head"
      title={props.title}
      icon={props.icon}
      kind={props.kind}
      collapsible={false}
      actions={
        <>
          <IconButton icon={ArrowUp} title="Apply earlier" small disabled={index <= 0} onClick={() => moveConstraint(props.id, -1)} />
          <IconButton icon={ArrowDown} title="Apply later" small disabled={index >= constraints.length - 1} onClick={() => moveConstraint(props.id, 1)} />
          <IconButton icon={Trash2} title={props.deleteTitle ?? 'Delete constraint'} small onClick={() => deleteConstraint(props.id)} />
        </>
      }
    >
      <TextField value={c.name} onCommit={(n) => renameConstraint(props.id, n)} wide />
    </Section>
  );
}
