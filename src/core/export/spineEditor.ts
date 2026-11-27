/**
 * What the Spine editor asks of an imported file beyond what the runtimes do. A file that breaks one of these plays in a game and is
 * refused by Import Data (seen with Spine 4.3.26).
 */
import { deformLength } from '../mesh';
import type { Animation, Attachment, Id, MeshAttachment, SkeletonDoc } from '../model';

/**
 * The editor wants the bones of a weighted vertex in the order of the skeleton. Gives a copy of the document written that way: the order
 * of the influences changes nothing in the pose, but the numbers of a deform key follow it, so they move together.
 */
export function bonesInOrder(doc: SkeletonDoc, boneIndex: ReadonlyMap<Id, number>): SkeletonDoc {
  const hasBone = (id: Id) => boneIndex.has(id);
  /** For an attachment that changes: where each pair of its deform numbers comes from. */
  const moved = new Map<Attachment, number[]>();
  const skins = doc.skins.map((skin) => ({
    ...skin,
    attachments: Object.fromEntries(
      Object.entries(skin.attachments).map(([slotId, list]) => [
        slotId,
        Object.fromEntries(
          Object.entries(list).map(([key, att]) => {
            if (!('weights' in att) || !att.weights) return [key, att];
            const from: number[] = [];
            let pairs = 0;
            const vertices = att.type === 'mesh' ? att.uvs.length >> 1 : att.weights.length;
            const weights = att.weights.map((list, i) => {
              const valid = list.filter((inf) => hasBone(inf[0]));
              const order = valid.map((_, j) => j).sort((a, b) => boneIndex.get(valid[a][0])! - boneIndex.get(valid[b][0])!);
              if (i < vertices) {
                if (valid.length) for (const j of order) from.push(pairs + j);
                else from.push(pairs);
                pairs += valid.length || 1;
              }
              return [...order.map((j) => valid[j]), ...list.filter((inf) => !hasBone(inf[0]))];
            });
            if (from.every((p, i) => p === i)) return [key, att];
            const turned = { ...att, weights };
            moved.set(turned, from);
            return [key, turned];
          }),
        ),
      ]),
    ),
  }));

  const animations: Animation[] = doc.animations.map((a) => ({
    ...a,
    deform: Object.fromEntries(
      Object.entries(a.deform).map(([skinId, slots]) => [
        skinId,
        Object.fromEntries(
          Object.entries(slots).map(([slotId, list]) => [
            slotId,
            Object.fromEntries(
              Object.entries(list).map(([key, keys]) => {
                const att = skins.find((s) => s.id === skinId)?.attachments[slotId]?.[key];
                const from = att && moved.get(att);
                if (!att || !from || (att.type !== 'mesh' && att.type !== 'path')) return [key, keys];
                const size = deformLength(att, hasBone);
                return [
                  key,
                  keys.map((k) =>
                    k.value.length === size ? { ...k, value: from.flatMap((p) => [k.value[p * 2], k.value[p * 2 + 1]]) } : k,
                  ),
                ];
              }),
            ),
          ]),
        ),
      ]),
    ),
  }));

  return { ...doc, skins, animations };
}

/**
 * Spine's own way with skins: the default skin holds what every look shares, and a picture another skin replaces belongs to a skin too.
 * The editor cannot show a picture of the default skin that a skin replaces, so those move into a skin of their own (`base`), with the
 * deform and sequence keys and the links that point at them. `skin` is that skin, or null (and the document itself) when nothing is
 * replaced.
 */
