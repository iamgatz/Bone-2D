/** Builds the dopesheet row model (what is listed on the left and where the diamonds sit) from the document. */
import { KEY_EPS } from '@/core/edit';
import type { KeyRef } from '@/core/keyrefs';
import { deformProp } from '@/core/keyrefs';
import { BONE_PROPS, PHYSICS_PARAMS } from '@/core/model';
import type { Animation, Id, SkeletonDoc } from '@/core/model';

export interface RowKeyInfo {
  time: number;
  refs: KeyRef[];
}

export type RowType = 'group' | 'entity' | 'prop';

export interface Row {
  id: string;
  label: string;
  type: RowType;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  keys: RowKeyInfo[];
  /** Selecting this row's entity in the editor. */
  target?: { kind: 'bone' | 'slot' | 'ik'; id: Id };
  selected?: boolean;
  /** Tint of the row's diamonds. */
  tone?: 'bone' | 'slot' | 'ik' | 'deform' | 'order' | 'event';
}

const PROP_LABEL: Record<string, string> = {
  rotate: 'Rotate',
  translate: 'Translate',
  translatex: 'Translate X',
  translatey: 'Translate Y',
  scale: 'Scale',
  scalex: 'Scale X',
  scaley: 'Scale Y',
  shear: 'Shear',
  shearx: 'Shear X',
  sheary: 'Shear Y',
  attachment: 'Attachment',
  rgba: 'Color',
  rgba2: 'Color',
  time: 'Time',
  mix: 'Mix',
  position: 'Position',
  spacing: 'Spacing',
};

function merge(into: RowKeyInfo[], refs: KeyRef[]) {
  for (const ref of refs) {
    const hit = into.find((k) => Math.abs(k.time - ref.time) <= KEY_EPS);
    if (hit) hit.refs.push(ref);
    else into.push({ time: ref.time, refs: [ref] });
  }
}

function propRows(id: string, depth: number, props: { prop: string; kind: KeyRef['kind']; target: Id; keys: { time: number }[] }[], tone: Row['tone']): Row[] {
  return props.map((p) => ({
    id: `${id}/${p.prop}`,
    label: PROP_LABEL[p.prop] ?? p.prop,
    type: 'prop',
    depth,
    expandable: false,
    expanded: false,
    keys: p.keys.map((k) => ({ time: k.time, refs: [{ kind: p.kind, target: p.target, prop: p.prop, time: k.time }] })),
    tone,
  }));
}

