/**
 * The interactive lessons: a lesson is data (steps with text in every language of the editor) and every step has a condition, a pure function of what
 * the editor looks like. A step is done when the editor is in the state it asks for, not when someone pressed "Next", so the order does not
 * matter, what was done before the lesson started counts, and nothing can be left stuck. The store (store/learn.ts) builds the state, the
 * card (editor/LearnCard.tsx) shows it. Pure data and functions: they run in the tests without a browser.
 */

/** The part of the editor a step points at (a soft frame is drawn around it). */
export type LearnTarget = 'tree' | 'viewport' | 'inspector' | 'mode' | 'play' | 'export' | 'images' | 'toolIk' | 'timeline' | 'graph';

/** Something the card can do for the person at a step (the store knows how): a button under the text. */
export type LessonHelper = 'samplePictures';

/** What a lesson can see of the editor. Only simple values, so a condition is a plain comparison. */
export interface LessonState {
  mode: 'setup' | 'animate';
  selectedBones: number;
  /** Steps made in the document since the editor started: grows with every edit, so "since the lesson began" is a difference. */
  edits: number;
  /** Keys in all the animations of the skeleton. */
  keys: number;
  playing: boolean;
  /** Pictures in the project, bones in the skeleton, and slots that sit on a bone other than a root (a picture that moves with a bone). */
  images: number;
  bones: number;
  ownSlots: number;
  /** A slot (a picture) is selected. */
  slotSelected: boolean;
  /** Meshes in the skins, and how many of them are bound to bones (weighted). */
  meshes: number;
  weightedMeshes: number;
  /** IK constraints in the skeleton, and the edits of the document made since a new one appeared (0 while none has). */
  ikConstraints: number;
  editsSinceIk: number;
  /** Keys selected on the timeline. */
  selectedKeys: number;
  /** Changes of the interpolation of keys (a menu choice, a preset) and drags of a curve handle, made since the lesson began. */
  interpEdits: number;
  handleEdits: number;
  /** Skins and events in the skeleton, the event keys in all its animations, and how many times the shown skin changed since the lesson began. */
  skins: number;
  events: number;
  eventKeys: number;
  skinSwitches: number;
  /** Files given out by the Export window since the lesson began: the Spine ZIP and the one-file player page. */
  zips: number;
  players: number;
  /** The curve graph has been the timeline view at some moment since the lesson began. */
  seenGraph: boolean;
  /** The weights brush has been the tool at some moment since the lesson began. */
  seenWeightsTool: boolean;
  /** Playback has been on at some moment since the lesson began (it can be off again now). */
  seenPlaying: boolean;
  /** The Export window has been opened since the lesson began. */
  seenExport: boolean;
}

interface Text {
  en: string;
  ru: string;
  zh: string;
}

interface LessonStep {
  id: string;
  target: LearnTarget;
  title: Text;
  text: Text;
  /** A button the card shows under the text of this step. */
  helper?: { id: LessonHelper; label: Text };
  /** True when the step is done; `base` is the state the lesson started in. */
  done: (state: LessonState, base: LessonState) => boolean;
}

export interface Lesson {
  id: string;
  title: Text;
  intro: Text;
  /** What to do next, shown when every step is done. */
  outro: Text;
  /** The lesson the card offers when this one is over. */
  next?: string;
  steps: LessonStep[];
}

