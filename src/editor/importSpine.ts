/**
 * "Import skeleton data…": a Spine skeleton .json or binary .skel plus (optionally) its .atlas and page images, or a DragonBones
 * *_ske.json with its *_tex.json and picture, picked together. It opens as a new project, or (`add`) as one more skeleton of the project
 * that is open. "Unpack atlas…": the pictures of an .atlas and its pages, added to the project's images.
 */
import { parseAtlas } from '@/core/import/atlas';
import type { ParsedPage } from '@/core/import/atlas';
import { displayPaths, dragonAtlas, importDragonBones, isDragonAtlas, isDragonBones } from '@/core/import/dragonBones';
import { binaryToJson } from '@/core/import/spineBinary';
import { importSpineJson } from '@/core/import/spineJson';
import type { SpineImportResult } from '@/core/import/spineJson';
import { cutRegion, unpackAtlas, unpremultiplyAlpha } from '@/core/import/unpack';
import type { Picture } from '@/core/import/unpack';
import { migrateProject } from '@/core/model';
import { addSkeleton, newSkeletonName } from '@/core/skeletons';
import { repairProject } from '@/core/validate';
import { importImageFiles } from '@/store/actions';
import { assets } from '@/store/assets';
import type { ImageAsset } from '@/store/assets';
import { docStore } from '@/store/doc';
import { showImportNotes } from '@/store/importNotes';
import { emptySelection, toast, uiStore } from '@/store/ui';
import { canvasToBlob } from './ui/canvas';

const baseName = (file: string) => file.replace(/^.*[\\/]/, '');
const stem = (file: string) => baseName(file).replace(/\.[^.]+$/, '');

/** The pixels of an image file, straight RGBA. */
async function pagePixels(file: Blob): Promise<Picture> {
  const bitmap = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: data.width, height: data.height, data: new Uint8ClampedArray(data.data) };
}

/** A picture as a PNG. */
function pictureBlob(pic: Picture): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = pic.width;
  canvas.height = pic.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pic.data), pic.width, pic.height), 0, 0);
  return canvasToBlob(canvas);
}

const fileNamed = (files: File[], name: string) => files.find((f) => baseName(f.name).toLowerCase() === baseName(name).toLowerCase());

/** The pictures cut out of the pages of an atlas, for the pages that were picked. */
async function cutPages(pages: ParsedPage[], files: File[], warnings: string[]): Promise<ImageAsset[]> {
  const decoded: ImageAsset[] = [];
  for (const page of pages) {
    const pageFile = fileNamed(files, page.file);
    if (!pageFile) {
      warnings.push(`atlas page "${page.file}" was not selected, its images are missing`);
      continue;
    }
    const pixels = await pagePixels(pageFile);
    if (page.pma) unpremultiplyAlpha(pixels.data);
    for (const r of page.regions) {
      try {
        decoded.push(await assets.decode(r.name, await pictureBlob(cutRegion(pixels, r))));
      } catch (e) {
        warnings.push(`region "${r.name}" could not be cut out of "${page.file}"`);
        console.warn(e);
      }
    }
  }
  return decoded;
}

/** Pictures picked one by one, under the names the skeleton calls them by (a name may hold folders, the picked file has none). */
async function loosePictures(names: string[], files: File[]): Promise<ImageAsset[]> {
  const decoded: ImageAsset[] = [];
  for (const name of names) {
    const file = files.find((f) => /\.(png|jpe?g|webp)$/i.test(f.name) && stem(f.name).toLowerCase() === baseName(name).toLowerCase());
    if (file) decoded.push(await assets.decode(name, file));
  }
  return decoded;
}

interface Read {
  result: SpineImportResult;
  decoded: ImageAsset[];
  warnings: string[];
}

async function readDragonBones(skeleton: unknown, atlases: unknown[], files: File[], file: string): Promise<Read> {
  const warnings: string[] = [];
  let decoded = await cutPages(atlases.map(dragonAtlas), files, warnings);
  if (!atlases.length) decoded = await loosePictures(displayPaths(skeleton), files);
  const sizes = new Map(decoded.map((d) => [d.name, { width: d.width, height: d.height }]));
  const result = importDragonBones(skeleton, sizes);
  if (result.project.skeleton.name === 'imported') result.project.skeleton.name = stem(file);
  if (!atlases.length && !decoded.length)
    warnings.push('no *_tex.json atlas or pictures were selected: the attachments have no images yet');
  return { result, decoded, warnings: [...result.warnings, ...warnings] };
}

async function readSpine(skeleton: unknown, files: File[], file: string): Promise<Read> {
  const atlasFile = files.find((f) => /\.atlas$/i.test(f.name));
  const result = importSpineJson(skeleton, stem(file));
  const warnings = [...result.warnings];
  const decoded = atlasFile ? await cutPages(parseAtlas(await atlasFile.text()), files, warnings) : [];
  if (!atlasFile && result.project.images.length) warnings.push('no .atlas file was selected: the attachments have no images yet');
  return { result, decoded, warnings };
}

