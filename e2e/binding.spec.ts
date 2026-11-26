/** Picking bones and a picture together (that is how a mesh is bound), with real clicks, and what the Delete key removes then. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type DocModule = typeof import('../src/store/doc');
type UiModule = typeof import('../src/store/ui');
type SceneModule = typeof import('../src/store/scene');
type HitModule = typeof import('../src/editor/viewport/hit');
// the dev server serves the sources, so the page can import the stores themselves
const URLS = {
  doc: '/src/store/doc.ts',
  ui: '/src/store/ui.ts',
  scene: '/src/store/scene.ts',
  hit: '/src/editor/viewport/hit.ts',
};

async function openDemo(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.locator('.overlay .choice.primary').click();
  await expect.poll(() => page.locator('.row .label').count()).toBeGreaterThan(5);
}

/** The first row of the hierarchy with exactly this name (a slot row comes before the rows of its attachments). */
const row = (page: Page, name: string) =>
  page
    .locator('[data-learn="tree"] .row')
    .filter({ has: page.locator('.label', { hasText: new RegExp(`^${name}$`) }) })
    .first();

/** What is selected, by names, and the size of the skeleton. */
const state = (page: Page) =>
  page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const { uiStore } = (await import(u.ui)) as UiModule;
    const d = docStore.get().skeleton;
    const sel = uiStore.get().selection;
    const bone = (id: string) => d.bones.find((b) => b.id === id)?.name;
    const arm = d.slots.find((s) => s.name === 'arm far');
    const att = arm ? d.skins[0].attachments[arm.id]?.['arm far'] : undefined;
    return {
      slot: d.slots.find((s) => s.id === sel.slot)?.name ?? null,
      bones: sel.bones.map(bone),
      boneCount: d.bones.length,
      slotCount: d.slots.length,
      armBones: att && att.type === 'mesh' ? [...new Set((att.weights ?? []).flat().map((i) => bone(i[0])))].sort() : [],
    };
  }, URLS);

test('a mesh gets one more bone: Shift-click in the hierarchy keeps the picture selected, and Add bones uses both', async ({ page }) => {
  await openDemo(page);
  await row(page, 'arm far').click();
  await row(page, 'hip').click({ modifiers: ['Shift'] });
  await expect.poll(() => state(page)).toMatchObject({ slot: 'arm far', bones: ['arm far 1', 'hip'] });
  // the bone that was added is highlighted next to the picture
  await expect(row(page, 'hip')).toHaveClass(/selected/);
  expect((await state(page)).armBones).not.toContain('hip');
  await page.getByRole('button', { name: 'Add bones' }).click();
  await expect.poll(async () => (await state(page)).armBones).toContain('hip');
});

test('bones first, then Shift-click on the picture: the bones stay picked', async ({ page }) => {
  await openDemo(page);
  await row(page, 'hip').click();
  await row(page, 'torso').click({ modifiers: ['Control'] });
  await row(page, 'arm far').click({ modifiers: ['Shift'] });
  await expect.poll(() => state(page)).toMatchObject({ slot: 'arm far', bones: ['hip', 'torso'] });
});

for (const tool of ['select', 'mesh'] as const)
  test(`Shift-click on a bone in the viewport adds it to the selected picture (${tool} tool)`, async ({ page }) => {
    await openDemo(page);
    await row(page, 'arm far').click();
    if (tool === 'mesh') await page.keyboard.press('m');
    // a bone that can be hit in the middle, not covered by another bone or by a window over the viewport
    const target = await page.evaluate(async (u) => {
      const { uiStore } = (await import(u.ui)) as UiModule;
      const { getScene, worldToScreen } = (await import(u.scene)) as SceneModule;
      const { hitBone, slotWorldVertices } = (await import(u.hit)) as HitModule;
      const canvas = document.querySelector('.viewport-wrap canvas')!;
      const box = canvas.getBoundingClientRect();
      const cam = uiStore.get().camera;
      const scene = getScene();
      const mesh = slotWorldVertices(scene.skeleton, uiStore.get().selection.slot!)!;
      const onPoint = (x: number, y: number) => {
        for (let i = 0; i < mesh.count; i++)
          if (Math.hypot(mesh.vertices[i * 2] - x, mesh.vertices[i * 2 + 1] - y) * cam.zoom < 16) return true;
        return false;
      };
      for (const b of scene.skeleton.bones) {
        if (b.data.name === 'arm far 1' || b.data.length < 10) continue;
        const wx = b.worldX + (b.a * b.data.length) / 2;
        const wy = b.worldY + (b.c * b.data.length) / 2;
        if (onPoint(wx, wy) || hitBone(scene, new Set(), wx, wy, cam.zoom, 6)?.id !== b.data.id) continue;
        const [sx, sy] = worldToScreen(cam, box.width, box.height, wx, wy);
        const x = box.left + sx;
        const y = box.top + sy;
        const top = document.elementFromPoint(x, y);
        if (top && top.closest('.viewport-wrap') && top.tagName === 'CANVAS') return { name: b.data.name, x, y };
      }
      return null;
    }, URLS);
    expect(target).not.toBeNull();
    await page.keyboard.down('Shift');
    await page.mouse.click(target!.x, target!.y);
    await page.keyboard.up('Shift');
    await expect.poll(() => state(page)).toMatchObject({ slot: 'arm far', bones: ['arm far 1', target!.name] });
  });

