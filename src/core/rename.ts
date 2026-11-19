/**
 * Names in bulk: the matcher behind the hierarchy filter (words, `*` and `?` wildcards, `/regular expression/`) and Find and replace for the
 * names of bones, slots, skins, events, constraints and animations. Pure functions over the document; nothing here touches pictures,
 * because a picture name is the name of an atlas region and is renamed in the Images window.
 */
import type { Id, SkeletonDoc } from './model';

export type NameTest = (name: string) => boolean;

/**
 * A test for a typed filter, or null when nothing is typed. Three forms: `/text/` (a regular expression, `/text/i` is case blind),
 * text with `*` (any run of characters) or `?` (one character), and plain words (each one has to be in the name, in any case).
 * A regular expression that does not parse matches nothing, so the tree shows it as an empty result instead of failing.
 */
export function nameMatcher(query: string): NameTest | null {
  const q = query.trim();
  if (!q) return null;
  const slashed = /^\/(.+)\/([a-z]*)$/s.exec(q);
  if (slashed) {
    try {
      const re = new RegExp(slashed[1], slashed[2].replace(/[gy]/g, ''));
      return (name) => re.test(name);
    } catch {
      return () => false;
    }
  }
  if (/[*?]/.test(q)) {
    const source = q
      .split('')
      .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
      .join('');
    const re = new RegExp(source, 'is');
    return (name) => re.test(name);
  }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return (name) => {
    const n = name.toLowerCase();
    return words.every((w) => n.includes(w));
  };
}

export type NameKind = 'bone' | 'slot' | 'skin' | 'event' | 'constraint' | 'animation';
export const NAME_KINDS: readonly NameKind[] = ['bone', 'slot', 'skin', 'event', 'constraint', 'animation'];

export interface FindReplaceOptions {
  find: string;
  replace: string;
  /** `find` is a regular expression and `replace` may use $1, $2 ... */
  regex: boolean;
  matchCase: boolean;
  /** Only the first match inside each name. */
  firstOnly: boolean;
  kinds: readonly NameKind[];
}

export interface RenameChange {
  kind: NameKind;
  id: Id;
  from: string;
  to: string;
}

export interface RenamePlan {
  changes: RenameChange[];
  /** A name that matched but could not change: it would be empty or the same as another name. */
  skipped: { kind: NameKind; from: string; to: string; why: 'empty' | 'taken' }[];
  /** The expression did not parse. */
  invalid: boolean;
}

function listOf(doc: SkeletonDoc, kind: NameKind): { id: Id; name: string }[] {
  switch (kind) {
    case 'bone':
      return doc.bones;
    case 'slot':
      return doc.slots;
    case 'skin':
      return doc.skins;
    case 'event':
      return doc.events;
    case 'constraint':
      return doc.constraints;
    case 'animation':
      return doc.animations;
  }
}

/**
 * What Find and replace would do, without doing it. Names are replaced one after the other: when two would end up the same the second
 * is skipped (it is listed), so the result never needs the validator to repair a duplicate. The default skin keeps its name.
 */
export function planRename(doc: SkeletonDoc, opts: FindReplaceOptions): RenamePlan {
  const plan: RenamePlan = { changes: [], skipped: [], invalid: false };
  if (!opts.find) return plan;
  let re: RegExp;
  try {
    const source = opts.regex ? opts.find : opts.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(source, (opts.matchCase ? '' : 'i') + (opts.firstOnly ? '' : 'g') + 's');
  } catch {
    plan.invalid = true;
    return plan;
  }
  // a plain replacement is taken literally: "$" in it does not mean a group
  const swap = (name: string) => (opts.regex ? name.replace(re, opts.replace) : name.replace(re, () => opts.replace));
  for (const kind of NAME_KINDS) {
    if (!opts.kinds.includes(kind)) continue;
    const list = listOf(doc, kind);
    const taken = new Set(list.map((x) => x.name));
    list.forEach((item, index) => {
      if (kind === 'skin' && index === 0) return;
      const to = swap(item.name);
      if (to === item.name) return;
      if (!to.trim()) return void plan.skipped.push({ kind, from: item.name, to, why: 'empty' });
      if (taken.has(to)) return void plan.skipped.push({ kind, from: item.name, to, why: 'taken' });
      taken.delete(item.name);
      taken.add(to);
      plan.changes.push({ kind, id: item.id, from: item.name, to });
    });
  }
  return plan;
}

/** Puts a plan into the document. Returns how many names changed. */
export function applyRename(doc: SkeletonDoc, changes: readonly RenameChange[]): number {
  let n = 0;
  for (const c of changes) {
    const item = listOf(doc, c.kind).find((x) => x.id === c.id);
    if (item && item.name === c.from) {
      item.name = c.to;
      n++;
    }
  }
  return n;
}