/** Opens a skeleton with its atlas and pictures (selected together) as a new project, or as one more skeleton of the open project. */
async function importSkeletonFiles(files: File[], add = false): Promise<void> {
  // a DragonBones export has two .json files: the atlas is told by what is in it
  let json: File | undefined;
  let skeleton: unknown;
  const atlases: unknown[] = [];
  for (const f of files.filter((f) => /\.(json|skel)$/i.test(f.name))) {
    const read: unknown = /\.skel$/i.test(f.name) ? binaryToJson(new Uint8Array(await f.arrayBuffer())) : JSON.parse(await f.text());
    if (isDragonAtlas(read)) atlases.push(read);
    else if (!json) [json, skeleton] = [f, read];
  }
  if (!json)
    throw new Error('Select a skeleton file (Spine .json or .skel, DragonBones *_ske.json) together with its atlas and image files');
  const dragon = isDragonBones(skeleton);
  const { result, decoded, warnings } = dragon
    ? await readDragonBones(skeleton, atlases, files, json.name)
    : await readSpine(skeleton, files, json.name);
  for (const img of result.project.images) {
    const asset = decoded.find((d) => d.name === img.name);
    if (asset) {
      img.width = asset.width;
      img.height = asset.height;
    } else warnings.push(`image "${img.name}" is not in the atlas`);
  }

  const repaired = repairProject(result.project);
  if (repaired.length) console.warn('imported project repaired:', repaired);
  const imported = migrateProject(result.project);
  if (add) {
    // one more skeleton in the project that is open: its pictures join the shared ones, a picture the project already has keeps its pixels
    const have = new Set(docStore.get().images.map((i) => i.name));
    const fresh = imported.images.filter((i) => !have.has(i.name));
    for (const d of decoded) if (!have.has(d.name)) assets.set(d.name, d);
    const doc = imported.skeleton;
    doc.name = newSkeletonName(docStore.get(), doc.name || stem(json.name));
    docStore.update('Import skeleton', (d) => {
      addSkeleton(d, doc);
      d.images.push(...fresh);
    });
    uiStore.patch({
      mode: 'setup',
      selection: emptySelection,
      animationId: docStore.get().skeleton.animations[0]?.id ?? null,
      skinId: null,
      time: 0,
      playing: false,
      overrides: {},
      selectedKeys: [],
    });
    const same = decoded.filter((d) => have.has(d.name)).length;
    if (same) warnings.push(`${same} picture${same === 1 ? '' : 's'} already in the project kept the pixels they had`);
  } else {
    assets.replaceAll(decoded);
    docStore.replace(imported);
    const doc = imported.skeleton;
    uiStore.patch({
      mode: 'setup',
      selection: emptySelection,
      animationId: doc.animations[0]?.id ?? null,
      skinId: null,
      time: 0,
      playing: false,
      overrides: {},
      selectedKeys: [],
    });
  }
  if (warnings.length) console.warn('Skeleton import:', warnings);
  // another editor's file loses more on the way: what did is listed in a window, not only in the console
  if (dragon && warnings.length) {
    showImportNotes(json.name, warnings);
    toast(`Imported "${json.name}"`, 'info');
    return;
  }
  toast(
    `Imported "${json.name}"${warnings.length ? ` — ${warnings.length} note${warnings.length === 1 ? '' : 's'} (see the console)` : ''}`,
    warnings.length ? 'info' : 'ok',
  );
}

/** Cuts the pictures out of an .atlas and its pages and adds them to the project's images (with their folders). */
async function unpackAtlasFiles(files: File[]): Promise<void> {
  const atlasFile = files.find((f) => /\.atlas$/i.test(f.name));
  if (!atlasFile) throw new Error('Select an .atlas file together with its page images');
  const text = await atlasFile.text();
  const pageOf = new Map<string, Picture>();
  for (const page of parseAtlas(text)) {
    const file = files.find((f) => baseName(f.name).toLowerCase() === baseName(page.file).toLowerCase());
    if (file) pageOf.set(page.file, await pagePixels(file));
  }
  const { pictures, warnings } = unpackAtlas(text, (file) => pageOf.get(file) ?? null);
  if (!pictures.length) throw new Error('No pictures could be cut out: select the page images together with the .atlas');
  const blobs: File[] = [];
  for (const p of pictures) blobs.push(new File([await pictureBlob(p.picture)], `${baseName(p.name)}.png`, { type: 'image/png' }));
  await importImageFiles(
    blobs,
    pictures.map((p) => `${p.name}.png`),
  );
  if (warnings.length) {
    console.warn('Unpack atlas:', warnings);
    toast(`${warnings.length} note${warnings.length === 1 ? '' : 's'} while unpacking (see the console)`, 'info');
  }
}

function pick(accept: string, then: (files: File[]) => Promise<void>, failure: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = accept;
  input.onchange = async () => {
    const files = [...(input.files ?? [])];
    if (!files.length) return;
    try {
      await then(files);
    } catch (e) {
      toast(`${failure}: ${(e as Error).message}`, 'error');
    }
  };
  input.click();
}

export function openSpineImport(add = false) {
  pick('.json,.skel,.atlas,.png,.jpg,.jpeg,.webp', (files) => importSkeletonFiles(files, add), 'Could not import');
}

export function openAtlasUnpack() {
  pick('.atlas,.png,.jpg,.jpeg,.webp', unpackAtlasFiles, 'Could not unpack');
}
