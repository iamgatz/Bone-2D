/** A layered character comes in and gets its skeleton: the dialog offers itself, a wrong guess is corrected, one Undo takes it back. */
import { deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createZip, crc32 } from '../src/core/export/zip';

type DocModule = typeof import('../src/store/doc');
const URLS = { doc: '/src/store/doc.ts' };

type P = [number, number];

/** A PNG of thick lines in one colour, on a clear ground. */
function png(w: number, h: number, line: P[], radius: number, color: [number, number, number]): Uint8Array {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const solid = line.some((a, i) => {
        const b = line[Math.min(i + 1, line.length - 1)];
        const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) <= radius;
      });
      if (solid) raw.set([...color, 255], y * (w * 4 + 1) + 1 + x * 4);
    }
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

/** A figure facing us on a 300 × 420 canvas: the lines are in canvas pixels, y down. Back to front. */
function figure() {
  const layers: [string, P[], number, [number, number, number]][] = [
    [
      'arm right',
      [
        [190, 130],
        [245, 190],
        [245, 265],
      ],
      15,
      [200, 90, 40],
    ],
    [
      'leg right',
      [
        [175, 250],
        [180, 395],
      ],
      17,
      [60, 80, 150],
    ],
    [
      'torso',
      [
        [150, 145],
        [150, 215],
      ],
      45,
      [70, 140, 90],
    ],
    [
      'leg left',
      [
        [125, 250],
        [116, 325],
        [120, 395],
      ],
      17,
      [70, 95, 170],
    ],
    [
      'arm left',
      [
        [110, 130],
        [55, 190],
        [55, 265],
      ],
      15,
      [230, 120, 40],
    ],
    [
      'head',
      [
        [150, 70],
        [150, 70],
      ],
      45,
      [235, 190, 150],
    ],
    [
      'mystery',
      [
        [165, 62],
        [165, 62],
      ],
      7,
      [30, 30, 40],
    ],
  ];
  const files: { name: string; data: Uint8Array }[] = [];
  const stack: string[] = [];
  layers.forEach(([name, line, radius, color], i) => {
    const left = Math.min(...line.map((p) => p[0])) - radius - 2;
    const top = Math.min(...line.map((p) => p[1])) - radius - 2;
    const width = Math.max(...line.map((p) => p[0])) + radius + 2 - left;
    const height = Math.max(...line.map((p) => p[1])) + radius + 2 - top;
    const own = line.map(([x, y]): P => [x - left, y - top]);
    files.push({ name: `data/${i}.png`, data: png(width, height, own, radius, color) });
    // the file lists the top layer first
    stack.unshift(`<layer name="${name}" src="data/${i}.png" x="${left}" y="${top}"/>`);
  });
  const xml = `<?xml version="1.0"?><image w="300" h="420"><stack>${stack.join('')}</stack></image>`;
  return {
    name: 'figure.ora',
    mimeType: 'image/openraster',
    buffer: Buffer.from(createZip([{ name: 'stack.xml', data: new TextEncoder().encode(xml) }, ...files])),
  };
}

async function openEmpty(page: Page, lang: string) {
  await page.addInitScript((l) => {
    localStorage.clear();
    localStorage.setItem('bone2d.lang', l);
  }, lang);
  await page.goto('/');
  await page.locator('.overlay .dialog .dialog-head button').click();
  await expect(page.locator('.overlay')).toHaveCount(0);
}

const rig = (page: Page) =>
  page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const d = docStore.get().skeleton;
    const bone = (id: string) => d.bones.find((b) => b.id === id)?.name;
    return {
      bones: d.bones.map((b) => b.name),
      meshes: d.slots.filter((s) => d.skins[0].attachments[s.id]?.[s.attachment!]?.type === 'mesh').map((s) => s.name),
      mystery: bone(d.slots.find((s) => s.name === 'mystery')!.bone),
      ik: d.constraints.length,
    };
  }, URLS);

test('a layered character gets its skeleton from the dialog, and one Undo takes it back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openEmpty(page, 'en');
  await page.locator('input[accept="image/*,.psd,.ora"]').setInputFiles(figure());
  const dialog = page.getByRole('dialog', { name: 'Auto-rig' });
  await expect(dialog).toBeVisible();
  const preview = dialog.locator('.rig-preview');
  // hips, torso, head, two arms and two legs of two bones each
  await expect(preview.locator('[data-bone]')).toHaveCount(11);
  await expect(dialog.getByRole('combobox', { name: 'leg left: part' })).toHaveValue('leg');
  await expect(dialog.getByRole('combobox', { name: 'leg left: side' })).toHaveValue('l');
  // the layer with a name that says nothing is corrected by hand
  await expect(dialog.getByRole('combobox', { name: 'mystery: part' })).toHaveValue('near');
  await dialog.getByRole('combobox', { name: 'mystery: part' }).selectOption('face');
  await page.screenshot({ path: 'test-results/autorig-dialog.png' });
  await dialog.getByRole('button', { name: 'Build rig' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await rig(page)).bones.length).toBe(14);
  expect(await rig(page)).toMatchObject({ meshes: ['arm right', 'leg right', 'leg left', 'arm left'], mystery: 'head', ik: 2 });
  await page.screenshot({ path: 'test-results/autorig-built.png' });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => await rig(page)).toMatchObject({ bones: ['root'], meshes: [], ik: 0 });
  expect(errors).toEqual([]);
});

test('the dialog is opened again from the command palette, in Russian', async ({ page }) => {
  await openEmpty(page, 'ru');
  await page.locator('input[accept="image/*,.psd,.ora"]').setInputFiles(figure());
  const dialog = page.getByRole('dialog', { name: 'Авториг' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect((await rig(page)).bones).toEqual(['root']);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('авториг');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'torso: часть' })).toHaveValue('torso');
  await page.screenshot({ path: 'test-results/autorig-ru.png' });
});
