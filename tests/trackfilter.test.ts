/** The track filter of the dopesheet: kinds of tracks, a name pattern, selected bones and slots only. */
import { describe, expect, it } from 'vitest';
import { NO_TRACK_FILTER, TRACK_GROUPS, buildRows, filterRows, isTrackFilter } from '../src/core/timelineRows';
import { buildFixture } from './fixture';

function rows(
  pick: (doc: ReturnType<typeof buildFixture>['project']['skeleton']) => string[] = () => [],
  expanded: Record<string, boolean> = {},
) {
  const { project } = buildFixture();
  const doc = project.skeleton;
  const anim = doc.animations.find((a) => a.name === 'walk')!;
  return { doc, built: buildRows(doc, anim, pick(doc), null, expanded) };
}
const groups = (r: { id: string }[]) => r.filter((x) => x.id.startsWith('g:')).map((x) => x.id);

describe('filterRows', () => {
  it('gives the same rows when nothing is filtered', () => {
    const { built } = rows();
    expect(isTrackFilter(NO_TRACK_FILTER)).toBe(false);
    expect(filterRows(built, NO_TRACK_FILTER)).toBe(built);
  });

  it('leaves out the groups that are switched off, with their rows', () => {
    const { built } = rows();
    const present = groups(built);
    expect(present.length).toBeGreaterThan(2);
    const out = filterRows(built, { ...NO_TRACK_FILTER, hidden: [present[0]] });
    expect(groups(out)).toEqual(present.slice(1));
    expect(out.length).toBeLessThan(built.length);
    expect(filterRows(built, { ...NO_TRACK_FILTER, hidden: TRACK_GROUPS.map((g) => g.id) })).toEqual([]);
  });

  it('keeps the tracks whose name matches, with their property rows, and drops the empty groups', () => {
    const { built } = rows(() => [], {});
    const bone = built.find((r) => r.type === 'entity' && r.id.startsWith('bone:'))!;
    const out = filterRows(built, { ...NO_TRACK_FILTER, text: bone.label });
    expect(out.find((r) => r.id === bone.id)).toBeDefined();
    // a group with nothing left is not listed
    for (const g of groups(out)) {
      const at = out.findIndex((r) => r.id === g);
      expect(at + 1).toBeLessThan(out.length);
      expect(out[at + 1].type).not.toBe('group');
    }
    // a pattern that matches nothing leaves nothing
    expect(filterRows(built, { ...NO_TRACK_FILTER, text: 'zzz-no-such-track' })).toEqual([]);
  });

  it('takes patterns like the hierarchy filter: words, wildcards, regular expressions', () => {
    const { built } = rows();
    const entity = built.find((r) => r.type === 'entity')!;
    expect(filterRows(built, { ...NO_TRACK_FILTER, text: `${entity.label[0]}*` }).some((r) => r.id === entity.id)).toBe(true);
    expect(filterRows(built, { ...NO_TRACK_FILTER, text: `/^${entity.label}$/` }).some((r) => r.id === entity.id)).toBe(true);
    // an expression that does not parse matches nothing
    expect(filterRows(built, { ...NO_TRACK_FILTER, text: '/(/' })).toEqual([]);
  });

  it('shows only the selected bones when asked, and leaves the other kinds alone', () => {
    let chosen = '';
    const { doc, built } = rows((d) => {
      const ids = Object.keys(d.animations.find((a) => a.name === 'walk')!.bones);
      chosen = ids[0];
      return [chosen];
    });
    expect(Object.keys(doc.animations.find((a) => a.name === 'walk')!.bones).length).toBeGreaterThan(1);
    expect(built.filter((r) => r.id.startsWith('bone:') && r.type === 'entity').length).toBeGreaterThan(1);
    const out = filterRows(built, { ...NO_TRACK_FILTER, selectedOnly: true });
    const bones = out.filter((r) => r.id.startsWith('bone:') && r.type === 'entity');
    expect(bones.map((r) => r.id)).toEqual([`bone:${chosen}`]);
    const other = (g: string) => g !== 'g:bones' && g !== 'g:slots';
    expect(groups(out).filter(other)).toEqual(groups(built).filter(other));
  });

  it('hands out the very rows it was given, so the keys are the same ones', () => {
    const { built } = rows();
    const out = filterRows(built, { ...NO_TRACK_FILTER, hidden: ['g:deform'] });
    for (const r of out) expect(r).toBe(built.find((b) => b.id === r.id));
  });
});
