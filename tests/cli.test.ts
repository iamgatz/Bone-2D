/** The command line: export writes the same data as the editor, the pictures land under images/ (and never outside), check reports damage. */
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodePicture, readProjectFile, run, safePath } from '../cli/bone2d';
import { exportSpineJson } from '../src/core/export/spineJson';
import { jsonToBinary } from '../src/core/export/spineBinary';
import { scaleSpineJson } from '../src/core/export/scale';
import { emptyProject, newAnimation, newBone, newSlot } from '../src/core/model';
import { decodePng, encodePng } from '../cli/png';
import { blankSkeleton } from '../src/core/skeletons';
import { S } from './official';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let dir = '';
const io = () => {
  const o: string[] = [];
  const e: string[] = [];
  return { out: (s: string) => void o.push(s), err: (s: string) => void e.push(s), o, e };
};

function sample(extra: Record<string, string> = {}) {
  const p = emptyProject('hero');
  p.skeleton.bones = [];
  const root = newBone({ name: 'root', length: 50 });
  p.skeleton.bones.push(root, newBone({ name: 'arm', parent: root.id, x: 50, length: 30 }));
  const a = newAnimation('idle', 1);
  a.bones[root.id] = { rotate: [{ time: 0, value: [0] }, { time: 1, value: [10] }] };
  p.skeleton.animations.push(a);
  const path = join(dir, 'hero.bone2d');
  writeFileSync(path, JSON.stringify({ bone2d: 1, project: p, images: { head: PNG, 'parts/hand': PNG, ...extra } }));
  return { path, project: p };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bone2d-cli-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('cli export', () => {
  it('writes the skeleton JSON the editor would, and the pictures under images/', () => {
    const { path, project } = sample();
    const out = join(dir, 'out');
    const r = io();
    expect(run(['export', path, out], r)).toBe(0);
    const got = JSON.parse(readFileSync(join(out, 'hero.json'), 'utf8'));
    expect(got).toEqual(JSON.parse(JSON.stringify(exportSpineJson(project.skeleton, { nonessential: true, imagesPath: './images/' }))));
    expect(readFileSync(join(out, 'images', 'head.png')).length).toBeGreaterThan(20);
    expect(existsSync(join(out, 'images', 'parts', 'hand.png'))).toBe(true);
    expect(r.o.join('')).toContain('2 pictures');
  });

  it('binary, scale, pretty and no-images', () => {
    const { path, project } = sample();
    const out = join(dir, 'bin');
    expect(run(['export', path, out, '--format', 'binary', '--scale', '0.5', '--no-images'], io())).toBe(0);
    const want = jsonToBinary(scaleSpineJson(exportSpineJson(project.skeleton, { nonessential: true, imagesPath: './images/' }), 0.5));
    expect(new Uint8Array(readFileSync(join(out, 'hero.skel')))).toEqual(want);
    expect(existsSync(join(out, 'images'))).toBe(false);
    const out2 = join(dir, 'pretty');
    run(['export', path, out2, '--pretty', '--no-nonessential'], io());
    expect(readFileSync(join(out2, 'hero.json'), 'utf8')).toContain('\n  ');
    expect(JSON.parse(readFileSync(join(out2, 'hero.json'), 'utf8')).skeleton.fps).toBeUndefined();
  });

  it('refuses bad options and files, and a picture name cannot leave the images folder', () => {
    const { path } = sample({ '../../escape': PNG });
    const out = join(dir, 'safe');
    const r = io();
    expect(run(['export', path, out], r)).toBe(0);
    expect(r.e.join('')).toContain('skipped the picture "../../escape"');
    expect(existsSync(join(dir, 'escape.png'))).toBe(false);
    expect(run(['export', path, out, '--format', 'xml'], io())).toBe(2);
    expect(run(['export', path, out, '--scale', '0'], io())).toBe(2);
    expect(run(['export'], io())).toBe(2);
    const bad = join(dir, 'bad.bone2d');
    writeFileSync(bad, '{"x":1}');
    const r2 = io();
    expect(run(['export', bad, out], r2)).toBe(1);
    expect(r2.e.join('')).toContain('Not a Bone 2D project file');
    expect(run(['nope'], io())).toBe(2);
    expect(run(['help'], io())).toBe(0);
  });
});

describe('cli info and check', () => {
  it('info counts what the project holds', () => {
    const { path } = sample();
    const r = io();
    expect(run(['info', path], r)).toBe(0);
    const text = r.o.join('');
    expect(text).toMatch(/bones\s+2/);
    expect(text).toMatch(/animations\s+1/);
    expect(text).toMatch(/images\s+2/);
  });
  it('check is quiet for a healthy project and lists the damage of a broken one', () => {
    const { path, project } = sample();
    expect(run(['check', path], io())).toBe(0);
    project.skeleton.slots.push({ id: 's1', name: 'slot', bone: 'missing', color: [1, 1, 1, 1], attachment: null, blend: 'normal' } as never);
    const broken = join(dir, 'broken.bone2d');
    writeFileSync(broken, JSON.stringify({ bone2d: 1, project, images: {} }));
    const r = io();
    expect(run(['check', broken], r)).toBe(1);
    expect(r.o.join('')).toMatch(/^- /);
  });
});

describe('helpers', () => {
  it('safePath, decodePicture, readProjectFile', () => {
    expect(safePath('/a/b', 'x/y.png')).toBeTruthy();
    expect(safePath('/a/b', '../c.png')).toBeNull();
    expect(decodePicture('nope')).toBeNull();
    expect(decodePicture(PNG)!.ext).toBe('png');
    expect(() => readProjectFile('{"bone2d":1}')).toThrow(/Not a Bone 2D/);
    expect(readProjectFile(JSON.stringify({ marrow: 1, project: emptyProject() })).project.skeleton.fps).toBe(30);
  });
});

describe('cli atlas', () => {
  /** A picture with a transparent border whose opaque pixels are unique, as a data URL. */
  function pic(index: number, w: number, h: number, border: number) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const inside = x >= border && x < w - border && y >= border && y < h - border;
        data.set([x * 4, y * 4, index * 40, inside ? 255 : 0], (y * w + x) * 4);
      }
    return { url: `data:image/png;base64,${encodePng(w, h, data).toString('base64')}`, data, w, h };
  }
  function rigged(images: Record<string, string>) {
    const p = emptyProject('hero');
    p.skeleton.bones = [];
    const root = newBone({ name: 'root', length: 50 });
    p.skeleton.bones.push(root);
    p.skeleton.skins[0].attachments = {};
    for (const [i, name] of Object.keys(images).entries()) {
      const slot = newSlot({ name: `s${i}`, bone: root.id });
      p.skeleton.slots.push(slot);
      p.skeleton.skins[0].attachments[slot.id] = { [name]: { type: 'region', name, path: name, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 10, height: 10, color: [1, 1, 1, 1] } };
    }
    const path = join(dir, 'rig.bone2d');
    writeFileSync(path, JSON.stringify({ bone2d: 1, project: p, images }));
    return path;
  }

  it('packs the used pictures into an atlas the official runtime reads, with the pixels where the atlas says', () => {
    const a = pic(1, 20, 12, 3);
    const b = pic(2, 9, 30, 0);
    const path = rigged({ head: a.url, 'parts/hand': b.url });
    const out = join(dir, 'atlas');
    const r = io();
    expect(run(['export', path, out, '--atlas', '--trim'], r)).toBe(0);
    expect(r.o.join('')).toContain('2 regions on 1 page');
    expect(existsSync(join(out, 'images'))).toBe(false);
    const atlas = new S.TextureAtlas(readFileSync(join(out, 'hero.atlas'), 'utf8'));
    expect(atlas.pages).toHaveLength(1);
    const page = decodePng(readFileSync(join(out, 'hero.png')))!;
    expect([page.width, page.height]).toEqual([atlas.pages[0].width, atlas.pages[0].height]);
    const head = atlas.findRegion('head')!;
    // trimmed: the 3-pixel empty border is outside the region, and the atlas file says where it was
    expect([head.width, head.height, head.originalWidth, head.originalHeight]).toEqual([14, 6, 20, 12]);
    for (let y = 0; y < head.height; y++)
      for (let x = 0; x < head.width; x++) {
        const at = ((head.y + y) * page.width + head.x + x) * 4;
        const src = ((3 + y) * a.w + 3 + x) * 4;
        expect(Array.from(page.data.subarray(at, at + 4))).toEqual(Array.from(a.data.subarray(src, src + 4)));
      }
    expect(atlas.findRegion('parts/hand')!.width).toBe(9);
  });

  it('--scale shrinks the pictures with the skeleton, and options change the page', () => {
    const a = pic(1, 40, 40, 0);
    const path = rigged({ head: a.url });
    const out = join(dir, 'half');
    expect(run(['export', path, out, '--atlas', '--scale', '0.5', '--padding', '0', '--no-pot', '--filter', 'nearest'], io())).toBe(0);
    const text = readFileSync(join(out, 'hero.atlas'), 'utf8');
    expect(text).toContain('size:20,20');
    expect(text).toContain('filter:Nearest,Nearest');
    expect(text).toContain('bounds:0,0,20,20');
  });

  it('many pictures spill onto numbered pages', () => {
    const images: Record<string, string> = {};
    for (let i = 0; i < 5; i++) images[`p${i}`] = pic(i, 60, 60, 0).url;
    const out = join(dir, 'pages');
    const r = io();
    expect(run(['export', rigged(images), out, '--atlas', '--max-size', '64', '--padding', '0'], r)).toBe(0);
    expect(r.o.join('')).toContain('5 regions on 5 pages');
    expect(existsSync(join(out, 'hero-5.png'))).toBe(true);
  });

  it('what it cannot read stays out with a note, a bad option is refused, a picture too big stops with a message', () => {
    const path = rigged({ ok: pic(1, 8, 8, 0).url, jpg: 'data:image/jpeg;base64,/9j/4AAQ' });
    const r = io();
    expect(run(['export', path, join(dir, 'a1'), '--atlas'], r)).toBe(1);
    expect(r.e.join('')).toContain('left out of the atlas: "jpg"');
    expect(existsSync(join(dir, 'a1', 'hero.atlas'))).toBe(true);
    expect(run(['export', path, join(dir, 'a2'), '--atlas', '--max-size', 'x'], io())).toBe(2);
    expect(run(['export', path, join(dir, 'a3'), '--atlas', '--filter', 'cubic'], io())).toBe(2);
    const big = io();
    expect(run(['export', rigged({ wide: pic(1, 200, 8, 0).url }), join(dir, 'a4'), '--atlas', '--max-size', '64'], big)).toBe(1);
    expect(big.e.join('')).toContain('does not fit');
  });
});