/** Lesson 1: the whole loop on the demo fox, in about two minutes. */
export const FOX_LESSON: Lesson = {
  id: 'fox',
  title: { en: 'Bring the fox to life', ru: 'Оживите лису', zh: '让狐狸动起来' },
  intro: {
    en: 'Six short steps on the demo rig. Do them in any order; skip what you know.',
    ru: 'Шесть коротких шагов на демо-риге. Делайте в любом порядке, ненужное пропускайте.',
    zh: '用示例骨架完成六个简短步骤。顺序随意，已经会的可以跳过。',
  },
  outro: {
    en: 'That is the whole loop. Now make your own: drop PNG pictures into the window, press B and draw bones.',
    ru: 'Это весь цикл. Теперь сделайте своё: перетащите PNG в окно, нажмите B и рисуйте кости.',
    zh: '这就是完整流程。现在做你自己的：把 PNG 图片拖进窗口，按 B 绘制骨骼。',
  },
  next: 'rig',
  steps: [
    {
      id: 'select',
      target: 'tree',
      title: { en: 'Pick a bone', ru: 'Выберите кость', zh: '选择一根骨骼' },
      text: {
        en: 'Click a bone in the hierarchy on the left, or on the character in the viewport.',
        ru: 'Нажмите на кость в списке слева или на персонаже во вьюпорте.',
        zh: '在左侧层级树中单击一根骨骼，或在视口中单击角色身上的骨骼。',
      },
      done: (s) => s.selectedBones > 0,
    },
    {
      id: 'edit',
      target: 'inspector',
      title: { en: 'Change it', ru: 'Измените её', zh: '修改它' },
      text: {
        en: 'Drag the bone in the viewport, or type a number in the Inspector on the right. Ctrl+Z takes it back.',
        ru: 'Потяните кость во вьюпорте или впишите число в инспекторе справа. Ctrl+Z вернёт всё назад.',
        zh: '在视口中拖动骨骼，或在右侧属性面板中输入数值。Ctrl+Z 可以撤销。',
      },
      done: (s, base) => s.edits > base.edits,
    },
    {
      id: 'animate',
      target: 'mode',
      title: { en: 'Switch to Animate', ru: 'Перейдите в «Анимацию»', zh: '切换到动画模式' },
      text: {
        en: 'Press Tab or click Animate: from now on a change of the pose becomes a key on the timeline.',
        ru: 'Нажмите Tab или кнопку «Анимация»: теперь изменение позы становится ключом на таймлайне.',
        zh: '按 Tab 或单击“动画”：从现在起，姿势的改动会变成时间轴上的关键帧。',
      },
      done: (s) => s.mode === 'animate',
    },
    {
      id: 'play',
      target: 'play',
      title: { en: 'Play it', ru: 'Проиграйте', zh: '播放' },
      text: {
        en: 'Press Space: the animation plays. Press Space again to stop.',
        ru: 'Нажмите Пробел: анимация проиграется. Ещё раз Пробел остановит её.',
        zh: '按空格键播放动画。再按一次空格停止。',
      },
      done: (s) => s.seenPlaying,
    },
    {
      id: 'key',
      target: 'viewport',
      title: { en: 'Make your own key', ru: 'Поставьте свой ключ', zh: '打一个自己的关键帧' },
      text: {
        en: 'Stop the playback, move the time marker on the timeline, then turn a bone. With Auto key on, the key is made for you.',
        ru: 'Остановите проигрывание, передвиньте маркер времени на таймлайне и поверните кость. При включённом автоключе ключ создастся сам.',
        zh: '停止播放，在时间轴上移动时间指针，然后旋转一根骨骼。开启自动关键帧时，关键帧会自动生成。',
      },
      done: (s, base) => s.keys > base.keys,
    },
    {
      id: 'export',
      target: 'export',
      title: { en: 'Take it to your game', ru: 'Заберите в игру', zh: '带进你的游戏' },
      text: {
        en: 'Press Ctrl+E: Spine data for your game, or the animation as a GIF.',
        ru: 'Нажмите Ctrl+E: данные Spine для игры или анимация в виде GIF.',
        zh: '按 Ctrl+E：导出游戏用的 Spine 数据，或把动画导出为 GIF。',
      },
      done: (s) => s.seenExport,
    },
  ],
};

