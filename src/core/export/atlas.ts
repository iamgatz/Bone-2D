/** MaxRects texture atlas packer + Spine atlas text writer. Pure logic; pixels are composed by the caller. */

export interface PackInput {
  name: string;
  width: number;
  height: number;
}

export interface PackedRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AtlasPage {
  index: number;
  width: number;
  height: number;
  regions: PackedRegion[];
}

export interface PackOptions {
  maxSize?: number;
  /** Transparent/extruded border around every region. */
  padding?: number;
  /** Power-of-two page sizes (default true). */
  pot?: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

class MaxRects {
  free: Rect[];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.free = [{ x: 0, y: 0, w: width, h: height }];
  }

  insert(w: number, h: number): Rect | null {
    let best: Rect | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    for (const f of this.free) {
      if (f.w >= w && f.h >= h) {
        const lw = f.w - w;
        const lh = f.h - h;
        const short = Math.min(lw, lh);
        const long = Math.max(lw, lh);
        if (short < bestShort || (short === bestShort && long < bestLong)) {
          best = { x: f.x, y: f.y, w, h };
          bestShort = short;
          bestLong = long;
        }
      }
    }
    if (!best) return null;
    this.place(best);
    return best;
  }

  private place(r: Rect) {
    const next: Rect[] = [];
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) {
        next.push(f);
        continue;
      }
      if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - (r.x + r.w), h: f.h });
      if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - (r.y + r.h) });
    }
    // prune contained rects
    this.free = next.filter((a, i) => !next.some((b, j) => i !== j && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h || i > j)));
  }
}

function nextPow2(v: number): number {
  let p = 1;
  while (p < v) p <<= 1;
  return p;
}

function tryPack(items: PackInput[], size: [number, number], pad: number): { placed: PackedRegion[]; rest: PackInput[] } {
  const packer = new MaxRects(size[0], size[1]);
  const placed: PackedRegion[] = [];
  const rest: PackInput[] = [];
  for (const it of items) {
    const r = packer.insert(it.width + pad * 2, it.height + pad * 2);
    if (r) placed.push({ name: it.name, x: r.x + pad, y: r.y + pad, width: it.width, height: it.height });
    else rest.push(it);
  }
  return { placed, rest };
}

export function packAtlas(inputs: PackInput[], options: PackOptions = {}): AtlasPage[] {
  const maxSize = options.maxSize ?? 2048;
  const pad = options.padding ?? 2;
  const pot = options.pot ?? true;
  const items = inputs
    .slice()
    .sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.width * b.height - a.width * a.height);
  for (const it of items) {
    if (it.width + pad * 2 > maxSize || it.height + pad * 2 > maxSize) {
      throw new Error(`Image "${it.name}" (${it.width}x${it.height}) does not fit the ${maxSize}px atlas page`);
    }
  }
  const pages: AtlasPage[] = [];
  let remaining = items;
  while (remaining.length) {
    const area = remaining.reduce((s, i) => s + (i.width + pad * 2) * (i.height + pad * 2), 0);
    const widest = Math.max(...remaining.map((i) => i.width + pad * 2));
    const tallest = Math.max(...remaining.map((i) => i.height + pad * 2));
    let side = Math.max(nextPow2(Math.ceil(Math.sqrt(area))), nextPow2(widest), nextPow2(tallest), 16);
    let result: { placed: PackedRegion[]; rest: PackInput[] } | null = null;
    let w = 0;
    let h = 0;
    while (true) {
      const sizes: [number, number][] = pot
        ? [
            [side, side >> 1 >= Math.max(1, nextPow2(tallest)) ? side >> 1 : side],
            [side, side],
          ]
        : [[side, side]];
      let done = false;
      for (const s of sizes) {
        const r = tryPack(remaining, s, pad);
        if (r.rest.length === 0) {
          result = r;
          w = s[0];
          h = s[1];
          done = true;
          break;
        }
      }
      if (done) break;
      if (side >= maxSize) {
        const r = tryPack(remaining, [maxSize, maxSize], pad);
        result = r;
        w = maxSize;
        h = maxSize;
        break;
      }
      side <<= 1;
    }
    const r = result!;
    if (!pot) {
      // shrink to used bounds
      w = Math.max(...r.placed.map((p) => p.x + p.width + pad));
      h = Math.max(...r.placed.map((p) => p.y + p.height + pad));
    } else {
      const usedW = Math.max(...r.placed.map((p) => p.x + p.width + pad));
      const usedH = Math.max(...r.placed.map((p) => p.y + p.height + pad));
      w = Math.min(w, nextPow2(usedW));
      h = Math.min(h, nextPow2(usedH));
    }
    pages.push({ index: pages.length, width: w, height: h, regions: r.placed });
    remaining = r.rest;
  }
  return pages;
}

/** Spine 4.x atlas text for the given pages. `pageFile(i)` supplies each page's image file name. */
export function writeAtlas(pages: AtlasPage[], pageFile: (index: number) => string, opts: { pma?: boolean } = {}): string {
  const lines: string[] = [];
  for (const p of pages) {
    lines.push(pageFile(p.index));
    lines.push(`size:${p.width},${p.height}`);
    lines.push('filter:Linear,Linear');
    lines.push(`pma:${opts.pma ? 'true' : 'false'}`);
    for (const r of p.regions) {
      lines.push(r.name);
      lines.push(`bounds:${r.x},${r.y},${r.width},${r.height}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
