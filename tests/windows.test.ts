/** The Metrics window numbers and the remembered window layout. */
import { describe, expect, it } from 'vitest';
import { newAnimation } from '../src/core/model';
import { countKeys, projectStats, projectWarnings } from '../src/core/stats';
import { DEFAULT_VIEWS, LAYOUTS, VIEW_LIST, readLayout } from '../src/store/layout';
import { buildFixture } from './fixture';

describe('project stats', () => {
  const { project } = buildFixture();

  it('count what is in the rig', () => {
    const s = projectStats(project);
    expect(s.bones).toBe(project.skeleton.bones.length);
    expect(s.slots).toBe(project.skeleton.slots.length);
    expect(s.animations).toBe(project.skeleton.animations.length);
    expect(s.attachments.mesh).toBeGreaterThan(0);
    expect(s.vertices).toBeGreaterThan(0);
    expect(s.triangles).toBeGreaterThan(0);
    expect(s.keys).toBe(project.skeleton.animations.reduce((n, a) => n + countKeys(a), 0));
    expect(s.keys).toBeGreaterThan(20);
    expect(Object.values(s.constraints).reduce((a, b) => a + b, 0)).toBe(project.skeleton.constraints.length);
  });

  it('count the keys of an animation once each', () => {
    const a = newAnimation('x', 1);
    expect(countKeys(a)).toBe(0);
    const bone = project.skeleton.bones[0].id;
    a.bones[bone] = { rotate: [{ time: 0, value: [0] }, { time: 1, value: [10] }], translate: [{ time: 0.5, value: [1, 2] }] } as never;
    expect(countKeys(a)).toBe(3);
  });

  it('report forgotten things without touching the project', () => {
    const before = JSON.stringify(project);
    const withExtra = structuredClone(project);
    withExtra.images.push({ id: 'zz', name: 'never-used', width: 4, height: 4 });
    withExtra.skeleton.animations.push(newAnimation('empty', 1));
    const w = projectWarnings(withExtra);
    expect(w).toContainEqual({ kind: 'unusedImage', subject: 'never-used' });
    expect(w).toContainEqual({ kind: 'emptyAnimation', subject: 'empty' });
    expect(JSON.stringify(project)).toBe(before);
  });
});

describe('window layout', () => {
  it('keeps what is valid and falls back to the defaults for the rest', () => {
    expect(readLayout(null)).toEqual({});
    expect(readLayout('not json')).toEqual({});
    const odd = readLayout(JSON.stringify({ views: { tree: false, timeline: 'yes', ghost: true }, panel: { left: 5, right: 300, bottom: 300 } }));
    expect(odd.views).toEqual({ ...DEFAULT_VIEWS, tree: false });
    expect(odd.panel).toBeUndefined(); // 5 px wide would hide the window for good
    const ok = readLayout(JSON.stringify({ views: DEFAULT_VIEWS, panel: { left: 270, right: 300, bottom: 300 } }));
    expect(ok.panel).toEqual({ left: 270, right: 300, bottom: 300 });
  });

  it('has ready layouts that name every window', () => {
    for (const l of LAYOUTS) expect(Object.keys(l.views).sort()).toEqual(VIEW_LIST.map((v) => v.id).sort());
    expect(LAYOUTS[0].views).toEqual(DEFAULT_VIEWS);
  });
});
