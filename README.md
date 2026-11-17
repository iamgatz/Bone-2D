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
- **Photoshop import**: drop a `.psd` into the window (or the Images window) and every visible layer becomes a picture and a slot with a region, bottom layer first, so the stack of the file is the draw order. Groups become folders, opacity and the multiply / screen / additive blend modes are kept, hidden layers are left out; one Undo takes it all back. The origin is the middle of the bottom edge of the document (masks, clipping layers and effects are not applied). **Update from PSD** (button in the Images window) matches the layers of a repainted file to the pictures by name: new pixels, attachments follow the size and the move of the layer, new layers become slots, the rig stays.
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
- **Paths** (tool `N`): Bezier path attachments — click places a node, dragging pulls its handles; edit nodes with the mesh tool (`M`), Ctrl-click / double-click the curve adds a node, `Del` removes it. Closed / open, constant speed or setup lengths, binding to bones with automatic weights.
- **Path constraints 4.3** (the spline button next to Constraints): the selected bones follow the path shown in a slot — rotate mode `tangent` / `chain` / `chainScale`, position `fixed` / `percent`, spacing `length` / `fixed` / `percent` / `proportional`, offset rotation, three mixes.
- **Physics constraints** (Spine 4.2+; the wave button next to Constraints): a spring simulation on one bone — it swings (rotate), is pushed (x / y), stretches (scale X, with the scale Y mode `none` / `uniform` / `volume`) or shears — with inertia, strength, damping, mass, wind, gravity, mix, a limit and its own step rate. The simulation runs while an animation plays (scrubbing shows the pose without it); every parameter can be keyed, the global timelines and reset keys are supported.
- Skins (swap the image in a slot), events, undo / redo (a gesture collapses into one step).

**Workspace**
- **Folders of images**: drop a folder onto the Images window or the viewport (or use its folder button); subfolders stay as folders of pictures (`hero/arm/upper`), one Undo takes the lot.
- **Windows menu**: Hierarchy, Images, Animations, Metrics, Inspector and Timeline open and close on their own, ready layouts, `F9` hides everything; the arrangement is remembered. Metrics counts bones, meshes, vertices and keys and lists what looks forgotten before an export.
- **Settings** (`F12`): language, autosave, viewport background, texture smoothing, zoom to mouse, onion skin frames, and the **letters of the tools** can be changed.
- **Updates** (the bell) shows what is new and the live activity of the project; **Feedback** sends a bug report or an idea.
- Tools: select / pose, bones, translate, rotate, scale, **shear** (`H`), mesh, weights, IK, clipping, bounding boxes, points, paths. Edit menu: **duplicate and mirror bones** (with children, slots and images), reset / copy / paste pose.

**Animation (Animate mode)**
- Auto-key (or manual keys + "Key all"); keys for rotate / translate / scale / shear, slot colors (light and dark), attachment changes, IK mix / bend, transform-constraint mixes, **path position / spacing / mixes**, **mesh and path deformation** (drag nodes in Animate mode), draw order, events.
- Dopesheet: selection, box select, drag keys with frame snapping, copy / paste, interpolation (linear / stepped / bezier / ease).
- **Graph editor**: per-channel curves, drag keys and Bézier handles.
- **Animation tools** window: *Simplify keys* takes out the keys a curve does not need (tolerance you scale, shows how many can go first), *Bake constraints* writes what IK, transform, path, physics and sliders do into plain bone keys of a new animation (every frame or every N-th, optionally simplified, constraints switched off in the copy). Checked frame by frame against the originals in the random-session tests.
- **Hotkeys**: every command's key combination can be moved in Settings → Hotkeys (not only the tool letters); conflicts with another command, a tool or the browser are refused by name.
- **Poses** window: a library of poses kept by name; one click puts a pose on the selected bones (setup pose in Setup mode, keys at the playhead in Animate mode), optionally only part of the way. Saved in the project file, not exported.
- **Hierarchy filter** by name, **Ctrl+H** shows everything hidden, **Ctrl+Shift+H** shows only the selection.
- **Close the loop**: the end of an animation takes the value of its start, for seamless cycles.
- **Sequences** (frame-by-frame pictures on a region or mesh) with all seven Spine modes, in the editor, the JSON / binary export and the import.
- **Linked meshes**: a skin gives a mesh another picture and keeps its shape, weights and deform; the link is written to and read from Spine files.
- **Event sounds** (path, volume, balance) are edited in the Hierarchy and kept through the Spine export and import.
- **Rulers, guides and snapping** to the grid and the guides (guides are saved in the project).
- Keys copied from one bone **paste onto the selected bone**; Settings: bone size and hints.
- **Texture packer**: strip whitespace, rotate, Linear / Nearest filter, padding, power-of-two, page size; export settings are remembered and can be saved to / loaded from a file.
- Playback, loop, frame stepping. **Onion skin** (faded poses before and after the playhead), **Clean Up** (removes the keys that change nothing), **Alt-drag a key** to shift the keys after it too, an Animations window with folders (`emotes/wave`).