export function withBaseSkin(doc: SkeletonDoc): { doc: SkeletonDoc; skin: { id: Id; name: string } | null } {
  const [first, ...others] = doc.skins;
  const moved = new Set<string>();
  for (const [slotId, list] of Object.entries(first?.attachments ?? {}))
    for (const key of Object.keys(list)) if (others.some((s) => s.attachments[slotId]?.[key])) moved.add(`${slotId}\n${key}`);
  if (!first || !moved.size) return { doc, skin: null };

  let name = 'base';
  for (let n = 2; doc.skins.some((s) => s.name === name); n++) name = `base-${n}`;
  const id = `${first.id}-base`;
  const isMoved = (slotId: Id, key: string) => moved.has(`${slotId}\n${key}`);
  /** The entries of a slot → key table that move (`true`) or stay (`false`). */
  const part = <T>(slots: Record<Id, Record<string, T>>, move: boolean): Record<Id, Record<string, T>> =>
    Object.fromEntries(
      Object.entries(slots)
        .map(
          ([slotId, list]) => [slotId, Object.fromEntries(Object.entries(list).filter(([key]) => isMoved(slotId, key) === move))] as const,
        )
        .filter(([, list]) => Object.keys(list).length),
    );
  const relink = (slots: Record<Id, Record<string, Attachment>>) =>
    Object.fromEntries(
      Object.entries(slots).map(([slotId, list]) => [
        slotId,
        Object.fromEntries(
          Object.entries(list).map(([key, att]) => {
            if (att.type !== 'mesh' || !att.link) return [key, att];
            const toFirst = (att.link.skin ?? first.id) === first.id && isMoved(att.link.slot ?? slotId, att.link.source);
            return [key, toFirst ? { ...att, link: { ...att.link, skin: id } } : att];
          }),
        ),
      ]),
    );
  const shared = { ...first, attachments: relink(part(first.attachments, false)) };
  const base = { ...first, id, name, bones: [], constraints: [], attachments: relink(part(first.attachments, true)) };
  /** Keys of the default skin follow their attachment. */
  const follow = <T>(table: Record<Id, Record<Id, Record<string, T>>>) => {
    const own = table[first.id];
    if (!own) return table;
    const out = { ...table, [first.id]: part(own, false) };
    const gone = part(own, true);
    if (Object.keys(gone).length) out[id] = gone;
    if (!Object.keys(out[first.id]).length) delete out[first.id];
    return out;
  };
  const animations = doc.animations.map((a) => ({
    ...a,
    deform: follow(a.deform),
    ...(a.sequence ? { sequence: follow(a.sequence) } : {}),
  }));
  const rest = others.map((s) => ({ ...s, attachments: relink(s.attachments) }));
  return { doc: { ...doc, skins: [shared, base, ...rest], animations }, skin: { id, name } };
}

/**
 * The way back, on a parsed file: the skin `base` that {@link withBaseSkin} wrote goes into the default skin again and the names that had
 * to be given are dropped, so a project that was exported and imported has the skins it had. A file that merely has a skin called `base`
 * (other names, bones or constraints, or a place no other skin replaces) is left as it is.
 */
export function foldBaseSkin(root: Record<string, unknown>): Record<string, unknown> {
  type Table = Record<string, Record<string, Record<string, unknown>>>;
  type RawSkin = Record<string, unknown> & { attachments?: Table };
  const skins = Array.isArray(root.skins) ? (root.skins as (RawSkin | null)[]).filter((s): s is RawSkin => !!s) : [];
  const base = skins.find((s) => s.name === 'base');
  if (!base || Object.keys(base).some((k) => k !== 'name' && k !== 'attachments')) return root;
  const own = (s: RawSkin | undefined): Table => s?.attachments ?? {};
  const first = skins.find((s) => s.name === 'default');
  const others = skins.filter((s) => s !== base && s !== first);
  const keys = Object.entries(own(base)).flatMap(([slot, list]) => Object.keys(list).map((key) => [slot, key] as const));
  const ours = keys.every(
    ([slot, key]) => own(base)[slot][key].name === `base/${key}` && !own(first)[slot]?.[key] && others.some((s) => own(s)[slot]?.[key]),
  );
  if (!keys.length || !ours) return root;

  const copy = structuredClone(root);
  const list = copy.skins as RawSkin[];
  const from = list.find((s) => s.name === 'base')!;
  let into = list.find((s) => s.name === 'default');
  if (!into) list.unshift((into = { name: 'default' }));
  const target = (into.attachments ??= {});
  for (const [slot, key] of keys) (target[slot] ??= {})[key] = own(from)[slot][key];
  const left = list.filter((s) => s !== from);
  copy.skins = left;
  for (const skin of left) {
    const wrote = skin === into ? 'base' : String(skin.name);
    for (const [slot, attachments] of Object.entries(own(skin))) {
      for (const [key, att] of Object.entries(attachments)) {
        if (att.skin === 'base') delete att.skin; // the source of a linked mesh
        if (att.name === `${wrote}/${key}` && keys.some(([s, k]) => s === slot && k === key)) delete att.name;
      }
    }
  }
  const animations = (copy.animations ?? {}) as Record<string, { attachments?: Record<string, Table> }>;
  for (const animation of Object.values(animations)) {
    const table = animation.attachments;
    if (!table?.base) continue;
    const to = (table.default ??= {});
    for (const [slot, attachments] of Object.entries(table.base)) Object.assign((to[slot] ??= {}), attachments);
    delete table.base;
  }
  return copy;
}

