/** Builds a Spine 4.3 export bundle: skeleton JSON + texture atlas (.atlas + PNG pages), zipped. */
import { jsonToBinary } from '@/core/export/spineBinary';
import { scaleSpineJson } from '@/core/export/scale';
import { exportSpineJson } from '@/core/export/spineJson';
import { composePage, packAtlas, trimBounds, writeAtlas } from '@/core/export/atlas';
import type { AtlasFilter, AtlasPage, PackInput } from '@/core/export/atlas';
import { attachmentPictures } from '@/core/sequence';
import { createZip } from '@/core/export/zip';
import type { ZipEntry } from '@/core/export/zip';
import { assets } from '@/store/assets';
import { docStore } from '@/store/doc';

export interface ExportOptions {
  /** The skeleton file: Spine JSON, or the smaller binary .skel. */
  format?: 'json' | 'binary';
  /** Size of the export relative to the project: 0.5 makes half-size pictures and a skeleton to match. */
  scale?: number;
  maxSize: number;
  padding: number;
  pretty: boolean;
  nonessential: boolean;
  /** Power-of-two atlas pages (older GPUs and some engines want them). */
  pot?: boolean;
  /** Cut the empty border off every picture (not those a mesh uses); the atlas file tells the runtime where it was. */
  trim?: boolean;
  /** Turn a picture a quarter turn on the page when it fits better. */
  rotate?: boolean;
  /** How the engine should smooth the atlas: Linear, or Nearest for pixel art. */
  filter?: AtlasFilter;
  /** Write the single-file preview page that plays the export. */
  includePreview?: boolean;
  /** Animations left out of the export (an animation a slider uses always stays). */
  excludeAnimations?: string[];
  baseName?: string;
}

export interface ExportResult {
  zip: Uint8Array;
  files: { name: string; size: number }[];
  pages: number;
  missing: string[];
  json: unknown;
  /** Self-contained preview page (official Spine player). */
  preview?: string;
}

/** The images the skeleton uses; `mesh` marks those a mesh uses too (a mesh can sample outside the opaque part, so such a picture is never trimmed). */
function usedImages(): { name: string; mesh: boolean }[] {
  const used = new Map<string, boolean>();
  for (const skin of docStore.get().skeleton.skins) {
    for (const slot of Object.values(skin.attachments)) {
      for (const att of Object.values(slot)) {
        for (const image of attachmentPictures(att)) used.set(image, (used.get(image) ?? false) || att.type === 'mesh');
      }
    }
  }
  return [...used].map(([name, mesh]) => ({ name, mesh }));
}

/** The picture at the size it is exported at (a smaller one is drawn from the full picture with smoothing), as straight RGBA. */
function scaledPixels(name: string, w: number, h: number): ImageData {
  const img = assets.get(name)!.bitmap;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const resized = w !== img.width || h !== img.height;
  ctx.imageSmoothingEnabled = resized;
  if (resized) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

async function pageToPng(page: AtlasPage, pixels: Map<string, Uint8ClampedArray>, padding: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d')!;
  const data = composePage(page, (n) => (pixels.has(n) ? { data: pixels.get(n)! } : undefined), padding);
  ctx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, page.width, page.height), 0, 0);
  const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

/** A single-file preview page using the official Spine 4.3 web player (script from a CDN, data embedded as data URIs). */
function previewHtml(base: string, skeleton: { file: string; data: Uint8Array; binary: boolean }, atlas: string, pngs: { name: string; data: Uint8Array }[], animation: string | null, title: string): string {
  const utf8 = (s: string) => bytesToBase64(new TextEncoder().encode(s));
  const uris: Record<string, string> = {
    [skeleton.file]: `data:${skeleton.binary ? 'application/octet-stream' : 'application/json'};base64,${bytesToBase64(skeleton.data)}`,
    [`${base}.atlas`]: `data:text/plain;base64,${utf8(atlas)}`,
  };
  for (const p of pngs) uris[p.name] = `data:image/png;base64,${bytesToBase64(p.data)}`;
  const V = '4.3.13';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/[<&]/g, '')} — Spine ${V} preview</title>
