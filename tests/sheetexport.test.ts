/** The sprite sheet export: what an engine reads from the JSON and the pictures gives every frame back exactly. */
import { describe, expect, it } from 'vitest';
import { sheetBuilder } from '@/core/export/spriteSheet';
import type { Sheet } from '@/core/export/spriteSheet';

const W = 64;
const H = 48;

/** A frame with a filled box at (x, y), its colour telling the pixels apart. */
function frame(x: number, y: number, w: number, h: number, tint = 0): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) out.set([40 + i * 3, 60 + j * 5, tint, 128 + ((i + j) % 100)], ((y + j) * W + x + i) * 4);
  return out;
}

interface Entry {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  pivot: { x: number; y: number };
  duration: number;
}
interface Data {
  frames: Record<string, Entry>;
  animations: Record<string, string[]>;
  meta: { image: string; size: { w: number; h: number }; related_multi_packs?: string[] };
}

/** What an engine does: cuts the rectangle out of the page and puts it into an empty frame of the source size. */
function rebuild(sheet: Sheet, name: string): Uint8ClampedArray {
  for (const [i, text] of sheet.data.entries()) {
    const entry = (JSON.parse(text) as Data).frames[name];
    if (!entry) continue;
    const page = sheet.pages[i];
    const out = new Uint8ClampedArray(entry.sourceSize.w * entry.sourceSize.h * 4);
    const { frame: from, spriteSourceSize: to } = entry;
    for (let y = 0; y < from.h; y++) {
      const start = ((from.y + y) * page.width + from.x) * 4;
      out.set(page.pixels.subarray(start, start + from.w * 4), ((to.y + y) * entry.sourceSize.w + to.x) * 4);
    }
    return out;
  }
  throw new Error(`no frame ${name}`);
}

describe('sprite sheet export', () => {
  const walk = [frame(2, 3, 20, 30), frame(10, 3, 20, 30), frame(30, 8, 12, 20, 9), frame(2, 3, 20, 30)];
  const idle = [frame(5, 5, 20, 30), new Uint8ClampedArray(W * H * 4)];
  const build = (maxSize?: number) => {
    const b = sheetBuilder(W, H, [32, 40]);
    b.animation('walk', 12);
    for (const f of walk) b.add(f);
    b.animation('idle', 5);
    for (const f of idle) b.add(f);
    return b.build('hero', maxSize ? { maxSize } : {});
  };

  it('gives every frame back pixel for pixel, storing the ones that look the same once', () => {
    const sheet = build();
    expect(sheet.pages.map((p) => [p.image, p.json])).toEqual([['hero.png', 'hero.json']]);
    walk.forEach((f, i) => expect(rebuild(sheet, `walk_000${i}`)).toEqual(f));
    idle.forEach((f, i) => expect(rebuild(sheet, `idle_000${i}`)).toEqual(f));
    // the two walk frames in other places and the idle one are the same box, the empty frame is its own
    expect([sheet.frames, sheet.unique]).toEqual([6, 3]);
  });

  it('says what an engine needs: the order of the frames, their time, the origin and the size of the page', () => {
    const sheet = build();
    const data = JSON.parse(sheet.data[0]) as Data;
    expect(data.animations).toEqual({
      walk: ['walk_0000', 'walk_0001', 'walk_0002', 'walk_0003'],
      idle: ['idle_0000', 'idle_0001'],
    });
    expect(Object.keys(data.frames)).toEqual([...data.animations.walk, ...data.animations.idle]);
    expect(data.frames.walk_0000).toMatchObject({
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: 2, y: 3, w: 20, h: 30 },
      sourceSize: { w: W, h: H },
      pivot: { x: 0.5, y: 40 / H },
      duration: 83,
    });
    expect(data.frames.idle_0000.duration).toBe(200);
    expect(data.meta).toMatchObject({ image: 'hero.png', size: { w: sheet.pages[0].width, h: sheet.pages[0].height } });
    expect(data.meta.related_multi_packs).toBeUndefined();
    expect(sheet.index).toBeNull();
  });

  it('spreads over several pages when one is too small, and lists where every frame of every animation is', () => {
    const b = sheetBuilder(W, H, [0, 0]);
    b.animation('run', 10);
    const frames = Array.from({ length: 9 }, (_, i) => frame(0, 0, 40, 30, i * 7));
    for (const f of frames) b.add(f);
    const sheet = b.build('hero', { maxSize: 128 });
    expect(sheet.pages.length).toBeGreaterThan(1);
    expect(sheet.pages.every((p) => p.width <= 128 && p.height <= 128)).toBe(true);
    expect(sheet.pages[1].image).toBe('hero-1.png');
    frames.forEach((f, i) => expect(rebuild(sheet, `run_000${i}`)).toEqual(f));
    expect((JSON.parse(sheet.data[0]) as Data).meta.related_multi_packs).toContain('hero-1.json');
    // the animation is on more than one page: no page claims it, the index has it whole
    expect((JSON.parse(sheet.data[0]) as Data).animations).toEqual({});
    const index = JSON.parse(sheet.index!.text) as { animations: { run: { fps: number; frames: { name: string; sheet: string }[] } } };
    expect(index.animations.run.fps).toBe(10);
    expect(index.animations.run.frames.map((f) => f.name)).toEqual(frames.map((_, i) => `run_000${i}`));
    for (const f of index.animations.run.frames) {
      const page = sheet.pages.findIndex((p) => p.json === f.sheet);
      expect((JSON.parse(sheet.data[page]) as Data).frames[f.name]).toBeDefined();
    }
  });

  it('keeps animation names apart and safe for files', () => {
    const b = sheetBuilder(W, H, [0, 0]);
    for (const name of ['run/fast', 'run fast', 'бег', '']) {
      b.animation(name, 1);
      b.add(frame(1, 1, 3, 3));
    }
    expect(Object.keys((JSON.parse(b.build('x').data[0]) as Data).animations)).toEqual(['run_fast', 'run_fast_2', 'бег', 'animation']);
  });

  it('says which frame does not fit', () => {
    const b = sheetBuilder(W, H, [0, 0]);
    b.animation('big', 1);
    b.add(frame(0, 0, 60, 40));
    expect(() => b.build('x', { maxSize: 32 })).toThrow(/big_0000/);
  });
});
