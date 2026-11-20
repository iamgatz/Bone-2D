# Architecture

A short map for someone who wants to change the code. The deeper design notes are in [docs/history](history) (in Russian).

## The idea

Bone 2D is a skeletal animation editor whose **document is plain data** and whose **solver is our own code that is checked against the official Spine 4.3 runtime**.
Everything that decides how a skeleton looks lives in `src/core` and has no DOM, so it runs in the browser, in the tests and in the command line the same way.

```
 UI (React, Canvas2D overlay)  ──►  actions (src/store)  ──►  document (immer patches)  ──►  core (pure logic)
                                                                    │
                                                                    └──►  export (Spine JSON / binary / atlas)  ──►  official spine-core (tests)
```

## Folders

| Folder | What is in it |
|---|---|
| `src/core` | The model (`model.ts`), the solver (`skeleton.ts`: pose, inherit modes, IK, transform / path / physics / slider constraints, skinning), animation sampling (`animate.ts`), curves (`curve.ts`: the same 10-segment Bézier approximation as the runtime), meshes, weights, clipping, the document check and repair (`validate.ts`), the editing helpers (key tools, checkpoints, merge, time shift, ...). No DOM. |
| `src/core/export`, `src/core/import` | Spine JSON and binary writer / reader, the atlas packer, the GIF / APNG / ZIP encoders, the review player page. |
| `src/store` | The document store (`doc.ts`: immer patches, one undo step per gesture), the UI store, the settings, and the actions that the UI calls (`actions.ts` and the `*Actions.ts` files). |
| `src/render` | The WebGL2 renderer: batches, blend modes, two-color tint, stencil clipping. |
| `src/editor` | The React panels, the viewport (tools and the overlay), the dopesheet and the graph editor, the hotkey table, the command palette. |
| `src/i18n` | English / Russian. UI texts stay English in the components and are translated while rendering. |
| `src/player` | The standalone page a reviewer opens to look at an animation and leave comments. |
| `cli` | `npm run cli`: export and check a project without the editor. |
| `tests` | Vitest: unit tests, differential tests against the official runtime, and the random editor sessions (fuzzer). |

## Three rules that keep it correct

1. **The document is immutable data.** Every change goes through `docStore.update(label, recipe)`; the result is one undo step. A drag is grouped with `beginGesture` / `endGesture`.
2. **A feature is done when it goes through the whole chain:** model → validator → solver → export → import → differential test against the official runtime → UI → an operation in the fuzzer kit (`tests/fuzzkit.ts`).
3. **Nothing is shown that the export cannot carry**, or it is marked as editor-only.

## How the export is verified

- `tests/spine-parity.test.ts` and friends export a deliberately difficult rig, load it with `@esotericsoftware/spine-core` 4.3 and compare the world matrices of every bone, mesh vertices, colors, attachments and the draw order with our solver at many moments.
- `tests/fuzz.test.ts` plays random sequences of real editor actions. After every step the document must need no repair and the export must load in the official runtime; at the end the two solvers are compared, "undo everything" returns the first document and "redo everything" the last.
- Mutant tests make sure the comparison is not vacuous.

Run the long fuzzer with `FUZZ_FROM=1 FUZZ_SEEDS=300 FUZZ_STEPS=100 npx vitest run tests/fuzz.test.ts`.

## Adding a UI string

Write the English text in the component and add its Russian translation to `src/i18n/ru.ts` (`{}` in a key matches any text, `{#}` a number). `npm test` fails when a static string has no translation.

## Adding a hotkey

Add it to the table in `src/editor/hotkeys.ts` and its action to `src/editor/keyActions.ts`; the tooltips, the shortcuts window and the handler all read the same table. The handler reads letters by the position of the key, so shortcuts work on non-Latin layouts too.
