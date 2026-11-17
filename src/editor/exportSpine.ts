/** Builds a Spine 4.3 export bundle: skeleton JSON + texture atlas (.atlas + PNG pages), zipped. */
import { exportSpineJson } from '@/core/export/spineJson';
import { packAtlas, writeAtlas } from '@/core/export/atlas';
import type { AtlasPage } from '@/core/export/atlas';
import { attachmentImage } from '@/core/model';
import { createZip } from '@/core/export/zip';
import type { ZipEntry } from '@/core/export/zip';
import { assets } from '@/store/assets';
import { docStore } from '@/store/doc';

export interface ExportOptions {
  maxSize: number;
  padding: number;
  pretty: boolean;
  nonessential: boolean;
  /** Power-of-two atlas pages (older GPUs and some engines want them). */
  pot?: boolean;
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

function usedImageNames(): string[] {
  const used = new Set<string>();
  for (const skin of docStore.get().skeleton.skins) {
    for (const slot of Object.values(skin.attachments)) {
      for (const att of Object.values(slot)) {
        const image = attachmentImage(att);
        if (image) used.add(image);
      }
    }
  }
  return [...used];
}

async function pageToPng(page: AtlasPage, padding: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (const r of page.regions) {
    const a = assets.get(r.name);
    if (!a) continue;
    const img = a.bitmap;
    const { x, y, width: w, height: h } = r;
    ctx.drawImage(img, x, y);
    const p = Math.min(padding, 4);
    if (p > 0) {
      // extrude the edge pixels into the padding so bilinear filtering never samples transparent black
      ctx.drawImage(img, 0, 0, w, 1, x, y - p, w, p);
      ctx.drawImage(img, 0, h - 1, w, 1, x, y + h, w, p);
      ctx.drawImage(img, 0, 0, 1, h, x - p, y, p, h);
      ctx.drawImage(img, w - 1, 0, 1, h, x + w, y, p, h);
      ctx.drawImage(img, 0, 0, 1, 1, x - p, y - p, p, p);
      ctx.drawImage(img, w - 1, 0, 1, 1, x + w, y - p, p, p);
      ctx.drawImage(img, 0, h - 1, 1, 1, x - p, y + h, p, p);
      ctx.drawImage(img, w - 1, h - 1, 1, 1, x + w, y + h, p, p);
    }
  }
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
function previewHtml(base: string, json: string, atlas: string, pngs: { name: string; data: Uint8Array }[], animation: string | null, title: string): string {
  const utf8 = (s: string) => bytesToBase64(new TextEncoder().encode(s));
  const uris: Record<string, string> = {
    [`${base}.json`]: `data:application/json;base64,${utf8(json)}`,
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
  skeleton: ${JSON.stringify(`${base}.json`)},
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
  const names = usedImageNames();
  const missing = names.filter((n) => !assets.has(n));
  const inputs = names.filter((n) => assets.has(n)).map((n) => ({ name: n, width: assets.get(n)!.width, height: assets.get(n)!.height }));

  const enc = new TextEncoder();
  const files: ZipEntry[] = [];
  const json = exportSpineJson(doc, { nonessential: opts.nonessential, imagesPath: './images/' });
  const jsonText = JSON.stringify(json, null, opts.pretty ? 2 : 0);
  files.push({ name: `${base}.json`, data: enc.encode(jsonText) });

  let pages: AtlasPage[] = [];
  let preview: string | undefined;
  if (inputs.length) {
    pages = packAtlas(inputs, { maxSize: opts.maxSize, padding: opts.padding, pot: opts.pot ?? true });
    const pageFile = (i: number) => (pages.length === 1 ? `${base}.png` : `${base}-${i + 1}.png`);
    const atlasText = writeAtlas(pages, pageFile, { pma: false });
    files.push({ name: `${base}.atlas`, data: enc.encode(atlasText) });
    const pngs: { name: string; data: Uint8Array }[] = [];
    for (const p of pages) {
      const data = await pageToPng(p, opts.padding);
      pngs.push({ name: pageFile(p.index), data });
      files.push({ name: pageFile(p.index), data });
    }
    if (opts.includePreview ?? true) {
      const firstAnim = doc.animations[0]?.name ?? null;
      preview = previewHtml(base, jsonText, atlasText, pngs, firstAnim, doc.name || base);
      files.push({ name: `${base}-preview.html`, data: enc.encode(preview) });
    }
  }
  files.push({
    name: 'README.txt',
    data: enc.encode(`Exported from Bone 2D.\n\n${base}.json          Spine 4.3 skeleton data\n${base}.atlas         texture atlas (straight alpha, pma:false)\n${base}-preview.html  open in a browser: plays the animations with the official Spine 4.3 web player (needs internet for the player script)\n\nLoad with the official Spine 4.3 runtimes (spine-ts, Unity, Godot, ...).\n`),
  });
  const zip = createZip(files);
  return { zip, files: files.map((f) => ({ name: f.name, size: f.data.length })), pages: pages.length, missing, json, preview };
}
