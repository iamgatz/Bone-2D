/** "Import Spine JSON…": a skeleton .json plus (optionally) its .atlas and page images, picked together. */
import { parseAtlas } from '@/core/import/atlas';
import type { ParsedPage, ParsedRegion } from '@/core/import/atlas';
import { importSpineJson } from '@/core/import/spineJson';
import { migrateProject } from '@/core/model';
import { repairProject } from '@/core/validate';
import { assets } from '@/store/assets';
import type { ImageAsset } from '@/store/assets';
import { docStore } from '@/store/doc';
import { emptySelection, toast, uiStore } from '@/store/ui';

const baseName = (file: string) => file.replace(/^.*[\\/]/, '');
const stem = (file: string) => baseName(file).replace(/\.[^.]+$/, '');

/** Cuts one atlas region out of its page image into an image of the region's ORIGINAL size (restoring trimmed whitespace). */
async function sliceRegion(page: ImageBitmap, r: ParsedRegion): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, r.originalWidth);
  canvas.height = Math.max(1, r.originalHeight);
  const ctx = canvas.getContext('2d')!;
  const destX = r.offsetX;
  const destY = r.originalHeight - r.offsetY - r.height; // offsets are measured from the bottom
  if (r.rotate === 0) ctx.drawImage(page, r.x, r.y, r.width, r.height, destX, destY, r.width, r.height);
  else {
    // stored rotated: the page rectangle is height wide and width tall; rotate it back
    ctx.save();
    ctx.translate(destX, destY);
    if (r.rotate === 90) {
      ctx.translate(0, r.height);
      ctx.rotate(-Math.PI / 2);
    } else {
      ctx.translate(r.width, 0);
      ctx.rotate(Math.PI / 2);
    }
    ctx.drawImage(page, r.x, r.y, r.height, r.width, 0, 0, r.height, r.width);
    ctx.restore();
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'));
}

/** Opens a skeleton .json (+ .atlas + page images selected together) as a new project. */
export async function importSpineFiles(files: File[]): Promise<void> {
  const json = files.find((f) => /\.json$/i.test(f.name));
  if (!json) throw new Error('Select a Spine skeleton (.json) — optionally together with its .atlas and image files');
  const atlasFile = files.find((f) => /\.atlas$/i.test(f.name));
  const result = importSpineJson(JSON.parse(await json.text()), stem(json.name));
  const warnings = [...result.warnings];

  const decoded: ImageAsset[] = [];
  if (atlasFile) {
    const pages: ParsedPage[] = parseAtlas(await atlasFile.text());
    for (const page of pages) {
      const pageFile = files.find((f) => baseName(f.name).toLowerCase() === baseName(page.file).toLowerCase());
      if (!pageFile) {
        warnings.push(`atlas page "${page.file}" was not selected, its images are missing`);
        continue;
      }
      const bitmap = await createImageBitmap(pageFile, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      for (const r of page.regions) {
        try {
          const asset = await assets.decode(r.name, await sliceRegion(bitmap, r));
          decoded.push(asset);
          const ref = result.project.images.find((i) => i.name === r.name);
          if (ref) {
            ref.width = asset.width;
            ref.height = asset.height;
          }
        } catch (e) {
          warnings.push(`region "${r.name}" could not be cut out of "${page.file}"`);
          console.warn(e);
        }
      }
      bitmap.close();
    }
  } else if (result.project.images.length) warnings.push('no .atlas file was selected: the attachments have no images yet');
  for (const img of result.project.images) if (!decoded.some((d) => d.name === img.name)) warnings.push(`image "${img.name}" is not in the atlas`);

  const repaired = repairProject(result.project);
  if (repaired.length) console.warn('imported project repaired:', repaired);
  assets.replaceAll(decoded);
  docStore.replace(migrateProject(result.project));
  const doc = result.project.skeleton;
  uiStore.patch({ mode: 'setup', selection: emptySelection, animationId: doc.animations[0]?.id ?? null, skinId: null, time: 0, playing: false, overrides: {}, selectedKeys: [] });
  if (warnings.length) console.warn('Spine import:', warnings);
  toast(`Imported "${json.name}"${warnings.length ? ` — ${warnings.length} note${warnings.length === 1 ? '' : 's'} (see the console)` : ''}`, warnings.length ? 'info' : 'ok');
}

export function openSpineImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.json,.atlas,.png,.jpg,.jpeg,.webp';
  input.onchange = async () => {
    const files = [...(input.files ?? [])];
    if (!files.length) return;
    try {
      await importSpineFiles(files);
    } catch (e) {
      toast(`Could not import: ${(e as Error).message}`, 'error');
    }
  };
  input.click();
}
