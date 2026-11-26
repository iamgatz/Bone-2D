/**
 * A sprite sheet of animations: the frames, cut to their painted part, packed onto as few pictures as they take, with a JSON file for each
 * in the "hash" form of TexturePacker (what 2D engines read), the order of the frames of every animation and the place of the skeleton's
 * origin in them. Frames that look the same are stored once. Pure; the rendering of the frames is the editor's.
 */
import { composePage, packAtlas, trimBounds } from './atlas';
import type { AtlasPage } from './atlas';

export interface SheetOptions {
  /** The largest side of a page, in pixels. */
  maxSize?: number;
  /** Pixels between two frames. */
  padding?: number;
}

interface SheetPage {
  /** File names without their folder: the picture and the JSON that describes it. */
  image: string;
  json: string;
  width: number;
  height: number;
  /** Straight RGBA, row by row. */
  pixels: Uint8ClampedArray;
}

export interface Sheet {
  pages: SheetPage[];
  /** The text of each page's JSON, in the order of the pages. */
  data: string[];
  /** Present when an animation did not fit on one page: every animation with its frames and the page each frame is on. */
  index: { name: string; text: string } | null;
  /** How many frames there are, and how many different pictures they take. */
  frames: number;
  unique: number;
}

interface Frame {
  name: string;
  animation: string;
  /** Where the painted part sits in the whole frame. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The frame whose pixels this one uses (its own name when it is the first to look like that). */
  from: string;
}

interface Clip {
  name: string;
  fps: number;
  frames: string[];
}

const clean = (name: string) => name.replace(/[^\p{L}\p{N}-]+/gu, '_') || 'animation';

/** Collects the frames one by one (only their painted parts are kept in memory) and builds the sheet. */
export function sheetBuilder(width: number, height: number, origin: [number, number]) {
  const frames: Frame[] = [];
  const clips: Clip[] = [];
  const pixels = new Map<string, Uint8ClampedArray>();
  /** The frames that look different, by a number made of their pixels. */
  const seen = new Map<number, string[]>();

  const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);

  return {
    /** Starts the next animation: the frames added after it are its own. */
    animation(name: string, fps: number) {
      let own = clean(name);
      for (let i = 2; clips.some((c) => c.name === own); i++) own = `${clean(name)}_${i}`;
      clips.push({ name: own, fps, frames: [] });
    },
    /** A frame of the current animation: straight RGBA of the whole frame. */
    add(rgba: ArrayLike<number>) {
      const clip = clips[clips.length - 1];
      const name = `${clip.name}_${String(clip.frames.length).padStart(4, '0')}`;
      const box = trimBounds(rgba, width, height);
      const part = new Uint8ClampedArray(box.w * box.h * 4);
      let hash = (box.w * 31 + box.h) >>> 0;
      for (let y = 0; y < box.h; y++) {
        for (let x = 0; x < box.w * 4; x++) {
          const v = rgba[((box.y + y) * width + box.x) * 4 + x];
          part[y * box.w * 4 + x] = v;
          hash = (Math.imul(hash, 16777619) ^ v) >>> 0;
        }
      }
      const alike = seen.get(hash) ?? [];
      let from = alike.find((n) => {
        const other = frames.find((f) => f.name === n)!;
        return other.width === box.w && other.height === box.h && same(pixels.get(n)!, part);
      });
      if (!from) {
        from = name;
        pixels.set(name, part);
        seen.set(hash, [...alike, name]);
      }
      frames.push({ name, animation: clip.name, x: box.x, y: box.y, width: box.w, height: box.h, from });
      clip.frames.push(name);
    },
    build(base: string, options: SheetOptions = {}): Sheet {
      const padding = options.padding ?? 2;
      const packed: AtlasPage[] = packAtlas(
        frames.map((f) => ({ name: f.name, width: f.width, height: f.height, ...(f.from === f.name ? {} : { aliasOf: f.from }) })),
        { maxSize: options.maxSize ?? 2048, padding, pot: false },
      );
      const byName = new Map(frames.map((f) => [f.name, f]));
      const pageOf = new Map<string, number>();
      packed.forEach((p, i) => p.regions.forEach((r) => pageOf.set(r.name, i)));
      const file = (i: number) => (packed.length > 1 ? `${base}-${i}` : base);
      const split = clips.filter((c) => new Set(c.frames.map((n) => pageOf.get(n))).size > 1);
      const pivot = { x: origin[0] / width, y: origin[1] / height };
      const data = packed.map((page, i) => {
        const here = page.regions.map((r) => byName.get(r.name)!).sort((a, b) => frames.indexOf(a) - frames.indexOf(b));
        const rects = new Map(page.regions.map((r) => [r.name, r]));
        return JSON.stringify(
          {
            frames: Object.fromEntries(
              here.map((f) => {
                const r = rects.get(f.name)!;
                return [
                  f.name,
                  {
                    frame: { x: r.x, y: r.y, w: f.width, h: f.height },
                    rotated: false,
                    trimmed: f.width !== width || f.height !== height,
                    spriteSourceSize: { x: f.x, y: f.y, w: f.width, h: f.height },
                    sourceSize: { w: width, h: height },
                    // the origin of the skeleton as a share of the whole frame: engines call it pivot or anchor
                    pivot,
                    anchor: pivot,
                    duration: Math.round(1000 / clips.find((c) => c.name === f.animation)!.fps),
                  },
                ];
              }),
            ),
            animations: Object.fromEntries(clips.filter((c) => c.frames.every((n) => pageOf.get(n) === i)).map((c) => [c.name, c.frames])),
            meta: {
              app: 'https://iamgatz.github.io/Bone-2D/',
              image: `${file(i)}.png`,
              format: 'RGBA8888',
              size: { w: page.width, h: page.height },
              scale: '1',
              ...(packed.length > 1 ? { related_multi_packs: packed.map((_, k) => `${file(k)}.json`).filter((_, k) => k !== i) } : {}),
            },
          },
          null,
          1,
        );
      });
      const pages = packed.map((page, i) => ({
        image: `${file(i)}.png`,
        json: `${file(i)}.json`,
        width: page.width,
        height: page.height,
        // an alias lies where its source does, so only the sources are painted
        pixels: composePage(
          { ...page, regions: page.regions.filter((r) => byName.get(r.name)!.from === r.name) },
          (name) => ({ data: pixels.get(name)! }),
          padding,
        ),
      }));
      const index = split.length
        ? {
            name: `${base}.animations.json`,
            text: JSON.stringify(
              {
                animations: Object.fromEntries(
                  clips.map((c) => [
                    c.name,
                    { fps: c.fps, frames: c.frames.map((n) => ({ name: n, sheet: `${file(pageOf.get(n)!)}.json` })) },
                  ]),
                ),
              },
              null,
              1,
            ),
          }
        : null;
      return { pages, data, index, frames: frames.length, unique: pixels.size };
    },
  };
}
