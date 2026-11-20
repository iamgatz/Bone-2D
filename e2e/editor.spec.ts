import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type DocModule = typeof import('../src/store/doc');
type UiModule = typeof import('../src/store/ui');
// the dev server serves the sources, so the page can import the stores themselves
const DOC = '/src/store/doc.ts';
const UI = '/src/store/ui.ts';

/** Opens the editor on the demo fox, with the welcome window closed. */
async function openDemo(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.locator('.overlay .choice.primary').click();
  await expect(page.locator('.row .label').first()).toBeVisible();
}

test('the demo rig loads and the hierarchy lists its bones', async ({ page }) => {
  await openDemo(page);
  await expect.poll(() => page.locator('.row .label').count()).toBeGreaterThan(5);
});

test('Ctrl+Z undoes an edit on a Russian keyboard layout too', async ({ page }) => {
  await openDemo(page);
  const fps = () => page.evaluate(async (url) => ((await import(url)) as DocModule).docStore.get().skeleton.fps, DOC);
  const before = await fps();
  await page.evaluate(async (url) => {
    const { docStore } = (await import(url)) as DocModule;
    docStore.update('Test edit', (d) => {
      d.skeleton.fps = 12;
    });
  }, DOC);
  expect(await fps()).toBe(12);
  // the key that is Z on a Latin layout types "я" on a Russian one
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'я', code: 'KeyZ', ctrlKey: true, bubbles: true })));
  await expect.poll(fps).toBe(before);
});

test('the icon of every icon button sits in the middle of the button', async ({ page }) => {
  await openDemo(page);
  const off = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.icon-btn')]
      .map((b) => {
        const svg = b.querySelector('svg');
        if (!svg || !b.offsetWidth) return 0;
        const a = b.getBoundingClientRect();
        const c = svg.getBoundingClientRect();
        return Math.max(Math.abs(a.left + a.width / 2 - (c.left + c.width / 2)), Math.abs(a.top + a.height / 2 - (c.top + c.height / 2)));
      })
      .reduce((m, v) => Math.max(m, v), 0),
  );
  expect(off).toBeLessThan(0.75);
});

for (const width of [1100, 1440, 1920]) {
  test(`nothing spills sideways at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openDemo(page);
    const spill = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(spill).toBeLessThanOrEqual(0);
  });
}

test('the Export window groups its settings', async ({ page }) => {
  await openDemo(page);
  await page.evaluate(async (url) => {
    const { uiStore } = (await import(url)) as UiModule;
    uiStore.patch({ exportOpen: true });
  }, UI);
  const labels = page.locator('.dialog .section-label');
  await expect(labels.filter({ hasText: 'Skeleton data' })).toBeVisible();
  await expect(labels.getByText('Atlas', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toBeVisible();
});

test('a link with ?demo=wave opens the fox playing the wave, without the welcome window', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?demo=wave');
  await expect(page.locator('.overlay .choice.primary')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        async (urls) => {
          const { uiStore } = (await import(urls[0])) as UiModule;
          const { docStore } = (await import(urls[1])) as DocModule;
          const ui = uiStore.get();
          const anim = docStore.get().skeleton.animations.find((a) => a.id === ui.animationId);
          return `${ui.mode}:${anim?.name}:${ui.playing}`;
        },
        [UI, DOC],
      ),
    )
    .toBe('animate:wave:true');
});
