/** Names in bulk: the filter forms (words, wildcards, regular expressions) and Find and replace. */
import { describe, expect, it } from 'vitest';
import { applyRename, nameMatcher, planRename } from '../src/core/rename';
import type { FindReplaceOptions } from '../src/core/rename';
import { filterTree } from '../src/core/treeFilter';
import { validateProject } from '../src/core/validate';
import { buildFixture } from './fixture';

const opts = (extra: Partial<FindReplaceOptions>): FindReplaceOptions => ({ find: 'x', replace: 'y', regex: false, matchCase: false, firstOnly: false, kinds: ['bone'], ...extra });

describe('nameMatcher', () => {
  it('is null for an empty filter', () => {
    expect(nameMatcher('')).toBeNull();
    expect(nameMatcher('   ')).toBeNull();
  });

  it('words: every word, any case, any order', () => {
    const m = nameMatcher('arm UP')!;
    expect(m('armUpper')).toBe(true);
    expect(m('upperArm')).toBe(true);
    expect(m('armLower')).toBe(false);
  });

  it('wildcards: * is a run, ? is one character, the rest is literal', () => {
    expect(nameMatcher('arm*per')!('armUpper')).toBe(true);
    expect(nameMatcher('arm?pper')!('armUpper')).toBe(true);
    expect(nameMatcher('arm?per')!('armUpper')).toBe(false);
    expect(nameMatcher('a.m*')!('a.mX')).toBe(true);
    expect(nameMatcher('a.m*')!('abmX')).toBe(false);
    expect(nameMatcher('(x)*')!('(x)y')).toBe(true);
  });

  it('/regex/: flags, and a bad expression matches nothing instead of throwing', () => {
    expect(nameMatcher('/^arm/')!('armUpper')).toBe(true);
    expect(nameMatcher('/^arm/')!('legarm')).toBe(false);
    expect(nameMatcher('/^ARM/')!('armUpper')).toBe(false);
    expect(nameMatcher('/^ARM/i')!('armUpper')).toBe(true);
    expect(nameMatcher('/(/')!('anything')).toBe(false);
  });

  it('a stateful flag does not make the test flip between calls', () => {
    const m = nameMatcher('/a/g')!;
    expect([m('a'), m('a'), m('a')]).toEqual([true, true, true]);
  });
});

describe('the hierarchy filter with the new forms', () => {
  const doc = buildFixture().project.skeleton;
  it('finds bones by wildcard and by regular expression, with their ancestors', () => {
    const names = (q: string) => doc.bones.filter((b) => filterTree(doc, q).bones.has(b.id)).map((b) => b.name);
    expect(names('arm*')).toContain('armLower');
    expect(names('arm*')).toContain('torso');
    expect(names('/^hand/')).toEqual(expect.arrayContaining(['hand', 'handTarget']));
    const none = filterTree(doc, '/(/');
    expect(none.active).toBe(true);
    expect(none.bones.size).toBe(0);
  });
});

