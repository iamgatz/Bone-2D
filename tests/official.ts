/** Helpers that run our export through the OFFICIAL Spine 4.3 runtime (@esotericsoftware/spine-core). */
import * as spine from '@esotericsoftware/spine-core';
import { packAtlas, writeAtlas } from '../src/core/export/atlas';
import { exportSpineJson } from '../src/core/export/spineJson';
import { attachmentImage } from '../src/core/model';
import type { Project } from '../src/core/model';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const S = spine as any;

class FakeTexture extends S.Texture {
  constructor(image: unknown) {
    super(image);
  }
  setFilters() {}
  setWraps() {}
  dispose() {}
}

/** Loads exported JSON + atlas text with the official `SkeletonJson`. Throws exactly like the real loader does. */
export function loadOfficial(json: unknown, atlasText: string) {
  const atlas = new S.TextureAtlas(atlasText);
  for (const page of atlas.pages) page.setTexture(new FakeTexture({ width: page.width, height: page.height }));
  const loader = new S.AtlasAttachmentLoader(atlas);
  const sj = new S.SkeletonJson(loader);
  return sj.readSkeletonData(JSON.stringify(json));
}

/** Image names referenced by any attachment (what the atlas must contain). */
export function usedImages(project: Project) {
  const used = new Set<string>();
  for (const skin of project.skeleton.skins) {
    for (const slot of Object.values(skin.attachments)) {
      for (const att of Object.values(slot)) {
        const image = attachmentImage(att);
        if (image) used.add(image);
      }
    }
  }
  return project.images.filter((i) => used.has(i.name)).map((i) => ({ name: i.name, width: i.width, height: i.height }));
}

/** Exports `project` the way the editor does and loads it with the official runtime. */
export function exportAndLoad(project: Project, options: Parameters<typeof exportSpineJson>[1] = {}) {
  const json = exportSpineJson(project.skeleton, options);
  const pages = packAtlas(usedImages(project), { maxSize: 2048, padding: 2 });
  const atlasText = writeAtlas(pages, (i) => `atlas${i}.png`);
  return { json, skeletonData: loadOfficial(json, atlasText), atlasText };
}