/** Lesson 2: a rig of one's own, from pictures to a moving bone. Works on whatever is open: every step compares with where the lesson began. */
export const RIG_LESSON: Lesson = {
  id: 'rig',
  title: { en: 'Your own rig', ru: 'Свой риг', zh: '搭建自己的骨架' },
  intro: {
    en: 'From a picture to a moving bone, in six steps. It works on any project: new or not.',
    ru: 'От картинки до движущейся кости за шесть шагов. Работает на любом проекте: новом и нет.',
    zh: '六步让一张图片变成会动的骨骼。适用于任何项目，新旧皆可。',
  },
  outro: {
    en: 'Your picture moves with its bone. Real characters are the same, only with more bones: add a bone for every part that has to move.',
    ru: 'Картинка двигается вместе со своей костью. Настоящие персонажи устроены так же, только костей больше: по кости на каждую движущуюся часть.',
    zh: '图片会随骨骼移动。真正的角色也是一样，只是骨骼更多：给每个需要活动的部位添加一根骨骼。',
  },
  next: 'mesh',
  steps: [
    {
      id: 'pictures',
      target: 'images',
      title: { en: 'Bring pictures', ru: 'Добавьте картинки', zh: '导入图片' },
      text: {
        en: 'Drop PNG files into the window. No pictures at hand? The button adds two sample ones.',
        ru: 'Перетащите PNG-файлы в окно. Нет картинок под рукой? Кнопка добавит две учебные.',
        zh: '把 PNG 文件拖进窗口。手头没有图片？点按钮添加两张示例图片。',
      },
      helper: { id: 'samplePictures', label: { en: 'Add sample pictures', ru: 'Добавить учебные картинки', zh: '添加示例图片' } },
      done: (s, base) => s.images > base.images,
    },
    {
      id: 'bone',
      target: 'viewport',
      title: { en: 'Draw a bone', ru: 'Нарисуйте кость', zh: '绘制骨骼' },
      text: {
        en: 'Press B, then drag in the viewport from where the bone starts to where it ends.',
        ru: 'Нажмите B и протяните во вьюпорте от начала кости до её конца.',
        zh: '按 B，然后在视口中从骨骼起点拖到终点。',
      },
      done: (s, base) => s.bones > base.bones,
    },
    {
      id: 'attach',
      target: 'images',
      title: { en: 'Put a picture on the bone', ru: 'Посадите картинку на кость', zh: '把图片放到骨骼上' },
      text: {
        en: 'With the new bone selected, drag a picture from Images into the viewport: it joins the selected bone and moves with it.',
        ru: 'Когда новая кость выбрана, перетащите картинку из «Картинок» во вьюпорт: она встанет на выбранную кость и будет двигаться с ней.',
        zh: '选中新骨骼后，把一张图片从图片面板拖进视口：它会挂到所选骨骼上并随之移动。',
      },
      done: (s, base) => s.ownSlots > base.ownSlots,
    },
    {
      id: 'animate',
      target: 'mode',
      title: { en: 'Switch to Animate', ru: 'Перейдите в «Анимацию»', zh: '切换到动画模式' },
      text: {
        en: 'Press Tab or click Animate: from now on a change of the pose becomes a key.',
        ru: 'Нажмите Tab или кнопку «Анимация»: теперь изменение позы становится ключом.',
        zh: '按 Tab 或单击“动画”：从现在起，姿势的改动会变成关键帧。',
      },
      done: (s) => s.mode === 'animate',
    },
    {
      id: 'key',
      target: 'viewport',
      title: { en: 'Turn the bone', ru: 'Поверните кость', zh: '旋转骨骼' },
      text: {
        en: 'Move the time marker on the timeline and turn the bone: the picture follows, and a key is made.',
        ru: 'Передвиньте маркер времени на таймлайне и поверните кость: картинка последует за ней, ключ создастся сам.',
        zh: '在时间轴上移动时间指针并旋转骨骼：图片随之转动，同时生成关键帧。',
      },
      done: (s, base) => s.keys > base.keys,
    },
    {
      id: 'play',
      target: 'play',
      title: { en: 'Play it', ru: 'Проиграйте', zh: '播放' },
      text: {
        en: 'Press Space: your rig plays the animation. Press Space again to stop.',
        ru: 'Нажмите Пробел: ваш риг проиграет анимацию. Ещё раз Пробел остановит её.',
        zh: '按空格键播放你的动画。再按一次空格停止。',
      },
      done: (s) => s.seenPlaying,
    },
  ],
};

