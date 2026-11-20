/**
 * The built-in demo rig "Kit": a fox with IK legs, a physics tail, ears and scarf, weighted meshes, two skins, four animations.
 * The rig itself is built from data by demo/kit.ts, the pictures by demo/art.ts; this only puts them into the editor.
 */
import type { ImageRef } from '@/core/model';
import { assets } from './assets';
import { docStore } from './doc';
import { drawDemoImages } from './demo/art';
import { buildDemoRig } from './demo/kit';
import { emptySelection, toast, uiStore } from './ui';

export async function loadSample() {
  assets.clear();
  const refs: Record<string, ImageRef> = {};
  for (const { name, blob } of await drawDemoImages()) refs[name] = await assets.addFile(blob, name);

  const project = buildDemoRig(refs);
  const walk = project.skeleton.animations.find((a) => a.name === 'walk')!;
  docStore.replace(project);
  uiStore.patch({
    mode: 'setup',
    selection: emptySelection,
    animationId: walk.id,
    skinId: null,
    time: 0,
    playing: false,
    overrides: {},
    selectedKeys: [],
    camera: { x: 20, y: 150, zoom: 1.5 },
  });
  window.dispatchEvent(new Event('bone2d:frame'));
  toast('Loaded the "Kit" demo rig — switch to Animate and press Space', 'ok');
}
