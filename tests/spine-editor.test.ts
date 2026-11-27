/**
 * What the Spine EDITOR asks of an imported file beyond what the runtimes do. Found by importing the demo rig into Spine 4.3.26: the
 * official loader read every one of these files, the editor refused them or showed only part of the character.
 */
import * as spine from '@esotericsoftware/spine-core';
import { describe, expect, it } from 'vitest';
import { engineNeeds } from '../src/core/export/engineNeeds';
import { withBaseSkin } from '../src/core/export/spineEditor';
import { exportSpineJson } from '../src/core/export/spineJson';
import { importSpineJson } from '../src/core/import/spineJson';
import { uid } from '../src/core/ids';
import type { ImageRef, MeshAttachment, Project, SkeletonDoc } from '../src/core/model';
import { DEMO_IMAGES, buildDemoRig } from '../src/store/demo/kit';
import { atlasFor } from './binarykit';
import { buildFixture } from './fixture';
import { loadOfficial, placeholderOf } from './official';

const S = spine as any;

function kit(): Project {
  const images: Record<string, ImageRef> = {};
  for (const i of DEMO_IMAGES) images[i.name] = { id: uid(), name: i.name, width: i.width, height: i.height };
  return buildDemoRig(images);
}

/** Every attachment of an exported file, with the name it goes by and the picture it shows. */
function listed(json: any) {
  const out: { skin: string; slot: string; key: string; name: string; path: string; att: any }[] = [];
  for (const s of json.skins)
    for (const [slot, list] of Object.entries<any>(s.attachments))
      for (const [key, att] of Object.entries<any>(list))
        out.push({ skin: s.name, slot, key, name: att.name ?? key, path: att.path ?? att.name ?? key, att });
  return out;
}

/** Bone indices of each vertex of a weighted vertex list. */
function bonesPerVertex(v: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < v.length;) {
    const count = v[i++];
    out.push(Array.from({ length: count }, (_, j) => v[i + j * 4]));
    i += count * 4;
  }
  return out;
}

const weightedMeshes = (doc: SkeletonDoc) =>
  doc.skins.flatMap((skin) =>
    Object.entries(skin.attachments).flatMap(([slotId, list]) =>
      Object.entries(list)
        .filter((e): e is [string, MeshAttachment] => e[1].type === 'mesh' && !!e[1].weights)
        .map(([key, mesh]) => ({ skinId: skin.id, slotId, key, mesh })),
    ),
  );

/** What a skeleton of the official runtime shows with `skins` set, at a time of an animation: per slot, the key and where it is. */
function shown(data: any, skins: string[], animation: string | null, t: number) {
  const sk = new S.Skeleton(data);
  if (skins.length) {
    const all = new S.Skin('all');
    for (const name of skins) all.addSkin(data.findSkin(name));
    sk.setSkin(all);
  }
  sk.setupPose();
  if (animation) {
    const state = new S.AnimationState(new S.AnimationStateData(data));
    state.setAnimation(0, animation, false);
    state.update(t);
    state.apply(sk);
  }
  sk.updateWorldTransform(S.Physics.update);
  return sk.slots.map((slot: any) => {
    const att = slot.appliedPose.attachment;
    let xy: number[] = [];
    if (att instanceof S.MeshAttachment) {
      xy = new Array(att.worldVerticesLength).fill(0);
      att.computeWorldVertices(sk, slot, 0, att.worldVerticesLength, xy, 0, 2);
    }
    return {
      slot: slot.data.name as string,
      key: att ? placeholderOf(data, att) : null,
      xy: xy.map((v) => +v.toFixed(3)).sort((a, b) => a - b),
    };
  });
}

