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
    version: '0.43',
    date: '2026-11-19',
    en: [
      "Rotation limit: a bone can be kept inside a sector of angles (Inspector → Rotation limit). The sector is drawn in the scene; the bone follows a control bone and stops at the ends of the sector. It is a Spine 4.3 transform constraint with a clamp, so it exports and plays in every runtime. Rotating or keying the limited bone goes to the control bone, so dragging past the sector keeps turning the control and the bone follows as soon as it is back.",
      "Chain curve (Inspector, for a tail or a spine): spread one physics value (strength, damping, inertia, mass, mix, wind, gravity) over the bones of a chain along a curve instead of typing it bone by bone. Missing physics constraints are created.",
      "Tween (Animation tools): a slider that puts the selected bones between the keys before and after the playhead (0% previous key, 100% next, beyond that overshoots) and keys them there; one drag is one undo step.",
      "Mute: a speaker button on a bone, slot or constraint row of the timeline plays the animation without those keys, to compare with and without. The keys stay and the export does not change. The zoom button falls back to the loop range when no keys are selected. Pasting a key that repeats the value already there keeps the curve that was drawn on it."
    ],
    ru: [
      "Предел поворота: кость можно удержать в секторе углов (Инспектор → «Предел поворота»). Сектор рисуется на сцене; кость следует за костью-управлением и останавливается на краях сектора. Это transform-констрейнт Spine 4.3 с clamp, поэтому он экспортируется и работает в любом рантайме. Вращение и ключи ограниченной кости уходят в кость-управление: если тянуть за сектор, управление продолжает крутиться, а кость следует, как только оно вернулось.",
      "Кривая по цепочке (Инспектор, для хвоста или позвоночника): одно значение физики (сила, затухание, инерция, масса, mix, ветер, гравитация) раскладывается по костям цепочки вдоль кривой, а не вводится по одной кости. Недостающие физические констрейнты создаются.",
      "Tween (Animation tools): ползунок ставит выбранные кости между ключами до и после текущего кадра (0% предыдущий ключ, 100% следующий, дальше — перелёт) и ключует их там; одно перетаскивание — один шаг отмены.",
      "Mute: кнопка с динамиком на строке кости, слота или констрейнта в таймлайне проигрывает анимацию без этих ключей, чтобы сравнить «с» и «без». Ключи остаются, экспорт не меняется. Кнопка масштаба без выбранных ключей берёт диапазон цикла. Вставка ключа, повторяющего значение, которое уже там, оставляет нарисованную на нём кривую."
    ],
  },
  {
    version: '0.42',
    date: '2026-11-19',
    en: [
      "Timeline markers: flags with a name, a colour and a note (Animation tools → Markers, or the command palette). They show on the ruler and as a faint line down the keys; double-click one to edit it. Split at markers cuts the animation into one clip per stretch, each clip moving exactly like the original did there.",
      "Animation tools: Wiggle (random noise on the selected keys' timelines, with a seed so it is repeatable), Mirror a half cycle (animate one step, get the whole cycle with left and right swapped, as a new animation), Foot slide (finds where a planted foot drags along the ground), Hide bones without keys.",
      "Split bone can now share the weights of the meshes that follow the bone: each vertex goes to the part it lies on, or blends smoothly around each cut, and the deform keys follow. Splitting the first bone of an IK chain nested is refused with a note (the second bone would leave the first one).",
      "Export: the mix table (crossfade times between animations) is written as <name>.mixes.json next to the skeleton, in the editor and with the command line (--no-mixes leaves it out). The export dialog can copy its settings as text.",
      "Draw order list: slots of a draw order folder that sit next to each other are grouped under the folder's name and can be folded. Dropping a folder of numbered pictures (frame01 …) on the scene makes one slot with a sequence for each series. Update from PSD ignores the shift a bigger canvas gives every layer. The event waveform shows on the events row of the dopesheet when the sound is loaded. The Preview can open in a window of its own."
    ],
    ru: [
      "Маркеры на таймлайне: флажки с именем, цветом и заметкой (Animation tools → Markers или палитра команд). Видны на линейке и тонкой линией сквозь ключи; двойной щелчок открывает правку. «Разрезать по маркерам» делает клип на каждый отрезок, и каждый клип двигается точно как оригинал на этом отрезке.",
      "Animation tools: «Дрожь» (случайный шум на таймлайнах выбранных ключей, с зерном, чтобы повторялось), «Зеркало полуцикла» (анимируете один шаг, получаете весь цикл с поменянными левым и правым, новой анимацией), «Скольжение стопы» (находит, где стопа на земле ползёт), «Скрыть кости без ключей».",
      "Разрезание кости теперь может поделить веса мешей, которые за ней следуют: каждая вершина уходит в часть, на которой лежит, или плавно делится у каждого разреза, ключи деформации идут следом. Разрезать цепочкой первую кость IK-цепи нельзя: об этом говорится в заметке (вторая кость ушла бы из-под первой).",
      "Экспорт: таблица переходов (времена перехода между анимациями) пишется файлом <имя>.mixes.json рядом со скелетом, в редакторе и в командной строке (--no-mixes отключает). В диалоге экспорта настройки можно скопировать текстом.",
      "Список порядка отрисовки: слоты папки порядка отрисовки, идущие подряд, собраны под именем папки и сворачиваются. Папка пронумерованных картинок (frame01 …), брошенная на сцену, даёт один слот с последовательностью на каждую серию. «Обновить из PSD» не считает правкой сдвиг, который расширенный холст даёт всем слоям. Волна звука события видна на ряду событий в доупшите, когда звук загружен. Просмотр можно открыть в отдельном окне."
    ],
  },
  {
    version: '0.41',
    date: '2026-11-18',
    en: [
      "Split X / Y keys (Spine's translateX / translateY, scaleX / scaleY, shearX / shearY): in Animate mode the Inspector has a Split X / Y switch for position, scale and shear (also in the timeline menu and the command palette). A split channel keeps its keys but has one timeline per axis, each with its own key times and curves; auto-key and the Key buttons then key only the axis you change. Merging joins the axes again. The solver, JSON and binary export and import all handle them and are checked against the official runtime; before, a Spine file with split timelines lost the second axis on import.",
      "Key dialog: double-click a key in the dopesheet (or right-click → Edit key…, or the command palette) to type its frame, its values, its interpolation and the bezier handles of its curve."
    ],
    ru: [
      "Разделённые ключи X / Y (translateX / translateY, scaleX / scaleY, shearX / shearY в Spine): в режиме Animate в Инспекторе есть переключатель «Разделить X / Y» для позиции, масштаба и сдвига (а также в меню таймлайна и в палитре команд). Разделённый канал сохраняет ключи, но у каждой оси свой таймлайн со своими временами и кривыми; автоключ и кнопки ключей ставят ключ только на ось, которую вы меняете. «Склеить» объединяет оси обратно. Солвер, экспорт и импорт JSON и binary поддерживают такие таймлайны и сверены с официальным рантаймом; раньше файл Spine с разделёнными таймлайнами терял вторую ось при импорте.",
      "Диалог ключа: двойной щелчок по ключу в доупшите (или правая кнопка → «Править ключ…», или палитра команд) — можно ввести кадр, значения, интерполяцию и маркеры безье кривой."
    ],
  },
  {
    version: '0.40',
    date: '2026-11-18',
    en: [
      "Several skeletons in one project: at the top of the Hierarchy pick the skeleton to edit, add an empty one, duplicate or delete the edited one. The pictures are shared (an image another skeleton shows counts as used, a rename follows into all of them); the pose library and the mix table belong to each skeleton. Export has a Skeleton choice (the edited one, any, or all in one ZIP, a folder each); the command line writes a file for every skeleton (--skeleton picks one).",
      "Key Edited (K): keys only the channels you changed since the last key, for example only the rotation after you turned a bone; with nothing pending it keys everything of the selected bones. Ctrl+Shift+L always keys all channels (Key Shown in Spine).",
      "Floating windows (Windows → Floating: Slot color, Mesh tools, Weights): the same controls as in the Inspector in windows that hover over the viewport, can be dragged and stay where you leave them. While one is open the Inspector does not repeat its controls.",
      "Backups (History window, Backups): the editor keeps copies of the project in the browser, every five minutes of work, before you open another file or start a new project, and when you press Back up now. Restore brings one back (what was open is backed up first), the trash button deletes one.",
      "Command line: export --atlas packs the pictures into the atlas and PNG pages with the same packer as the editor (--max-size, --padding, --no-pot, --trim, --rotate, --filter, and --scale for smaller pictures). PNG only; other picture formats are left out with a note.",
      "Fixed: the atlas packer could make a page bigger than the page size limit when there were many pictures; the deform keys of a linked mesh that has its own deform no longer break when the weights of its source change."
    ],
    ru: [
      "Несколько скелетов в одном проекте: вверху иерархии выберите скелет для правки, добавьте пустой, дублируйте или удалите редактируемый. Картинки общие (картинка, которую показывает другой скелет, считается используемой, переименование доходит до всех); библиотека поз и таблица переходов у каждого скелета свои. В экспорте есть выбор скелета (редактируемый, любой или все в одном ZIP, по папке на каждый); командная строка пишет файл для каждого скелета (--skeleton выбирает один).",
      "Key Edited (K): ключ только на те каналы, что вы изменили с прошлого ключа, например только на поворот после поворота кости; когда ничего не менялось, ключует всё у выбранных костей. Ctrl+Shift+L всегда ключует все каналы (Key Shown в Spine).",
      "Плавающие окна (Окна → Плавающее: цвет слота, инструменты меша, веса): те же элементы, что в Инспекторе, в окнах над вьюпортом; их можно перетаскивать, и они остаются там, где вы их оставили. Пока окно открыто, Инспектор не повторяет его элементы.",
      "Резервные копии (окно History, раздел Backups): редактор хранит копии проекта в браузере, каждые пять минут работы, перед открытием другого файла или новым проектом и по кнопке «Сделать копию сейчас». «Вернуть» возвращает копию (открытое сперва тоже сохраняется), корзина удаляет копию.",
      "Командная строка: export --atlas пакует картинки в атлас и страницы PNG тем же упаковщиком, что и редактор (--max-size, --padding, --no-pot, --trim, --rotate, --filter, а --scale даёт уменьшенные картинки). Только PNG; другие форматы картинок остаются за атласом с пометкой.",
      "Исправлено: упаковщик атласа мог сделать страницу больше предельного размера, когда картинок много; ключи деформации связанного меша со своей деформацией больше не ломаются, когда меняются веса его источника."
    ],
  },
  {
    version: '0.39',
    date: '2026-11-17',
    en: ['Draw order folders (new in Spine 4.3): put slots into a folder (Inspector, slot, Folder) and the draw order of the folder is keyed on its own. In Animate mode, dragging a slot of a folder in the Hierarchy keys the folder only: its slots swap places among the seats they hold, the other slots stay where they are. Every folder with keys gets its own row in the dopesheet. Export (JSON and binary) and import of Spine files with draw order folders work and are checked against the official runtime; before, imported folder timelines were dropped.'],
    ru: ['Папки порядка отрисовки (новое в Spine 4.3): положите слоты в папку (Инспектор, слот, «Папка»), и порядок отрисовки папки ключуется отдельно. В режиме Animate перетаскивание слота папки в иерархии ставит ключ только папки: её слоты меняются местами на тех местах, что они занимают, остальные слоты остаются на месте. У каждой папки с ключами свой ряд в доупшите. Экспорт (JSON и binary) и импорт файлов Spine с такими папками работают и сверены с официальным рантаймом; раньше импортированные таймлайны папок отбрасывались.'],
  },
  {
    version: '0.38',
    date: '2026-11-17',
    en: ['Command line: `npm run cli -- export project.bone2d out/` writes the Spine 4.3 skeleton data (JSON or binary, scale, pretty, without editor-only data) and the pictures of the project without opening the editor, for a build step or CI; `info` counts what a project holds, `check` lists what is damaged (exit code 1). The atlas is still packed by the editor.'],
    ru: ['Командная строка: `npm run cli -- export project.bone2d out/` пишет данные скелета Spine 4.3 (JSON или binary, масштаб, с отступами, без данных только для редактора) и картинки проекта, не открывая редактор, для шага сборки или CI; `info` считает, что в проекте, `check` перечисляет повреждения (код выхода 1). Атлас по-прежнему пакует редактор.'],
  },
  {
    version: '0.37',
    date: '2026-11-17',
    en: [
      'Preview window (Windows → Preview): a small view of its own that plays an animation the way a game would. Choose an animation, loop, speed, pause; when you change to another animation the bones crossfade over the mix time. The mix table sits right there: a default time and times for single pairs of animations (saved in the project, not part of the Spine export, because Spine keeps it in the runtime code). Events that fire show up as chips; load sound files with the speaker button and an event plays the file with the name of its sound.',
      'Mesh view buttons (Inspector, Mesh, with the Edit mesh or Weights tool on): Wireframe hides the triangle edges, Dim darkens everything outside the mesh, Isolate hides it, Freeze lets you select vertices without dragging them.',
    ],
    ru: [
      'Окно «Просмотр» (Окна → Просмотр): отдельный маленький вид, который проигрывает анимацию так, как это сделает игра. Выбор анимации, повтор, скорость, пауза; при смене анимации кости плавно переходят за время перехода. Таблица переходов там же: время по умолчанию и время для отдельных пар анимаций (хранится в проекте, в экспорт Spine не попадает: Spine держит её в коде рантайма). Сработавшие события появляются метками; загрузите звуковые файлы кнопкой с динамиком, и событие проиграет файл с именем своего звука.',
      'Кнопки вида меша (Инспектор, «Сетка», при включённом инструменте сетки или весов): «Каркас» убирает рёбра треугольников, «Затемнить» затемняет всё вне меша, «Изолировать» скрывает его, «Заморозить» позволяет выделять вершины, не сдвигая их.',
    ],
  },
  {
    version: '0.36',
    date: '2026-11-17',
    en: ['Mesh edges like in Spine: draw an edge between two vertices (Ctrl+drag from one vertex to another with the mesh tool, or select two vertices and press Edge in the Mesh section; do it again to remove it) and the triangulation never crosses it, so you decide how the mesh bends. Manual edges are orange, the outline is cyan. The outline itself is now always kept as edges, so a concave outline (an L, a tail) no longer gets triangles that cut across it. The edges are saved with the project and written to the JSON and binary export as nonessential data (edges of imported Spine files are not used: the format does not say how their indices count). Vertex edits renumber the edges; Retriangulate and Clear edges rebuild the triangles.'],
    ru: ['Рёбра меша, как в Spine: проведите ребро между двумя вершинами (Ctrl+перетаскивание от вершины к вершине инструментом меша, либо выберите две вершины и нажмите «Ребро» в разделе «Меш»; ещё раз — ребро убирается), и триангуляция его никогда не пересекает, так что вы сами решаете, как сгибается меш. Ребра, проведённые вручную, оранжевые, контур — голубой. Сам контур теперь всегда остаётся рёбрами, поэтому у вогнутого контура (буква Г, хвост) больше не появляются треугольники, режущие его насквозь. Рёбра сохраняются в проекте и пишутся в JSON и бинарный экспорт как необязательные данные (рёбра импортируемых файлов Spine не используются: формат не говорит, как считаются их индексы). Правки вершин перенумеровывают рёбра; «Перетриангулировать» и «Очистить» пересобирают треугольники.'],
  },
  {
    version: '0.35',
    date: '2026-11-17',
    en: ['Weights: the list of the bones a mesh follows (Inspector, Weights) shows each bone with its colour, the Lock toggle and a new Remove button. Remove makes the mesh stop following that bone: its weight goes to the other bones of each vertex in proportion, a vertex that followed only that bone goes to the parent bone, the vertices stay where they are. One step in the history.'],
    ru: ['Веса: список костей, за которыми следует сетка (Инспектор, «Веса»), показывает каждую кость с её цветом, переключателем замка и новой кнопкой «Убрать». «Убрать» делает так, что сетка перестаёт следовать за костью: её вес переходит другим костям каждой вершины пропорционально, вершина, которая следовала только за ней, переходит на родительскую кость, сами вершины остаются на месте. Один шаг в истории.'],
  },
  {
    version: '0.34',
    date: '2026-11-17',
    en: ['Weights view like in Spine: Pies draws a pie chart of the weights on every vertex while the Weights tool is on (the selected vertices larger), Overlay fills the mesh with the colours of its bones instead of the brush-bone heat map, Selected limits the pies to the selected vertices and the vertices weighted to selected bones and shows the other bones black in the overlay. Every bone keeps its own colour.'],
    ru: ['Просмотр весов, как в Spine: «Круги» рисуют на каждой вершине круговую диаграмму весов, пока включён инструмент весов (у выбранных вершин крупнее), «Заливка» красит сетку цветами её костей вместо тепловой карты кости кисти, «Выбранные» оставляют круги только у выбранных вершин и вершин с весом на выбранных костях, а в заливке остальные кости делают чёрными. У каждой кости свой постоянный цвет.'],
  },
  {
    version: '0.33',
    date: '2026-11-17',
    en: ['Weights: Update bindings (after you moved bones in the setup pose, the stored bind positions are stale and weight edits shift the vertices; this makes the bind pose the pose the bones have now, the mesh does not move) and Weld (this mesh takes the weights of another weighted mesh where it lies over it, blended by position; both need the same two or more bones; Overlapping limits it to the vertices over the other mesh, All gives the vertices outside the weights of the nearest triangle). Both work on the selected vertices when some are selected, each is one step in the history.'],
    ru: ['Веса: Обновить привязку (после сдвига костей в позе сборки сохранённые позиции привязки устаревают и правка весов сдвигает вершины; кнопка делает позой привязки текущую позу костей, сетка не двигается) и Слить (эта сетка берёт веса другой сетки там, где лежит поверх неё, с плавным переходом по положению; нужны те же две и более костей; «Перекрытие» — только вершины над другой сеткой, «Все» — вершинам снаружи достаются веса ближайшего треугольника). Оба работают на выбранных вершинах, если они выбраны, каждое — один шаг в истории.'],
  },
  {
    version: '0.32',
    date: '2026-11-17',
    en: ['Weights: Lock (a locked bone keeps its weights while you paint, the others share what is left), Feather on the brush (how much of its size fades out: 100% from the centre, 0% a hard edge), Copy weights and Paste weights between the same number of selected vertices.', 'Fixed: pasting two-colour (dark colour) keys onto a slot without a dark colour left the curve of the dark channels in the plain colour key; the document then needed repair. Found by the fuzz test.'],
    ru: ['Веса: Замок (кость с замком сохраняет свои веса при рисовании, остальные делят то, что осталось), Растушёвка кисти (какая часть размера затухает: 100% — от центра, 0% — жёсткий край), Копировать и Вставить веса между одинаковым числом выбранных вершин.', 'Исправлено: вставка ключей двух цветов (с тёмным цветом) на слот без тёмного цвета оставляла в обычном ключе кривую тёмных каналов, и документ потом требовал ремонта. Нашёл фаззер.'],
  },
  {
    version: '0.31',
    date: '2026-11-17',
    en: ['Weights, closer to Spine: Auto, Smooth and Prune now work only on the selected vertices when some are selected (select them with the mesh tool, M; with none selected they work on the whole mesh). Prune has its own settings: the most bones a vertex may keep and the weight below which an influence is removed. New Swap: two bones exchange their weights on the selected vertices or the whole mesh, the vertices stay where they are. Each is one step in the history.'],
    ru: ['Веса, ближе к Spine: Авто, Сглаживание и Очистка теперь работают только на выбранных вершинах, если они выбраны (выбираются инструментом сетки, M; без выбора — на всей сетке). У Очистки появились настройки: сколько костей может остаться у вершины и ниже какого веса влияние убирается. Новое: Обмен — две кости меняются весами на выбранных вершинах или на всей сетке, вершины остаются на месте. Каждое действие — один шаг в истории.'],
  },
  {
    version: '0.30',
    date: '2026-11-17',
    en: ['Split bone (Inspector, Split section, in Setup mode): cuts the selected bone into 2 to 32 shorter bones along its length. Nested makes a chain (every new bone is a child of the one before: tails, spines, tentacles), without it the parts stand side by side under the parent of the bone. Fibonacci makes each part shorter than the one before (5 3 2 1 1), otherwise the lengths are equal. The original keeps its name, slots, weights and keys and becomes the first part. In a chain the children of the bone move to the part they sit on, so a hand at the end of a forearm follows the last part. One step in the history.'],
    ru: ['Разрезать кость (Инспектор, раздел «Разрезать», режим Setup): делит выбранную кость вдоль на 2–32 коротких. «Цепочкой» — каждая новая кость ребёнок предыдущей (хвосты, позвоночники, щупальца), без неё части стоят рядом под родителем кости. «Фибоначчи» — каждая часть короче предыдущей (5 3 2 1 1), иначе длины равны. Исходная кость сохраняет имя, слоты, веса и ключи и становится первой частью. В цепочке дочерние кости переходят на ту часть, на которой сидят, поэтому кисть на конце предплечья идёт за последней частью. Один шаг в истории.'],
  },
  {
    version: '0.29',
    date: '2026-11-17',
    en: ['Set Parent (Shift+P, Edit menu, command palette): select bones (or a slot), start it, then click the new parent bone in the viewport or in the tree. The bones stay where they are, a selected slot moves to the clicked bone, the whole change is one step in the history, Esc or a click on nothing cancels. In Spine it is the P key; here P is the Point tool, so the key is Shift+P (and can be moved in Settings).'],
    ru: ['Назначить родителя (Shift+P, меню «Правка», палитра команд): выберите кости (или слот), запустите режим и кликните новую родительскую кость во вьюпорте или в дереве. Кости остаются на месте, выбранный слот переходит на кликнутую кость, всё это один шаг в истории, Esc или клик по пустому месту отменяют. В Spine это клавиша P, у нас P занята инструментом «Точка», поэтому Shift+P (клавишу можно поменять в Настройках).'],
  },
  {
    version: '0.28',
    date: '2026-11-17',
    en: ['Folders of images: drop a folder onto the Images window or the viewport (or use the new folder button of the Images window) and every picture in it is imported, subfolders included. The folders stay: "hero/arm/upper.png" is the picture "hero/arm/upper", shown in a folder of the Images window. Numbered files come in the natural order (frame2 before frame10). A whole folder is one step in the history. A folder dropped on the viewport only fills the Images window, it does not put a hundred slots on the scene.'],
    ru: ['Папки с картинками: перетащите папку в окно «Картинки» или во вьюпорт (или нажмите новую кнопку с папкой в окне «Картинки») — импортируются все картинки в ней, включая вложенные папки. Папки сохраняются: «hero/arm/upper.png» становится картинкой «hero/arm/upper» в папке окна «Картинки». Пронумерованные файлы идут в естественном порядке (frame2 раньше frame10). Вся папка — один шаг в истории. Папка, брошенная во вьюпорт, только наполняет окно «Картинки» и не ставит сотню слотов на сцену.'],
  },
  {
    version: '0.27',
    date: '2026-11-17',
    en: ['Update from PSD: the artist repaints the Photoshop file, the rig stays. The new button in the Images window reads a .psd and matches its layers to the pictures by name ("group/layer"): the matched pictures get the new pixels, a region attachment follows the new size and the way the layer moved (and keeps the scale you gave it), meshes keep their shape, a layer the project has not got yet becomes a new slot right above the layer under it in the file, and nothing is removed. One step in the history (the old pixels do not come back with Undo, as with Replace image).'],
    ru: ['Обновление из PSD: художник правит файл Photoshop, а риг остаётся. Новая кнопка в окне «Картинки» читает .psd и сопоставляет слои с картинками по имени («группа/слой»): совпавшие картинки получают новые пиксели, регион следует за новым размером и за тем, как сдвинулся слой (и сохраняет масштаб, который вы задали), меши сохраняют форму, слой, которого в проекте ещё нет, становится новым слотом сразу над нижележащим слоем файла, ничего не удаляется. Один шаг в истории (старые пиксели с Undo не возвращаются, как и при «Заменить картинку»).'],
  },
  {
    version: '0.26',
    date: '2026-11-17',
    en: ['Photoshop import: drop a .psd file into the window (or the Images window) and every visible layer becomes a picture and a slot with a region, bottom layer first, so the layer stack is the draw order. Groups become folders ("arm/upper"), layer opacity becomes the slot alpha, multiply / screen / linear dodge become Spine blend modes, hidden layers are skipped. The origin is the middle of the bottom edge of the document. One Undo removes the whole import.'],
    ru: ['Импорт из Photoshop: перетащите файл .psd в окно (или в окно «Картинки») — каждый видимый слой станет картинкой и слотом с регионом, нижний слой первым, так что стопка слоёв — это порядок отрисовки. Группы становятся папками («arm/upper»), прозрачность слоя — альфой слота, режимы multiply / screen / linear dodge — режимами наложения Spine, скрытые слои пропускаются. Начало координат — середина нижней кромки документа. Один Undo убирает весь импорт.'],
  },
  {
    version: '0.25',
    date: '2026-11-17',
    en: ['Every animation now has its own playback settings: Loop, Ping-pong and the play range (Playback window and the loop button of the timeline). They are saved with the project and not exported, so a walk can loop while a jump plays once, and the range you set on one animation no longer leaks into the others.'],
    ru: ['У каждой анимации теперь свои настройки воспроизведения: цикл, пинг-понг и диапазон (окно «Воспроизведение» и кнопка цикла в таймлайне). Они сохраняются в проекте и не попадают в экспорт: ходьба может идти по кругу, а прыжок играть один раз, и диапазон одной анимации больше не переходит на другие.'],
  },
  {
    version: '0.24',
    date: '2026-11-17',
    en: ['Linked meshes: a skin can dress a mesh in another picture and keep its shape, weights and deform. Pick a picture for a mesh in the "In skin" field of the Inspector (with a skin selected) and the skin gets a linked mesh of the same name that follows the mesh of the default skin. The shape of a linked mesh is always the shape of its source (edit the source, every linked mesh follows; the Unlink button cuts one loose), the deform animation of the source moves it too (Share deform), and the file carries the link: Spine JSON and binary files write and read real linkedmesh attachments, also from another slot or skin. Before, a linked mesh of an imported file became an independent copy.', 'View: Shift+F frames the selected bones (or the bone of the selected slot), Shift+Z sets the zoom to 100% (one scene unit per screen pixel). Both are in the View menu and the command palette, and can be moved in Settings.', 'Deform: in Animate mode the vertices that the current pose has moved are drawn in orange in the Mesh tool, so it is clear where a deform already is.'],
    ru: ['Linked mesh: скин может одеть сетку в другую картинку и оставить её форму, веса и деформацию. Выберите картинку для сетки в поле «В скине» инспектора (при выбранном скине) — в скине появится linked mesh с тем же именем, который повторяет сетку скина по умолчанию. Форма linked mesh всегда равна форме источника (правите источник — все связанные сетки следуют; кнопка «Отвязать» отрезает одну), анимация деформации источника двигает и её («Общая деформация»), а файл хранит связь: JSON и бинарные файлы Spine пишут и читают настоящие linkedmesh, в том числе из другого слота или скина. Раньше linked mesh из импортированного файла становился независимой копией.', 'Вид: Shift+F показывает выделенные кости (или кость выбранного слота), Shift+Z ставит масштаб 100% (одна единица сцены на пиксель экрана). Оба есть в меню «Вид» и в палитре команд, клавиши меняются в настройках.', 'Деформация: в режиме анимации вершины, которые текущая поза сдвинула, рисуются оранжевым в инструменте сетки — видно, где деформация уже есть.'],
  },
  {
    version: '0.23',
    date: '2026-11-17',
    en: ['Events: click an event in the Hierarchy to open it and set its default Int, Float and Text, and its Sound (the path of the sound file for the engine) with Volume and Balance. A key of the event in an animation can override the volume and balance. Sounds are kept in the Spine export (JSON and binary) and in the import, so Spine projects with sounds no longer lose them; the editor does not play them. Every event key of a sound is written with both numbers, because the official 4.3.13 JSON loader takes the volume of the definition as the default balance.', 'Pasting colour keys onto another slot: two-colour keys become plain colour keys when the slot has no dark colour.'],
    ru: ['События: щёлкните по событию в иерархии, чтобы открыть его и задать значения по умолчанию (целое, дробное, текст) и звук (путь к файлу звука для движка) с громкостью и балансом. Ключ события в анимации может переопределить громкость и баланс. Звуки сохраняются в экспорте Spine (JSON и бинарном) и в импорте, так что проекты Spine со звуками больше их не теряют; редактор звук не проигрывает. Каждый ключ события со звуком пишется с обоими числами, потому что официальный загрузчик JSON 4.3.13 берёт громкость описания как баланс по умолчанию.', 'Вставка ключей цвета на другой слот: двухцветные ключи становятся обычными, если у слота нет тёмного цвета.'],
  },
  {
    version: '0.22',
    date: '2026-11-17',
    en: ['Rulers, guides and snapping (View menu, and two buttons in the viewport): rulers along the top and left show the scene units. Drag a guide out of a ruler (from the top one a horizontal line, from the left one a vertical line), drag a guide to move it, drag it back onto its ruler to take it away; Clear guides removes them all. Guides are saved with the project and are not part of the export. Snap puts new bones and moved bones on the grid, and on a guide when one is close.'],
    ru: ['Линейки, направляющие и привязка (меню «Вид» и две кнопки во вьюпорте): линейки сверху и слева показывают единицы сцены. Вытащите направляющую из линейки (из верхней горизонтальную, из левой вертикальную), потяните её, чтобы сдвинуть, или верните на линейку, чтобы убрать; «Убрать направляющие» стирает все. Направляющие сохраняются в проекте и в экспорт не попадают. Привязка ставит новые и двигаемые кости на сетку, а рядом с направляющей — на неё.'],
  },
  {
    version: '0.21',
    date: '2026-11-17',
    en: ['Pasting keys: keys copied from one bone go onto the bone that is selected now, so the swing of one arm can be pasted onto the other (select the other bone and press Ctrl+V; several selected bones each get a copy). The same for the keys of one slot. With the same bone selected the keys stay where they were.', 'Settings: Bone size (50 to 200 percent) and Hints (switch the pop-up hints off).'],
    ru: ['Вставка ключей: ключи, скопированные с одной кости, вставляются на кость, выбранную сейчас, так что взмах одной руки можно вставить на другую (выберите другую кость и нажмите Ctrl+V; каждая из нескольких выбранных костей получит копию). То же для ключей одного слота. Если выбрана та же кость, ключи остаются на месте.', 'Настройки: «Толщина костей» (от 50 до 200 процентов) и «Подсказки» (можно выключить всплывающие подсказки).'],
  },
  {
    version: '0.20',
    date: '2026-11-17',
    en: ['Sequences: a region or a mesh can show a different picture over time (smoke, fire, a blink drawn frame by frame). Number the pictures (flame01, flame02…), select the image and press Make a sequence in the Inspector: the numbered series is found and the frames are set. In Animate mode key the Mode (hold, once, loop, ping-pong and the backwards versions), the Frame and the Delay; the keys have their own Sequences rows in the dopesheet and move, copy and delete like any key. The Spine export (JSON and binary) and the import (JSON and binary) carry sequences, every frame goes into the atlas, and the tests compare the frame shown at every time with the official Spine 4.3 runtime. The Metrics window warns about missing frames.'],
    ru: ['Последовательности: регион или меш может показывать разные картинки по времени (дым, огонь, моргание, нарисованное покадрово). Пронумеруйте картинки (flame01, flame02…), выберите изображение и нажмите «Сделать последовательность» в инспекторе: ряд картинок находится сам, кадры настраиваются. В режиме Animate ставьте ключи на «Режим» (держать, один раз, по кругу, туда-обратно и версии назад), «Кадр» и «Задержку»; у ключей своя строка «Последовательности» в таймлайне, их можно двигать, копировать и удалять как обычные. Экспорт Spine (JSON и бинарный) и импорт (JSON и бинарный) переносят последовательности, каждый кадр попадает в атлас, а тесты сверяют кадр на каждом времени с официальным рантаймом Spine 4.3. Окно «Сводка» предупреждает, если кадра не хватает.'],
  },
  {
    version: '0.19',
    date: '2026-11-17',
    en: ['Close the loop (Animation tools window and the command palette): makes the end of the animation the same as its start, so a walk or an idle repeats without a jump. Every number timeline gets the value of its first key on its last key (or the other way round), and one that ends early gets a key at the end. Works on the selected bones or on the whole animation.'],
    ru: ['Замкнуть петлю (окно «Инструменты анимации» и палитра команд): делает конец анимации таким же, как начало, чтобы ходьба или покой повторялись без скачка. Каждая дорожка получает на последнем ключе значение первого (или наоборот), а дорожка, которая кончается раньше, получает ключ в конце. Работает на выбранных костях или на всей анимации.'],
  },
  {
    version: '0.18',
    date: '2026-11-17',
    en: ['Texture packer options in the Export window: Strip whitespace (cuts the empty border off pictures, the atlas file records where it was; pictures a mesh uses stay whole), Rotate pictures (a quarter turn on the page when that saves room) and Texture filter (Linear, or Nearest for pixel art). The atlas is read back by the official Spine runtime in the tests, and every point of every region has to land on the right pixel. Export settings are remembered, and Save settings / Load settings keep them in a small JSON file to share with a team.'],
    ru: ['Параметры упаковщика текстур в окне экспорта: «Обрезать пустоту» (убирает пустую кайму у картинок, файл атласа помнит, где она была; картинки мешей остаются целыми), «Поворачивать картинки» (боком на странице, если это экономит место) и «Фильтр текстуры» (Linear или Nearest для пиксельной графики). В тестах атлас читает официальный рантайм Spine, и каждая точка каждого региона должна попасть на свой пиксель. Настройки экспорта запоминаются, а «Сохранить настройки» / «Загрузить настройки» кладут их в небольшой JSON-файл, который можно передать команде.'],
  },
  {
    version: '0.17',
    date: '2026-11-17',
    en: ['Hierarchy filter: type part of a name to see only the matching bones, slots (also by the name of their images), constraints, skins and events, with the bones above them. Ctrl+H shows everything that was hidden in the viewport, Ctrl+Shift+H hides everything except the selection (a slot, or the bones with their children and slots). Both are in the Edit menu and the command palette, and their keys can be moved in Settings.'],
    ru: ['Фильтр иерархии: введите часть имени, и останутся только подходящие кости, слоты (в том числе по имени их картинок), констрейнты, скины и события вместе с костями над ними. Ctrl+H показывает всё, что скрыто во вьюпорте, Ctrl+Shift+H скрывает всё, кроме выбранного (слота или костей с детьми и слотами). Обе команды есть в меню «Правка» и в палитре, клавиши можно поменять в настройках.'],
  },
  {
    version: '0.16',
    date: '2026-11-17',
    en: ['Poses window (Windows menu): a library of poses kept by name (a guard stance, a wave, a hand shape). Press + to keep the pose of the selected bones (all when none is selected); click a pose to put it on the bones. In Setup mode it sets the setup pose, in Animate mode it keys the bones at the playhead. A Blend percentage puts a pose on only part of the way, angles turning the short way round. Rename, replace with the current pose, delete. The library is saved in the project file and is not part of the Spine export.'],
    ru: ['Окно «Позы» (меню «Окна»): библиотека поз с именами (стойка, взмах руки, форма кисти). Нажмите +, чтобы сохранить позу выбранных костей (всех, если ничего не выбрано), клик по позе накладывает её на кости. В режиме Setup поза становится позой по умолчанию, в режиме Animate кости получают ключи в точке маркера. Процент «Наложение» кладёт позу лишь частично, углы идут по короткой дуге. Можно переименовать позу, заменить её текущей или удалить. Библиотека сохраняется в файле проекта и в экспорт Spine не попадает.'],
  },
  {
    version: '0.15',
    date: '2026-11-17',
    en: ['Every key of the editor can be moved: Settings → Hotkeys now has a button for each command (Undo, Save, Frame skeleton, Play…), not only the tool letters. Press it, then the new combination (Ctrl, Alt, Shift and a key, F-keys, Tab, Space). A combination that another command, a tool letter or the browser already has is refused with the name of the owner; Reset puts the default back. The tooltips, menus, shortcuts window and command palette show the keys as you set them.'],
    ru: ['Теперь можно переназначить любую клавишу редактора: в «Настройки → Горячие клавиши» у каждой команды (Отменить, Сохранить, Показать весь скелет, Воспроизведение…) есть кнопка, не только у букв инструментов. Нажмите её и затем новое сочетание (Ctrl, Alt, Shift и клавиша, F-клавиши, Tab, Space). Сочетание, которое уже занято другой командой, буквой инструмента или браузером, не принимается, и сообщение называет, чем оно занято; «Сбросить» возвращает исходное. Подсказки, меню, окно горячих клавиш и палитра команд показывают клавиши так, как вы их задали.'],
  },
  {
    version: '0.14',
    date: '2026-11-17',
    en: [
      'Animation tools window (Windows menu). Simplify keys takes out the keys a curve does not need, within a tolerance you scale; it shows how many can go before you press the button. Bake constraints writes what IK, transform, path, physics and sliders do into plain bone keys of a new animation (every frame or every N-th, optionally simplified, constraints switched off in the copy), so the motion plays the same where a game runtime has no such constraint. Checked frame by frame in the random-session tests.',
      'The one difference from the official runtime that the random-session tests could not explain turned out to be the test reading a bone on the 0/360 wrap before a slider moved it; the test now knows about that, the editor needed no change.',
    ],
    ru: [
      'Окно «Инструменты анимации» (меню «Окна»). «Упрощение ключей» убирает ключи, которые кривой не нужны, в допуске, который можно менять; перед нажатием видно, сколько уйдёт. «Запечь констрейнты» записывает работу IK, transform, path, физики и слайдеров в обычные ключи костей новой анимации (каждый кадр или каждый N-й, с упрощением по желанию, констрейнты в копии выключены), и движение играет так же там, где в игровом рантайме таких констрейнтов нет. Сверено кадр за кадром в тестах со случайными сессиями.',
      'Единственное расхождение с официальным рантаймом, которое случайные сессии не смогли объяснить, оказалось тестом: он читал кость на стыке 0/360 после того, как слайдер её повернул. Теперь тест это знает, редактор менять не пришлось.',
    ],
  },
  {
    version: '0.13',
    date: '2026-11-17',
    en: ['Motion trails (View menu, or the route button in the top bar): the path that the selected bones travel in the animation, cool before the playhead and warm after it, with the keys marked on it. Spine has nothing like it.'],
    ru: ['Траектории движения (меню «Вид» или кнопка с маршрутом в верхней панели): путь, который выбранные кости проходят в анимации, холодным цветом до маркера и тёплым после него, с отмеченными ключами. В Spine такого нет.'],
  },
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