**Files**
- `.bone2d` project (images embedded), autosave to IndexedDB, File System Access API (Ctrl+S saves to the same file, Ctrl+Shift+S asks where; the Welcome window lists recent projects). Older `.marrow` files (the project's former working name) still open.
  A file is **validated and repaired** on open (dangling references, stale deform keys, NaN, duplicate names); a broken image never wipes the open session.
- Export ZIP: Spine 4.3 JSON **or binary `.skel`** (about half the size) + atlas (MaxRects, edge extrusion, page size, padding, power of two) + `*-preview.html` (plays the export with the **official** Spine player); choose which animations go in.
- **Render an animation to a GIF** (transparent, own encoder), **a PNG sequence** (ZIP) or **a WebM video** — File → Export → Animation tab.
- **Spine import: JSON 4.0 – 4.3 and binary `.skel` 4.3** (File → Import…): pick the `.json` / `.skel` together with the `.atlas` and the page images — regions are cut out (trim offsets and rotation are honored).
  Files from Spine 4.0 / 4.1 / 4.2 (separate `ik` / `transform` / `path` lists, the old transform-constraint model) are converted to the 4.3 model on the way in; the two corners where 4.3 computes
  a transform constraint differently from 4.2 are reported. Whatever is not supported (sequences, …) is skipped and listed in the console. Export → import → export gives the same JSON, byte for byte.

## Why the export can be trusted

`tests/spine-parity.test.ts` exports a deliberately nasty test rig (all inherit modes, shear, IK, 4 transform constraints, weighted and plain meshes, deformation, colors,
events, skins, random draw orders; `tests/path.test.ts` adds open / closed / weighted paths and path constraints in every mode, and `tests/physics.test.ts` plays physics constraints frame by frame against the same runtime), loads the JSON with the official `@esotericsoftware/spine-core@4.3.x` and compares **world matrices of every bone, mesh vertices, colors,
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

`V` select / pose · `B` bone · `T` `R` `S` translate / rotate / scale · `M` mesh / path nodes · `W` weights · `I` IK · `C` clipping · `X` bounding box · `P` point · `N` path · `Tab` Setup ⇄ Animate ·
`H` shear · `Space` play · `←` / `→` frame · `K` key · `Ctrl+Z` / `Ctrl+Y` undo / redo · `Del` delete · `F` frame the skeleton · `Ctrl+S` / `Ctrl+O` / `Ctrl+E` save / open / export · `Ctrl+D` / `Ctrl+Shift+D` duplicate / mirror bones · `F9` hide windows · `F12` settings.

## Not done yet

Weights and deformation for clipping / bounding boxes (only moving vertices is supported),
sequence atlases, draw-order folders, binary files of Spine 4.0 – 4.2,
collaboration.

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
