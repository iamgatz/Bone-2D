/** Bringing artwork in and rigging it, with real files and clicks: an OpenRaster file, a mesh of a picture in pieces, a bone without length. */
import { deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createZip, crc32 } from '../src/core/export/zip';

type DocModule = typeof import('../src/store/doc');
const URLS = { doc: '/src/store/doc.ts' };

/** A real PNG: `solid` says which pixels are painted (orange), the rest are clear. */
function png(w: number, h: number, solid: (x: number, y: number) => boolean = () => true): Uint8Array {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) raw.set([230, 120, 40, 255], y * (w * 4 + 1) + 1 + x * 4);
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

async function openEmpty(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  // the welcome window comes a moment after the page: it is waited for, then closed
  await page.locator('.overlay .dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.overlay')).toHaveCount(0);
}

const doc = (page: Page) =>
  page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const d = docStore.get().skeleton;
    return {
      bones: d.bones.map((b) => ({ name: b.name, length: b.length, x: b.x, y: b.y, parent: d.bones.find((p) => p.id === b.parent)?.name })),
      slots: d.slots.map((s) => ({ name: s.name, alpha: s.color[3], blend: s.blend, attachment: s.attachment })),
      images: docStore.get().images.map((i) => ({ name: i.name, width: i.width, height: i.height })),
    };
  }, URLS);

test('an OpenRaster file becomes pictures and slots, and a repainted one updates them', async ({ page }) => {
  await openEmpty(page);
  const file = (bodyWidth: number) => {
    const stack = `<?xml version="1.0"?><image w="200" h="200"><stack>
      <stack name="face"><layer name="eye" src="data/eye.png" x="90" y="30" opacity="0.5" composite-op="svg:multiply"/></stack>
      <layer name="body" src="data/body.png" x="60" y="50"/>
    </stack></image>`;
    return {
      name: 'hero.ora',
      mimeType: 'image/openraster',
      buffer: Buffer.from(
        createZip([
          { name: 'stack.xml', data: new TextEncoder().encode(stack) },
          { name: 'data/eye.png', data: png(20, 10) },
          { name: 'data/body.png', data: png(bodyWidth, 100) },
        ]),
      ),
    };
  };
  await page.locator('input[accept="image/*,.psd,.ora"]').setInputFiles(file(80));
  await expect.poll(async () => (await doc(page)).slots.length).toBe(2);
  const first = await doc(page);
  // back to front: the body is drawn first
  expect(first.slots.map((s) => [s.name, s.alpha, s.blend])).toEqual([
    ['body', 1, 'normal'],
    ['eye', 0.5, 'multiply'],
  ]);
  expect(first.images).toEqual([
    { name: 'body', width: 80, height: 100 },
    { name: 'face/eye', width: 20, height: 10 },
  ]);
  await page.locator('input[accept=".psd,.ora"]').setInputFiles(file(90));
  await expect.poll(async () => (await doc(page)).images[0].width).toBe(90);
  expect((await doc(page)).slots.length).toBe(2);
});

test('Trace mesh on a picture in two pieces keeps both of them', async ({ page }) => {
  await openEmpty(page);
  const two = (x: number, y: number) => Math.hypot(x - 30, y - 40) < 22 || Math.hypot(x - 130, y - 40) < 22;
  await page
    .locator('input[accept="image/*,.psd,.ora"]')
    .setInputFiles({ name: 'eyes.png', mimeType: 'image/png', buffer: Buffer.from(png(160, 80, two)) });
  await expect.poll(async () => (await doc(page)).images.length).toBe(1);
  await page.locator('.asset').first().dblclick();
  await expect.poll(async () => (await doc(page)).slots.length).toBe(1);
  await page.locator('aside.right').getByRole('button', { name: 'Trace mesh' }).click();
  const reach = () =>
    page.evaluate(async (u) => {
      const { docStore } = (await import(u.doc)) as DocModule;
      const d = docStore.get().skeleton;
      const a = Object.values(Object.values(d.skins[0].attachments)[0])[0];
      if (a.type !== 'mesh') return null;
      const us = a.uvs.filter((_, i) => i % 2 === 0).slice(0, a.hull);
      return [Math.min(...us) * 160, Math.max(...us) * 160];
    }, URLS);
  await expect.poll(reach).not.toBeNull();
  const [left, right] = (await reach())!;
  expect(left).toBeLessThan(10);
  expect(right).toBeGreaterThan(150);
});

test('with the bone tool a Ctrl-click makes a bone without length, a plain click makes nothing', async ({ page }) => {
  await openEmpty(page);
  await page.keyboard.press('b');
  const box = (await page.locator('.viewport-wrap canvas').first().boundingBox())!;
  // a free corner of the viewport: its middle carries the "Start rigging" card of an empty project
  const x = box.x + box.width * 0.75;
  const y = box.y + box.height * 0.8;
  await page.mouse.click(x, y);
  expect((await doc(page)).bones.length).toBe(1);
  await page.keyboard.down('Control');
  await page.mouse.click(x, y);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await doc(page)).bones.length).toBe(2);
  const bone = (await doc(page)).bones[1];
  expect(bone.length).toBe(0);
  // the next bone drawn from it is its child
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await doc(page)).bones.length).toBe(3);
  expect((await doc(page)).bones[2].parent).toBe(bone.name);
});