describe('cli with several skeletons', () => {
  function multi() {
    const { project } = sample();
    const other = blankSkeleton('second');
    other.animations.push(newAnimation('run', 1));
    project.others = [other];
    project.activeAt = 0;
    const path = join(dir, 'multi.bone2d');
    writeFileSync(path, JSON.stringify({ bone2d: 1, project, images: {} }));
    return { path, project };
  }

  it('writes a file for each skeleton, named like it', () => {
    const { path, project } = multi();
    const out = join(dir, 'm1');
    const r = io();
    expect(run(['export', path, out, '--no-images'], r)).toBe(0);
    expect(JSON.parse(readFileSync(join(out, 'hero.json'), 'utf8'))).toEqual(JSON.parse(JSON.stringify(exportSpineJson(project.skeleton, { nonessential: true, imagesPath: './images/' }))));
    const second = JSON.parse(readFileSync(join(out, 'second.json'), 'utf8'));
    expect(Object.keys(second.animations)).toEqual(['run']);
    expect(r.o.join('')).toContain('second.json');
  });

  it('--skeleton picks one by name or number, and says what exists when it is not there', () => {
    const { path } = multi();
    const out = join(dir, 'm2');
    expect(run(['export', path, out, '--no-images', '--skeleton', 'second'], io())).toBe(0);
    expect(existsSync(join(out, 'second.json'))).toBe(true);
    expect(existsSync(join(out, 'hero.json'))).toBe(false);
    const out2 = join(dir, 'm3');
    expect(run(['export', path, out2, '--no-images', '--skeleton', '0'], io())).toBe(0);
    expect(existsSync(join(out2, 'hero.json'))).toBe(true);
    const r = io();
    expect(run(['export', path, join(dir, 'm4'), '--skeleton', 'nope'], r)).toBe(2);
    expect(r.e.join('')).toContain('hero, second');
  });

  it('info lists the skeletons and check repairs inside the others too', () => {
    const { path, project } = multi();
    const r = io();
    expect(run(['info', path], r)).toBe(0);
    expect(r.o.join('')).toMatch(/skeletons\s+hero, second/);
    project.others![0].fps = 9999;
    const broken = join(dir, 'mb.bone2d');
    writeFileSync(broken, JSON.stringify({ bone2d: 1, project, images: {} }));
    const c = io();
    expect(run(['check', broken], c)).toBe(1);
    expect(c.o.join('')).toContain('skeleton "second"');
  });
});
