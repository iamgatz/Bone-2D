/** The command line: export writes the same data as the editor, the pictures land under images/ (and never outside), check reports damage. */
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodePicture, readProjectFile, run, safePath } from '../cli/bone2d';
import { exportSpineJson } from '../src/core/export/spineJson';
import { jsonToBinary } from '../src/core/export/spineBinary';
import { scaleSpineJson } from '../src/core/export/scale';
import { emptyProject, newAnimation, newBone } from '../src/core/model';

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