/** Lesson 3: a picture that bends. A mesh is a picture cut into triangles; bound to bones, its points follow them with weights. */
export const MESH_LESSON: Lesson = {
  id: 'mesh',
  title: { en: 'A picture that bends', ru: 'Картинка, которая гнётся', zh: '会弯曲的图片' },
  intro: {
    en: 'Turn a picture into a mesh and bind it to a bone, so it bends instead of turning stiffly. Needs a picture on a slot and a bone.',
    ru: 'Превратите картинку в сетку и привяжите к кости: она будет гнуться, а не поворачиваться целиком. Нужны картинка в слоте и кость.',
    zh: '把图片转成网格并绑定到骨骼，让它弯曲，而不是僵硬地旋转。需要插槽上有图片，并且有一根骨骼。',
  },
  outro: {
    en: 'The picture bends with its bones. Bind to two or more bones and paint the weights: that is how tails, arms and cloth are made.',
    ru: 'Картинка гнётся вместе с костями. Привяжите к двум и более костям и подкрасьте веса: так делают хвосты, руки и ткань.',
    zh: '图片会随骨骼弯曲。绑定到两根或更多骨骼并绘制权重：尾巴、手臂和布料就是这样做的。',
  },
  next: 'ik',
  steps: [
    {
      id: 'slot',
      target: 'tree',
      title: { en: 'Pick a picture', ru: 'Выберите картинку', zh: '选择图片' },
      text: {
        en: 'Click a picture (a slot, the layered icon) in the hierarchy. No pictures yet? Do the lesson "Your own rig" first.',
        ru: 'Нажмите на картинку (слот, значок со слоями) в иерархии. Картинок ещё нет? Сначала пройдите урок «Свой риг».',
        zh: '在层级树中单击一张图片（插槽，图层图标）。还没有图片？先学“搭建自己的骨架”这一课。',
      },
      done: (s) => s.slotSelected,
    },
    {
      id: 'mesh',
      target: 'inspector',
      title: { en: 'Make it a mesh', ru: 'Сделайте сетку', zh: '转成网格' },
      text: {
        en: 'In the Inspector press Quad (four corners) or Trace mesh (follows the outline). The mesh appears on the picture.',
        ru: 'В инспекторе нажмите «Квадрат» (четыре угла) или «Трассировать сетку» (по контуру). Сетка появится на картинке.',
        zh: '在属性面板中按“四边形”（四个角点）或“描边生成网格”（沿轮廓）。图片上会出现网格。',
      },
      done: (s, base) => s.meshes > base.meshes,
    },
    {
      id: 'bind',
      target: 'inspector',
      title: { en: 'Bind it to bones', ru: 'Привяжите к костям', zh: '绑定到骨骼' },
      text: {
        en: 'With the picture still selected, Shift-click every other bone that should move it, then press the Bind button in the Inspector.',
        ru: 'Не снимая выбора картинки, щёлкните с Shift по остальным костям, которые должны её двигать, и нажмите кнопку привязки в инспекторе.',
        zh: '保持图片选中，按住 Shift 单击其他需要带动它的骨骼，然后按属性面板中的“绑定”按钮。',
      },
      done: (s, base) => s.weightedMeshes > base.weightedMeshes,
    },
    {
      id: 'weights',
      target: 'viewport',
      title: { en: 'Look at the weights', ru: 'Посмотрите на веса', zh: '查看权重' },
      text: {
        en: 'Press W: the brush paints how strongly each bone pulls the mesh. Paint a little, then press V to go back.',
        ru: 'Нажмите W: кисть красит, насколько сильно каждая кость тянет сетку. Проведите кистью и вернитесь на V.',
        zh: '按 W：笔刷用来绘制每根骨骼对网格的拉动强度。涂几笔，然后按 V 返回。',
      },
      done: (s) => s.seenWeightsTool,
    },
    {
      id: 'animate',
      target: 'mode',
      title: { en: 'Switch to Animate', ru: 'Перейдите в «Анимацию»', zh: '切换到动画模式' },
      text: {
        en: 'Press Tab or click Animate.',
        ru: 'Нажмите Tab или кнопку «Анимация».',
        zh: '按 Tab 或单击“动画”。',
      },
      done: (s) => s.mode === 'animate',
    },
    {
      id: 'bend',
      target: 'viewport',
      title: { en: 'Bend it', ru: 'Согните её', zh: '让它弯曲' },
      text: {
        en: 'Move the time marker and turn a bone: the mesh bends with it. A key is made.',
        ru: 'Передвиньте маркер времени и поверните кость: сетка согнётся вместе с ней. Ключ создастся сам.',
        zh: '移动时间指针并旋转骨骼：网格随之弯曲，同时生成关键帧。',
      },
      done: (s, base) => s.keys > base.keys,
    },
  ],
};

