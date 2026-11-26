/** The web player: the same poses as the editor, mixes without jumps, events once each, and types that match what it gives. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAnimation } from '@/core/animate';
import { webGameFiles } from '@/core/export/webGame';
import { compileSkeleton, createSkeleton } from '@/core/skeleton';
import type { Skeleton } from '@/core/skeleton';
import { createCharacter } from '@/runtime/character';
import type { CharacterData, GameEvent } from '@/runtime/character';
import { buildFixture } from './fixture';
import { addPhysicsRig } from './physicsrig';

function data(physics = false): CharacterData {
  const f = buildFixture();
  if (physics) addPhysicsRig(f.project);
  // through text, as a game gets it
  return JSON.parse(
    JSON.stringify({ bone2d: 1, name: 'fixture', skeleton: f.project.skeleton, images: {}, smooth: true }),
  ) as CharacterData;
}

const shape = (sk: Skeleton) => [
  ...sk.bones.flatMap((b) => [b.worldX, b.worldY, b.a, b.b, b.c, b.d]),
  ...sk.slots.flatMap((s) => [...s.color, ...s.deform]),
];
/** The bones alone: their places can be compared one to one even when two slots show different pictures. */
const bones = (sk: Skeleton) => sk.bones.flatMap((b) => [b.worldX, b.worldY, b.a, b.b, b.c, b.d]);
const shown = (sk: Skeleton) => [...sk.drawOrder.map((s) => s.data.name), ...sk.slots.map((s) => s.attachmentName)];
const far = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - (b[i] ?? 0))), 0);

/** What the editor shows of an animation at a time. */
function editor(d: CharacterData, name: string, time: number) {
  const sk = createSkeleton(compileSkeleton(d.skeleton), null);
  applyAnimation(
    sk,
    d.skeleton.animations.find((a) => a.name === name)!,
    time,
  );
  sk.updateWorldTransform('none');
  return sk;
}

