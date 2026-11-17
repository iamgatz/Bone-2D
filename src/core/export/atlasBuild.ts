/**
 * What the editor export and the command line share when they build an atlas: which pictures the skeleton uses, and one picture turned into a
 * region (trimmed or not) for the packer. Pure: the pixels come in as straight RGBA, however they were read.
 */
import { attachmentPictures } from '../sequence';
import type { SkeletonDoc } from '../model';
import { trimBounds } from './atlas';
import type { PackInput } from './atlas';

/** The images the skeleton uses; `mesh` marks those a mesh uses too (a mesh can sample outside the opaque part, so such a picture is never trimmed). */
export function usedImages(doc: Pick<SkeletonDoc, 'skins'>): { name: string; mesh: boolean }[] {
  const used = new Map<string, boolean>();
  for (const skin of doc.skins) {
    for (const slot of Object.values(skin.attachments)) {
      for (const att of Object.values(slot)) {
        for (const image of attachmentPictures(att)) used.set(image, (used.get(image) ?? false) || att.type === 'mesh');
      }
    }
  }
  return [...used].map(([name, mesh]) => ({ name, mesh }));
}

/** The size a picture has at an export scale (never below one pixel). */
export const scaledSize = (width: number, height: number, scale: number): [number, number] => [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];

/**
 * One picture, already at its export size, as a region: the pixels of the part that is packed (the picture without its empty border when `trim`
 * is on and no mesh uses it) and what the packer is told about it.
 */
export function makeRegion(name: string, mesh: boolean, width: number, height: number, rgba: Uint8ClampedArray, trim: boolean): { pixels: Uint8ClampedArray; input: PackInput } {
  const b = trim && !mesh ? trimBounds(rgba, width, height) : { x: 0, y: 0, w: width, h: height };
  let pixels = rgba;
  if (b.w !== width || b.h !== height) {
    pixels = new Uint8ClampedArray(b.w * b.h * 4);
    for (let y = 0; y < b.h; y++) pixels.set(rgba.subarray(((b.y + y) * width + b.x) * 4, ((b.y + y) * width + b.x + b.w) * 4), y * b.w * 4);
  }
  return { pixels, input: { name, width: b.w, height: b.h, offsetX: b.x, offsetY: height - (b.y + b.h), originalWidth: width, originalHeight: height } };
}
