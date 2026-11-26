/** Painting weights on a posed mesh, with real drags and clicks on the demo fox. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type DocModule = typeof import('../src/store/doc');
type UiModule = typeof import('../src/store/ui');
type SceneModule = typeof import('../src/store/scene');
type ActionsModule = typeof import('../src/store/actions');
const URLS = { doc: '/src/store/doc.ts', ui: '/src/store/ui.ts', scene: '/src/store/scene.ts', actions: '/src/store/actions.ts' };

/** Where things of the viewport are on the screen: the middle of a bone, and a vertex of the tail mesh that no bone is near. */
const places = (page: Page) =>
  page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const { uiStore } = (await import(u.ui)) as UiModule;
    const { getViewScene, worldToScreen } = (await import(u.scene)) as SceneModule;
    const host = document.querySelector('.viewport') as HTMLElement;
    const box = host.getBoundingClientRect();
    const cam = uiStore.get().camera;
    const at = (x: number, y: number): [number, number] => {
      const p = worldToScreen(cam, host.clientWidth, host.clientHeight, x, y);
      return [p[0] + box.x, p[1] + box.y];
    };
    const doc = docStore.get().skeleton;
    const { skeleton } = getViewScene();
    const bone = (name: string) => {
      const b = skeleton.boneById(doc.bones.find((x) => x.name === name)!.id)!;
      return { id: b.data.id, from: at(b.worldX, b.worldY), to: at(b.tipX, b.tipY) };
    };
    const slot = doc.slots.find((s) => s.name === 'tail')!;
    const mesh = doc.skins[0].attachments[slot.id].tail;
    if (mesh.type !== 'mesh') throw new Error('the tail is a mesh');
    const seen = mesh.weights!.map((list) => {
      let x = 0;
      let y = 0;
      for (const [id, bx, by, w] of list) {
        const m = skeleton.boneById(id)!;
        x += (m.a * bx + m.b * by + m.worldX) * w;
        y += (m.c * bx + m.d * by + m.worldY) * w;
      }
      return at(x, y);
    });
    const names = ['tail 1', 'tail 2', 'tail 3'].map(bone);
    const clear = (p: [number, number]) =>
      Math.min(
        ...names.map(({ from, to }) => {
          const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
          const t = Math.max(0, Math.min(1, ((p[0] - from[0]) * dx + (p[1] - from[1]) * dy) / (dx * dx + dy * dy)));
          return Math.hypot(p[0] - from[0] - dx * t, p[1] - from[1] - dy * t);
        }),
      );
    const vertex = seen.map((p, i) => ({ i, p, d: clear(p) })).sort((a, b) => b.d - a.d)[0];
    const share = mesh.weights![vertex.i].find((e) => e[0] === names[1].id)?.[3] ?? 0;
    return { tail2: names[1], vertex, share };
  }, URLS);

const state = (page: Page) =>
  page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const { uiStore } = (await import(u.ui)) as UiModule;
    const { getViewScene } = (await import(u.scene)) as SceneModule;
    const ui = uiStore.get();
    const doc = docStore.get().skeleton;
    const tail2 = doc.bones.find((b) => b.name === 'tail 2')!;
    return {
      setup: tail2.rotation,
      seen: getViewScene().skeleton.boneById(tail2.id)!.rotation,
      posed: Object.keys(ui.testPose).length,
      brush: doc.bones.find((b) => b.id === ui.brush.bone)?.name,
      changed: docStore.canUndo,
      camera: [ui.camera.x, ui.camera.y],
    };
  }, URLS);

const middle = (b: { from: [number, number]; to: [number, number] }): [number, number] => [
  (b.from[0] + b.to[0]) / 2,
  (b.from[1] + b.to[1]) / 2,
];

