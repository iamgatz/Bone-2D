# Bone 2D

**English** · [Русский](README.ru.md)

An open-source 2D skeletal animation editor that runs entirely in the browser — in the spirit of Spine.
It exports the **Spine 4.3** format (`.json` + `.atlas` + `.png`), and the export is checked in the test suite against the official `spine-core` 4.3 runtime.

**[Open the editor →](https://iamgatz.github.io/Bone-2D/)** — nothing to install, everything runs locally in your browser.
The interface is available in **English and Russian** (switch it in the top bar; the choice is remembered, the first visit follows your browser language).

```bash
npm install
npm run dev        # http://localhost:5273
npm test           # unit tests + random editor sessions, including a comparison with the official spine-core 4.3
npm run build      # production build into dist/
```

A long run of random editor sessions (`FUZZ_FROM` is the first seed):

```bash
FUZZ_SEEDS=300 FUZZ_STEPS=100 npx vitest run tests/fuzz.test.ts
```

```powershell
$env:FUZZ_SEEDS='300'; $env:FUZZ_STEPS='100'; npx vitest run tests/fuzz.test.ts
```

## What it can do

**Rigging (Setup mode)**
- Bones: create by dragging (chains start at the tip of the selected bone), hierarchy with drag-and-drop, inherit modes (`normal`, `onlyTranslation`, `noRotationOrReflection`, `noScale`, `noScaleOrReflection`).
- Slots and images: drop PNGs into the window, draw order, blend modes, tint, and **two-color tint** (a dark color that fills in where the image is dark: glow, hit flash; keyed in Animate mode together with the light color).
- **Meshes**: auto-trace by alpha → Delaunay triangulation, vertex editing, add / remove, re-triangulate.
- **Weights**: bind to bones (auto-weights), brush (add / subtract / replace / smooth), heat map, normalize, up to 4 influences per vertex.
- **IK** (1 and 2 bones): mix, softness, bend, stretch, compress, scaleY modes; create by dragging.
- **Transform constraints 4.3**: map any source property to any target property, clamp, local / world, additive, presets.
- **Sliders 4.3**: play a chosen animation with a manual time (the time and the mix can be keyed) or with the time driven by a bone property
  (`time = to + (value − from) × scale`, local / world, loop, additive). Added with the "+" next to the Constraints list.
- **Clipping, bounding boxes, points** (tools `C` / `X` / `P`): draw a polygon by clicking (close it by clicking the first point, double-click or Enter),
  edit vertices (drag, Ctrl-click on an edge adds, Del removes), `end` slot, `convex` / `inverse`. Clipping is drawn with the stencil buffer using Spine's semantics
  (the end slot is clipped inclusively); weighted polygons from imported files are kept and drawn.
- Skins (swap the image in a slot), events, undo / redo (a gesture collapses into one step).

**Animation (Animate mode)**
- Auto-key (or manual keys + "Key all"); keys for rotate / translate / scale / shear, slot colors (light and dark), attachment changes, IK mix / bend, transform-constraint mixes, **mesh deformation**, draw order, events.
- Dopesheet: selection, box select, drag keys with frame snapping, copy / paste, interpolation (linear / stepped / bezier / ease).
- **Graph editor**: per-channel curves, drag keys and Bézier handles.
- Playback, loop, frame stepping.

**Files**
- `.bone2d` project (images embedded), autosave to IndexedDB, File System Access API. Older `.marrow` files (the project's former working name) still open.
  A file is **validated and repaired** on open (dangling references, stale deform keys, NaN, duplicate names); a broken image never wipes the open session.
- Export ZIP: Spine 4.3 JSON + atlas (MaxRects, edge extrusion) + `*-preview.html` (plays the export with the **official** Spine player).
- **Spine 4.3 JSON import** (File → Import…): pick the `.json` together with the `.atlas` and the page images — regions are cut out (trim offsets and rotation are honored).
  Whatever is not supported (path / physics constraints, sequences, …) is skipped and listed in the console. Export → import → export gives the same JSON, byte for byte.

## Why the export can be trusted

`tests/spine-parity.test.ts` exports a deliberately nasty test rig (all inherit modes, shear, IK, 4 transform constraints, weighted and plain meshes, deformation, colors,
events, skins, random draw orders), loads the JSON with the official `@esotericsoftware/spine-core@4.3.x` and compares **world matrices of every bone, mesh vertices, colors,
attachments and draw order** with our own solver at dozens of points in time. The check is not vacuous: mutant tests confirm that any deviation is caught.
Clipping, bounding boxes and points are checked the same way, including the real `SkeletonClipping` and `SkeletonBounds` (`tests/attachments.test.ts`).

The second level of trust is **random sessions** (`tests/fuzz.test.ts`): hundreds of sequences of real editor actions (bones, meshes, weights, IK, transform constraints,
sliders, keys, undo / redo, …). After **every** step the document must not need repair, the export must load in the official runtime and the matrices must be finite;
at the end our solver is compared with the official one, "undo everything" returns the initial document and "redo everything" the final one. This is how update-order bugs
(the 4.3 model with lazy `world` / `local`), Spine's float32 π, loss of deform keys on mesh edits and others were found and fixed (see `docs/ROUND2.md`, in Russian).

## Layout

```
src/core      pure logic, no DOM: model, curves (the same 10-segment approximation as the runtime),
              skeleton.ts (pose, inherit modes, IK, transform constraints, sliders, skinning), animate.ts, mesh.ts,
              clip.ts (clipping plan), validate.ts (document check / repair), export/ (spineJson, atlas, zip), import/ (spineJson, atlas)
src/store     document store on immer patches (undo / redo), UI store, actions
src/render    WebGL2 renderer (batches, blend modes, tint, stencil clipping)
src/editor    React panels, viewport (Canvas2D overlay + tools), dopesheet, graph editor
tests         vitest: core, meshes / weights, differential tests against the official runtime, random sessions
docs          design notes and plans (in Russian)
```

Stack: TypeScript (strict), Vite, React 19, immer, delaunator, own WebGL2 renderer.
Rationale for the choices is in [docs/PROMPT.md](docs/PROMPT.md); notes on the 4.3 format are in [docs/RESEARCH.md](docs/RESEARCH.md) (both in Russian).

## Hotkeys

`V` select / pose · `B` bone · `T` `R` `S` translate / rotate / scale · `M` mesh · `W` weights · `I` IK · `C` clipping · `X` bounding box · `P` point · `Tab` Setup ⇄ Animate ·
`Space` play · `←` / `→` frame · `K` key · `Ctrl+Z` / `Ctrl+Y` undo / redo · `Del` delete · `F` frame the skeleton · `Ctrl+S` / `Ctrl+O` / `Ctrl+E` save / open / export.

## Not done yet

Path and physics constraints, path attachments, weights and deformation for clipping / bounding boxes (only moving vertices is supported),
linked meshes (imported as copies), sequence atlases, draw-order folders, import of Spine 4.0–4.2 files (different constraint format), binary export (`.skel`),
onion skin, collaboration.

Spine quirks we reproduce on purpose: angles go through float32 π (`180 / 3.1415927`), and reading a world rotation at the 0 / 360° boundary (the source of a transform
constraint or a slider driver) gives 0 or 360 depending on ~1e-6° noise, so different runtimes can disagree on such an edge.

## Contributing

Issues and pull requests are welcome. The safety net is the test suite — please run it before sending a change:

```bash
npm test
npm run build
```

A new editor feature counts as done when it goes through the whole chain: model → validator → solver / runtime → export → import → differential test against the official
runtime → UI → an operation in the random-session kit (`tests/fuzzkit.ts`). The reasoning is in `docs/ROUND3.md` (in Russian).

Interface texts stay English in the components and are translated while rendering (`src/i18n`): add the Russian text of any new UI string to `src/i18n/ru.ts`
(`{}` in a key matches any text, `{#}` a number). `npm test` fails when a static UI string has no translation. To add another language, add a dictionary like `ru.ts` and extend `Lang`.

## License

[MIT](LICENSE)
