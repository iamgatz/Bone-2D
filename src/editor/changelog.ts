/**
 * What changed, newest first. The Updates window shows it, and the dot on its button lights up when the newest entry has not been opened yet.
 * Every line has both languages here (the language runtime translates the interface, not data), so a new entry is one object.
 */
export interface Release {
  /** Shown as the title; also what the "seen" mark remembers. */
  version: string;
  date: string;
  en: string[];
  ru: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: '0.12',
    date: '2026-11-17',
    en: [
      'Playback window (Windows menu): speed, loop, ping-pong and a play range that you set from the playhead; the range is shown on the ruler and what is outside it is dimmed.',
      'Save now writes to the file the project came from (Ctrl+S, no dialog); Save as… (Ctrl+Shift+S) asks where. The Welcome window lists recent projects (Chrome, Edge and other browsers with file handles).',
      'Export size: 100% / 75% / 50% / 25% / 200%. The pictures of the atlas and the skeleton (bones, meshes, translations, constraints) are scaled together, the way the official loader scales; checked against it.',
      'Images window: folders (a / in the name), rename (attachments follow), replace the picture under the same name, unused images marked and a button that removes them.',
      'Weights: Prune (drops influences under 5% and keeps at most 4 bones per vertex) and Mirror L→R / R→L (copies the weights of one half to the other, bones swapped for their mirror twins).',
      'Timeline: Ctrl+Alt-drag a key to offset keys round the loop (what leaves the end comes back at the start), and a Zoom to keys button.',
      'A slider without an animation no longer changes the update order of the bones, which could make a path constraint differ from the exported file (found by the random-session tests).',
    ],
    ru: [
      'Окно «Воспроизведение» (меню «Окна»): скорость, цикл, туда-обратно и диапазон воспроизведения, который задаётся от маркера; диапазон виден на линейке, всё вне его затемнено.',
      'Сохранить теперь пишет в тот же файл, из которого открыт проект (Ctrl+S, без диалога); «Сохранить как…» (Ctrl+Shift+S) спрашивает, куда. В окне приветствия виден список недавних проектов (Chrome, Edge и другие браузеры с файловыми хэндлами).',
      'Размер экспорта: 100% / 75% / 50% / 25% / 200%. Картинки атласа и скелет (кости, меши, смещения, констрейнты) масштабируются вместе, как это делает официальный загрузчик; сверено с ним.',
      'Окно «Картинки»: папки (/ в имени), переименование (вложения следуют за именем), замена картинки под тем же именем, неиспользуемые помечены, кнопка убирает их.',
      'Веса: «Очистить» (убирает влияния слабее 5% и оставляет не больше 4 костей на вершину) и «Зеркало Л→П / П→Л» (копирует веса одной половины на другую, кости заменяются зеркальными двойниками).',
      'Таймлайн: Ctrl+Alt-перетаскивание ключа сдвигает ключи по кругу (ушедшее за конец возвращается в начало) и кнопка «Масштаб по ключам».',
      'Слайдер без анимации больше не меняет порядок обновления костей: из-за него path-констрейнт мог отличаться от экспортированного файла (нашли случайные сессии в тестах).',
    ],
  },
  {
    version: '0.11',
    date: '2026-11-17',
    en: [
      'Binary .skel: Export → Skeleton file → Binary (about half the size of the JSON), and File → Import Spine data opens .skel files of Spine 4.3. Both are checked against the official SkeletonBinary loader, including files written the way Spine writes them (split timelines, separate rgb and alpha, linked meshes, sequences, audio events).',
    ],
    ru: [
      'Бинарный .skel: Экспорт → Файл скелета → Бинарный (примерно вдвое меньше JSON), а Файл → Импорт данных Spine открывает .skel от Spine 4.3. Оба направления сверены с официальным загрузчиком SkeletonBinary, в том числе на файлах в том виде, как их пишет Spine (раздельные таймлайны, отдельные rgb и alpha, linked mesh, sequences, события со звуком).',
    ],
  },
  {
    version: '0.10',
    date: '2026-11-17',
    en: [
      'Skins window (Windows menu): the skins with their own attachments, a copy of a skin, and the skin scope: lock a bone or a constraint so it exists only in the skins you tick (a hat, a second tail), like Spine\'s skin bones and skin constraints.',
      'Fixed against the official runtime: bones, slots and constraints that a skin does not activate are now skipped by animations exactly as in Spine, and a bone below a skin-required bone is required too.',
    ],
    ru: [
      'Окно «Скины» (меню «Окна»): скины с их собственными вложениями, копия скина и скоуп скина: замок на кости или констрейнте делает её существующей только в отмеченных скинах (шляпа, второй хвост), как skin bones и skin constraints в Spine.',
      'Исправлено по официальному рантайму: кости, слоты и констрейнты, которые скин не включает, анимации теперь пропускают в точности как в Spine, а кость под «только для скинов» тоже становится такой.',
    ],
  },
  {
    version: '0.9',
    date: '2026-11-17',
    en: ['New demo rig "Kit": a fox with weighted meshes, IK legs, a physics tail, ears and scarf, two skins (red and arctic) and four animations (idle, walk, wave, jump) with blinking, a draw-order change and events. Try it from the Welcome window.'],
    ru: ['Новый демо-риг «Kit»: лиса с мешами и весами, IK-ногами, физичным хвостом, ушами и шарфом, двумя скинами (рыжий и арктический) и четырьмя анимациями (idle, walk, wave, jump) с морганием, сменой порядка отрисовки и событиями. Открыть можно из окна приветствия.'],
  },
  {
    version: '0.8',
    date: '2026-11-17',
    en: [
      'Export an animation to a transparent GIF, a PNG sequence (ZIP) or a WebM video: Export, Animation tab. In the data export you can choose which animations go in, power-of-two pages and the preview page.',
      'Command palette (Ctrl+K): any command, tool, window or animation by name. History window: every step, click to go back or forward to it.',
      'Welcome window with the ways to start (demo, new, open, import from Spine), first steps and links.',
    ],
    ru: [
      'Экспорт анимации в GIF с прозрачностью, последовательность PNG (ZIP) или видео WebM: Экспорт, вкладка «Анимация». В экспорте данных можно выбрать, какие анимации попадут в файл, страницы степени двойки и страницу предпросмотра.',
      'Палитра команд (Ctrl+K): любая команда, инструмент, окно или анимация по названию. Окно «История»: все шаги, клик возвращает или двигает вперёд до нужного.',
      'Окно приветствия: способы начать (демо, новый, открыть, импорт из Spine), первые шаги и ссылки.',
    ],
  },
  {
    version: '0.7',
    date: '2026-11-17',
    en: [
      'Windows menu: open and close Hierarchy, Images, Animations, Metrics, Inspector and Timeline, ready layouts, F9 hides everything. The choice is remembered.',
      'New windows: Animations (folders by "/" in the name, duplicate, rename, clean up) and Metrics (bones, meshes, vertices, keys and what looks forgotten before an export).',
      'Settings (F12): language, autosave, viewport background, smoothing, zoom to mouse, onion skin frames, and tool letters you can change.',
      'Shear tool (H); Edit menu with Duplicate and Mirror bones (Ctrl+D, Ctrl+Shift+D), Reset / Copy / Paste pose.',
      'Animation: onion skin (faded poses before and after the playhead), Clean Up removes keys that change nothing, Alt-drag a key to shift the keys after it too.',
    ],
    ru: [
      'Меню «Окна»: открывайте и закрывайте Иерархию, Картинки, Анимации, Сводку, Инспектор и Таймлайн, готовые раскладки, F9 прячет всё. Выбор запоминается.',
      'Новые окна: Анимации (папки по «/» в названии, дубль, переименование, очистка) и Сводка (кости, меши, вершины, ключи и что похоже на забытое перед экспортом).',
      'Настройки (F12): язык, автосохранение, фон вьюпорта, сглаживание, зум в курсор, кадры onion skin и буквы инструментов, которые можно менять.',
      'Инструмент Shear (H); меню «Правка» с дублированием и зеркальной копией костей (Ctrl+D, Ctrl+Shift+D), сброс / копирование / вставка позы.',
      'Анимация: onion skin (бледные позы до и после маркера), Clean Up убирает ключи, которые ничего не меняют, Alt-перетаскивание ключа сдвигает и ключи после него.',
    ],
  },
  {
    version: '0.6',
    date: '2026-11-17',
    en: [
      'New: Updates window with this list and the live activity of the project, and a Feedback window for bug reports, ideas and missing features.',
      'Interface round: design tokens, tooltips with hotkeys, one shared set of controls and inspectors, a grouped shortcuts window, keyboard navigation in menus and dialogs.',
      'Physics constraints (Spine 4.2+): swing, push, stretch and shear of a bone with inertia, strength, damping, mass, wind and gravity; keyable, exported and imported.',
    ],
    ru: [
      'Новое: окно «Обновления» с этим списком и живой лентой активности проекта, и окно «Обратная связь» для ошибок, идей и недостающих функций.',
      'Раунд интерфейса: токены дизайна, подсказки с горячими клавишами, единый набор контролов и инспекторов, окно горячих клавиш по группам, клавиатура в меню и диалогах.',
      'Констрейнты физики (Spine 4.2+): качание, толчок, растяжение и сдвиг кости с инерцией, силой, затуханием, массой, ветром и гравитацией; ключи, экспорт и импорт.',
    ],
  },
  {
    version: '0.5',
    date: '2026-11-17',
    en: ['Import of Spine 4.0, 4.1 and 4.2 JSON: converted to the 4.3 structure on the way in.', 'Random-session tests now judge ill-conditioned poses by how far the official runtime moves on its own.'],
    ru: ['Импорт Spine JSON 4.0, 4.1 и 4.2: по пути конвертируется в структуру 4.3.', 'Случайные сессии в тестах судят плохо обусловленные позы по тому, насколько сам официальный рантайм «плавает».'],
  },
  {
    version: '0.4',
    date: '2026-11-16',
    en: ['Path attachments and path constraints (Spine 4.3): tool N, bezier nodes and handles, every rotate / position / spacing mode, weights and deform.', 'Transform-constraint mixes can be keyed in the timeline.'],
    ru: ['Path-вложения и path-констрейнты (Spine 4.3): инструмент N, узлы и ручки безье, все режимы вращения / позиции / интервала, веса и деформация.', 'Миксы transform-констрейнтов можно ключевать на таймлайне.'],
  },
  {
    version: '0.3',
    date: '2026-11-16',
    en: ['Two-color tint (light and dark color): shader, inspector, dopesheet and graph, export and import.'],
    ru: ['Двухцветный тинт (светлый и тёмный цвет): шейдер, инспектор, дорожка и график, экспорт и импорт.'],
  },
  {
    version: '0.2',
    date: '2026-11-16',
    en: ['Russian interface: switch EN / RU in the top bar, the choice is remembered.'],
    ru: ['Русский интерфейс: переключатель EN / RU в верхней панели, выбор запоминается.'],
  },
  {
    version: '0.1',
    date: '2026-11-16',
    en: ['First public version: bones, meshes, weights, IK, transform constraints, sliders, clipping, bounding boxes, points, skins, events, dopesheet and graph, Spine 4.3 export checked against the official runtime.'],
    ru: ['Первая публичная версия: кости, меши, веса, IK, transform-констрейнты, слайдеры, клиппинг, боксы, точки, скины, события, дорожка и график, экспорт Spine 4.3 с проверкой по официальному рантайму.'],
  },
];

export const LATEST = CHANGELOG[0].version;

export const REPO = 'iamgatz/Bone-2D';
export const SITE = 'https://iamgatz.github.io/Bone-2D/';