test('with points of a mesh picked, Delete never goes on to remove the picture or a bone', async ({ page }) => {
  await openDemo(page);
  const before = await state(page);
  await row(page, 'arm far').click();
  await page.keyboard.press('w');
  await page.evaluate(async (u) => {
    const { uiStore } = (await import(u.ui)) as UiModule;
    uiStore.patch({ selection: { ...uiStore.get().selection, vertices: [0] } });
  }, URLS);
  await page.keyboard.press('Delete');
  expect(await state(page)).toMatchObject({ slot: 'arm far', slotCount: before.slotCount, boneCount: before.boneCount });
});

test('a plain click on a bone still selects only the bone', async ({ page }) => {
  await openDemo(page);
  await row(page, 'arm far').click();
  await row(page, 'hip').click();
  await expect.poll(() => state(page)).toMatchObject({ slot: null, bones: ['hip'] });
});

test('Delete with a picture selected removes the picture and leaves its bone, however often it is pressed', async ({ page }) => {
  await openDemo(page);
  const before = await state(page);
  await row(page, 'arm far').click();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await state(page)).slotCount).toBe(before.slotCount - 1);
  expect((await state(page)).boneCount).toBe(before.boneCount);
  await page.keyboard.press('Delete');
  expect((await state(page)).boneCount).toBe(before.boneCount);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state(page)).slotCount).toBe(before.slotCount);
});

test('the trash button of the hierarchy removes the selected picture, not its bone', async ({ page }) => {
  await openDemo(page);
  const before = await state(page);
  await row(page, 'arm far').click();
  await page.locator('[data-learn="tree"] .panel-head button').last().click();
  await expect.poll(async () => (await state(page)).slotCount).toBe(before.slotCount - 1);
  expect((await state(page)).boneCount).toBe(before.boneCount);
});

test('Delete with bones selected still removes the bones', async ({ page }) => {
  await openDemo(page);
  const before = await state(page);
  await row(page, 'tail 3').click();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await state(page)).boneCount).toBeLessThan(before.boneCount);
});

test('the whole path of the mesh lesson: make a mesh, Shift-click one more bone, bind to both', async ({ page }) => {
  await openDemo(page);
  const slot = await page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const d = docStore.get().skeleton;
    // a picture that is still a plain rectangle, alone in its slot
    const s = d.slots.find((x) => x.attachment && d.skins[0].attachments[x.id]?.[x.attachment]?.type === 'region' && x.name !== 'head')!;
    return { name: s.name, bone: d.bones.find((b) => b.id === s.bone)!.name };
  }, URLS);
  expect(slot.bone).not.toBe('hip');
  // the slot row, not a bone of the same name: only a slot row has a "Delete slot" button
  await page
    .locator('[data-learn="tree"] .row')
    .filter({ has: page.locator('.label', { hasText: new RegExp(`^${slot.name}$`) }) })
    .filter({ has: page.getByRole('button', { name: 'Delete slot' }) })
    .click();
  await expect.poll(async () => (await state(page)).slot).toBe(slot.name);
  await page.getByRole('button', { name: 'Quad', exact: true }).click();
  await row(page, 'hip').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Bind to 2 selected bones' }).click();
  const bound = await page.evaluate(
    async ({ u, name }) => {
      const { docStore } = (await import(u.doc)) as DocModule;
      const d = docStore.get().skeleton;
      const s = d.slots.find((x) => x.name === name)!;
      const a = d.skins[0].attachments[s.id][s.attachment!];
      return a.type === 'mesh' ? [...new Set((a.weights ?? []).flat().map((i) => d.bones.find((b) => b.id === i[0])!.name))].sort() : [];
    },
    { u: URLS, name: slot.name },
  );
  expect(bound).toEqual(['hip', slot.bone].sort());
});
