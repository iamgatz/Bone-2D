/** A DragonBones export opened from the Welcome window: its files picked together, the character built, what was lost listed. */
import { deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { crc32 } from '../src/core/export/zip';
import { dragonSkeleton, DRAGON_PICTURES } from '../tests/dragonfixture';

type DocModule = typeof import('../src/store/doc');
const URLS = { doc: '/src/store/doc.ts' };

/** A PNG of coloured blocks on a clear ground. */
function png(w: number, h: number, blocks: { x: number; y: number; width: number; height: number; color: number[] }[]): Buffer {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (const b of blocks)
    for (let y = b.y; y < b.y + b.height; y++)
      for (let x = b.x; x < b.x + b.width; x++) raw.set([...b.color, 255], y * (w * 4 + 1) + 1 + x * 4);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const head = new Uint8Array(13);
  const view = new DataView(head.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  head.set([8, 6], 8);
  return Buffer.concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** The three files DragonBones writes for a character: skeleton, atlas and its page. */
function exported() {
  const colors = [
    [220, 90, 60],
    [230, 180, 60],
    [80, 160, 100],
    [70, 110, 190],
    [160, 90, 180],
  ];
  let x = 0;
  const regions = [...DRAGON_PICTURES].map(([name, size], i) => {
    const region = { name, x, y: 0, ...size, color: colors[i] };
    x += size.width + 2;
    return region;
  });
  const skeleton = dragonSkeleton();
  // something the import cannot carry over, so that there is a note to show
  skeleton.armature[0].skin[0].slot[0].display.push({ name: 'sparks', type: 'armature' } as never);
  const atlas = { name: 'fixture', imagePath: 'hero_tex.png', SubTexture: regions.map(({ color: _, ...r }) => r) };
  const file = (name: string, mimeType: string, buffer: Buffer) => ({ name, mimeType, buffer });
  return [
    file('hero_ske.json', 'application/json', Buffer.from(JSON.stringify(skeleton))),
    file('hero_tex.json', 'application/json', Buffer.from(JSON.stringify(atlas))),
    file('hero_tex.png', 'image/png', png(x, 40, regions)),
  ];
}

for (const [lang, button, title, close, lost] of [
  ['en', 'Import from Spine or DragonBones', 'Import notes', 'Got it', /armatures shown inside a slot/],
  ['ru', 'Импорт из Spine или DragonBones', 'Заметки об импорте', 'Понятно', /арматуры внутри слота не поддерживаются \(слот «body»\)/],
] as const) {
  test(`a DragonBones export opens as a character, and what it lost is listed (${lang})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.addInitScript((l) => {
      localStorage.clear();
      localStorage.setItem('bone2d.lang', l);
    }, lang);
    await page.goto('/');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: new RegExp(button) }).click();
    await (await chooser).setFiles(exported());
    const notes = page.getByRole('dialog', { name: title });
    await expect(notes).toBeVisible();
    await expect(notes.locator('li')).toHaveText([lost]);
    await page.screenshot({ path: `test-results/dragonbones-notes-${lang}.png` });
    await notes.getByRole('button', { name: close }).click();
    await expect(notes).toHaveCount(0);
    const read = () =>
      page.evaluate(async (u) => {
        const { docStore } = (await import(u.doc)) as DocModule;
        const d = docStore.get();
        return {
          bones: d.skeleton.bones.length,
          slots: d.skeleton.slots.length,
          animations: d.skeleton.animations.map((a) => a.name),
          pictures: d.images.map((i) => `${i.name} ${i.width}x${i.height}`).sort(),
        };
      }, URLS);
    expect(await read()).toEqual({
      bones: 8,
      slots: 5,
      animations: ['go'],
      pictures: ['body 40x30', 'flag 20x12', 'glove 22x17', 'parts/body2 24x24', 'slant 10x8'],
    });
    await page.keyboard.press('f');
    await page.screenshot({ path: `test-results/dragonbones-setup-${lang}.png` });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    await page.keyboard.press('Space');
    await page.screenshot({ path: `test-results/dragonbones-playing-${lang}.png` });
    expect(errors).toEqual([]);
  });
}
