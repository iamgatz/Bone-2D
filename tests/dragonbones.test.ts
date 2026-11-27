/** DragonBones import: the imported project poses like the official runtime, and says what it could not carry over. */
import { describe, expect, it } from 'vitest';
import { applyAnimation } from '@/core/animate';
import { displayPaths, dragonAtlas, dragonBonesToSpine, importDragonBones, isDragonAtlas, isDragonBones } from '@/core/import/dragonBones';
import { cutRegion } from '@/core/import/unpack';
import { meshWorldVertices, regionWorldVertices } from '@/core/rig/geometry';
import { compileSkeleton, createSkeleton } from '@/core/skeleton';
import { validateProject } from '@/core/validate';
import { dragonSkeleton, DRAGON_PICTURES } from './dragonfixture';
import { DRAGON_GOLDEN } from './dragongolden';

describe('a DragonBones skeleton imported', () => {
  const { project } = importDragonBones(dragonSkeleton(), DRAGON_PICTURES);
  const doc = project.skeleton;

  it.each(Object.keys(DRAGON_GOLDEN).map(Number))('poses frame %i as the official runtime does', (frame) => {
    const golden = DRAGON_GOLDEN[frame];
    const sk = createSkeleton(compileSkeleton(doc), null);
    applyAnimation(sk, frame < 0 ? null : doc.animations[0], frame / 24);
    sk.updateWorldTransform('none');
    const off: string[] = [];
    for (const [name, [x, y, a, b, c, d]] of Object.entries(golden.bones)) {
      const bone = sk.bones.find((v) => v.data.name === name)!;
      const place = Math.hypot(bone.worldX - x, bone.worldY - y);
      const axes = Math.max(Math.abs(bone.a - a), Math.abs(bone.b - b), Math.abs(bone.c - c), Math.abs(bone.d - d));
      // the runtime reads a curve from samples at whole frames, so what hangs on an eased bone can differ by a fraction of a unit
      if (place > 0.3 || axes > 0.004) off.push(`bone ${name}: ${place.toFixed(3)} ${axes.toFixed(4)}`);
    }
    expect(sk.drawOrder.map((s) => s.data.name)).toEqual(golden.slots.map((s) => s[0]));
    for (const [name, shown, color, points] of golden.slots) {
      const slot = sk.slots.find((s) => s.data.name === name)!;
      const att = sk.getAttachment(slot.data.index, slot.attachmentName);
      expect(att?.name ?? null, name).toBe(shown);
      if (!att || (att.kind !== 'region' && att.kind !== 'mesh')) continue;
      color.forEach((v, i) => expect(Math.abs(slot.color[i] - v), `${name} colour`).toBeLessThan(0.012));
      const got: number[] = [];
      if (att.kind === 'region') regionWorldVertices(att, slot.bone, got);
      else meshWorldVertices(sk, slot, att, slot.deform.length ? slot.deform : null, got);
      // a slanted picture became a mesh: its corners may be listed in another order
      const quad = points.length === 8 && name === 'mark';
      for (let i = 0; i < points.length; i += 2) {
        const d = quad
          ? Math.min(...[0, 2, 4, 6].map((k) => Math.hypot(got[k] - points[i], got[k + 1] - points[i + 1])))
          : Math.hypot(got[i] - points[i], got[i + 1] - points[i + 1]);
        if (d > 0.3) off.push(`slot ${name} point ${i / 2}: ${d.toFixed(3)}`);
      }
    }
    expect(off).toEqual([]);
  });
});

type Fixture = ReturnType<typeof dragonSkeleton>;
/** The fixture with something changed, and what the import says about it. */
function warned(change: (armature: any, root: any) => void) {
  const root: Fixture = dragonSkeleton();
  change(root.armature[0], root);
  return importDragonBones(root, DRAGON_PICTURES);
}