const boneOnScreen = (page: Page, name: string) =>
  page.evaluate(
    async ([u, wanted]) => {
      const { docStore } = (await import(u.doc)) as DocModule;
      const { uiStore } = (await import(u.ui)) as UiModule;
      const { getViewScene, worldToScreen } = (await import(u.scene)) as SceneModule;
      const host = document.querySelector('.viewport') as HTMLElement;
      const box = host.getBoundingClientRect();
      const b = getViewScene().skeleton.boneById(docStore.get().skeleton.bones.find((x) => x.name === wanted)!.id)!;
      const at = (x: number, y: number): [number, number] => {
        const p = worldToScreen(uiStore.get().camera, host.clientWidth, host.clientHeight, x, y);
        return [p[0] + box.x, p[1] + box.y];
      };
      return { from: at(b.worldX, b.worldY), to: at(b.tipX, b.tipY) };
    },
    [URLS, name] as const,
  );

async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 8 });
  await page.mouse.up();
}

test('a bone dragged with the Weights tool poses the mesh, the brush paints on it as it is seen, and the setup pose stays', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()} ${m.location().url}`));
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?demo');
  await expect(page.locator('.viewport')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async (u) => {
        const { docStore } = (await import(u.doc)) as DocModule;
        return docStore.get().skeleton.slots.some((s) => s.name === 'tail');
      }, URLS),
    )
    .toBe(true);
  await page.waitForTimeout(300); // the camera frames the skeleton a moment after it is loaded
  await page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const { setSelection } = (await import(u.actions)) as ActionsModule;
    const slot = docStore.get().skeleton.slots.find((s) => s.name === 'tail')!;
    setSelection({ slot: slot.id, attachment: 'tail' });
  }, URLS);
  await page.keyboard.press('w');

  // a click on a bone picks it for the brush and poses nothing
  const first = await places(page);
  await page.mouse.click(...middle(first.tail2));
  await expect.poll(async () => (await state(page)).brush).toBe('tail 2');
  expect((await state(page)).posed).toBe(0);

  // a drag on it turns it, on the screen only
  const [x, y] = middle(first.tail2);
  await drag(page, [x, y], [x + 30, y - 50]);
  const posed = await state(page);
  expect(posed.posed).toBe(1);
  expect(Math.abs(posed.seen - posed.setup)).toBeGreaterThan(15);
  expect(posed.changed).toBe(false);

  // a stroke where a vertex is seen now changes its weight
  await page.locator('select[aria-label="Mode"]').selectOption('subtract');
  const there = await places(page);
  expect(there.share).toBeGreaterThan(0);
  await drag(page, there.vertex.p, [there.vertex.p[0] + 3, there.vertex.p[1] + 2]);
  await expect.poll(async () => (await state(page)).changed).toBe(true);
  expect((await places(page)).share).toBeLessThan(there.share);

  // Esc puts the bones back, and the selection stays
  await page.keyboard.press('Escape');
  const back = await state(page);
  expect(back.posed).toBe(0);
  expect(back.seen).toBe(back.setup);

  // Swing moves the brush bone by itself until the pose is reset
  await page.getByRole('button', { name: 'Swing', exact: true }).click();
  const seen = new Set<number>();
  await expect
    .poll(async () => {
      seen.add(Math.round((await state(page)).seen));
      return seen.size;
    })
    .toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Reset pose' }).click();
  expect((await state(page)).seen).toBe(back.setup);

  // Alt poses a bone that does not move the mesh, and the view stays
  const before = (await state(page)).camera;
  const head = middle(await boneOnScreen(page, 'head'));
  await page.keyboard.down('Alt');
  await drag(page, head, [head[0] + 40, head[1] + 10]);
  await page.keyboard.up('Alt');
  expect((await state(page)).posed).toBe(1);
  expect((await state(page)).camera).toEqual(before);

  // Alt on empty space still pans
  const view = (await page.locator('.viewport').boundingBox())!;
  await page.keyboard.down('Alt');
  await drag(page, [view.x + view.width * 0.85, view.y + view.height * 0.5], [view.x + view.width * 0.8, view.y + view.height * 0.5]);
  await page.keyboard.up('Alt');
  expect((await state(page)).camera).not.toEqual(before);
  expect(errors).toEqual([]);
});
