/** Transform constraints (Spine 4.3): create from presets and edit. */
import type { Draft } from 'immer';
import { freshName } from '@/core/edit';
import { newTransformConstraint } from '@/core/model';
import type { Id, TransformConstraint, TransformFrom, TransformProp } from '@/core/model';
import { setSelection } from './actions';
import { docStore } from './doc';
import { toast } from './ui';

export type TransformPreset = 'rotation' | 'mirror' | 'position' | 'scale' | 'rotateToX';

export const PRESET_LABEL: Record<TransformPreset, string> = {
  rotation: 'Copy rotation',
  mirror: 'Mirror rotation',
  position: 'Copy position',
  scale: 'Copy scale',
  rotateToX: 'Rotation → X (rolling)',
};

function mapping(from: TransformProp, to: TransformProp, scale = 1): TransformFrom {
  return { prop: from, offset: 0, to: [{ prop: to, offset: 0, max: 1, scale }] };
}

export function presetProperties(p: TransformPreset): TransformFrom[] {
  switch (p) {
    case 'rotation':
      return [mapping('rotate', 'rotate')];
    case 'mirror':
      return [mapping('rotate', 'rotate', -1)];
    case 'position':
      return [mapping('x', 'x'), mapping('y', 'y')];
    case 'scale':
      return [mapping('scaleX', 'scaleX'), mapping('scaleY', 'scaleY')];
    case 'rotateToX':
      return [mapping('rotate', 'x', 0.5)];
  }
}

export function createTransformConstraint(bones: Id[], source: Id, preset: TransformPreset): Id | null {
  const doc = docStore.get().skeleton;
  if (!bones.length || !source) return null;
  if (bones.includes(source)) {
    toast('The source must be a different bone than the constrained bones', 'error');
    return null;
  }
  const target = doc.bones.find((b) => b.id === bones[0]);
  const src = doc.bones.find((b) => b.id === source);
  const c = newTransformConstraint({
    name: freshName(`${target?.name ?? 'bone'} follows ${src?.name ?? 'source'}`, doc.constraints),
    bones,
    source,
    properties: presetProperties(preset),
  });
  docStore.update('Create transform constraint', (d) => {
    d.skeleton.constraints.push(c);
  });
  setSelection({ constraint: c.id });
  toast(`Transform constraint created (${PRESET_LABEL[preset].toLowerCase()})`, 'ok');
  return c.id;
}

export function updateTransform(id: Id, recipe: (c: Draft<TransformConstraint>) => void, label = 'Edit transform constraint') {
  docStore.update(label, (d) => {
    const c = d.skeleton.constraints.find((x) => x.id === id);
    if (c && c.type === 'transform') recipe(c);
  });
}