describe('what a DragonBones import carries over', () => {
  const { project, warnings } = importDragonBones(dragonSkeleton(), DRAGON_PICTURES);
  const doc = project.skeleton;

  it('makes a valid project with nothing to complain about, as long as the animations say', () => {
    expect(warnings).toEqual([]);
    expect(validateProject(project)).toEqual([]);
    expect([doc.name, doc.fps, doc.animations.map((a) => [a.name, a.duration])]).toEqual(['hero', 24, [['go', 0.5]]]);
    expect(doc.bones.map((b) => b.name)).toEqual(['root', 'arm', 'hand', 'neck', 'tail', 'leg', 'shin', 'foot']);
    expect(doc.slots.map((s) => [s.name, s.blend, s.attachment])).toEqual([
      ['body', 'normal', 'body'],
      ['glove', 'normal', 'glove'],
      ['flag', 'additive', 'flag'],
      ['mark', 'normal', 'slant'],
      ['zone', 'normal', 'zone'],
    ]);
  });

  it('keeps the events, the draw order and every kind of key', () => {
    const [go] = doc.animations;
    expect(go.events.map((e) => [e.time, doc.events.find((d) => d.id === e.event)!.name, e.int, e.string])).toEqual([
      [5 / 24, 'step', 3, 'a'],
    ]);
    expect(go.drawOrder.map((k) => k.time)).toEqual([0, 0.25]);
    expect(Object.keys(go.bones)).toHaveLength(3);
    expect(Object.values(go.deform)).toHaveLength(1);
    expect(Object.keys(go.ik)).toHaveLength(1);
  });

  it('holds the last keys of an animation that plays once', () => {
    const once = warned((a) => (a.animation[0].playTimes = 1)).project.skeleton.animations[0];
    const loop = doc.animations[0];
    const bone = (anim: typeof once) => Object.values(anim.bones)[0].translate!;
    expect(bone(once)).toHaveLength(3);
    expect(bone(loop)).toHaveLength(4);
    expect(bone(loop).at(-1)!.value).toEqual(bone(loop)[0].value);
  });

  it.each<[string, (a: any, root: any) => void, RegExp]>([
    ['an old file', (_, root) => (root.version = '4.5'), /4\.5/],
    ['a second armature', (_, root) => root.armature.push({ name: 'extra', bone: [{ name: 'r' }] }), /"extra"/],
    ['an armature in a slot', (a) => a.skin[0].slot[0].display.push({ name: 'x', type: 'armature' }), /inside a slot/],
    ['a surface', (a) => a.bone.push({ name: 's', type: 'surface' }), /surface/],
    ['colour offsets', (a) => (a.slot[0].color = { rO: 40 }), /offsets/],
    ['an unknown blend mode', (a) => (a.slot[0].blendMode = 'darken'), /darken/],
    ['a missing picture', (a) => (a.skin[0].slot[0].display[1].name = 'nowhere'), /nowhere/],
    ['a command in a key', (a) => (a.animation[0].frame[0].actions = [{ gotoAndPlay: 'go' }]), /actions/],
    ['timelines of 5.6', (a) => (a.animation[0].timeline = [{ type: 40 }]), /5\.6/],
    ['IK that is partly on', (a) => (a.animation[0].ik[0].frame[1].weight = 0.5), /partly/],
    ['an uneven scale above', (a) => ((a.bone[3].transform.scX = 2), (a.bone[4].inheritScale = false)), /one way more/],
  ])('says so about %s', (_, change, message) => {
    expect(warned(change).warnings.join(' | ')).toMatch(message);
  });

  it('takes a bone that ignores a scale for an ordinary one where nothing above it is ever scaled', () => {
    const inherit = (scale: number) =>
      warned((a) => {
        Object.assign(a.bone[4], { inheritRotation: true, inheritScale: false });
        a.bone[3].transform.scX = scale;
      }).project.skeleton.bones.find((b) => b.name === 'tail')!.inherit;
    expect([inherit(1), inherit(2)]).toEqual(['normal', 'noScale']);
  });

  it('knows its files from other ones and takes the armature the others are parts of', () => {
    expect(isDragonBones(dragonSkeleton())).toBe(true);
    expect(isDragonBones({ skeleton: { spine: '4.3' }, bones: [] })).toBe(false);
    expect(isDragonAtlas({ SubTexture: [] })).toBe(true);
    expect(isDragonAtlas(dragonSkeleton())).toBe(false);
    expect(() => dragonBonesToSpine({}, new Map())).toThrow('Not a DragonBones');
    expect(displayPaths(dragonSkeleton()).sort()).toEqual(['body', 'flag', 'glove', 'parts/body2', 'slant']);
    const two = dragonSkeleton();
    two.armature.unshift({ name: 'part', bone: [{ name: 'r' }] } as never);
    expect(dragonBonesToSpine(two, DRAGON_PICTURES).name).toBe('hero');
  });

  it('survives files with parts missing or of the wrong kind', () => {
    let seed = 11;
    const random = (n: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    const junk = [null, 0, -1, 1e9, 'x', [], {}, [null], true];
    for (let round = 0; round < 600; round++) {
      const root = dragonSkeleton();
      for (let change = 0; change <= random(4); change++) {
        let at: any = root.armature[0];
        for (let depth = 0; depth < 6; depth++) {
          const keys = Object.keys(at);
          if (!keys.length) break;
          const key = keys[random(keys.length)];
          if (at[key] && typeof at[key] === 'object' && random(3)) at = at[key];
          else {
            at[key] = junk[random(junk.length)];
            break;
          }
        }
      }
      try {
        const made = importDragonBones(root, DRAGON_PICTURES).project;
        const sk = createSkeleton(compileSkeleton(made.skeleton), null);
        for (const anim of made.skeleton.animations) applyAnimation(sk, anim, 0.2);
        sk.updateWorldTransform('none');
      } catch (e) {
        // a file that says nothing usable is refused with a sentence, never with a broken program state
        expect((e as Error).message, `round ${round}`).toMatch(/^Not a (DragonBones|Spine)/);
      }
    }
  });
});

describe('a DragonBones texture atlas', () => {
  it('gives the regions with their trimmed borders, turned ones too', () => {
    const page = dragonAtlas({
      imagePath: 'a.png',
      width: 8,
      height: 8,
      SubTexture: [
        { name: 'plain', x: 1, y: 2, width: 3, height: 2, frameX: -1, frameY: -2, frameWidth: 6, frameHeight: 5 },
        { name: 'turned', x: 0, y: 0, width: 3, height: 1, rotated: true },
      ],
    });
    expect(page.file).toBe('a.png');
    const pixels = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
    const mark = (x: number, y: number, v: number) => pixels.data.set([v, 0, 0, 255], (y * 8 + x) * 4);
    mark(1, 2, 10); // the top left of "plain"
    const plain = cutRegion(pixels, page.regions[0]);
    expect([plain.width, plain.height, plain.data[(2 * 6 + 1) * 4]]).toEqual([6, 5, 10]);
    // "turned" is 3 wide and 1 tall and lies a quarter turn clockwise: one pixel wide, three tall, its left end on top
    mark(0, 0, 21);
    mark(0, 2, 23);
    const turned = cutRegion(pixels, page.regions[1]);
    expect([turned.width, turned.height, turned.data[0], turned.data[8]]).toEqual([3, 1, 21, 23]);
  });
});
