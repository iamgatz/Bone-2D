/**
 * The player for a web game: loads a character the editor saved and draws it with WebGL2. This file and what it imports become
 * `bone2d.js` of the web game export (see the `bone2d:bundles` plugin of vite.config.ts).
 */
import { GLRenderer } from '@/render/gl';
import { createCharacter } from './character';
import type { Character, CharacterData } from './character';

export { createCharacter };

/** Loads a character file (its address, or the data already read) and its pictures. */
export async function loadCharacter(source: string | CharacterData): Promise<Character> {
  let data: CharacterData;
  let base = document.baseURI;
  if (typeof source === 'string') {
    const url = new URL(source, base);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${source}: ${response.status}`);
    data = (await response.json()) as CharacterData;
    base = url.href;
  } else data = source;
  const character = createCharacter(data);
  await Promise.all(
    Object.entries(data.images).map(async ([name, address]) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = address.startsWith('data:') ? address : new URL(address, base).href;
      await img.decode();
      character.images.set(name, img);
    }),
  );
  return character;
}

export interface Camera {
  /** The place of the game shown in the middle of the canvas, y up. */
  x?: number;
  y?: number;
  /** CSS pixels per unit of the game. */
  zoom?: number;
}

/** A canvas that characters are drawn on. It is clear around them unless a background is given (red, green, blue, alpha: 0..1). */
export function createView(canvas: HTMLCanvasElement, options: { background?: [number, number, number, number] } = {}) {
  const renderer = new GLRenderer(canvas, { alpha: true });
  /** Each picture has a number of its own, so two characters can both call a picture "head". */
  const numbers = new WeakMap<object, number>();
  let taken = 0;
  return {
    /** Clears the canvas and draws the characters, the first one at the back. */
    draw(characters: Character | Character[], camera: Camera = {}) {
      const ratio = window.devicePixelRatio || 1;
      // a canvas that is laid out on the page gets as many pixels as it covers
      if (canvas.clientWidth && canvas.clientHeight) {
        const width = Math.round(canvas.clientWidth * ratio);
        const height = Math.round(canvas.clientHeight * ratio);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
      }
      const scale = (camera.zoom ?? 1) * (canvas.clientWidth ? ratio : 1);
      renderer.begin(
        { x: camera.x ?? 0, y: camera.y ?? 0, scale, width: canvas.width, height: canvas.height },
        options.background ?? [0, 0, 0, 0],
      );
      for (const character of [characters].flat()) {
        renderer.flush();
        renderer.setSmoothing(character.data.smooth);
        renderer.source = {
          get: (name) => {
            const bitmap = character.images.get(name) as HTMLImageElement | undefined;
            if (!bitmap) return null;
            if (!numbers.has(bitmap)) numbers.set(bitmap, ++taken);
            return { bitmap, version: 1, key: String(numbers.get(bitmap)) };
          },
        };
        renderer.drawSkeleton(character.skeleton);
        // a clipping that a character left open must not cut the next one
        renderer.end();
      }
    },
    dispose() {
      renderer.dispose();
    },
  };
}
