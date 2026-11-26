/** The test pose of the Weights tool: bones are tried out on the screen while the weights are painted, and the document does not change. */
import { beforeEach, describe, expect, it } from 'vitest';
import { meshFromRegion, meshWorldPositions } from '@/core/mesh';
import type { RegionAttachment } from '@/core/model';
import { emptyProject, newBone, newSlot } from '@/core/model';
import { dragFrom, grabFor, WIGGLE_PERIOD, wiggleOf } from '@/core/testPose';
import { currentPose, setSelection, setTool, setMode, resetTestPose, toggleWiggle } from '@/store/actions';
import { docStore } from '@/store/doc';
import { createIkFromDrag } from '@/store/ikActions';
import { bindMeshToBones, getMesh, paintWeights, setupMats } from '@/store/meshActions';
import { getScene, getViewScene, setWiggleClock } from '@/store/scene';
import { uiStore } from '@/store/ui';

let slotId = '';
let root = '';
let a = '';
let b = '';

/** A strip 200 long along x with two bones in a chain: a (0..100) and its child b (100..200), the mesh bound to both. */
beforeEach(() => {
  const p = emptyProject();
  const r = newBone({ name: 'root' });
  const ba = newBone({ name: 'a', parent: r.id, length: 100 });
  const bb = newBone({ name: 'b', parent: ba.id, x: 100, length: 100 });
  p.skeleton.bones = [r, ba, bb];
  const slot = newSlot({ name: 's', bone: r.id });
  p.skeleton.slots = [slot];
  const region: RegionAttachment = {
    type: 'region',
    name: 'img',
    path: 'img',
    x: 100,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    width: 200,
    height: 60,
    color: [1, 1, 1, 1],
  };
  p.skeleton.skins[0].attachments[slot.id] = { img: meshFromRegion(region) };
  slot.attachment = 'img';
  docStore.replace(p);
  uiStore.patch({ mode: 'setup', tool: 'select', testPose: {}, wiggle: false });
  [slotId, root, a, b] = [slot.id, r.id, ba.id, bb.id];
  setSelection({ slot: slotId, attachment: 'img', bones: [a, b] });
  bindMeshToBones(slotId, 'img', [a, b]);
  setTool('weights');
});

const bone = (id: string) => getViewScene().skeleton.boneById(id)!;
const weightsOfB = () => getMesh(slotId, 'img')!.weights!.map((l) => l.find((e) => e[0] === b)?.[3] ?? 0);

describe('what a drag takes hold of', () => {
  it('a bone is turned, a bone without a parent is moved', () => {
    expect(grabFor(getScene().skeleton, b)).toEqual({ bone: b, move: false });
    expect(grabFor(getScene().skeleton, root)).toEqual({ bone: root, move: true });
  });

  it('a bone of an IK chain is moved by the target of the chain', () => {
    const target = newBone({ name: 'target', parent: root, x: 200 });
    docStore.update('target', (d) => void d.skeleton.bones.push(target));
    createIkFromDrag(b, target.id, 200, 0);
    const sk = getScene().skeleton;
    const chain = sk.data.constraints.find((c) => c.kind === 'ik')!;
    expect(chain.kind).toBe('ik');
    expect(grabFor(sk, b)).toMatchObject({ bone: target.id, move: true });
    expect(grabFor(sk, target.id)).toMatchObject({ bone: target.id, move: true });
  });

  it('a drag turns a bone by the angle the pointer went round its origin', () => {
    const at = dragFrom(getScene().skeleton, { bone: b, move: false }, [200, 0])!;
    expect(at([100, 100]).rotation).toBeCloseTo(90, 6);
    expect(at([100, -100]).rotation).toBeCloseTo(-90, 6);
  });

  it('a moved bone follows the pointer in the space of its parent', () => {
    docStore.update('turn', (d) => void (d.skeleton.bones[1].rotation = 90));
    const at = dragFrom(getScene().skeleton, { bone: b, move: true }, [0, 100])!;
    // 10 up in the scene is 10 along the parent, which points up
    const pose = at([0, 110]);
    expect(pose.x).toBeCloseTo(110, 6);
    expect(pose.y).toBeCloseTo(0, 6);
  });

  it('the wiggle swings about the pose and comes back to it', () => {
    const swing = wiggleOf(getScene().skeleton, { bone: b, move: false })!;
    expect(swing(0).rotation).toBeCloseTo(0, 6);
    expect(swing(WIGGLE_PERIOD / 4).rotation).toBeCloseTo(25, 6);
    expect(swing(WIGGLE_PERIOD).rotation).toBeCloseTo(0, 6);
  });

  it('the wiggle of an IK target pulls it toward the start of its chain, which bends the joint', () => {
    const target = newBone({ name: 'target', parent: root, x: 200 });
    docStore.update('target', (d) => void d.skeleton.bones.push(target));
    createIkFromDrag(b, target.id, 200, 0);
    const sk = getScene().skeleton;
    const swing = wiggleOf(sk, grabFor(sk, b)!)!;
    expect(swing(0).x).toBeCloseTo(200, 6);
    expect(swing(WIGGLE_PERIOD / 2).x!).toBeLessThan(160);
  });
});