/** The key of {@link editorNames}. */
export const attachmentId = (skinId: Id, slotId: Id, key: string) => `${skinId}\n${slotId}\n${key}`;

/**
 * Names for the attachments that may not keep theirs. In one slot the editor takes a name once: an attachment of the default skin may not
 * be called like a skin's placeholder, and two different attachments may not share a name. Those get `<skin>/<name>` (`base/` for the
 * default skin), the way Spine's own examples name them. The keys, which games and timelines use, and the pictures stay.
 */
export function editorNames(doc: SkeletonDoc): Map<string, string> {
  const names = new Map<string, string>();
  const bySlot = new Map<Id, { skin: SkeletonDoc['skins'][number]; base: boolean; key: string; att: Attachment }[]>();
  doc.skins.forEach((skin, i) => {
    for (const [slotId, list] of Object.entries(skin.attachments)) {
      let here = bySlot.get(slotId);
      if (!here) bySlot.set(slotId, (here = []));
      for (const [key, att] of Object.entries(list)) here.push({ skin, base: i === 0, key, att });
    }
  });
  for (const [slotId, here] of bySlot) {
    const taken = new Set(here.flatMap((e) => [e.key, e.att.name]));
    const placeholders = new Set(here.filter((e) => !e.base).map((e) => e.key));
    const shared = new Set<string>();
    for (const name of new Set(here.map((e) => e.att.name))) {
      const group = here.filter((e) => e.att.name === name);
      const shapes = new Set(group.map((e) => JSON.stringify({ ...e.att, name: '' })));
      if (group.length > 1 && (shapes.size > 1 || group.some((e) => e.base))) shared.add(name);
    }
    for (const e of here) {
      if (!shared.has(e.att.name) && !(e.base && placeholders.has(e.att.name))) continue;
      const wanted = `${e.base ? 'base' : e.skin.name}/${e.att.name}`;
      let name = wanted;
      for (let n = 2; taken.has(name); n++) name = `${wanted}-${n}`;
      taken.add(name);
      names.set(attachmentId(e.skin.id, slotId, e.key), name);
    }
  }
  return names;
}

/** The edges of a mesh as a Spine file lists them: the outline and the manual edges, each end counted as vertex × 2. */
export function editorEdges(mesh: MeshAttachment): number[] {
  const n = mesh.uvs.length >> 1;
  const out: number[] = [];
  const seen = new Set<string>();
  const add = (a: number, b: number) => {
    const id = a < b ? `${a} ${b}` : `${b} ${a}`;
    if (a === b || a >= n || b >= n || seen.has(id)) return;
    seen.add(id);
    out.push(a * 2, b * 2);
  };
  for (let i = 0; i < mesh.hull; i++) add(i, (i + 1) % mesh.hull);
  const manual = mesh.edges ?? [];
  for (let i = 0; i + 1 < manual.length; i += 2) add(manual[i], manual[i + 1]);
  return out;
}
