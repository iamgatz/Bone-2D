# Исследование: Spine 4.3 и формат (выжимка)

Источники: esotericsoftware.com (blog «Spine 4.3 released», changelog), исходники рантайма ветки 4.3
(`spine-ts/spine-core/src/{SkeletonJson,Animation,BonePose,...}.ts`). Опубликованная страница «JSON export format»
описывает старую версию (3.8) — ей доверять нельзя.

## Версии
- Spine 4.3 stable — 14.05.2026. npm: `@esotericsoftware/spine-core` 4.3.13 (на 16.11.2026).
- Экспорт 4.3 несовместим с рантаймами 4.2 и наоборот → пишем **4.3**.

## Что нового в 4.3 (ориентир по функциональности)
Sliders (констрейнт, проигрывающий анимацию; ведётся костью или вручную) • Transform constraints: любое свойство
источника → любое свойство цели, clamp, local/world • Draw order folders с отдельными ключами • Inverse/convex
clipping • Linked mesh в другом слоте • Volumetric scaleY у IK/physics • Атлас на скин • Мульти-трейс мешей,
мульти-веса • Math в числовых полях • Problems view • HTML-экспорт плеера.

## JSON 4.3 — то, что реально читает рантайм
```
skeleton{hash,spine,x,y,width,height,referenceScale,fps,images,audio}
bones[]{name,parent,length,x,y,rotation,scaleX,scaleY,shearX,shearY,inherit,skin,color}
   inherit: normal|onlyTranslation|noRotationOrReflection|noScale|noScaleOrReflection (первая буква регистр не важна)
slots[]{name,bone,color(rrggbbaa),dark(rrggbb),attachment,blend,visible}
constraints[]{type: ik|transform|path|physics|slider, name, skin, ...}   ← порядок массива = порядок применения
   ik: bones[1..2], target, mix, softness, bendPositive, compress, stretch, scaleY
   transform: bones[], source, localSource, localTarget, additive, clamp,
              properties{from:{offset,to:{prop:{offset,max,scale}}}}, rotation/x/y/scaleX/scaleY/shearY, mixRotate/X/Y/ScaleX/ScaleY/ShearY
   slider: additive, loop, mix, [bone, property, from, to, scale, max, local] | time, animation
skins[]{name, bones[], ik[], transform[], path[], physics[], slider[], attachments{slot:{name:attachment}}}
attachments: region{path,x,y,scaleX,scaleY,rotation,width,height,color,sequence}
             mesh{path,uvs,triangles,vertices,hull,edges,color,width,height}
             linkedmesh = mesh + {source, slot?, skin?, timelines}
             boundingbox/clipping/path{vertexCount,vertices,...}  clipping{end,convex,inverse}  point{x,y,rotation}
vertices: невзвешенные = [x,y,...]; взвешенные = на вершину [n, (boneIdx, bindX, bindY, weight)*n]
          взвешенность определяется: vertices.length != uvs.length
events{name:{int,float,string,audio,volume,balance}}
animations{name:{slots{slot:{attachment,rgba,rgb,alpha,rgba2,rgb2}}, bones{bone:{rotate,translate,translatex,translatey,
   scale,scalex,scaley,shear,shearx,sheary,inherit}}, ik{}, transform{}, path{}, physics{}, slider{c:{time,mix}},
   attachments{skin:{slot:{att:{deform,sequence}}}}, drawOrder[], drawOrderFolder[], events[]}}
```
Ключи: `time`, одноканальные — `value`; многоканальные — `x`,`y` / `color` / `light`+`dark`; `curve`: нет = linear,
`"stepped"`, или массив `[cx1,cy1,cx2,cy2, ...]` по 4 числа на канал (cx — **секунды**, cy — **значение**).
`rotate`/`translate`/`shear` — относительно setup, `scale` — множитель setup, цвета — абсолютные.
Deform: `offset`+`vertices` — смещения; у невзвешенных рантайм прибавляет setup-вершины, у взвешенных смещение
хранится **на каждое влияние** (2 числа на influence) и прибавляется к bind-позиции в локальных осях кости.
drawOrder: `offsets:[{slot,offset}]`.

## Математика, которую повторяем
- Безье: 10 сегментов (forward differencing), значение берётся линейной интерполяцией между точками.
- Мировая трансформация кости: Normal / OnlyTranslation / NoRotationOrReflection / NoScale / NoScaleOrReflection
  (см. `BonePose.updateWorldTransform`); updateLocalTransform — обратное преобразование.
- Update cache: кости в порядке иерархии, констрейнты в порядке массива; IK-цели сортируются до констрейнта.
- IK 1–2 кости (law of cosines, softness, bendDirection, stretch/compress, scaleY mode).

## Конкуренты / ориентиры
- **Spine** (эталон: Setup/Animate, дерево, dopesheet+graph, меши/веса, констрейнты).
- **SkelForm**, **Rigby2D**, **keyframe.it** — молодые 2D-скелетные редакторы (десктоп/веб), слабее по мешам/формату.
- **Rive** — эталон веб-редактора по UX; **Figma** — эталон архитектуры (WASM-ядро + WebGL-холст).
- DragonBones — заморожен. Spriter — без мешей.
Вывод: незанятая ниша — полноценный веб-редактор со Spine-совместимым экспортом.
