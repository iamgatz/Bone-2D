/**
 * The side panels in a real browser: whatever is opened and however far it is dragged, the editor stays inside the window, and the
 * panels can be sized, folded and moved with the mouse.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type UiModule = typeof import('../src/store/ui');
const UI = '/src/store/ui.ts';
const DOCK = '/src/store/dock.ts';
const ACTIONS = '/src/store/dockActions.ts';

async function openDemo(page: Page, width: number, height: number, lang = 'en') {
  await page.setViewportSize({ width, height });
  // a fresh start on the first visit only, so that a reload shows what was remembered
  await page.addInitScript((l) => {
    if (sessionStorage.getItem('started')) return;
    sessionStorage.setItem('started', '1');
    localStorage.clear();
    localStorage.setItem('bone2d.lang', l);
  }, lang);
  await page.goto('/');
  await page.locator('.overlay .choice.primary').click();
  await expect.poll(() => page.locator('.row .label').count()).toBeGreaterThan(5);
}

/** Opens every window and asks for sizes no screen has room for. */
const openEverything = (page: Page) =>
  page.evaluate(async (url) => {
    const { uiStore } = (await import(url)) as UiModule;
    const views = { ...uiStore.get().views };
    for (const id of Object.keys(views) as (keyof typeof views)[]) views[id] = true;
    uiStore.patch({ views, panel: { left: 1100, right: 1100, bottom: 1100, labels: 1100 } });
  }, UI);

const height = (page: Page, panel: string) => page.locator(`.dock-slot[data-panel="${panel}"]`).evaluate((el) => el.clientHeight);

for (const lang of ['en', 'ru']) {
  for (const [width, tall] of [
    [1100, 560],
    [1366, 657],
    [1920, 960],
  ]) {
    test(`with every window open nothing leaves the window (${lang}, ${width}x${tall})`, async ({ page }) => {
      await openDemo(page, width, tall, lang);
      await openEverything(page);
      await expect(page.locator('.dock-slot')).toHaveCount(12);
      const found = await page.evaluate(async (url) => {
        await new Promise((r) => setTimeout(r, 300));
        const { PANEL_MIN } = (await import(url)) as typeof import('../src/store/dock');
        const de = document.documentElement;
        const out: string[] = [];
        if (de.scrollHeight > innerHeight) out.push(`the page is ${de.scrollHeight - innerHeight}px too tall`);
        if (de.scrollWidth > innerWidth) out.push(`the page is ${de.scrollWidth - innerWidth}px too wide`);
        for (const column of document.querySelectorAll<HTMLElement>('.main > .left, .main > .right')) {
          for (const slot of column.querySelectorAll<HTMLElement>('.dock-slot')) {
            const id = slot.dataset.panel as keyof typeof PANEL_MIN;
            if (slot.getBoundingClientRect().height < PANEL_MIN[id] - 1) out.push(`${id} is squeezed`);
            // every title bar can be scrolled to
            slot.scrollIntoView({ block: 'nearest' });
            const head = slot.querySelector('.panel-head')!.getBoundingClientRect();
            const frame = column.getBoundingClientRect();
            if (head.top < frame.top - 1 || head.bottom > frame.bottom + 1) out.push(`${id} cannot be reached`);
          }
        }
        const bar = document.querySelector('.tl-bar')!.getBoundingClientRect();
        for (const b of document.querySelectorAll<HTMLElement>('.tl-bar button')) {
          const r = b.getBoundingClientRect();
          if (r.width && (r.right > bar.right + 1 || r.bottom > bar.bottom + 1)) out.push(`timeline button ${b.title} is cut off`);
        }
        const viewport = document.querySelector('.viewport-wrap')!.getBoundingClientRect();
        if (viewport.height < 119 || viewport.width < 419) out.push(`the viewport is ${viewport.width}x${viewport.height}`);
        return out;
      }, DOCK);
      expect(found).toEqual([]);
    });
  }
}