export function buildRows(doc: SkeletonDoc, anim: Animation | null, selectedBones: Id[], selectedSlot: Id | null, expanded: Record<string, boolean>): Row[] {
  if (!anim) return [];
  const rows: Row[] = [];
  const isOpen = (id: string, def = false) => (id in expanded ? expanded[id] : def);

  // ---- bones
  const boneRows: Row[] = [];
  for (const bone of doc.bones) {
    const tl = anim.bones[bone.id];
    const selected = selectedBones.includes(bone.id);
    if (!tl && !selected) continue;
    const props = BONE_PROPS.filter((p) => tl?.[p]?.length).map((p) => ({ prop: p, kind: 'bone' as const, target: bone.id, keys: tl![p]! }));
    const id = `bone:${bone.id}`;
    const open = isOpen(id, selected);
    const keys: RowKeyInfo[] = [];
    for (const p of props) merge(keys, p.keys.map((k) => ({ kind: 'bone' as const, target: bone.id, prop: p.prop, time: k.time })));
    keys.sort((a, b) => a.time - b.time);
    boneRows.push({ id, label: bone.name, type: 'entity', depth: 1, expandable: props.length > 0, expanded: open && props.length > 0, keys, target: { kind: 'bone', id: bone.id }, selected, tone: 'bone' });
    if (open) boneRows.push(...propRows(id, 2, props, 'bone'));
  }
  if (boneRows.length) rows.push({ id: 'g:bones', label: 'Bones', type: 'group', depth: 0, expandable: false, expanded: true, keys: [] }, ...boneRows);

  // ---- slots
  const slotRows: Row[] = [];
  for (const slot of doc.slots) {
    const tl = anim.slots[slot.id];
    if (!tl) continue;
    const props = (['attachment', 'rgba', 'rgba2'] as const).filter((p) => tl[p]?.length).map((p) => ({ prop: p, kind: 'slot' as const, target: slot.id, keys: tl[p]! }));
    if (!props.length) continue;
    const id = `slot:${slot.id}`;
    const open = isOpen(id, selectedSlot === slot.id);
    const keys: RowKeyInfo[] = [];
    for (const p of props) merge(keys, p.keys.map((k) => ({ kind: 'slot' as const, target: slot.id, prop: p.prop, time: k.time })));
    keys.sort((a, b) => a.time - b.time);
    slotRows.push({ id, label: slot.name, type: 'entity', depth: 1, expandable: true, expanded: open, keys, target: { kind: 'slot', id: slot.id }, selected: selectedSlot === slot.id, tone: 'slot' });
    if (open) slotRows.push(...propRows(id, 2, props, 'slot'));
  }
  if (slotRows.length) rows.push({ id: 'g:slots', label: 'Slots', type: 'group', depth: 0, expandable: false, expanded: true, keys: [] }, ...slotRows);

  // ---- constraints
  const ikRows: Row[] = [];
  for (const c of doc.constraints) {
    if (c.type === 'slider') {
      const tl = anim.slider?.[c.id];
      const props = (['time', 'mix'] as const).filter((p) => tl?.[p]?.length).map((p) => ({ prop: p, kind: 'slider' as const, target: c.id, keys: tl![p]! }));
      if (!props.length) continue;
      const id = `slider:${c.id}`;
      const open = isOpen(id, false);
      const keys: RowKeyInfo[] = [];
      for (const p of props) merge(keys, p.keys.map((k) => ({ kind: 'slider' as const, target: c.id, prop: p.prop, time: k.time })));
      keys.sort((a, b) => a.time - b.time);
      ikRows.push({ id, label: c.name, type: 'entity', depth: 1, expandable: true, expanded: open, keys, target: { kind: 'ik', id: c.id }, tone: 'ik' });
      if (open) ikRows.push(...propRows(id, 2, props, 'ik'));
      continue;
    }
    if (c.type === 'path') {
      const tl = anim.path?.[c.id];
      const props = (['position', 'spacing', 'mix'] as const).filter((p) => tl?.[p]?.length).map((p) => ({ prop: p, kind: 'path' as const, target: c.id, keys: tl![p]! }));
      if (!props.length) continue;
      const id = `path:${c.id}`;
      const open = isOpen(id, false);
      const keys: RowKeyInfo[] = [];
      for (const p of props) merge(keys, p.keys.map((k) => ({ kind: 'path' as const, target: c.id, prop: p.prop, time: k.time })));
      keys.sort((a, b) => a.time - b.time);
      ikRows.push({ id, label: c.name, type: 'entity', depth: 1, expandable: true, expanded: open, keys, target: { kind: 'ik', id: c.id }, tone: 'ik' });
      if (open) ikRows.push(...propRows(id, 2, props, 'ik'));
      continue;
    }
    if (c.type === 'physics') {
      const tl = anim.physics?.[c.id];
      const props = ([...PHYSICS_PARAMS, 'reset'] as const).filter((p) => tl?.[p]?.length).map((p) => ({ prop: p, kind: 'physics' as const, target: c.id, keys: tl![p]! }));
      if (!props.length) continue;
      const id = `physics:${c.id}`;
      const open = isOpen(id, false);
      const keys: RowKeyInfo[] = [];
      for (const p of props) merge(keys, p.keys.map((k) => ({ kind: 'physics' as const, target: c.id, prop: p.prop, time: k.time })));
      keys.sort((a, b) => a.time - b.time);
      ikRows.push({ id, label: c.name, type: 'entity', depth: 1, expandable: true, expanded: open, keys, target: { kind: 'ik', id: c.id }, tone: 'ik' });
      if (open) ikRows.push(...propRows(id, 2, props, 'ik'));
      continue;
    }
    if (c.type === 'transform') {
      const mixKeys = anim.transform?.[c.id];
      if (!mixKeys?.length) continue;
      ikRows.push({ id: `transform:${c.id}`, label: c.name, type: 'entity', depth: 1, expandable: false, expanded: false, keys: mixKeys.map((k) => ({ time: k.time, refs: [{ kind: 'transform' as const, target: c.id, prop: '', time: k.time }] })), target: { kind: 'ik', id: c.id }, tone: 'ik' });
      continue;
    }
    const keys = anim.ik[c.id];
    if (!keys?.length) continue;
    ikRows.push({ id: `ik:${c.id}`, label: c.name, type: 'entity', depth: 1, expandable: false, expanded: false, keys: keys.map((k) => ({ time: k.time, refs: [{ kind: 'ik' as const, target: c.id, prop: '', time: k.time }] })), target: { kind: 'ik', id: c.id }, tone: 'ik' });
  }
  if (ikRows.length) rows.push({ id: 'g:ik', label: 'Constraints', type: 'group', depth: 0, expandable: false, expanded: true, keys: [] }, ...ikRows);

  // ---- deform
  const deformRows: Row[] = [];
  for (const skinId in anim.deform) {
    const skin = doc.skins.find((s) => s.id === skinId);
    for (const slotId in anim.deform[skinId]) {
      const slot = doc.slots.find((s) => s.id === slotId);
      for (const att in anim.deform[skinId][slotId]) {
        const keys = anim.deform[skinId][slotId][att];
        if (!keys.length) continue;
        deformRows.push({
          id: `deform:${skinId}:${slotId}:${att}`,
          label: `${slot?.name ?? '?'} / ${att}${skin && skin.name !== 'default' ? ` (${skin.name})` : ''}`,
          type: 'entity',
          depth: 1,
          expandable: false,
          expanded: false,
          keys: keys.map((k) => ({ time: k.time, refs: [{ kind: 'deform' as const, target: slotId, prop: deformProp(skinId, att), time: k.time }] })),
          tone: 'deform',
        });
      }
    }
  }
  if (deformRows.length) rows.push({ id: 'g:deform', label: 'Deform', type: 'group', depth: 0, expandable: false, expanded: true, keys: [] }, ...deformRows);

  // ---- sequences
  const sequenceRows: Row[] = [];
  for (const skinId in anim.sequence ?? {}) {
    const skin = doc.skins.find((s) => s.id === skinId);
    for (const slotId in anim.sequence![skinId]) {
      const slot = doc.slots.find((s) => s.id === slotId);
      for (const att in anim.sequence![skinId][slotId]) {
        const keys = anim.sequence![skinId][slotId][att];
        if (!keys.length) continue;
        sequenceRows.push({
          id: `sequence:${skinId}:${slotId}:${att}`,
          label: `${slot?.name ?? '?'} / ${att}${skin && skin.name !== 'default' ? ` (${skin.name})` : ''}`,
          type: 'entity',
          depth: 1,
          expandable: false,
          expanded: false,
          keys: keys.map((k) => ({ time: k.time, refs: [{ kind: 'sequence' as const, target: slotId, prop: deformProp(skinId, att), time: k.time }] })),
          target: slot ? { kind: 'slot', id: slotId } : undefined,
          tone: 'slot',
        });
      }
    }
  }
  if (sequenceRows.length) rows.push({ id: 'g:sequence', label: 'Sequences', type: 'group', depth: 0, expandable: false, expanded: true, keys: [] }, ...sequenceRows);

  // ---- draw order / events
  const folderRows = (doc.drawOrderFolders ?? []).filter((f) => anim.drawOrderFolder?.[f.id]?.length);
  if (anim.drawOrder.length || anim.events.length || folderRows.length) {
    rows.push({ id: 'g:other', label: 'Draw order & events', type: 'group', depth: 0, expandable: false, expanded: true, keys: [] });
    for (const f of folderRows) rows.push({ id: `orderfolder:${f.id}`, label: f.name, type: 'entity', depth: 1, expandable: false, expanded: false, keys: anim.drawOrderFolder![f.id].map((k) => ({ time: k.time, refs: [{ kind: 'drawOrderFolder' as const, target: f.id, prop: '', time: k.time }] })), tone: 'order' });
    if (anim.drawOrder.length) rows.push({ id: 'order', label: 'Draw order', type: 'entity', depth: 1, expandable: false, expanded: false, keys: anim.drawOrder.map((k) => ({ time: k.time, refs: [{ kind: 'drawOrder' as const, target: '', prop: '', time: k.time }] })), tone: 'order' });
    if (anim.events.length) rows.push({ id: 'events', label: 'Events', type: 'entity', depth: 1, expandable: false, expanded: false, keys: anim.events.map((k) => ({ time: k.time, refs: [{ kind: 'event' as const, target: '', prop: '', time: k.time }] })), tone: 'event' });
  }
  return rows;
}