describe('the test pose is only looked at', () => {
  it('the view shows it, the scene and the document do not', () => {
    const doc = docStore.get().skeleton;
    uiStore.patch({ testPose: { [b]: { rotation: 90 } } });
    expect(bone(b).tipY).toBeCloseTo(100, 6);
    expect(getScene().skeleton.boneById(b)!.tipY).toBeCloseTo(0, 6);
    expect(currentPose(b)!.rotation).toBe(0);
    expect(docStore.get().skeleton).toBe(doc);
  });

  it('putting the bones back, leaving the tool or changing the mode ends it', () => {
    for (const end of [() => resetTestPose(), () => setTool('select'), () => setMode('animate')]) {
      uiStore.patch({ mode: 'setup', tool: 'weights', testPose: { [b]: { rotation: 90 } }, wiggle: true });
      end();
      expect(uiStore.get().testPose).toEqual({});
      expect(uiStore.get().wiggle).toBe(false);
      expect(getViewScene()).toBe(getScene());
    }
  });

  it('the wiggle needs a brush bone, and moves it with the clock', () => {
    uiStore.patch({ brush: { ...uiStore.get().brush, bone: null } });
    toggleWiggle();
    expect(uiStore.get().wiggle).toBe(false);
    uiStore.patch({ brush: { ...uiStore.get().brush, bone: b } });
    toggleWiggle();
    setWiggleClock(WIGGLE_PERIOD / 4);
    expect(bone(b).rotation).toBeCloseTo(25, 6);
    setWiggleClock(0);
    expect(bone(b).rotation).toBeCloseTo(0, 6);
  });
});

describe('painting on a posed mesh', () => {
  it('the brush touches the vertex where it is seen, and the setup pose of the mesh stays', () => {
    const world = () => {
      const { mats, slotMat } = setupMats();
      return Array.from(meshWorldPositions(getMesh(slotId, 'img')!, slotMat(slotId), mats));
    };
    const setup = world();
    // the far corner (200, 30) goes to about (70, 100) when b turns a quarter
    uiStore.patch({ testPose: { [b]: { rotation: 90 } } });
    const view = getViewScene().skeleton.boneById(b)!;
    const far = setup.findIndex((v, i) => i % 2 === 0 && Math.abs(v - 200) < 1 && setup[i + 1] > 0) / 2;
    const before = weightsOfB();
    uiStore.patch({ brush: { size: 12, strength: 1, mode: 'subtract', bone: b, feather: 100, locked: [] } as never });
    // a stroke where the corner was does nothing
    paintWeights(slotId, 'img', { x: 200, y: 30 }, b);
    expect(weightsOfB()).toEqual(before);
    const w = getMesh(slotId, 'img')!.weights![far];
    let x = 0;
    let y = 0;
    for (const [id, bx, by, share] of w) {
      const m = id === b ? view : getViewScene().skeleton.boneById(id)!;
      x += (m.a * bx + m.b * by + m.worldX) * share;
      y += (m.c * bx + m.d * by + m.worldY) * share;
    }
    paintWeights(slotId, 'img', { x, y }, b);
    expect(weightsOfB()[far]).toBeLessThan(before[far]);
    world().forEach((v, i) => expect(v).toBeCloseTo(setup[i], 6));
  });
});
