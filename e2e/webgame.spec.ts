/** The web game export: the real ZIP is downloaded, served as a website, and its player draws what the editor draws. */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readZip } from '../src/core/import/zipRead';

type DocModule = typeof import('../src/store/doc');
type RenderModule = typeof import('../src/editor/renderAnimation');
const URLS = { doc: '/src/store/doc.ts', render: '/src/editor/renderAnimation.ts' };
const FPS = 30;
const FRAMES = [0, 11, 23];

const TYPES: Record<string, string> = { html: 'text/html', js: 'text/javascript', json: 'application/json', ts: 'text/plain' };

interface EditorFrame {
  animation: string;
  frame: number;
  png: string;
  width: number;
  height: number;
  origin: [number, number];
}

/** Frames of every animation of the demo as the editor renders them to files. */
const editorFrames = (page: Page) =>
  page.evaluate(
    async ({ urls, fps, frames }) => {
      const { docStore } = (await import(urls.doc)) as DocModule;
      const { prepareRender } = (await import(urls.render)) as RenderModule;
      const doc = docStore.get().skeleton;
      return doc.animations.flatMap((animation) => {
        const made = prepareRender({ doc, animation, fps, scale: 1, padding: 8, background: null });
        const out: EditorFrame[] = [];
        for (let i = 0; i <= frames[frames.length - 1] && i < made.count; i++) {
          const image = made.frame(i);
          if (!frames.includes(i)) continue;
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          canvas.getContext('2d')!.putImageData(image, 0, 0);
          const { width, height, origin } = made;
          out.push({ animation: animation.name, frame: i, png: canvas.toDataURL(), width, height, origin });
        }
        made.dispose();
        return out;
      });
    },
    { urls: URLS, fps: FPS, frames: FRAMES },
  );

test('the downloaded web game plays the demo fox and draws it as the editor does', async ({ page, context }) => {
  const errors: string[] = [];
  const watch = (p: Page) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  };
  watch(page);
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('bone2d.lang', 'en');
  });
  await page.goto('/?demo');
  await expect
    .poll(() =>
      page.evaluate(async (url) => {
        const { docStore } = (await import(url)) as DocModule;
        return docStore.get().skeleton.animations.length;
      }, URLS.doc),
    )
    .toBeGreaterThan(1);
  await page.waitForTimeout(800); // the demo settles: its pictures are decoded
  const wanted = await editorFrames(page);
  expect(wanted.length).toBeGreaterThan(6);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await page.screenshot({ path: 'test-results/webgame-dialog.png' });
  const waiting = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Web game' }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe('kit-web-game.zip');
  const bytes = readFileSync(await download.path());
  const zip = readZip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const files = new Map<string, Buffer>();
  for (const [name, read] of zip) files.set(name, Buffer.from(await read()));
  expect([...files.keys()].sort()).toEqual(['bone2d.d.ts', 'bone2d.js', 'index.html', 'kit.json']);
  expect(files.get('bone2d.js')!.length).toBeLessThan(120_000);

  const game = await context.newPage();
  watch(game);
  await game.route('http://game.test/**', (route) => {
    const name = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    const body = files.get(name);
    return body ? route.fulfill({ body, contentType: TYPES[name.split('.').pop()!] }) : route.fulfill({ status: 404 });
  });
  await game.goto('http://game.test/index.html');
  await game.waitForFunction(() => 'hero' in window);
  const names = [...new Set(wanted.map((f) => f.animation))];
  await expect(game.locator('nav button')).toHaveText(names);
  await game.locator('nav button').nth(1).click();
  await expect.poll(() => game.evaluate(() => (window as unknown as { hero: { animation: string } }).hero.animation)).toBe(names[1]);
  await game.screenshot({ path: 'test-results/webgame.png' });

  // the same frames drawn by the downloaded player, pixel against pixel
  const results = await game.evaluate(
    async ({ frames, fps }) => {
      const player = (await import(new URL('./bone2d.js', location.href).href)) as typeof import('../src/runtime/index');
      const canvas = document.createElement('canvas');
      const view = player.createView(canvas);
      const out: { name: string; off: number; painted: number }[] = [];
      for (const want of frames) {
        const hero = await player.loadCharacter('./kit.json');
        hero.play(want.animation, { loop: true });
        hero.update(0);
        for (let i = 0; i < want.frame; i++) hero.update(1 / fps);
        canvas.width = want.width;
        canvas.height = want.height;
        const [ox, oy] = want.origin;
        view.draw(hero, { x: want.width / 2 - ox, y: oy - want.height / 2, zoom: 1 });
        const read = (source: CanvasImageSource) => {
          const c = document.createElement('canvas');
          c.width = want.width;
          c.height = want.height;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(source, 0, 0);
          return ctx.getImageData(0, 0, c.width, c.height).data;
        };
        // read in the same turn as the drawing: the canvas of the view does not keep its picture
        const got = read(canvas);
        const img = new Image();
        img.src = want.png;
        await img.decode();
        view.draw(hero, { x: want.width / 2 - ox, y: oy - want.height / 2, zoom: 1 });
        const expected = read(img);
        // colours as the screen shows them (times their alpha); a share of the pixels may differ at the edges
        const seen = (d: Uint8ClampedArray, i: number) => (i % 4 === 3 ? d[i] : (d[i] * d[i | 3]) / 255);
        let off = 0;
        let painted = 0;
        for (let p = 0; p < expected.length; p += 4) {
          if (expected[p + 3] === 0 && got[p + 3] === 0) continue;
          painted++;
          if ([0, 1, 2, 3].some((k) => Math.abs(seen(expected, p + k) - seen(got, p + k)) > 6)) off++;
        }
        out.push({ name: `${want.animation} ${want.frame}`, off, painted });
      }
      return out;
    },
    { frames: wanted, fps: FPS },
  );
  for (const r of results) {
    expect(r.painted, r.name).toBeGreaterThan(5000);
    expect(r.off / r.painted, r.name).toBeLessThan(0.002);
  }
  expect(errors).toEqual([]);
});