/** Lesson 4: IK. Move the end of a limb and the limb follows, instead of turning every bone by hand. */
export const IK_LESSON: Lesson = {
  id: 'ik',
  title: { en: 'A leg that follows', ru: 'Нога, которая следует за целью', zh: '会跟随目标的腿' },
  intro: {
    en: 'IK makes a chain of bones follow a target: move the target, and the limb bends to reach it. Needs a bone that is not the root.',
    ru: 'IK заставляет цепочку костей следовать за целью: двигаете цель, и конечность сгибается, чтобы дотянуться. Нужна кость, не корневая.',
    zh: 'IK 让一串骨骼跟随一个目标：移动目标，肢体就弯曲去够到它。需要一根非根骨骼。',
  },
  outro: {
    en: 'That is how legs stay on the ground and hands reach things: animate the target, not every bone.',
    ru: 'Так ноги стоят на земле, а руки достают до предметов: анимируйте цель, а не каждую кость.',
    zh: '腿能稳稳踩在地上、手能够到物体，靠的就是它：只给目标做动画，不必逐根骨骼调整。',
  },
  next: 'curves',
  steps: [
    {
      id: 'bone',
      target: 'tree',
      title: { en: 'Pick the end of a limb', ru: 'Выберите конец конечности', zh: '选择肢体末端' },
      text: {
        en: 'Click the last bone of an arm, a leg or a tail in the hierarchy (not the root).',
        ru: 'Нажмите на последнюю кость руки, ноги или хвоста в иерархии (не корень).',
        zh: '在层级树中单击手臂、腿或尾巴的最后一根骨骼（不能是根骨骼）。',
      },
      done: (s) => s.selectedBones > 0,
    },
    {
      id: 'ik',
      target: 'toolIk',
      title: { en: 'Draw an IK target', ru: 'Создайте IK-цель', zh: '拖出 IK 目标' },
      text: {
        en: 'Press I, then drag from the tip of that bone out into empty space: an orange target appears and the chain follows it.',
        ru: 'Нажмите I и протяните от кончика этой кости в пустое место: появится оранжевая цель, и цепочка пойдёт за ней.',
        zh: '按 I，然后从该骨骼末端拖到空白处：会出现橙色目标，骨骼链跟随它。',
      },
      done: (s, base) => s.ikConstraints > base.ikConstraints,
    },
    {
      id: 'pull',
      target: 'viewport',
      title: { en: 'Move the target', ru: 'Подвигайте цель', zh: '移动目标' },
      text: {
        en: 'Press V, then drag the orange target: the limb bends to reach it, and no bone was turned by hand.',
        ru: 'Нажмите V и потяните оранжевую цель: конечность согнётся, чтобы дотянуться, и ни одну кость не крутили вручную.',
        zh: '按 V，然后拖动橙色目标：肢体弯曲去够到它，而你没有手动旋转任何骨骼。',
      },
      done: (s) => s.editsSinceIk >= 1,
    },
    {
      id: 'animate',
      target: 'mode',
      title: { en: 'Switch to Animate', ru: 'Перейдите в «Анимацию»', zh: '切换到动画模式' },
      text: {
        en: 'Press Tab or click Animate.',
        ru: 'Нажмите Tab или кнопку «Анимация».',
        zh: '按 Tab 或单击“动画”。',
      },
      done: (s) => s.mode === 'animate',
    },
    {
      id: 'key',
      target: 'viewport',
      title: { en: 'Key the target', ru: 'Поставьте ключ на цель', zh: '给目标打关键帧' },
      text: {
        en: 'Move the time marker and move the target: only the target gets a key, the limb follows it.',
        ru: 'Передвиньте маркер времени и сдвиньте цель: ключ получает только цель, конечность следует за ней.',
        zh: '移动时间指针并移动目标：只有目标生成关键帧，肢体跟着它走。',
      },
      done: (s, base) => s.keys > base.keys,
    },
    {
      id: 'play',
      target: 'play',
      title: { en: 'Play it', ru: 'Проиграйте', zh: '播放' },
      text: {
        en: 'Press Space: the limb follows the moving target. Press Space again to stop.',
        ru: 'Нажмите Пробел: конечность следует за движущейся целью. Ещё раз Пробел остановит её.',
        zh: '按空格键：肢体跟随移动的目标。再按一次空格停止。',
      },
      done: (s) => s.seenPlaying,
    },
  ],
};