describe('planRename / applyRename', () => {
  it('renames what matches, only in the chosen kinds', () => {
    const doc = buildFixture().project.skeleton;
    const plan = planRename(doc, opts({ find: 'arm', replace: 'Arm', matchCase: true }));
    expect(plan.changes.length).toBeGreaterThan(0);
    expect(plan.changes.every((c) => c.kind === 'bone')).toBe(true);
    expect(plan.changes.map((c) => c.to)).toContain('ArmUpper');
    const before = doc.slots.map((s) => s.name);
    applyRename(doc, plan.changes);
    expect(doc.bones.some((b) => b.name === 'ArmUpper')).toBe(true);
    expect(doc.slots.map((s) => s.name)).toEqual(before);
  });

  it('match case and first-only', () => {
    const doc = buildFixture().project.skeleton;
    expect(planRename(doc, opts({ find: 'ARM', replace: 'q', matchCase: true })).changes).toHaveLength(0);
    expect(planRename(doc, opts({ find: 'ARM', replace: 'q', matchCase: false })).changes.length).toBeGreaterThan(0);
    const names = doc.bones.map((b) => b.name);
    const target = names.find((n) => (n.match(/e/gi) ?? []).length > 1)!;
    const first = planRename(doc, opts({ find: 'e', replace: '_', firstOnly: true })).changes.find((c) => c.from === target)!;
    const all = planRename(doc, opts({ find: 'e', replace: '_' })).changes.find((c) => c.from === target)!;
    expect((first.to.match(/_/g) ?? []).length).toBe(1);
    expect((all.to.match(/_/g) ?? []).length).toBeGreaterThan(1);
  });

  it('a plain replacement is literal ($1 is just text), a regular expression one has groups', () => {
    const doc = buildFixture().project.skeleton;
    const lit = planRename(doc, opts({ find: 'head', replace: '$1x' })).changes.find((c) => c.from === 'head');
    expect(lit?.to).toBe('$1x');
    const grp = planRename(doc, opts({ find: '^(arm)(\\w+)$', replace: '$2_$1', regex: true })).changes.find((c) => c.from === 'armUpper');
    expect(grp?.to).toBe('Upper_arm');
  });

  it('special characters in a plain search are not an expression', () => {
    const doc = buildFixture().project.skeleton;
    doc.bones[1].name = 'a.b(c)';
    const plan = planRename(doc, opts({ find: '.b(', replace: '-' }));
    expect(plan.invalid).toBe(false);
    expect(plan.changes.find((c) => c.from === 'a.b(c)')?.to).toBe('a-c)');
  });

  it('an expression that does not parse is reported, nothing changes', () => {
    const doc = buildFixture().project.skeleton;
    const plan = planRename(doc, opts({ find: '(', replace: '', regex: true }));
    expect(plan.invalid).toBe(true);
    expect(plan.changes).toHaveLength(0);
  });

  it('a name that would clash or become empty is skipped and listed', () => {
    const doc = buildFixture().project.skeleton;
    const plan = planRename(doc, opts({ find: '.+', replace: 'same', regex: true, firstOnly: true }));
    // the first one takes "same", every other one would clash with it
    expect(plan.changes).toHaveLength(1);
    expect(plan.skipped.length).toBe(doc.bones.length - 1);
    expect(plan.skipped.every((s) => s.why === 'taken')).toBe(true);
    const gone = planRename(doc, opts({ find: 'head', replace: '' }));
    expect(gone.skipped.find((s) => s.from === 'head')?.why).toBe('empty');
  });

  it('swapping works one name at a time and never leaves a duplicate', () => {
    const doc = buildFixture().project.skeleton;
    const a = doc.bones.find((b) => b.name === 'armUpper')!;
    const plan = planRename(doc, opts({ find: 'armUpper', replace: 'armLower' }));
    expect(plan.changes).toHaveLength(0);
    expect(plan.skipped[0]).toMatchObject({ from: 'armUpper', why: 'taken' });
    expect(a.name).toBe('armUpper');
  });

  it('keeps the default skin name, and renames the rest of the kinds', () => {
    const { project } = buildFixture();
    const doc = project.skeleton;
    const kinds = ['bone', 'slot', 'skin', 'event', 'constraint', 'animation'] as const;
    const plan = planRename(doc, opts({ find: '[a-z]', replace: 'Z', regex: true, firstOnly: true, kinds }));
    expect(plan.changes.some((c) => c.kind === 'skin' && c.from === doc.skins[0].name)).toBe(false);
    applyRename(doc, plan.changes);
    for (const list of [doc.bones, doc.slots, doc.skins, doc.events, doc.constraints, doc.animations]) {
      const names = list.map((x) => x.name);
      expect(new Set(names).size).toBe(names.length);
    }
    expect(validateProject(project)).toEqual([]);
  });

  it('ignores a change whose name moved on since the plan was made', () => {
    const doc = buildFixture().project.skeleton;
    const plan = planRename(doc, opts({ find: 'head', replace: 'skull' }));
    doc.bones.find((b) => b.name === 'head')!.name = 'other';
    expect(applyRename(doc, plan.changes)).toBe(0);
  });
});
