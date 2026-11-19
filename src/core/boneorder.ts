/**
 * The order of the bones among their siblings (Spine's Bone Order Up / Down): a bone changes places with the sibling next to it, and its
 * descendants go with it. The list keeps parents before children. No DOM.
 */
import type { Id, SkeletonDoc } from './model';

/** The bone and every bone below it, in list order. */
function subtreeOf(doc: SkeletonDoc, id: Id): Set<Id> {
  const out = new Set<Id>([id]);
  for (const b of doc.bones) if (b.parent && out.has(b.parent)) out.add(b.id);
  return out;
}

/**
 * Moves the bone one place up (-1) or down (1) among the bones of its parent. Returns false when there is nowhere to go (the first or last
 * sibling, an unknown bone), true when the list changed.
 */
export function moveBoneOrder(doc: SkeletonDoc, id: Id, direction: -1 | 1): boolean {
  const bone = doc.bones.find((b) => b.id === id);
  if (!bone) return false;
  const siblings = doc.bones.filter((b) => b.parent === bone.parent);
  const at = siblings.findIndex((b) => b.id === id);
  const other = siblings[at + direction];
  if (at < 0 || !other) return false;
  // moving down is moving the next sibling up
  const moving = direction === -1 ? bone : other;
  const before = direction === -1 ? other : bone;
  const block = subtreeOf(doc, moving.id);
  const moved = doc.bones.filter((b) => block.has(b.id));
  const rest = doc.bones.filter((b) => !block.has(b.id));
  const insertAt = rest.findIndex((b) => b.id === before.id);
  if (insertAt < 0) return false;
  rest.splice(insertAt, 0, ...moved);
  doc.bones.splice(0, doc.bones.length, ...rest);
  return true;
}
