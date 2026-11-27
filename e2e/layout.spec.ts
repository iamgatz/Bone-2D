/**
 * The long texts of the Russian interface in a real browser: nothing sticks out of its window, is cut, or breaks a menu into
 * columns of single words. The places are the ones where that happened.
 */
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

type UiModule = typeof import('../src/store/ui');
type LearnModule = typeof import('../src/store/learn');
type ActionsModule = typeof import('../src/store/actions');
type DocModule = typeof import('../src/store/doc');
const URLS = { ui: '/src/store/ui.ts', learn: '/src/store/learn.ts', actions: '/src/store/actions.ts', doc: '/src/store/doc.ts' };

async function openDemo(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('bone2d.lang', 'ru');
  });
  await page.goto('/');
  await page.locator('.overlay .choice.primary').click();
  await expect.poll(() => page.locator('.row .label').count()).toBeGreaterThan(5);
}

/** The elements among `parts` that reach outside `box`: sideways, and past its lower edge unless the box scrolls down. */
async function outside(box: Locator, parts: string, scrolls = false): Promise<string[]> {
  return box.evaluate(
    (el, { q, down }) => {
      const b = el.getBoundingClientRect();
      return [...el.querySelectorAll(q)]
        .filter((p) => {
          const r = p.getBoundingClientRect();
          return r.width > 0 && (r.left < b.left - 1 || r.right > b.right + 1 || (down && r.bottom > b.bottom + 1));
        })
        .map((p) => (p.textContent || p.getAttribute('aria-label') || p.className).trim());
    },
    { q: parts, down: !scrolls },
  );
}

/** Whether the chosen entry of a list fits into the closed list. */
const fits = (select: Locator) =>
  select.evaluate((el: HTMLSelectElement) => {
    const probe = el.cloneNode(false) as HTMLSelectElement;
    probe.append(el.selectedOptions[0].cloneNode(true));
    probe.style.cssText = 'position:absolute;width:auto;flex:none;visibility:hidden';
    el.parentElement!.append(probe);
    const need = probe.getBoundingClientRect().width;
    probe.remove();
    return el.getBoundingClientRect().width >= need - 1;
  });

test('the Export window has no sideways scroll, and its buttons stay inside it', async ({ page }) => {
  await openDemo(page, 1280, 720);
  await page.evaluate(async (u) => ((await import(u.ui)) as UiModule).uiStore.patch({ exportOpen: true }), URLS);
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.card')).toContainText('kit.atlas');
  // a wide window and one narrower than the dialog would like to be
  for (const width of [1280, 600]) {
    await page.setViewportSize({ width, height: 640 });
    expect(await dialog.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(0);
    expect(await outside(dialog, 'button', true)).toEqual([]);
  }
});

test('the buttons of a lesson card stay inside the card', async ({ page }) => {
  await openDemo(page, 1280, 720);
  await page.evaluate(async (u) => ((await import(u.learn)) as LearnModule).startLesson('rig'), URLS);
  const card = page.locator('.learn');
  await expect(card.locator('.learn-actions button')).toHaveCount(2);
  expect(await outside(card, 'button, p')).toEqual([]);
});

test('lists show their whole choice, and a menu entry is one line', async ({ page }) => {
  await openDemo(page, 1920, 1080);
  expect(await fits(page.getByRole('combobox', { name: 'Интерполяция новых ключей' }))).toBe(true);
  for (let i = 0; i < 4; i++) {
    await page.locator('.topbar .menu > button').nth(i).click();
    const menu = page.getByRole('menu');
    const tall = await menu
      .locator('.menu-item')
      .evaluateAll((items) => items.filter((m) => m.getBoundingClientRect().height > 36).map((m) => m.textContent));
    expect(tall).toEqual([]);
    expect(await menu.evaluate((m) => m.scrollWidth - m.clientWidth)).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
  }
});

test('in a low window every tool is on the screen, and the panels do not scroll sideways', async ({ page }) => {
  await openDemo(page, 1100, 580);
  await page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const A = (await import(u.actions)) as ActionsModule;
    const { uiStore } = (await import(u.ui)) as UiModule;
    const sk = docStore.get().skeleton;
    A.selectSlot(sk.slots.find((s) => s.attachment && sk.skins[0].attachments[s.id]?.[s.attachment]?.type === 'mesh')!.id);
    uiStore.patch({ views: { ...uiStore.get().views, tools: true, playback: true } });
  }, URLS);
  const viewport = page.locator('.viewport-wrap');
  await expect(viewport.locator('.toolbox button')).toHaveCount(13);
  expect(await outside(viewport, '.toolbox button')).toEqual([]);
  const sideways = await page
    .locator('.panel-body')
    .evaluateAll((all) => all.filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.textContent.slice(0, 40)));
  expect(sideways).toEqual([]);
  // the words of the inspector are whole: a label wraps, it is not cut with three dots
  const cut = await page
    .locator('.right .frow-label')
    .evaluateAll((all) => all.filter((l) => l.scrollWidth > l.clientWidth).map((l) => l.textContent));
  expect(cut).toEqual([]);
});
