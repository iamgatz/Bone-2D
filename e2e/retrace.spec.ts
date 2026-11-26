/** Tracing a bound mesh of the demo fox again, through the fields of the Inspector. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type DocModule = typeof import('../src/store/doc');
type ActionsModule = typeof import('../src/store/actions');
const URLS = { doc: '/src/store/doc.ts', actions: '/src/store/actions.ts' };

const tail = (page: Page) =>
  page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const doc = docStore.get().skeleton;
    const slot = doc.slots.find((s) => s.name === 'tail');
    const mesh = slot && doc.skins[0].attachments[slot.id].tail;
    if (!mesh || mesh.type !== 'mesh') return null;
    return {
      vertices: mesh.uvs.length / 2,
      weighted: mesh.weights?.length ?? 0,
      bones: new Set(mesh.weights?.flat().map((e) => e[0])).size,
      unused: mesh.uvs.length / 2 - new Set(mesh.triangles).size,
    };
  }, URLS);

test('the number of vertices of a bound mesh is changed in its field, and it stays bound', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?demo');
  await expect.poll(() => tail(page)).not.toBeNull();
  await page.waitForTimeout(500); // the demo settles: its pictures are decoded and the camera frames it
  const before = (await tail(page))!;
  await page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const { setSelection } = (await import(u.actions)) as ActionsModule;
    const slot = docStore.get().skeleton.slots.find((s) => s.name === 'tail')!;
    setSelection({ slot: slot.id, attachment: 'tail' });
  }, URLS);
  const field = page.locator('aside.right .field', { has: page.getByText('#', { exact: true }) }).locator('input');
  await expect(field).toHaveValue(String(before.vertices));
  const wanted = before.vertices + 28;
  await field.fill(String(wanted));
  await field.press('Enter');
  // the demo has no deform keys on the tail, so the field acts at once
  await expect.poll(async () => (await tail(page))!.vertices).toBe(wanted);
  expect(await tail(page)).toEqual({ vertices: wanted, weighted: wanted, bones: before.bones, unused: 0 });
  await page.screenshot({ path: 'test-results/retrace.png' });
  // dragging the label scrubs the number, in one step of the history
  const label = page.locator('aside.right .flabel', { hasText: '#' });
  const box = (await label.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await tail(page))!.vertices).toBe(wanted + 20);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await tail(page))!.vertices).toBe(wanted);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await tail(page))!.vertices).toBe(before.vertices);
  // Escape gives up what was typed
  await field.fill('200');
  await field.press('Escape');
  await expect(field).toHaveValue(String(before.vertices));
  expect((await tail(page))!.vertices).toBe(before.vertices);
  expect(errors).toEqual([]);
});