/** Lesson 5: the feel of a motion. The same two poses move differently with another curve between them. */
export const CURVES_LESSON: Lesson = {
  id: 'curves',
  title: { en: 'The feel of a motion', ru: 'Характер движения', zh: '动作的节奏感' },
  intro: {
    en: 'The curve between two keys decides how the motion feels: even, snappy, soft or with a hold. Needs an animation with keys.',
    ru: 'Кривая между двумя ключами решает, каким будет движение: ровным, резким, мягким или с задержкой. Нужна анимация с ключами.',
    zh: '两个关键帧之间的曲线决定动作的感觉：匀速、干脆、柔和或停顿。需要一个带关键帧的动画。',
  },
  outro: {
    en: 'Now you can tell a stiff motion from a lively one. Ease in-out for most things, stepped for blinks, overshoot for bounce.',
    ru: 'Теперь вы отличите деревянное движение от живого. Мягкий вход и выход для большинства вещей, ступенька для моргания, перелёт для отскока.',
    zh: '现在你能分辨僵硬和生动的动作了。多数情况用缓入缓出，眨眼用阶梯，弹跳用过冲。',
  },
  next: 'skins',
  steps: [
    {
      id: 'animate',
      target: 'mode',
      title: { en: 'Switch to Animate', ru: 'Перейдите в «Анимацию»', zh: '切换到动画模式' },
      text: {
        en: 'Press Tab or click Animate: the timeline with the keys of the animation opens.',
        ru: 'Нажмите Tab или кнопку «Анимация»: откроется таймлайн с ключами анимации.',
        zh: '按 Tab 或单击“动画”：显示动画关键帧的时间轴会打开。',
      },
      done: (s) => s.mode === 'animate',
    },
    {
      id: 'select',
      target: 'timeline',
      title: { en: 'Select a key', ru: 'Выберите ключ', zh: '选择关键帧' },
      text: {
        en: 'Click a key (a diamond) on the timeline, or drag a frame around several.',
        ru: 'Нажмите на ключ (ромбик) на таймлайне или обведите рамкой несколько.',
        zh: '在时间轴上单击一个关键帧（菱形），或框选多个。',
      },
      done: (s) => s.selectedKeys > 0,
    },
    {
      id: 'interp',
      target: 'timeline',
      title: { en: 'Change the interpolation', ru: 'Смените интерполяцию', zh: '更改插值' },
      text: {
        en: 'Right-click the selected key and pick Stepped, Ease in-out or another: the motion after this key changes.',
        ru: 'Нажмите правой кнопкой на выбранный ключ и выберите «Ступенчатая», «Плавный старт и финиш» или другое: движение после этого ключа изменится.',
        zh: '右键单击选中的关键帧，选择“阶梯”“缓入缓出”或其他方式：此关键帧之后的动作随之改变。',
      },
      done: (s) => s.interpEdits >= 1,
    },
    {
      id: 'graph',
      target: 'graph',
      title: { en: 'Open the curve graph', ru: 'Откройте график кривых', zh: '打开曲线图' },
      text: {
        en: 'Press the curve button of the timeline: the graph shows the value over time and the handles of the curves.',
        ru: 'Нажмите кнопку кривой на таймлайне: график покажет значение во времени и ручки кривых.',
        zh: '按时间轴上的曲线按钮：曲线图显示数值随时间的变化以及曲线控制柄。',
      },
      done: (s) => s.seenGraph,
    },
    {
      id: 'handle',
      target: 'timeline',
      title: { en: 'Pull a handle', ru: 'Потяните ручку', zh: '拉动控制柄' },
      text: {
        en: 'Drag a round handle of a curve: pull it out for a slow start, pull it flat for a hold.',
        ru: 'Потяните круглую ручку кривой: вытяните для медленного старта, уложите ровно для задержки.',
        zh: '拖动曲线上的圆形控制柄：向外拉出得到缓慢起步，拉平得到停顿。',
      },
      done: (s) => s.handleEdits >= 1,
    },
    {
      id: 'play',
      target: 'play',
      title: { en: 'Play it', ru: 'Проиграйте', zh: '播放' },
      text: {
        en: 'Press Space and feel the difference. Press Space again to stop.',
        ru: 'Нажмите Пробел и почувствуйте разницу. Ещё раз Пробел остановит проигрывание.',
        zh: '按空格键感受区别。再按一次空格停止。',
      },
      done: (s) => s.seenPlaying,
    },
  ],
};

