import { uid, uniqueName } from '@/core/ids';
import type { ImageRef } from '@/core/model';

/** Image pixel data lives outside the (immutable) document; attachments refer to images by name. */
export interface ImageAsset {
  name: string;
  width: number;
  height: number;
  blob: Blob;
  bitmap: ImageBitmap;
  /** Changes whenever the pixels behind `name` change (texture re-upload). */
  version: number;
}

let assetCounter = 0;

class AssetRegistry {
  private map = new Map<string, ImageAsset>();
  /** Bumps whenever the set of images changes (renderer reuploads textures). */
  version = 0;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  get(name: string): ImageAsset | undefined {
    return this.map.get(name);
  }
  has(name: string) {
    return this.map.has(name);
  }
  names(): string[] {
    return [...this.map.keys()];
  }

  async addFile(file: File | Blob, suggestedName?: string): Promise<ImageRef> {
    const base = (suggestedName ?? (file instanceof File ? file.name : 'image')).replace(/\.[^.]+$/, '').trim() || 'image';
    const name = uniqueName(base, this.map.keys());
    const bitmap = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const asset: ImageAsset = { name, width: bitmap.width, height: bitmap.height, blob: file, bitmap, version: ++assetCounter };
    this.map.set(name, asset);
    this.emit();
    return { id: uid(), name, width: asset.width, height: asset.height };
  }

  /** Decodes an image without registering it (project load decodes everything first, then swaps the whole set). */
  async decode(name: string, blob: Blob): Promise<ImageAsset> {
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    return { name, width: bitmap.width, height: bitmap.height, blob, bitmap, version: ++assetCounter };
  }

  /** Replaces every image at once (open project). */
  replaceAll(list: ImageAsset[]) {
    for (const a of this.map.values()) a.bitmap.close?.();
    this.map = new Map(list.map((a) => [a.name, a] as const));
    this.emit();
  }

  remove(name: string) {
    const a = this.map.get(name);
    if (!a) return;
    a.bitmap.close?.();
    this.map.delete(name);
    this.emit();
  }

  clear() {
    for (const a of this.map.values()) a.bitmap.close?.();
    this.map.clear();
    this.emit();
  }

  /** Reads pixels (for tracing). */
  getImageData(name: string): ImageData | null {
    const a = this.map.get(name);
    if (!a) return null;
    const c = document.createElement('canvas');
    c.width = a.width;
    c.height = a.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(a.bitmap, 0, 0);
    return ctx.getImageData(0, 0, a.width, a.height);
  }
}

export const assets = new AssetRegistry();

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataURLToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
