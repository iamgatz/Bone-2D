import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FOX_LESSON, RIG_LESSON } from '../src/core/lessons';

type BoneActions = typeof import('../src/store/boneActions');
type DocModule = typeof import('../src/store/doc');
type UiModule = typeof import('../src/store/ui');
const UI = '/src/store/ui.ts';
const BONES = '/src/store/boneActions.ts';
const DOC = '/src/store/doc.ts';

/** Starts clean once (not at every reload, so what the editor remembers can be tested), then opens the demo from the welcome window. */
async function openFresh(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('fresh')) {
      sessionStorage.setItem('fresh', '1');
      localStorage.clear();
    }
  });
  await page.goto('/');
}
async function openDemoWithLesson(page: Page) {
  await openFresh(page);
  await page.locator('.overlay .choice.primary').click();
  await expect.poll(() => page.locator('.row .label').count()).toBeGreaterThan(5);
}

for (const locale of ['en-US', 'ru-RU'] as const) {
  const lang = locale === 'ru-RU' ? 'ru' : 'en';
  test.describe(`the fox lesson (${locale})`, () => {
    test.use({ locale });

    test('starts by itself with the first demo, and is passed with the real keys and clicks of the editor', async ({ page }) => {
      await openDemoWithLesson(page);
      const card = page.locator('.learn');
      const step = (i: number) => FOX_LESSON.steps[i];
      await expect(card).toBeVisible();
      await expect(card.locator('.learn-title')).toHaveText(FOX_LESSON.title[lang]);
      await expect(card.locator('.learn-step-title')).toHaveText(step(0).title[lang]);
      await expect(card.locator('.learn-text')).toHaveText(step(0).text[lang]);
      await expect(page.locator('[data-learn-hl]')).toHaveCount(1);
      await expect(page.locator('[data-learn="tree"]')).toHaveAttribute('data-learn-hl', '');

      // 1. pick a bone (a click in the hierarchy)
      await page.locator('.left .row').nth(2).click();
      await expect(card.locator('.learn-step-title')).toHaveText(step(1).title[lang]);
      await expect(page.locator('aside.right')).toHaveAttribute('data-learn-hl', '');
      await expect(page.locator('[data-learn="tree"]')).not.toHaveAttribute('data-learn-hl', '');

      // 2. change it (the same action a drag or an Inspector field makes)
      const turn = (rotation: number) =>
        page.evaluate(
          async ([doc, bones, rot]) => {
            const { docStore } = (await import(doc)) as DocModule;
            const { setBonePose } = (await import(bones)) as BoneActions;
            const id = docStore.get().skeleton.bones[2].id;
            setBonePose([{ id, props: { rotation: rot } }]);
          },
          [DOC, BONES, rotation] as const,
        );
      await turn(25);
      await expect(card.locator('.learn-step-title')).toHaveText(step(2).title[lang]);

      // 3. Tab switches to Animate
      await page.keyboard.press('Tab');
      await expect(card.locator('.learn-step-title')).toHaveText(step(3).title[lang]);
      await expect(page.locator('[data-learn="play"]')).toHaveAttribute('data-learn-hl', '');

      // 4. Space plays, Space stops
      await page.keyboard.press('Space');
      await expect(card.locator('.learn-step-title')).toHaveText(step(4).title[lang]);
      await page.keyboard.press('Space');

      // 5. a key of our own: the pose of the selected bone at another time, with Auto key on
      await page.evaluate(async (url) => {
        const { uiStore } = (await import(url)) as UiModule;
        uiStore.patch({ time: 0.37, playing: false });
      }, UI);
      await turn(-40);
      await expect(card.locator('.learn-step-title')).toHaveText(step(5).title[lang]);
      await expect(page.locator('[data-learn="export"]')).toHaveAttribute('data-learn-hl', '');

      // 6. Ctrl+E opens Export: the lesson is over
      await page.keyboard.press('Control+e');
      await expect(page.locator('.overlay .dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(card.locator('.learn-count')).toHaveText('6/6');
      await expect(card.locator('.learn-text')).toHaveText(FOX_LESSON.outro[lang]);
      await expect(page.locator('[data-learn-hl]')).toHaveCount(0);

      // Done closes it, and it does not come back after a reload (it was finished and offered once)
      await card.getByRole('button', { name: lang === 'ru' ? 'Готово' : 'Done' }).click();
      await expect(card).toHaveCount(0);
      await page.reload();
      await expect(page.locator('.learn')).toHaveCount(0);
    });

    test('can be skipped, folded and closed at any time, and is offered again from the welcome window', async ({ page }) => {
      await openDemoWithLesson(page);
      const card = page.locator('.learn');
      await expect(card.locator('.learn-count')).toHaveText('0/6');

      await card.locator('.btn.ghost').click(); // skip the first step
      await expect(card.locator('.learn-step-title')).toHaveText(FOX_LESSON.steps[1].title[lang]);

      await card.getByRole('button', { name: lang === 'ru' ? 'Свернуть урок' : 'Fold the lesson' }).click();
      await expect(card.locator('.learn-body')).toHaveCount(0);
      await expect(page.locator('[data-learn-hl]')).toHaveCount(0); // folded: no frame either
      await card.getByRole('button', { name: lang === 'ru' ? 'Развернуть урок' : 'Unfold the lesson' }).click();
      await expect(page.locator('[data-learn-hl]')).toHaveCount(1);

      await card.getByRole('button', { name: lang === 'ru' ? 'Закрыть урок' : 'Close the lesson' }).click();
      await expect(card).toHaveCount(0);
      await expect(page.locator('[data-learn-hl]')).toHaveCount(0);

      // the editor keeps working, and the lesson comes back only when asked: Help → the lesson button
      await page.evaluate(async (url) => {
        const { uiStore } = (await import(url)) as UiModule;
        uiStore.patch({ helpOpen: true });
      }, UI);
      await page.locator('.dialog .btn').first().click();
      await expect(page.locator('.learn')).toBeVisible();
      await expect(page.locator('.learn .learn-count')).toHaveText('0/6');
    });

    test('the card and the frame stay inside a small window and the page does not stretch', async ({ page }) => {
      await page.setViewportSize({ width: 1100, height: 560 });
      await openDemoWithLesson(page);
      const box = await page.evaluate(() => {
        const r = document.querySelector('.learn')!.getBoundingClientRect();
        const wrap = document.querySelector('.viewport-wrap')!.getBoundingClientRect();
        const d = document.documentElement;
        return {
          inside: r.left >= wrap.left && r.right <= wrap.right && r.top >= wrap.top && r.bottom <= wrap.bottom,
          wide: d.scrollWidth - d.clientWidth,
          tall: d.scrollHeight - d.clientHeight,
        };
      });
      expect(box.inside).toBe(true);
      expect(box.wide).toBeLessThanOrEqual(0);
      expect(box.tall).toBeLessThanOrEqual(0);
    });

    test('axe finds nothing wrong with the card and the frame', async ({ page }) => {
      await openDemoWithLesson(page);
      await expect(page.locator('.learn')).toBeVisible();
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
    });
  });
}

test('a link to the demo starts the lesson once, and not again for a visitor who closed it', async ({ page }) => {
  await openFresh(page);
  await page.goto('/?demo=wave');
  await expect(page.locator('.learn')).toBeVisible();
  // the link opened Animate and started the playback: those steps count at once, in whatever order they happened
  await expect(page.locator('.learn .learn-count')).toHaveText(/^[2-9]\/6$/);
  await page.locator('.learn').getByRole('button', { name: 'Close the lesson' }).click();
  await page.goto('/?demo=wave');
  await expect(page.locator('.learn')).toHaveCount(0);
});

type SlotActions = typeof import('../src/store/slotActions');
type SessionActions = typeof import('../src/store/sessionActions');
const SLOTS = '/src/store/slotActions.ts';
const SESSION = '/src/store/sessionActions.ts';

for (const locale of ['en-US', 'ru-RU'] as const) {
  const lang = locale === 'ru-RU' ? 'ru' : 'en';
  test.describe(`the rig lesson (${locale})`, () => {
    test.use({ locale });

    test('is passed from an empty project: pictures, a bone drawn with B, a picture on it, a turn, playback', async ({ page }) => {
      await openFresh(page);
      await page.locator('.overlay .choice').nth(1).click(); // New project: no lesson starts by itself
      await expect(page.locator('.learn')).toHaveCount(0);
      await page.evaluate(async (url) => {
        const { uiStore } = (await import(url)) as UiModule;
        uiStore.patch({ helpOpen: true });
      }, UI);
      await page.locator('.dialog .hstack.wrap .btn').nth(1).click();
      const card = page.locator('.learn');
      const step = (i: number) => RIG_LESSON.steps[i];
      await expect(card.locator('.learn-title')).toHaveText(RIG_LESSON.title[lang]);
      await expect(card.locator('.learn-step-title')).toHaveText(step(0).title[lang]);
      await expect(page.locator('[data-learn="images"]')).toHaveAttribute('data-learn-hl', '');

      // 1. the button of the step adds two sample pictures
      await card.getByRole('button', { name: step(0).helper!.label[lang] }).click();
      await expect(card.locator('.learn-step-title')).toHaveText(step(1).title[lang]);

      // 2. a bone drawn with the key and the mouse
      await page.keyboard.press('b');
      const area = await page.locator('.viewport-wrap').boundingBox();
      expect(area).not.toBeNull();
      // not from the middle: an empty project shows a card there that takes the pointer
      const at = (fx: number, fy: number) => [area!.x + area!.width * fx, area!.y + area!.height * fy] as const;
      await page.mouse.move(...at(0.2, 0.7));
      await page.mouse.down();
      await page.mouse.move(...at(0.35, 0.55), { steps: 6 });
      await page.mouse.move(...at(0.5, 0.35), { steps: 6 });
      await page.mouse.up();
      await expect(card.locator('.learn-step-title')).toHaveText(step(2).title[lang]);

      // 3. a picture on the new bone (what dropping it into the viewport does)
      await page.evaluate(
        async ([sessionUrl, slotUrl, docUrl]) => {
          const { docStore } = (await import(docUrl)) as DocModule;
          const session = (await import(sessionUrl)) as SessionActions;
          const slots = (await import(slotUrl)) as SlotActions;
          const bones = docStore.get().skeleton.bones;
          const id = bones[bones.length - 1].id;
          session.selectBone(id);
          slots.addImageToScene(docStore.get().images[0].name, 0, 0, id);
        },
        [SESSION, SLOTS, DOC] as const,
      );
      await expect(card.locator('.learn-step-title')).toHaveText(step(3).title[lang]);

      // 4. Tab, 5. a turn at another time (Auto key), 6. Space
      await page.keyboard.press('Tab');
      await expect(card.locator('.learn-step-title')).toHaveText(step(4).title[lang]);
      await page.evaluate(
        async ([ui, bonesUrl, docUrl]) => {
          const { uiStore } = (await import(ui)) as UiModule;
          const { docStore } = (await import(docUrl)) as DocModule;
          const { setBonePose } = (await import(bonesUrl)) as BoneActions;
          uiStore.patch({ time: 0.4 });
          const bones = docStore.get().skeleton.bones;
          setBonePose([{ id: bones[bones.length - 1].id, props: { rotation: 35 } }]);
        },
        [UI, BONES, DOC] as const,
      );
      await expect(card.locator('.learn-step-title')).toHaveText(step(5).title[lang]);
      await page.keyboard.press('Space');
      await expect(card.locator('.learn-count')).toHaveText('6/6');
      await expect(card.locator('.learn-text')).toHaveText(RIG_LESSON.outro[lang]);
      await page.keyboard.press('Space');
    });

    test('the first lesson leads to the second one when it is over', async ({ page }) => {
      await openDemoWithLesson(page);
      const card = page.locator('.learn');
      for (let i = 0; i < FOX_LESSON.steps.length; i++) await card.locator('.btn.ghost').click();
      await expect(card.locator('.learn-text')).toHaveText(FOX_LESSON.outro[lang]);
      await card.getByRole('button', { name: RIG_LESSON.title[lang] }).click();
      await expect(card.locator('.learn-title')).toHaveText(RIG_LESSON.title[lang]);
      await expect(card.locator('.learn-count')).toHaveText('0/6');
    });
  });
}