/** Lesson 6: another look and a signal. A skin is a look of the same skeleton; an event is a signal the game hears at a moment of an animation. */
export const SKINS_LESSON: Lesson = {
  id: 'skins',
  title: { en: 'Another look and a signal', ru: 'Другой облик и сигнал', zh: '换装与信号' },
  intro: {
    en: 'A skin is another look for the same skeleton, an event is a signal the game catches at a moment of the animation (a step, a shot, a sound). Both live in the tree on the left.',
    ru: 'Скин это другой облик того же скелета, событие это сигнал, который игра ловит в нужный момент анимации (шаг, выстрел, звук). И то и другое живёт в списке слева.',
    zh: '皮肤是同一骨架的另一套外观；事件是游戏在动画某一时刻接收到的信号（脚步、射击、声音）。两者都在左侧层级树中。',
  },
  outro: {
    en: 'One skeleton, many looks, and the game hears the signals you put on the timeline. Next: take it all out to a game.',
    ru: 'Один скелет и много обликов, а игра слышит сигналы, которые вы поставили на таймлайне. Дальше: вынести всё в игру.',
    zh: '一个骨架、多套外观，游戏还能接收到你放在时间轴上的信号。下一步：全部导出给游戏。',
  },
  next: 'export',
  steps: [
    {
      id: 'skin',
      target: 'tree',
      title: { en: 'Add a skin', ru: 'Добавьте скин', zh: '添加皮肤' },
      text: {
        en: 'Press the plus in the Skins section of the tree. The new skin is empty and becomes the one on the screen.',
        ru: 'Нажмите плюс в разделе «Скины» списка. Новый скин пуст и сразу становится показанным.',
        zh: '按层级树“皮肤”区域的加号。新皮肤是空的，并立即成为当前显示的皮肤。',
      },
      done: (s, base) => s.skins > base.skins,
    },
    {
      id: 'switch',
      target: 'tree',
      title: { en: 'Switch between skins', ru: 'Переключите скины', zh: '切换皮肤' },
      text: {
        en: 'Click another skin in the list, then click back: the picture on the screen changes with the skin. This is how the looks are compared.',
        ru: 'Нажмите на другой скин в списке и вернитесь обратно: картинка на экране меняется вместе со скином. Так сравнивают облики.',
        zh: '在列表中单击另一个皮肤，再点回来：画面上的图片随皮肤变化。这样就能对比不同外观。',
      },
      done: (s) => s.skinSwitches >= 2,
    },
    {
      id: 'event',
      target: 'tree',
      title: { en: 'Add an event', ru: 'Добавьте событие', zh: '添加事件' },
      text: {
        en: 'Press the plus in the Events section. The event has a name and can carry a number or a text for the game.',
        ru: 'Нажмите плюс в разделе «События». У события есть имя, и оно может нести число или текст для игры.',
        zh: '按“事件”区域的加号。事件有名称，还可以带给游戏用的数字或文本。',
      },
      done: (s, base) => s.events > base.events,
    },
    {
      id: 'animate',
      target: 'mode',
      title: { en: 'Switch to Animate', ru: 'Перейдите в «Анимацию»', zh: '切换到动画模式' },
      text: {
        en: 'Press Tab or click Animate: the signals are put on the timeline of an animation.',
        ru: 'Нажмите Tab или кнопку «Анимация»: сигналы ставятся на таймлайн анимации.',
        zh: '按 Tab 或单击“动画”：信号要放在某个动画的时间轴上。',
      },
      done: (s) => s.mode === 'animate',
    },
    {
      id: 'fire',
      target: 'tree',
      title: { en: 'Fire the event', ru: 'Выстрелите событием', zh: '触发事件' },
      text: {
        en: 'Move the playhead to a moment, then press the diamond next to the event: its signal is put there.',
        ru: 'Поставьте маркер времени на нужный момент и нажмите ромбик у события: сигнал встанет в эту точку.',
        zh: '把播放头移到某一时刻，然后按事件旁的菱形：信号就放在那里了。',
      },
      done: (s, base) => s.eventKeys > base.eventKeys,
    },
    {
      id: 'play',
      target: 'play',
      title: { en: 'Play it', ru: 'Проиграйте', zh: '播放' },
      text: {
        en: 'Press Space: when the playhead passes the signal, the event fires. Press Space again to stop.',
        ru: 'Нажмите Пробел: когда маркер пройдёт сигнал, событие сработает. Ещё раз Пробел остановит проигрывание.',
        zh: '按空格键：播放头经过信号时事件触发。再按一次空格停止。',
      },
      done: (s) => s.seenPlaying,
    },
  ],
};

