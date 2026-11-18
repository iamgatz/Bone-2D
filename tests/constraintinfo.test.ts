/** The constraint debug view's data: who drives which bones, how strongly, and which links the selection brings into focus. */
import { describe, expect, it } from 'vitest';
import { constraintLinks, focusLinks, linkLabel, linksTouching } from '../src/core/constraintInfo';
import { compileSkeleton, createSkeleton } from '../src/core/skeleton';
import { buildFixture } from './fixture';
import { addPathRig } from './pathrig';
import { addPhysicsRig } from './physicsrig';

function posed() {
  const { project } = buildFixture();
  addPathRig(project);
  addPhysicsRig(project);
  const data = compileSkeleton(project.skeleton);
  const sk = createSkeleton(data, null);
  sk.updateWorldTransform('pose' as never);
  return { project, sk };
}

describe('constraintLinks', () => {
  it('has a link for every active constraint, with the kind and the bones it moves', () => {
    const { sk } = posed();
    const links = constraintLinks(sk);
    expect(links.length).toBe(sk.constraints.filter((c) => c.active).length);
    for (const l of links) {
      expect(l.strength).toBeGreaterThanOrEqual(0);
      expect(l.strength).toBeLessThanOrEqual(1);
      if (l.kind !== 'slider') expect(l.driven.length).toBeGreaterThan(0);
    }
    const kinds = new Set(links.map((l) => l.kind));
    for (const k of ['ik', 'transform', 'path', 'physics'] as const) expect(kinds.has(k)).toBe(true);
  });

  it('an IK link is driven by its target and moves its chain; a path or physics link has no driver bone', () => {
    const { sk } = posed();
    for (const l of constraintLinks(sk)) {
      const c = sk.constraintById(l.id)!;
      if (c.kind === 'ik') {
        expect(l.driver).toBe(c.target);
        expect(l.driven).toEqual(c.bones);
        expect(l.strength).toBeCloseTo(Math.max(0, Math.min(1, c.mix)), 12);
      }
      if (c.kind === 'path' || c.kind === 'physics') expect(l.driver).toBeNull();
      if (c.kind === 'transform') expect(l.driver).toBe(c.source);
    }
  });

  it('skips a constraint that is not active', () => {
    const { sk } = posed();
    const first = sk.constraints[0];
    first.active = false;
    expect(constraintLinks(sk).some((l) => l.id === first.data.id)).toBe(false);
  });
});

describe('focusLinks', () => {
  it('the selected constraint alone; else the links that touch the selected bones; else every link', () => {
    const { sk } = posed();
    const links = constraintLinks(sk);
    const ik = links.find((l) => l.kind === 'ik')!;
    expect([...focusLinks(links, ik.id, [])]).toEqual([ik.id]);
    const touching = focusLinks(links, null, [ik.driven[0].data.id]);
    expect(touching.has(ik.id)).toBe(true);
    expect(touching.size).toBe(linksTouching(links, new Set([ik.driven[0].data.id])).length);
    expect(focusLinks(links, null, []).size).toBe(links.length);
    // a bone that no constraint touches, and a constraint that is not there, fall back to all
    expect(focusLinks(links, 'nope', ['no-such-bone']).size).toBe(links.length);
  });

  it('a bone that is the driver counts as touched too', () => {
    const { sk } = posed();
    const links = constraintLinks(sk);
    const ik = links.find((l) => l.kind === 'ik')!;
    expect(linksTouching(links, new Set([ik.driver!.data.id])).map((l) => l.id)).toContain(ik.id);
  });
});

describe('linkLabel', () => {
  it('shows the strength only when it is not full', () => {
    const base = { id: 'x', name: 'arm ik', kind: 'ik' as const, driver: null, driven: [] };
    expect(linkLabel({ ...base, strength: 1 })).toBe('arm ik');
    expect(linkLabel({ ...base, strength: 0.456 })).toBe('arm ik 46%');
    expect(linkLabel({ ...base, strength: 0 })).toBe('arm ik 0%');
  });
});