test('a menu in the title bar of the lowest panel is not cut off by its column', async ({ page }) => {
  await openDemo(page, 1100, 560);
  await openEverything(page);
  const slot = page.locator('.dock-slot[data-panel="images"]');
  await slot.scrollIntoViewIfNeeded();
  await slot.locator('.panel-head .menu > button').click();
  const seen = await page.locator('.menu-pop').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const corners = [
      [r.left + 6, r.top + 6],
      [r.right - 6, r.bottom - 6],
    ];
    return corners.every(([x, y]) => el.contains(document.elementFromPoint(x, y))) && r.bottom <= innerHeight && r.left >= 0;
  });
  expect(seen).toBe(true);
});

test('panels are sized, folded and moved with the mouse, and it is remembered', async ({ page }) => {
  await openDemo(page, 1366, 760);
  const usual = await height(page, 'tree');

  // the lower edge of the Hierarchy goes up: the pictures get the room
  const edge = (await page.locator('.dock-edge[data-edge="tree"]').boundingBox())!;
  await page.mouse.move(edge.x + 40, edge.y + 3);
  await page.mouse.down();
  await page.mouse.move(edge.x + 40, edge.y - 97, { steps: 5 });
  await page.mouse.up();
  expect(await height(page, 'tree')).toBeLessThan(usual - 80);
  expect(await height(page, 'images')).toBeGreaterThan(340);

  const images = page.locator('.dock-slot[data-panel="images"]');
  await images.locator('.panel-fold').click();
  expect(await height(page, 'images')).toBeLessThan(45);
  expect(await height(page, 'tree')).toBeGreaterThan(usual); // the room goes to the panel that is open
  await images.locator('.panel-fold').click();

  // the name of the Images panel is dragged into the right column, under the Inspector
  const name = (await images.locator('.panel-head .title').boundingBox())!;
  const right = (await page.locator('.main > .right').boundingBox())!;
  await page.mouse.move(name.x + 10, name.y + name.height / 2);
  await page.mouse.down();
  await page.mouse.move(right.x + 60, right.y + right.height - 20, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.main > .right .dock-slot')).toHaveCount(2);

  await page.reload();
  await expect(page.locator('.main > .right .dock-slot[data-panel="images"]')).toBeVisible();

  // the Inspector leaves for the left column too: the empty right column is gone, and comes back as a place to drop on
  await page.evaluate(async (url) => {
    const { resetDock } = (await import(url)) as typeof import('../src/store/dockActions');
    resetDock();
  }, ACTIONS);
  await expect(page.locator('.main > .right .dock-slot')).toHaveCount(1);
  const inspector = (await page.locator('.dock-slot[data-panel="inspector"] .panel-head .title').boundingBox())!;
  const left = (await page.locator('.main > .left').boundingBox())!;
  await page.mouse.move(inspector.x + 10, inspector.y + inspector.height / 2);
  await page.mouse.down();
  await page.mouse.move(left.x + 60, left.y + 8, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.main > .right')).toHaveCount(0);
  await expect(page.locator('.main > .left .dock-slot').first()).toHaveAttribute('data-panel', 'inspector');

  const back = (await page.locator('.dock-slot[data-panel="inspector"] .panel-head .title').boundingBox())!;
  await page.mouse.move(back.x + 10, back.y + back.height / 2);
  await page.mouse.down();
  await page.mouse.move(back.x + 400, back.y + 100, { steps: 4 });
  const place = (await page.locator('.main > .right.dock-nothing').boundingBox())!;
  await page.mouse.move(place.x + place.width / 2, place.y + place.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.main > .right .dock-slot[data-panel="inspector"]')).toBeVisible();
});

test('the column of names in the timeline can be made wider', async ({ page }) => {
  await openDemo(page, 1366, 760);
  const labels = page.locator('.tl-labels');
  const before = await labels.evaluate((el) => el.clientWidth);
  const split = (await page.locator('.tl-split').boundingBox())!;
  await page.mouse.move(split.x + 3, split.y + 60);
  await page.mouse.down();
  await page.mouse.move(split.x + 103, split.y + 60, { steps: 5 });
  await page.mouse.up();
  expect(await labels.evaluate((el) => el.clientWidth)).toBeGreaterThan(before + 80);
  await page.locator('.tl-split').dblclick();
  expect(await labels.evaluate((el) => el.clientWidth)).toBe(before);
});
