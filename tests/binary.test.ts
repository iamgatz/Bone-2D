/**
 * Binary export (.skel). The oracle is the official runtime itself: the same skeleton, loaded once from our JSON with `SkeletonJson` and
 * once from our binary with `SkeletonBinary`, must come out the same (up to 32-bit float rounding): bones, slots, constraints, skins,
 * attachments, events and every timeline.
 */
import { describe, expect, it } from 'vitest';
import { exportSpineBinary, jsonToBinary } from '../src/core/export/spineBinary';
import { binaryToJson, looksLikeBinary } from '../src/core/import/spineBinary';
import { importSpineJson } from '../src/core/import/spineJson';
import { exportSpineJson } from '../src/core/export/spineJson';
import { uid } from '../src/core/ids';
import type { ImageRef, Project } from '../src/core/model';
import { DEMO_IMAGES, buildDemoRig } from '../src/store/demo/kit';
import { addAttachmentRig, buildFixture } from './fixture';
import { addPathRig } from './pathrig';
import { addPhysicsRig } from './physicsrig';
import { KNOWN_DIFFS, atlasFor, compare, compareReadBack, diffGraphs } from './binarykit';
import { loadOfficial, loadOfficialBinary } from './official';

function kit(): Project {
  const images: Record<string, ImageRef> = {};
  for (const i of DEMO_IMAGES) images[i.name] = { id: uid(), name: i.name, width: i.width, height: i.height };
  return buildDemoRig(images);
}

function rich(): Project {
  const f = buildFixture();
  addAttachmentRig(f.project);
  addPathRig(f.project);
  addPhysicsRig(f.project);
  return f.project;
}

describe('binary export', () => {
  it('the demo rig loads from binary exactly like from JSON', () => {
    const r = compare(kit());
    expect(r.diffs).toEqual([]);
    expect(r.fromBinary.animations.length).toBe(4);
  });

  it('a rig with every constraint, attachment and timeline kind loads the same', () => {
    const r = compare(rich());
    expect(r.diffs).toEqual([]);
  });

  it('is smaller than the JSON', () => {
    const p = kit();
    const bytes = exportSpineBinary(p.skeleton);
    expect(bytes.length).toBeLessThan(JSON.stringify(exportSpineJson(p.skeleton)).length / 2);
  });

  it('the same without editor-only data', () => {
    const r = compare(rich(), { nonessential: false });
    expect(r.diffs).toEqual([]);
  });

  it('writes the header the reader expects', () => {
    const p = kit();
    const bytes = exportSpineBinary(p.skeleton);
    const sd = loadOfficialBinary(bytes, atlasFor(p));
    expect(sd.version).toBe('4.3.13');
    expect(sd.bones.length).toBe(p.skeleton.bones.length);
    expect(jsonToBinary(exportSpineJson(p.skeleton)).length).toBe(bytes.length);
  });
});

describe('binary import', () => {
  const roundTrips: [string, () => Project][] = [
    ['the demo rig', kit],
    ['the rig with every constraint, attachment and timeline kind', rich],
  ];
  for (const [label, build] of roundTrips) {
    it(`reads ${label} back to the JSON the official loader reads`, () => {
      expect(compareReadBack(build())).toEqual([]);
    });

    it(`importing ${label} from binary gives the same project as importing its JSON`, () => {
      const p = build();
      const fromJson = importSpineJson(exportSpineJson(p.skeleton), 'x');
      const fromBinary = importSpineJson(binaryToJson(exportSpineBinary(p.skeleton)), 'x');
      expect(fromBinary.warnings).toEqual(fromJson.warnings);
      const a = exportSpineJson(fromJson.project.skeleton);
      const b = exportSpineJson(fromBinary.project.skeleton);
      const atlas = atlasFor(fromJson.project);
      const diffs = diffGraphs(loadOfficial(a, atlas), loadOfficial(b, atlas), 'skeleton').filter((d) => !KNOWN_DIFFS.test(d));
      expect(diffs).toEqual([]);
    });
  }

  it('refuses other versions and damaged files with a clear message', () => {
    const bytes = exportSpineBinary(kit().skeleton);
    const old = new Uint8Array(bytes);
    // the version string "4.3.13" starts after the 8 hash bytes and a length byte: turn it into 4.2.13
    const at = 9 + 2;
    expect(String.fromCharCode(old[at])).toBe('3');
    old[at] = '2'.charCodeAt(0);
    expect(() => binaryToJson(old)).toThrow(/only 4\.3/);
    expect(() => binaryToJson(bytes.slice(0, bytes.length >> 1))).toThrow();
    expect(looksLikeBinary(bytes)).toBe(true);
    expect(looksLikeBinary(new TextEncoder().encode(' {"skeleton":{}}'))).toBe(false);
  });
});
