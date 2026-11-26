/** The sprite sheet from the Export window: the real ZIP is downloaded, and its frames match what the pictures of the frames show. */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import { readZip } from '../src/core/import/zipRead';

interface Data {
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number };
      spriteSourceSize: { x: number; y: number };
      sourceSize: { w: number; h: number };
      pivot: { x: number; y: number };
    }
  >;
  animations: Record<string, string[]>;
  meta: { image: string; size: { w: number; h: number } };
}

async function unzip(download: Download): Promise<Map<string, Buffer>> {
  const bytes = readFileSync(await download.path());
  const zip = readZip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const out = new Map<string, Buffer>();
  for (const [name, read] of zip) out.set(name, Buffer.from(await read()));
  return out;
}

/** Decodes two PNG files in the page and says how far a frame cut from the sheet is from the same frame exported on its own. */
const difference = (page: Page, sheet: Buffer, single: Buffer, entry: Data['frames'][string]) =>
  page.evaluate(
    async ([a, b, e]) => {
      const load = async (base64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${base64}`;
        await img.decode();
        return img;
      };
      const [packed, alone] = [await load(a), await load(b)];
      const at = e;
      const draw = (paint: (ctx: CanvasRenderingContext2D) => void) => {
        const c = document.createElement('canvas');
        c.width = at.sourceSize.w;
        c.height = at.sourceSize.h;
        const ctx = c.getContext('2d')!;
        paint(ctx);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const f = at.frame;
      const rebuilt = draw((ctx) => ctx.drawImage(packed, f.x, f.y, f.w, f.h, at.spriteSourceSize.x, at.spriteSourceSize.y, f.w, f.h));
      const whole = draw((ctx) => ctx.drawImage(alone, 0, 0));
      // colours are compared as the screen shows them (times their alpha): an almost clear pixel has no colour to speak of
      const seen = (d: Uint8ClampedArray, i: number) => (i % 4 === 3 ? d[i] : (d[i] * d[i | 3]) / 255);
      let most = 0;
      for (let i = 0; i < whole.length; i++) most = Math.max(most, Math.abs(seen(whole, i) - seen(rebuilt, i)));
      return { most, size: [alone.width, alone.height], painted: whole.filter((v, i) => i % 4 === 3 && v > 0).length };
    },
    [sheet.toString('base64'), single.toString('base64'), entry] as const,
  );

test('the demo fox becomes a sprite sheet with every animation, frame for frame', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('bone2d.lang', 'en');
  });
  await page.goto('/?demo');
  await expect
    .poll(() =>
      page.evaluate(async (url) => {
        const { docStore } = (await import(url)) as typeof import('../src/store/doc');
        return docStore.get().skeleton.animations.length;
      }, '/src/store/doc.ts'),
    )
    .toBeGreaterThan(1);
  await page.waitForTimeout(800);
  // the fox lesson that starts by itself is put away
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Animation' }).click();
  await dialog.getByRole('radio', { name: 'Sprite sheet' }).click();
  await dialog.locator('select[aria-label="Frame rate"]').selectOption('12');
  await dialog.locator('select[aria-label="Size"]').selectOption('0.5');
  await expect(dialog.locator('.export-preview canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/spritesheet.png' });
  const waiting = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Render' }).click();
  const files = await unzip(await waiting);
  const name = [...files.keys()].find((n) => n.endsWith('.json') && !n.endsWith('.animations.json'))!;
  const data = JSON.parse(files.get(name)!.toString()) as Data;
  const animations = Object.keys(data.animations);
  expect(animations.length).toBeGreaterThan(1);
  expect(Object.keys(data.frames).length).toBe(animations.reduce((s, a) => s + data.animations[a].length, 0));
  // one size and one origin for every frame of every animation
  expect(new Set(Object.values(data.frames).map((f) => JSON.stringify([f.sourceSize, f.pivot]))).size).toBe(1);
  expect(files.get(data.meta.image)).toBeDefined();

  // the same frames exported on their own, from one animation, show the same pictures
  await dialog.getByRole('switch', { name: 'Put every animation on the sheet' }).click();
  const one = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Render' }).click();
  const single = await unzip(await one);
  const singleName = [...single.keys()].find((n) => n.endsWith('.json'))!;
  const own = JSON.parse(single.get(singleName)!.toString()) as Data;
  await dialog.getByRole('radio', { name: 'PNG frames' }).click();
  const frames = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Render' }).click();
  const pngs = [...(await unzip(await frames)).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const names = Object.values(own.animations)[0];
  expect(pngs.length).toBe(names.length);
  for (const i of [0, Math.floor(names.length / 2), names.length - 1]) {
    const result = await difference(page, single.get(own.meta.image)!, pngs[i][1], own.frames[names[i]]);
    expect(result.size).toEqual([own.frames[names[i]].sourceSize.w, own.frames[names[i]].sourceSize.h]);
    expect(result.painted).toBeGreaterThan(1000);
    expect(result.most, names[i]).toBeLessThanOrEqual(2);
  }
  expect(errors).toEqual([]);
});