/** Lesson 7: to the game. The result of the work is a file that a game engine loads, or one page that plays it. */
export const EXPORT_LESSON: Lesson = {
  id: 'export',
  title: { en: 'Out to the game', ru: 'В игру', zh: '导出到游戏' },
  intro: {
    en: 'The last step of the work: take the animation out as files that a game engine loads. Spine 4.3 data works in Unity, Godot, Pixi, Phaser and others.',
    ru: 'Последний шаг работы: вынести анимацию файлами, которые читает игровой движок. Данные Spine 4.3 работают в Unity, Godot, Pixi, Phaser и других.',
    zh: '工作的最后一步：把动画导出为游戏引擎能加载的文件。Spine 4.3 数据可用于 Unity、Godot、Pixi、Phaser 等。',
  },
  outro: {
    en: 'That is the whole way: a picture, a bone, a mesh, a motion, a look, a signal and a file for the game. Draw your own character now.',
    ru: 'Это весь путь: картинка, кость, сетка, движение, облик, сигнал и файл для игры. Теперь рисуйте своего персонажа.',
    zh: '全部流程就是这样：图片、骨骼、网格、动作、外观、信号，以及给游戏的文件。现在画一个自己的角色吧。',
  },
  steps: [
    {
      id: 'open',
      target: 'export',
      title: { en: 'Open Export', ru: 'Откройте «Экспорт»', zh: '打开导出窗口' },
      text: {
        en: 'Press the Export button in the top bar: the window shows what will be taken out and how.',
        ru: 'Нажмите кнопку «Экспорт» в верхней панели: окно покажет, что и как будет вынесено.',
        zh: '按顶部栏的“导出”按钮：窗口会显示将导出什么以及如何导出。',
      },
      done: (s) => s.seenExport,
    },
    {
      id: 'zip',
      target: 'export',
      title: { en: 'Download the Spine data', ru: 'Скачайте данные Spine', zh: '下载 Spine 数据' },
      text: {
        en: 'On the first tab press Download ZIP: a skeleton file, an atlas and the pictures, ready for the engine of your game.',
        ru: 'На первой вкладке нажмите «Скачать ZIP»: файл скелета, атлас и картинки, готовые для движка вашей игры.',
        zh: '在第一个标签页按“下载 ZIP”：得到骨架文件、图集和图片，可直接用于游戏引擎。',
      },
      done: (s) => s.zips >= 1,
    },
    {
      id: 'player',
      target: 'export',
      title: { en: 'Save a player page', ru: 'Сохраните страницу-плеер', zh: '保存播放器页面' },
      text: {
        en: 'Press Save player page: one HTML file with the animation inside. It opens offline, good for showing a client.',
        ru: 'Нажмите «Сохранить страницу-плеер»: один HTML-файл с анимацией внутри. Открывается без интернета, удобно показать заказчику.',
        zh: '按“保存播放器页面”：得到一个内含动画的 HTML 文件。它能离线打开，适合给客户展示。',
      },
      done: (s) => s.players >= 1,
    },
  ],
};

export const LESSONS: readonly Lesson[] = [FOX_LESSON, RIG_LESSON, MESH_LESSON, IK_LESSON, CURVES_LESSON, SKINS_LESSON, EXPORT_LESSON];

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);

/** How a step stands: done by the state of the editor, skipped by the person, or still to do. */
type StepMark = 'done' | 'skipped' | 'todo';

export interface LessonProgress {
  marks: StepMark[];
  /** Index of the first step still to do, -1 when there is none (the lesson is over). */
  current: number;
  /** Steps done by the state of the editor (skipped ones are not counted). */
  doneCount: number;
}

/**
 * Where a lesson stands. A skipped step stays skipped only until it is done by itself. A step that was done stays done (`kept` lists
 * them): the editor can leave the state a step asked for (selecting a bone drops the selected picture), and the card must not jump back.
 */
export function progressOf(
  lesson: Lesson,
  state: LessonState,
  base: LessonState,
  skipped: readonly string[],
  kept: readonly string[] = [],
): LessonProgress {
  const marks: StepMark[] = lesson.steps.map((s) =>
    kept.includes(s.id) || s.done(state, base) ? 'done' : skipped.includes(s.id) ? 'skipped' : 'todo',
  );
  return { marks, current: marks.indexOf('todo'), doneCount: marks.filter((m) => m === 'done').length };
}
