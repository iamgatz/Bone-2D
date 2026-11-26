/**
 * The files of a "web game" export: the player as one JavaScript file with its types, the character as one JSON file, and a page that
 * shows how the two are used. Pure string work; the editor gathers the pictures.
 */
import type { CharacterData } from '../../runtime/character';

export interface GameFile {
  name: string;
  text: string;
}

/** A name that is safe for a file. */
const fileName = (name: string) => name.replace(/[^\p{L}\p{N}-]+/gu, '_').replace(/^_+|_+$/g, '') || 'character';

const LICENSE = `/*!
 * Bone 2D web player. https://github.com/iamgatz/Bone-2D
 * MIT License. Copyright (c) 2026 Bone 2D contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files
 * (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
`;

const escapeText = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function examplePage(title: string, file: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeText(title)}</title>
<style>
  html, body { height: 100%; margin: 0; background: #13161c; color: #c7ccd6; font: 14px system-ui, sans-serif; }
  canvas { position: fixed; inset: 0; width: 100%; height: 100%; }
  nav { position: fixed; left: 12px; top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
  button { font: inherit; color: inherit; background: #262b36; border: 1px solid #3a4150; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
  output { position: fixed; left: 12px; bottom: 12px; opacity: 0.7; }
</style>
</head>
<body>
<canvas id="game"></canvas>
<nav></nav>
<output></output>
<!--
  Browsers load modules only from a web server: serve this folder with any of them
  (for example "npx serve" or "python -m http.server") and open the page from there.
-->
<script type="module">
  import { createView, loadCharacter } from './bone2d.js';

  const canvas = document.getElementById('game');
  const view = createView(canvas);
  const hero = await loadCharacter(${JSON.stringify(`./${file}`).replace(/</g, '\\u003c')});
  hero.onEvent = (event) => (document.querySelector('output').textContent = 'event: ' + event.name);

  for (const name of hero.animations) {
    const button = document.createElement('button');
    button.textContent = name;
    button.onclick = () => hero.play(name, { loop: true, mix: 0.25 });
    document.querySelector('nav').append(button);
  }
  if (hero.animations.length) hero.play(hero.animations[0], { loop: true });
  hero.update(0);

  // the camera that shows the whole character, measured once
  const box = hero.bounds() ?? { x: -100, y: 0, width: 200, height: 200 };

  let last = performance.now();
  function frame(now) {
    hero.update(Math.min(0.1, (now - last) / 1000));
    last = now;
    const zoom = 0.7 * Math.min(canvas.clientWidth / box.width, canvas.clientHeight / box.height);
    view.draw(hero, { x: box.x + box.width / 2, y: box.y + box.height / 2, zoom });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // so that you can try things from the console of the browser
  window.hero = hero;
</script>
</body>
</html>
`;
}

export function webGameFiles(data: CharacterData, player: string, types: string): GameFile[] {
  const file = `${fileName(data.name)}.json`;
  return [
    { name: 'index.html', text: examplePage(data.name, file) },
    { name: file, text: JSON.stringify(data) },
    { name: 'bone2d.js', text: LICENSE + player },
    { name: 'bone2d.d.ts', text: types },
  ];
}
