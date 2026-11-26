/** Builds the single-file player page of a skeleton (see core/export/playerPage.ts): the skeleton and its pictures, with the player inside. */
import playerScript from 'virtual:bone2d-player';
import { usedImages } from '@/core/export/atlasBuild';
import { playerPageHtml } from '@/core/export/playerPage';
import type { PlayerPayload } from '@/core/export/playerPage';
import type { Project } from '@/core/model';
import { webGameFiles } from '@/core/export/webGame';
import { createZip } from '@/core/export/zip';
import type { CharacterData } from '@/runtime/character';
import { assets } from '@/store/assets';

/** The picture as a PNG data URI, or null when the editor does not have it. */
function pictureUri(name: string): string | null {
  const a = assets.get(name);
  if (!a) return null;
  const canvas = document.createElement('canvas');
  canvas.width = a.width;
  canvas.height = a.height;
  canvas.getContext('2d')!.drawImage(a.bitmap, 0, 0);
  return canvas.toDataURL('image/png');
}

/** The pictures the skeleton shows, as data URIs; `missing` lists the ones the editor could not find. */
function pictures(doc: Project['skeleton']): { images: Record<string, string>; missing: string[] } {
  const images: Record<string, string> = {};
  const missing: string[] = [];
  for (const { name } of usedImages(doc)) {
    const uri = pictureUri(name);
    if (uri) images[name] = uri;
    else missing.push(name);
  }
  return { images, missing };
}

/** The web game export of `doc`: a ZIP with the player module, the character and an example page. */
export async function buildWebGame(
  doc: Project['skeleton'],
  opts: { smooth?: boolean } = {},
): Promise<{ zip: Uint8Array; missing: string[] }> {
  const { default: player, types } = await import('virtual:bone2d-runtime');
  const { images, missing } = pictures(doc);
  const data: CharacterData = { bone2d: 1, name: doc.name || 'character', skeleton: doc, images, smooth: opts.smooth ?? true };
  const text = new TextEncoder();
  return { zip: createZip(webGameFiles(data, player, types).map((f) => ({ name: f.name, data: text.encode(f.text) }))), missing };
}

/** The page for `doc`; `missing` lists the pictures the editor could not find (their slots stay empty). */
export function buildPlayerPage(
  doc: Project['skeleton'],
  opts: { smooth?: boolean } = {},
): { html: string; missing: string[]; bytes: number } {
  const { images, missing } = pictures(doc);
  const payload: PlayerPayload = { title: doc.name || 'Bone 2D', skeleton: doc, images, smooth: opts.smooth ?? true };
  const html = playerPageHtml(payload, playerScript);
  return { html, missing, bytes: html.length };
}
