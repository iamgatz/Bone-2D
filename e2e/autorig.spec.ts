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
  await expect(dialog.getByRole('switch', { name: 'Face bones' })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'mystery: part' }).selectOption('face');
  // a piece of the face gets a bone of its own, unless that is switched off
  await expect(preview.locator('[data-bone="mystery"]')).toHaveCount(1);
  const faceBones = dialog.getByRole('switch', { name: 'Face bones' });
  await faceBones.click();
  await expect(preview.locator('[data-bone]')).toHaveCount(11);
  await faceBones.click();
  await expect(preview.locator('[data-bone]')).toHaveCount(12);
  await page.screenshot({ path: 'test-results/autorig-dialog.png' });
  await dialog.getByRole('button', { name: 'Build rig' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await rig(page)).bones.length).toBe(15);
  expect(await rig(page)).toMatchObject({
    meshes: ['arm right', 'leg right', 'torso', 'leg left', 'arm left'],
    mystery: 'mystery',
    ik: 2,
  });
  await page.screenshot({ path: 'test-results/autorig-built.png' });
  // the chest bends the body: what the screen shows with the torso bone turned
  await page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    docStore.update('turn', (d) => void (d.skeleton.bones.find((b) => b.name === 'torso')!.rotation += 25));
  }, URLS);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/autorig-bent.png' });
  await page.keyboard.press('Control+z');
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
  await dialog.getByRole('combobox', { name: 'mystery: часть' }).selectOption('face');
  await expect(dialog.getByRole('switch', { name: 'Кости лица' })).toBeChecked();
  await page.screenshot({ path: 'test-results/autorig-ru.png' });
});

/** A head with a closed mouth, an open one switched off, and a sketch switched off. */
function faces(openColor: [number, number, number]) {
  const layers: [name: string, x: number, y: number, w: number, h: number, color: [number, number, number], hidden: boolean][] = [
    ['head', 100, 40, 100, 100, [235, 190, 150], false],
    ['mouth open', 132, 96, 36, 28, openColor, true],
    ['mouth closed', 130, 104, 40, 8, [60, 20, 20], false],
    ['rough sketch', 100, 40, 100, 100, [0, 0, 0], true],
  ];
  const files = layers.map(([, , , w, h, color], i) => ({
    name: `data/${i}.png`,
    data: png(w, h, [[w / 2, h / 2]], Math.max(w, h) / 2, color),
  }));
  const stack = layers
    .map(
      ([name, x, y, , , , hidden], i) =>
        `<layer name="${name}" src="data/${i}.png" x="${x}" y="${y}"${hidden ? ' visibility="hidden"' : ''}/>`,
    )
    .reverse();
  const xml = `<?xml version="1.0"?><image w="300" h="200"><stack>${stack.join('')}</stack></image>`;
  return {
    name: 'faces.ora',
    mimeType: 'image/openraster',
    buffer: Buffer.from(createZip([{ name: 'stack.xml', data: new TextEncoder().encode(xml) }, ...files])),
  };
}

const slots = (page: Page) =>
  page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const d = docStore.get();
    return {
      slots: d.skeleton.slots.map((s) => [s.name, s.attachment, ...Object.keys(d.skeleton.skins[0].attachments[s.id])]),
      pictures: d.images.map((i) => [i.name, i.rev ?? 0]),
    };
  }, URLS);

test('a hidden state of a layer comes in as another picture of its slot, to switch to, and follows an update of the file', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openEmpty(page, 'en');
  await page.locator('input[accept="image/*,.psd,.ora"]').setInputFiles(faces([120, 30, 40]));
  await expect(page.getByText('Imported layers: 2 from faces.ora, hidden alternates: 1 (1 hidden skipped)')).toBeVisible();
  expect(await slots(page)).toEqual({
    slots: [
      ['head', 'head', 'head'],
      ['mouth closed', 'mouth closed', 'mouth closed', 'mouth open'],
    ],
    pictures: [
      ['head', 0],
      ['mouth closed', 0],
      ['mouth open', 0],
    ],
  });
  await page.getByText('mouth closed', { exact: true }).first().click();
  await page.keyboard.press('f');
  await page.screenshot({ path: 'test-results/alternates-closed.png' });
  const picture = page.locator('select', { has: page.locator('option', { hasText: 'mouth open' }) });
  await picture.selectOption('mouth open');
  await expect.poll(async () => (await slots(page)).slots[1][1]).toBe('mouth open');
  await page.screenshot({ path: 'test-results/alternates-open.png' });
  // the repainted file: the hidden picture is brought up to date too, and nothing is added
  await page.locator('input[accept=".psd,.ora"]').setInputFiles(faces([20, 90, 160]));
  await expect.poll(async () => (await slots(page)).pictures.find(([n]) => n === 'mouth open')![1]).toBe(1);
  expect((await slots(page)).slots).toHaveLength(2);
  await page.screenshot({ path: 'test-results/alternates-updated.png' });
  expect(errors).toEqual([]);
});