describe('the web player', () => {
  it('poses every animation as the editor does', () => {
    const d = data();
    for (const name of createCharacter(d).animations) {
      const hero = createCharacter(d);
      hero.play(name, { loop: false });
      let at = 0;
      for (const step of [0, 0.11, 0.2, 0.33, 0.4]) {
        hero.update(step);
        at = Math.min(at + step, d.skeleton.animations.find((a) => a.name === name)!.duration);
        const want = editor(d, name, at);
        expect(hero.time).toBeCloseTo(at, 9);
        expect(far(shape(hero.skeleton), shape(want))).toBeLessThan(1e-3);
        expect(shown(hero.skeleton)).toEqual(shown(want));
      }
    }
  });

  it('goes over from one animation to another without a jump, and ends exactly on the new one', () => {
    const d = data();
    const [a, b] = createCharacter(d).animations;
    const hero = createCharacter(d);
    hero.play(a, { loop: true });
    hero.update(0.4);
    const before = bones(hero.skeleton);
    // a hard switch moves the pose a lot; the mix starts where the old pose was
    const hard = far(before, bones(editor(d, b, 0)));
    expect(hard).toBeGreaterThan(5);
    hero.play(b, { loop: true, mix: 0.3 });
    hero.update(0.001);
    expect(far(before, bones(hero.skeleton))).toBeLessThan(hard * 0.05);
    let last = bones(hero.skeleton);
    let biggest = 0;
    for (let i = 0; i < 30; i++) {
      hero.update(0.01);
      const now = bones(hero.skeleton);
      biggest = Math.max(biggest, far(last, now));
      last = now;
    }
    expect(biggest).toBeLessThan(hard);
    hero.update(0.1);
    expect(far(bones(hero.skeleton), bones(editor(d, b, hero.time)))).toBeLessThan(1e-3);
  });

  it('starts a mix that interrupts a mix from the pose on screen', () => {
    const d = data();
    const [a, b] = createCharacter(d).animations;
    const hero = createCharacter(d);
    hero.play(a);
    hero.update(0.2);
    hero.play(b, { mix: 0.4 });
    hero.update(0.2);
    const on = bones(hero.skeleton);
    hero.play(a, { mix: 0.4 });
    hero.update(0.0001);
    expect(far(on, bones(hero.skeleton))).toBeLessThan(1);
  });

  it('gives every event once each time it is passed, with the values of the key or of the event', () => {
    const d = data();
    const anim = d.skeleton.animations.find((x) => x.events.length)!;
    anim.events = [
      { time: 0, event: d.skeleton.events[0].id },
      { time: anim.duration / 2, event: d.skeleton.events[0].id, int: 9, string: 'own' },
    ];
    const hero = createCharacter(d);
    const got: GameEvent[] = [];
    hero.onEvent = (e) => got.push(e);
    hero.play(anim.name, { loop: true });
    hero.update(0);
    const step = anim.duration / 10;
    for (let i = 0; i < 29; i++) hero.update(step);
    // three rounds: the start of each and the middle of each
    expect(got.map((e) => e.int)).toEqual([3, 9, 3, 9, 3, 9]);
    expect(got[0]).toEqual({ name: 'hit', int: 3, float: 1.5, string: 'ouch', animation: anim.name });
    expect(got[1].string).toBe('own');
  });

  it('says once when an animation ends, and goes on with the one that waited', () => {
    const d = data();
    const [a, b] = createCharacter(d).animations;
    const length = d.skeleton.animations[0].duration;
    const hero = createCharacter(d);
    const ended: string[] = [];
    hero.onEnd = (n) => ended.push(n);
    hero.play(a, { loop: false });
    for (let i = 0; i < 5; i++) hero.update(length / 2);
    expect(ended).toEqual([a]);
    expect(hero.time).toBeCloseTo(length, 9);

    hero.play(a, { loop: false, mix: 0 });
    hero.playNext(b, { loop: true });
    hero.update(length / 2);
    expect(hero.animation).toBe(a);
    hero.update(length);
    expect(hero.animation).toBe(b);
    expect(ended).toEqual([a, a]);
    // a looping one gives way at the end of its round
    hero.playNext(a);
    const own = d.skeleton.animations[1].duration;
    for (let i = 0; i < 12 && hero.animation === b; i++) hero.update(own / 8);
    expect(hero.animation).toBe(a);
  });

  it('moves, mirrors and wears skins; holds a bone where it is told', () => {
    const d = data();
    const hero = createCharacter(d);
    // a bone that no constraint turns by its place in the world
    const at = () => hero.bone('legUpper')!;
    const home = at();
    hero.x = 500;
    hero.y = -20;
    hero.update(0);
    expect([at().x, at().y]).toEqual([expect.closeTo(home.x + 500, 3), expect.closeTo(home.y - 20, 3)]);
    hero.scaleX = -1;
    hero.update(0);
    expect(at().x).toBeCloseTo(500 - home.x, 3);
    hero.moveBone('handTarget', 400, 90);
    hero.play(hero.animations[0]);
    hero.update(0.3);
    expect([hero.bone('handTarget')!.x, hero.bone('handTarget')!.y]).toEqual([expect.closeTo(400, 3), expect.closeTo(90, 3)]);
    hero.releaseBone('handTarget');
    hero.update(0.01);
    expect(hero.bone('handTarget')!.x).not.toBeCloseTo(400, 0);
    expect(hero.skins.length).toBeGreaterThan(0);
    expect(() => hero.setSkin(hero.skins[0])).not.toThrow();
    hero.setSkin(null);
    const slot = hero.skeleton.slots[0];
    hero.setAttachment(slot.data.name, null);
    hero.update(0.1);
    expect(slot.attachmentName).toBeNull();
    expect(hero.bounds()).not.toBeNull();
    expect(hero.bone('nobody')).toBeNull();
  });

  it('says what exists when asked for what does not', () => {
    const hero = createCharacter(data());
    expect(() => hero.play('fly')).toThrow(/There are: /);
    expect(() => hero.setSkin('gold')).toThrow(/No skin "gold"/);
    expect(() => createCharacter({} as CharacterData)).toThrow(/Not a Bone 2D/);
  });

  it('simulates physics, from rest after a reset', () => {
    const d = data(true);
    const run = () => {
      const hero = createCharacter(d);
      hero.play('walk');
      for (let i = 0; i < 40; i++) hero.update(1 / 30);
      return shape(hero.skeleton);
    };
    const first = run();
    expect(first.every(Number.isFinite)).toBe(true);
    expect(run()).toEqual(first);
    const hero = createCharacter(d);
    hero.play('walk');
    for (let i = 0; i < 40; i++) hero.update(1 / 30);
    expect(far(shape(hero.skeleton), shape(editor(d, 'walk', hero.time)))).toBeGreaterThan(0.1);
    // a character is not thenable: it can be returned from an async function
    expect('then' in hero).toBe(false);
  });

  it('declares in its types what it really gives', () => {
    const types = readFileSync('src/runtime/bone2d.d.ts', 'utf8');
    const body = /export interface Character \{([\s\S]*?)\n\}/.exec(types)![1];
    const declared = [...body.matchAll(/^ {2}(?:readonly )?([a-zA-Z]+)[(:?]/gm)].map((m) => m[1]);
    const real = Object.keys(createCharacter(data())).filter((k) => k !== 'skeleton');
    expect([...new Set(declared)].sort()).toEqual(real.sort());
    const index = readFileSync('src/runtime/index.ts', 'utf8');
    for (const name of ['loadCharacter', 'createCharacter', 'createView']) {
      expect(types).toContain(`export function ${name}(`);
      expect(index).toContain(name);
    }
  });

  it('is exported with a page that loads it, safe whatever the name is', () => {
    const d = data();
    d.name = 'Hero </script> "№1"';
    const files = webGameFiles(d, 'export const x = 1;', 'types');
    expect(files.map((f) => f.name)).toEqual(['index.html', 'Hero_script_1.json', 'bone2d.js', 'bone2d.d.ts']);
    expect(files[0].text).not.toContain('Hero </script>');
    expect(files[0].text).toContain('./Hero_script_1.json');
    expect(JSON.parse(files[1].text)).toEqual(d);
    expect(files[2].text).toContain('MIT License');
  });
});
