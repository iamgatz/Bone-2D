# План реализации Bone 2D

Отмечаю `[x]` по мере выполнения (сверху вниз = порядок работы).

## Фаза 0 — Каркас
- [x] Vite + React + TS strict, зависимости, конфиги, preview-конфиг в Desktop/.claude/launch.json
- [x] core/math, core/ids, core/curve (Безье как в рантайме)
- [x] core/model (типы документа)

## Фаза 1 — Ядро анимации
- [x] compileSkeleton + pose (world transform, inherit-режимы, updateLocalTransform)
- [x] animate: rotate/translate/scale/shear/color/attachment/IK/transform-mix/deform/draw order/events
- [x] constraints: IK (1–2 кости), transform (4.3), update cache
- [x] skinning: region/mesh → мировые вершины (веса, deform)
- [x] store (immer, история, коалесценс жестов), actions
- [x] Spine JSON 4.3 экспорт + атлас-паковщик + ZIP + preview.html (официальный плеер)
- [x] Тесты + дифф-тест против spine-core 4.3 (46 тестов)

## Фаза 2 — Рендер и вьюпорт
- [x] WebGL2 рендерер (батчи, текстуры, blend, tint) + Canvas2D оверлей + камера
- [x] Импорт PNG (drag&drop), ассеты, создание слота+региона
- [x] Инструменты: select, create bone, translate/rotate/scale, mesh, weights, IK

## Фаза 3 — UI
- [x] Layout (панели, ресайз), тулбар, тема, горячие клавиши
- [x] Tree (иерархия, drag-reparent, rename, видимость), Inspector (поля, math-ввод)
- [x] Setup/Animate, список анимаций, auto-key, Dopesheet, плейбек, loop
- [x] Save/Load/Autosave, Export-диалог

## Фаза 4 — Риггинг
- [x] Меши: трейс альфы, Delaunay, правка вершин
- [x] Веса: bind, auto-weights, кисть, нормализация; deform-ключи
- [x] IK-инструмент и таймлайн mix/bend; transform-констрейнты 4.3 (UI создания и правки)
- [x] Скины (подмена картинки), draw order (ключи), events
- [x] Graph editor (Безье-ручки), пресеты кривых

## Фаза 5 — Дальше
- [x] Слайдеры 4.3 (модель, рантайм по официальному `Slider.js`, экспорт, UI, дифф-тест, случайные сессии)
- [ ] Кейинг transform-миксов в таймлайне
- [x] clipping, bounding box, point (раунд 3, см. `ROUND3.md`)
- [ ] two-color tint (`rgba2`/`rgb2`, рендер и UI), path/physics-констрейнты, linked mesh
- [x] Импорт Spine 4.3 JSON + атлас (round-trip идемпотентен)
- [ ] Бинарный экспорт (`.skel`), onion skin, импорт Spine 4.0–4.2

## Раунд 2 — ревью и продолжение (см. `ROUND2.md`)
- [x] Ревью ядра/экспорта: 15+ дефектов найдено и исправлено с регресс-тестами
- [x] Property/fuzz-тест (случайные действия, undo/redo, официальный рантайм), валидатор документа
- [x] Ручная проверка dopesheet / graph editor / кисти весов в браузере (баг graph editor найден и исправлен)
- [x] Перенос модели обновления 4.3 (ленивые world/local, `modifyLocal/modifyWorld`), float32-π
- [x] Слайдеры 4.3
- [x] Импорт Spine JSON