<link rel="stylesheet" href="https://unpkg.com/@esotericsoftware/spine-player@${V}/dist/spine-player.css">
<script src="https://unpkg.com/@esotericsoftware/spine-player@${V}/dist/iife/spine-player.js"></script>
<style>html,body{height:100%;margin:0;background:#0d0f13;font-family:system-ui,sans-serif;color:#aab1be}#player{width:100%;height:100%}</style>
</head><body><div id="player"></div>
<script>
// Exported by Bone 2D. Rendered by the OFFICIAL Spine runtime — if it plays here, it plays in your engine.
new spine.SpinePlayer("player", {
  ${skeleton.binary ? 'binary' : 'skeleton'}: ${JSON.stringify(skeleton.file)},
  atlas: ${JSON.stringify(`${base}.atlas`)},
  rawDataURIs: ${JSON.stringify(uris)},
  ${animation ? `animation: ${JSON.stringify(animation)},` : ''}
  showControls: true,
  backgroundColor: "#13161c"
});
</script></body></html>`;
}

export async function buildSpineExport(opts: ExportOptions): Promise<ExportResult> {
  const project = docStore.get();
  const full = project.skeleton;
  const keep = new Set(full.constraints.flatMap((c) => (c.type === 'slider' && c.animation ? [c.animation] : [])));
  const doc = opts.excludeAnimations?.length ? { ...full, animations: full.animations.filter((a) => keep.has(a.id) || !opts.excludeAnimations!.includes(a.id)) } : full;
  const base = (opts.baseName ?? doc.name ?? 'skeleton').replace(/[^\w\-]+/g, '_') || 'skeleton';
  const images = usedImages();
  const missing = images.filter((i) => !assets.has(i.name)).map((i) => i.name);
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  // the pixels of every region (the part of the picture that is packed) and what the packer is told about them
  const pixels = new Map<string, Uint8ClampedArray>();
  const inputs: PackInput[] = [];
  for (const { name, mesh } of images) {
    const a = assets.get(name);
    if (!a) continue;
    const width = Math.max(1, Math.round(a.width * scale));
    const height = Math.max(1, Math.round(a.height * scale));
    const full = scaledPixels(name, width, height);
    const b = opts.trim && !mesh ? trimBounds(full.data, width, height) : { x: 0, y: 0, w: width, h: height };
    if (b.w === width && b.h === height) pixels.set(name, full.data);
    else {
      const part = new Uint8ClampedArray(b.w * b.h * 4);
      for (let y = 0; y < b.h; y++) part.set(full.data.subarray(((b.y + y) * width + b.x) * 4, ((b.y + y) * width + b.x + b.w) * 4), y * b.w * 4);
      pixels.set(name, part);
    }
    inputs.push({ name, width: b.w, height: b.h, offsetX: b.x, offsetY: height - (b.y + b.h), originalWidth: width, originalHeight: height });
  }

  const enc = new TextEncoder();
  const files: ZipEntry[] = [];
  const binary = opts.format === 'binary';
  const json = scaleSpineJson(exportSpineJson(doc, { nonessential: opts.nonessential, imagesPath: './images/' }), scale);
  const skeletonFile = binary ? `${base}.skel` : `${base}.json`;
  const skeletonData = binary ? jsonToBinary(json) : enc.encode(JSON.stringify(json, null, opts.pretty ? 2 : 0));
  files.push({ name: skeletonFile, data: skeletonData });

  let pages: AtlasPage[] = [];
  let preview: string | undefined;
  if (inputs.length) {
    pages = packAtlas(inputs, { maxSize: opts.maxSize, padding: opts.padding, pot: opts.pot ?? true, rotate: opts.rotate ?? false });
    const pageFile = (i: number) => (pages.length === 1 ? `${base}.png` : `${base}-${i + 1}.png`);
    const atlasText = writeAtlas(pages, pageFile, { pma: false, filter: opts.filter ?? 'Linear' });
    files.push({ name: `${base}.atlas`, data: enc.encode(atlasText) });
    const pngs: { name: string; data: Uint8Array }[] = [];
    for (const p of pages) {
      const data = await pageToPng(p, pixels, opts.padding);
      pngs.push({ name: pageFile(p.index), data });
      files.push({ name: pageFile(p.index), data });
    }
    if (opts.includePreview ?? true) {
      const firstAnim = doc.animations[0]?.name ?? null;
      preview = previewHtml(base, { file: skeletonFile, data: skeletonData, binary }, atlasText, pngs, firstAnim, doc.name || base);
      files.push({ name: `${base}-preview.html`, data: enc.encode(preview) });
    }
  }
  files.push({
    name: 'README.txt',
    data: enc.encode(`Exported from Bone 2D.\n\n${skeletonFile.padEnd(base.length + 5)}  Spine 4.3 skeleton data (${binary ? 'binary' : 'JSON'})\n${base}.atlas         texture atlas (straight alpha, pma:false)\n${base}-preview.html  open in a browser: plays the animations with the official Spine 4.3 web player (needs internet for the player script)\n\nLoad with the official Spine 4.3 runtimes (spine-ts, Unity, Godot, ...).\n`),
  });
  const zip = createZip(files);
  return { zip, files: files.map((f) => ({ name: f.name, size: f.data.length })), pages: pages.length, missing, json, preview };
}
