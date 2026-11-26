/** The Chinese interface in a real browser: it opens by itself, the choice is remembered, and no English text is left on the screens. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type DocModule = typeof import('../src/store/doc');
type UiModule = typeof import('../src/store/ui');
type ActionsModule = typeof import('../src/store/actions');
const URLS = { doc: '/src/store/doc.ts', ui: '/src/store/ui.ts', actions: '/src/store/actions.ts' };

test.use({ locale: 'zh-CN' });

async function openDemo(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.locator('.overlay .choice.primary').click();
  await expect.poll(() => page.locator('.row .label').count()).toBeGreaterThan(5);
}

test('a Chinese browser opens in Chinese, and the choice of another language is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page).toHaveTitle('Bone 2D — 2D 骨骼动画');
  const dialog = page.locator('.overlay .dialog');
  await expect(dialog).toContainText('欢迎使用 Bone 2D');
  await dialog.locator('.lang').getByRole('radio', { name: 'EN' }).click();
  await expect(dialog).toContainText('Welcome to Bone 2D');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('.overlay .lang').getByRole('radio', { name: '中文' }).click();
  await page.reload();
  await expect(page.locator('.overlay .dialog')).toContainText('欢迎使用 Bone 2D');
});

/**
 * Every text and hint on the screen that has two English words in a row and no Chinese character. Names that come from the project
 * (bones, pictures, animations) and from the changelog of older versions are left out by their place.
 */
const englishLeft = (page: Page) =>
  page.evaluate(async (u) => {
    const { docStore } = (await import(u.doc)) as DocModule;
    const names = JSON.stringify(docStore.get());
    const found = new Set<string>();
    const look = (text: string | null) => {
      const t = (text ?? '').trim();
      // a name can stand with a number after it: `leg far (0)`; the frame rate stands with its unit
      const bare = t.replace(/ \(\d+\)$/, '');
      if (!/[A-Za-z]{2,} [A-Za-z]{2,}/.test(t) || /[4e00-9fff]/.test(t) || names.includes(`"${bare}"`) || t === 'FPS fps') return;
      found.add(t);
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement?.closest('.release')) look(n.textContent);
    for (const el of document.querySelectorAll('[title], [aria-label], [placeholder]'))
      for (const a of ['title', 'aria-label', 'placeholder']) look(el.getAttribute(a));
    return [...found];
  }, URLS);

test('no English sentence is left in the editor, its panels and its windows', async ({ page }) => {
  await openDemo(page);
  const left: Record<string, string[]> = {};
  const note = async (where: string) => {
    await page.waitForTimeout(60);
    const found = await englishLeft(page);
    if (found.length) left[where] = found;
  };
  await note('setup');
  for (const state of ['slot', 'bone', 'animate', 'mesh', 'weights'] as const) {
    await page.evaluate(
      async ({ u, which }) => {
        const { docStore } = (await import(u.doc)) as DocModule;
        const A = (await import(u.actions)) as ActionsModule;
        const sk = docStore.get().skeleton;
        const mesh = sk.slots.find((s) => s.attachment && sk.skins[0].attachments[s.id]?.[s.attachment]?.type === 'mesh')!;
        if (which === 'slot') A.selectSlot(mesh.id);
        if (which === 'bone') A.selectBone(sk.bones[2].id);
        if (which === 'animate') {
          A.setMode('animate');
          A.selectAnimation(sk.animations[0].id);
          A.selectBone(sk.bones[2].id);
        }
        if (which === 'mesh' || which === 'weights') {
          A.setMode('setup');
          A.selectSlot(mesh.id);
          A.setTool(which);
        }
      },
      { u: URLS, which: state },
    );
    await note(state);
  }
  for (const dialog of ['helpOpen', 'exportOpen', 'settingsOpen', 'updatesOpen', 'feedbackOpen', 'metricsOpen'] as const) {
    await page.evaluate(
      async ({ u, key }) => {
        const { uiStore } = (await import(u.ui)) as UiModule;
        uiStore.patch({ [key]: true });
      },
      { u: URLS, key: dialog },
    );
    await note(dialog);
    await page.evaluate(
      async ({ u, key }) => {
        const { uiStore } = (await import(u.ui)) as UiModule;
        uiStore.patch({ [key]: false });
      },
      { u: URLS, key: dialog },
    );
  }
  await page.keyboard.press('Control+k');
  await note('command palette');
  expect(left).toEqual({});
});