describe('what the Spine editor needs of an export', () => {
  it('moves what a skin replaces into a skin of its own, so the default skin holds only what every look shares', () => {
    const project = kit();
    const doc = project.skeleton;
    const json: any = exportSpineJson(doc, { editorSkins: true });
    expect(json.skins.map((s: any) => s.name)).toEqual(['default', 'base', 'arctic']);
    const all = listed(json);
    const of = (skin: string) => all.filter((a) => a.skin === skin);
    expect(of('base').length).toBeGreaterThan(5);
    for (const o of of('arctic')) {
      expect(of('default').find((a) => a.slot === o.slot && a.key === o.key)).toBeUndefined();
      const b = of('base').find((a) => a.slot === o.slot && a.key === o.key)!;
      // names of their own; the keys a game and the timelines use, and the pictures, stay
      expect(b.name).toBe(`base/${o.key}`);
      expect(o.name).toBe(`arctic/${o.key}`);
      expect(o.path).not.toBe(b.path);
    }
    // with the skin set, the official runtime shows what it showed before with no skin at all
    const atlas = atlasFor(project);
    const before = loadOfficial(exportSpineJson(doc), atlas);
    const after = loadOfficial(json, atlas);
    for (const anim of [null, ...doc.animations.map((a) => a.name)]) {
      expect(shown(after, ['base'], anim, 0.37)).toEqual(shown(before, [], anim, 0.37));
      expect(shown(after, ['base', 'arctic'], anim, 0.37)).toEqual(shown(before, ['arctic'], anim, 0.37));
    }
    expect(engineNeeds(doc, { editorSkins: true }).map((n) => n.id)).toContain('baseSkin');
  });

  it('keeps deform keys and linked meshes with the attachments that move', () => {
    const project = buildFixture().project;
    const doc = project.skeleton;
    const { skinId, slotId, key, mesh } = weightedMeshes(doc).find((m) => m.skinId === doc.skins[0].id)!;
    const size = mesh.weights!.reduce((n, w) => n + w.length * 2, 0);
    ((doc.animations[0].deform[skinId] ??= {})[slotId] ??= {})[key] = [{ time: 0, value: Array.from({ length: size }, (_, i) => i % 7) }];
    // one skin replaces the mesh, another one links to the one in the default skin
    const skin = (name: string, at: string, att: MeshAttachment) => ({
      id: uid(),
      name,
      bones: [],
      constraints: [],
      attachments: { [slotId]: { [at]: att } },
    });
    doc.skins.push(skin('red', key, { ...structuredClone(mesh), color: [1, 0, 0, 1] }));
    const link = { source: key, slot: null, skin: null, deform: true };
    doc.skins.push(skin('link', 'linked', { ...structuredClone(mesh), name: 'linked', link }));
    const untouched = structuredClone(doc);

    const out = withBaseSkin(doc);
    expect(doc).toEqual(untouched);
    expect(out.skin?.name).toBe('base');
    expect((out.doc.skins.at(-1)!.attachments[slotId].linked as MeshAttachment).link!.skin).toBe(out.skin!.id);
    expect(out.doc.animations[0].deform[out.skin!.id][slotId][key]).toHaveLength(1);
    expect(out.doc.animations[0].deform[skinId]?.[slotId]?.[key]).toBeUndefined();

    const atlas = atlasFor(project);
    const before = loadOfficial(exportSpineJson(doc), atlas);
    const after = loadOfficial(exportSpineJson(doc, { editorSkins: true }), atlas);
    const slot = doc.slots.find((s) => s.id === slotId)!.name;
    const at = (data: any, skins: string[]) => shown(data, skins, doc.animations[0].name, 0).find((s: any) => s.slot === slot);
    expect(at(after, ['base'])).toEqual(at(before, []));
  });

  it('comes back from its own export as the project it was', () => {
    const doc = kit().skeleton;
    const json: any = exportSpineJson(doc, { editorSkins: true });
    const back = importSpineJson(structuredClone(json), 'kit').project.skeleton;
    expect(back.skins.map((s) => s.name)).toEqual(doc.skins.map((s) => s.name));
    expect(exportSpineJson(back, { editorSkins: true }).skins).toEqual(json.skins);
    // a skin that is merely called "base" stays a skin
    const other = structuredClone(json);
    for (const a of listed(other).filter((x) => x.skin === 'base')) delete a.att.name;
    expect(importSpineJson(other, 'kit').project.skeleton.skins.map((s) => s.name)).toEqual(['default', 'base', 'arctic']);
  });

  it('leaves the skins and names alone when it is not asked to, or when no skin replaces anything', () => {
    const doc = kit().skeleton;
    const plain: any = exportSpineJson(doc);
    expect(plain.skins.map((s: any) => s.name)).toEqual(['default', 'arctic']);
    for (const a of listed(plain)) expect(a.name).toBe(a.key);
    const single = { ...doc, skins: [doc.skins[0]] };
    expect(withBaseSkin(single).doc).toBe(single);
    expect(exportSpineJson(single, { editorSkins: true })).toEqual(exportSpineJson(single));
  });

  it('gives two different attachments of two skins names of their own, and leaves a shared one its name', () => {
    const doc = kit().skeleton;
    const [base, other] = doc.skins;
    const slotId = Object.keys(other.attachments)[0];
    const [key, att] = Object.entries(other.attachments[slotId])[0];
    delete base.attachments[slotId][key];
    doc.skins.push({ ...structuredClone(other), id: uid(), name: 'third', attachments: { [slotId]: { [key]: structuredClone(att) } } });
    const slot = doc.slots.find((s) => s.id === slotId)!.name;
    const here = () => listed(exportSpineJson(doc, { editorSkins: true })).filter((a) => a.slot === slot && a.key === key);
    expect(here().map((a) => a.name)).toEqual([key, key]);
    (doc.skins.at(-1)!.attachments[slotId][key] as MeshAttachment).color = [1, 0, 0, 1];
    expect(here().map((a) => a.name)).toEqual([`${other.name}/${key}`, `third/${key}`]);
  });

  it('lists the bones of every weighted vertex in the order of the skeleton, and the deform keys with them', () => {
    const doc = buildFixture().project.skeleton;
    const target = weightedMeshes(doc).find((m) => m.mesh.weights!.some((w) => w.length > 1))!;
    expect(target).toBeDefined();
    // a deform key that tells every value apart
    const size = target.mesh.weights!.reduce((n, w) => n + w.length * 2, 0);
    ((doc.animations[0].deform[target.skinId] ??= {})[target.slotId] ??= {})[target.key] = [
      { time: 0, value: Array.from({ length: size }, (_, i) => i + 1) },
    ];
    const wanted = exportSpineJson(doc);

    // the same skeleton, written down with the influences of every vertex the other way round
    const turned = structuredClone(doc);
    const mesh = turned.skins.find((s) => s.id === target.skinId)!.attachments[target.slotId][target.key] as MeshAttachment;
    const key = turned.animations[0].deform[target.skinId][target.slotId][target.key][0];
    const values: number[] = [];
    let at = 0;
    mesh.weights = mesh.weights!.map((w) => {
      const pairs = w.map((_, j) => [key.value[at + j * 2], key.value[at + j * 2 + 1]]);
      at += w.length * 2;
      values.push(...pairs.reverse().flat());
      return [...w].reverse();
    });
    key.value = values;
    const before = structuredClone(turned);

    const got = exportSpineJson(turned);
    expect(got.skins).toEqual(wanted.skins);
    expect(got.animations).toEqual(wanted.animations);
    expect(turned).toEqual(before); // the project itself is not touched

    for (const a of listed(exportSpineJson(kit().skeleton)).concat(listed(got))) {
      const v: number[] | undefined = a.att.vertices;
      const count = a.att.uvs ? a.att.uvs.length : (a.att.vertexCount ?? 0) * 2;
      if (!v || v.length <= count) continue; // not weighted
      for (const bones of bonesPerVertex(v)) expect(bones, a.key).toEqual([...bones].sort((x, y) => x - y));
    }
  });

  it('writes the outline and the manual edges of a mesh, counted the way Spine counts them', () => {
    const doc = kit().skeleton;
    const target = weightedMeshes(doc)[0];
    const hull = target.mesh.hull;
    target.mesh.edges = [0, 2, 1, 0]; // one inner edge and one that is already part of the outline
    const slot = doc.slots.find((s) => s.id === target.slotId)!.name;
    const skin = doc.skins.find((s) => s.id === target.skinId)!.name;
    const find = (json: any) => listed(json).find((a) => a.skin === skin && a.slot === slot && a.key === target.key)!.att;
    const edges: number[] = find(exportSpineJson(doc)).edges;
    const outline = Array.from({ length: hull }, (_, i) => [i * 2, ((i + 1) % hull) * 2]).flat();
    expect(edges).toEqual([...outline, 0, 4]);
    expect(find(exportSpineJson(doc, { nonessential: false })).edges).toBeUndefined();
    for (const a of listed(exportSpineJson(doc)))
      if (a.att.type === 'mesh') expect(a.att.edges.length).toBeGreaterThanOrEqual(a.att.hull * 2);
  });
});
