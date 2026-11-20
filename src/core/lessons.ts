/**
 * The interactive lessons: a lesson is data (steps with text in both languages) and every step has a condition, a pure function of what
 * the editor looks like. A step is done when the editor is in the state it asks for, not when someone pressed "Next", so the order does not
 * matter, what was done before the lesson started counts, and nothing can be left stuck. The store (store/learn.ts) builds the state, the
 * card (editor/LearnCard.tsx) shows it. Pure data and functions: they run in the tests without a browser.
 */

/** The part of the editor a step points at (a soft frame is drawn around it). */
export type LearnTarget = 'tree' | 'viewport' | 'inspector' | 'mode' | 'play' | 'export' | 'images' | 'toolIk';

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
  title: { en: 'Bring the fox to life', ru: 'Оживите лису' },
  intro: {
    en: 'Six short steps on the demo rig. Do them in any order; skip what you know.',
    ru: 'Шесть коротких шагов на демо-риге. Делайте в любом порядке, ненужное пропускайте.',
  },
  outro: {
    en: 'That is the whole loop. Now make your own: drop PNG pictures into the window, press B and draw bones.',
    ru: 'Это весь цикл. Теперь сделайте своё: перетащите PNG в окно, нажмите B и рисуйте кости.',
  },
  next: 'rig',
  steps: [
    {
      id: 'select',
      target: 'tree',
      title: { en: 'Pick a bone', ru: 'Выберите кость' },
      text: {
        en: 'Click a bone in the hierarchy on the left, or on the character in the viewport.',
        ru: 'Нажмите на кость в списке слева или на персонаже во вьюпорте.',
      },
      done: (s) => s.selectedBones > 0,
    },
    {
      id: 'edit',
      target: 'inspector',
      title: { en: 'Change it', ru: 'Измените её' },
      text: {
        en: 'Drag the bone in the viewport, or type a number in the Inspector on the right. Ctrl+Z takes it back.',
        ru: 'Потяните кость во вьюпорте или впишите число в инспекторе справа. Ctrl+Z вернёт всё назад.',
      },
      done: (s, base) => s.edits > base.edits,
    },
    {
      id: 'animate',
      target: 'mode',
      title: { en: 'Switch to Animate', ru: 'Перейдите в «Анимацию»' },
      text: {
        en: 'Press Tab or click Animate: from now on a change of the pose becomes a key on the timeline.',
        ru: 'Нажмите Tab или кнопку «Анимация»: теперь изменение позы становится ключом на таймлайне.',
      },
      done: (s) => s.mode === 'animate',
    },
    {
      id: 'play',
      target: 'play',
      title: { en: 'Play it', ru: 'Проиграйте' },
      text: {
        en: 'Press Space: the animation plays. Press Space again to stop.',
        ru: 'Нажмите Пробел: анимация проиграется. Ещё раз Пробел остановит её.',
      },
      done: (s) => s.seenPlaying,
    },
    {
      id: 'key',
      target: 'viewport',
      title: { en: 'Make your own key', ru: 'Поставьте свой ключ' },
      text: {
        en: 'Stop the playback, move the time marker on the timeline, then turn a bone. With Auto key on, the key is made for you.',
        ru: 'Остановите проигрывание, передвиньте маркер времени на таймлайне и поверните кость. При включённом автоключе ключ создастся сам.',
      },
      done: (s, base) => s.keys > base.keys,
    },
    {
      id: 'export',
      target: 'export',
      title: { en: 'Take it to your game', ru: 'Заберите в игру' },
      text: {
        en: 'Press Ctrl+E: Spine data for your game, or the animation as a GIF.',
        ru: 'Нажмите Ctrl+E: данные Spine для игры или анимация в виде GIF.',
      },
      done: (s) => s.seenExport,
    },
  ],
};

/** Lesson 2: a rig of one's own, from pictures to a moving bone. Works on whatever is open: every step compares with where the lesson began. */
export const RIG_LESSON: Lesson = {
  id: 'rig',
  title: { en: 'Your own rig', ru: 'Свой риг' },
  intro: {
    en: 'From a picture to a moving bone, in six steps. It works on any project: new or not.',
    ru: 'От картинки до движущейся кости за шесть шагов. Работает на любом проекте: новом и нет.',
  },
  outro: {
    en: 'Your picture moves with its bone. Real characters are the same, only with more bones: add a bone for every part that has to move.',
    ru: 'Картинка двигается вместе со своей костью. Настоящие персонажи устроены так же, только костей больше: по кости на каждую движущуюся часть.',
  },
  next: 'mesh',
  steps: [
    {
      id: 'pictures',
      target: 'images',
      title: { en: 'Bring pictures', ru: 'Добавьте картинки' },
      text: {
        en: 'Drop PNG files into the window. No pictures at hand? The button adds two sample ones.',
        ru: 'Перетащите PNG-файлы в окно. Нет картинок под рукой? Кнопка добавит две учебные.',
      },
      helper: { id: 'samplePictures', label: { en: 'Add sample pictures', ru: 'Добавить учебные картинки' } },
      done: (s, base) => s.images > base.images,
    },
    {
      id: 'bone',
      target: 'viewport',
      title: { en: 'Draw a bone', ru: 'Нарисуйте кость' },
      text: {
        en: 'Press B, then drag in the viewport from where the bone starts to where it ends.',
        ru: 'Нажмите B и протяните во вьюпорте от начала кости до её конца.',
      },
      done: (s, base) => s.bones > base.bones,
    },
    {
      id: 'attach',
      target: 'images',
      title: { en: 'Put a picture on the bone', ru: 'Посадите картинку на кость' },
      text: {
        en: 'With the new bone selected, drag a picture from Images into the viewport: it joins the selected bone and moves with it.',
        ru: 'Когда новая кость выбрана, перетащите картинку из «Картинок» во вьюпорт: она встанет на выбранную кость и будет двигаться с ней.',
      },
      done: (s, base) => s.ownSlots > base.ownSlots,
    },
    {
      id: 'animate',
      target: 'mode',
      title: { en: 'Switch to Animate', ru: 'Перейдите в «Анимацию»' },
      text: {
        en: 'Press Tab or click Animate: from now on a change of the pose becomes a key.',
        ru: 'Нажмите Tab или кнопку «Анимация»: теперь изменение позы становится ключом.',
      },
      done: (s) => s.mode === 'animate',
    },
    {
      id: 'key',
      target: 'viewport',
      title: { en: 'Turn the bone', ru: 'Поверните кость' },
      text: {
        en: 'Move the time marker on the timeline and turn the bone: the picture follows, and a key is made.',
        ru: 'Передвиньте маркер времени на таймлайне и поверните кость: картинка последует за ней, ключ создастся сам.',
      },
      done: (s, base) => s.keys > base.keys,
    },
    {
      id: 'play',
      target: 'play',
      title: { en: 'Play it', ru: 'Проиграйте' },
      text: {
        en: 'Press Space: your rig plays the animation. Press Space again to stop.',
        ru: 'Нажмите Пробел: ваш риг проиграет анимацию. Ещё раз Пробел остановит её.',
      },
      done: (s) => s.seenPlaying,
    },
  ],
};

/** Lesson 3: a picture that bends. A mesh is a picture cut into triangles; bound to bones, its points follow them with weights. */
export const MESH_LESSON: Lesson = {
  id: 'mesh',
  title: { en: 'A picture that bends', ru: 'Картинка, которая гнётся' },
  intro: {
    en: 'Turn a picture into a mesh and bind it to a bone, so it bends instead of turning stiffly. Needs a picture on a slot and a bone.',
    ru: 'Превратите картинку в сетку и привяжите к кости: она будет гнуться, а не поворачиваться целиком. Нужны картинка в слоте и кость.',
  },
  outro: {
    en: 'The picture bends with its bones. Bind to two or more bones and paint the weights: that is how tails, arms and cloth are made.',
    ru: 'Картинка гнётся вместе с костями. Привяжите к двум и более костям и подкрасьте веса: так делают хвосты, руки и ткань.',
  },
  next: 'ik',
  steps: [
    {
      id: 'slot',
      target: 'tree',
      title: { en: 'Pick a picture', ru: 'Выберите картинку' },
      text: {
        en: 'Click a picture (a slot, the layered icon) in the hierarchy. No pictures yet? Do the lesson "Your own rig" first.',
        ru: 'Нажмите на картинку (слот, значок со слоями) в иерархии. Картинок ещё нет? Сначала пройдите урок «Свой риг».',
      },
      done: (s) => s.slotSelected,
    },
    {
      id: 'mesh',
      target: 'inspector',
      title: { en: 'Make it a mesh', ru: 'Сделайте сетку' },
      text: {
        en: 'In the Inspector press Quad (four corners) or Trace mesh (follows the outline). The mesh appears on the picture.',
        ru: 'В инспекторе нажмите «Квадрат» (четыре угла) или «Трассировать сетку» (по контуру). Сетка появится на картинке.',
      },
      done: (s, base) => s.meshes > base.meshes,
    },
    {
      id: 'bind',
      target: 'inspector',
      title: { en: 'Bind it to bones', ru: 'Привяжите к костям' },
      text: {
        en: 'Select the bone or bones that should move it, then press the Bind button in the Inspector.',
        ru: 'Выберите кость или кости, которые должны её двигать, и нажмите кнопку привязки в инспекторе.',
      },
      done: (s, base) => s.weightedMeshes > base.weightedMeshes,
    },
    {
      id: 'weights',
      target: 'viewport',
      title: { en: 'Look at the weights', ru: 'Посмотрите на веса' },
      text: {
        en: 'Press W: the brush paints how strongly each bone pulls the mesh. Paint a little, then press V to go back.',
        ru: 'Нажмите W: кисть красит, насколько сильно каждая кость тянет сетку. Проведите кистью и вернитесь на V.',
      },
      done: (s) => s.seenWeightsTool,
    },
    {
      id: 'animate',
      target: 'mode',
      title: { en: 'Switch to Animate', ru: 'Перейдите в «Анимацию»' },
      text: {
        en: 'Press Tab or click Animate.',
        ru: 'Нажмите Tab или кнопку «Анимация».',
      },
      done: (s) => s.mode === 'animate',
    },
    {
      id: 'bend',
      target: 'viewport',
      title: { en: 'Bend it', ru: 'Согните её' },
      text: {
        en: 'Move the time marker and turn a bone: the mesh bends with it. A key is made.',
        ru: 'Передвиньте маркер времени и поверните кость: сетка согнётся вместе с ней. Ключ создастся сам.',
      },
      done: (s, base) => s.keys > base.keys,
    },
  ],
};

/** Lesson 4: IK. Move the end of a limb and the limb follows, instead of turning every bone by hand. */
export const IK_LESSON: Lesson = {
  id: 'ik',
  title: { en: 'A leg that follows', ru: 'Нога, которая следует за целью' },
  intro: {
    en: 'IK makes a chain of bones follow a target: move the target, and the limb bends to reach it. Needs a bone that is not the root.',
    ru: 'IK заставляет цепочку костей следовать за целью: двигаете цель, и конечность сгибается, чтобы дотянуться. Нужна кость, не корневая.',
  },
  outro: {
    en: 'That is how legs stay on the ground and hands reach things: animate the target, not every bone.',
    ru: 'Так ноги стоят на земле, а руки достают до предметов: анимируйте цель, а не каждую кость.',
  },
  steps: [
    {
      id: 'bone',
      target: 'tree',
      title: { en: 'Pick the end of a limb', ru: 'Выберите конец конечности' },
      text: {
        en: 'Click the last bone of an arm, a leg or a tail in the hierarchy (not the root).',
        ru: 'Нажмите на последнюю кость руки, ноги или хвоста в иерархии (не корень).',
      },
      done: (s) => s.selectedBones > 0,
    },
    {
      id: 'ik',
      target: 'toolIk',
      title: { en: 'Draw an IK target', ru: 'Создайте IK-цель' },
      text: {
        en: 'Press I, then drag from the tip of that bone out into empty space: an orange target appears and the chain follows it.',
        ru: 'Нажмите I и протяните от кончика этой кости в пустое место: появится оранжевая цель, и цепочка пойдёт за ней.',
      },
      done: (s, base) => s.ikConstraints > base.ikConstraints,
    },
    {
      id: 'pull',
      target: 'viewport',
      title: { en: 'Move the target', ru: 'Подвигайте цель' },
      text: {
        en: 'Press V, then drag the orange target: the limb bends to reach it, and no bone was turned by hand.',
        ru: 'Нажмите V и потяните оранжевую цель: конечность согнётся, чтобы дотянуться, и ни одну кость не крутили вручную.',
      },
      done: (s) => s.editsSinceIk >= 1,
    },
    {
      id: 'animate',
      target: 'mode',
      title: { en: 'Switch to Animate', ru: 'Перейдите в «Анимацию»' },
      text: {
        en: 'Press Tab or click Animate.',
        ru: 'Нажмите Tab или кнопку «Анимация».',
      },
      done: (s) => s.mode === 'animate',
    },
    {
      id: 'key',
      target: 'viewport',
      title: { en: 'Key the target', ru: 'Поставьте ключ на цель' },
      text: {
        en: 'Move the time marker and move the target: only the target gets a key, the limb follows it.',
        ru: 'Передвиньте маркер времени и сдвиньте цель: ключ получает только цель, конечность следует за ней.',
      },
      done: (s, base) => s.keys > base.keys,
    },
    {
      id: 'play',
      target: 'play',
      title: { en: 'Play it', ru: 'Проиграйте' },
      text: {
        en: 'Press Space: the limb follows the moving target. Press Space again to stop.',
        ru: 'Нажмите Пробел: конечность следует за движущейся целью. Ещё раз Пробел остановит её.',
      },
      done: (s) => s.seenPlaying,
    },
  ],
};

export const LESSONS: readonly Lesson[] = [FOX_LESSON, RIG_LESSON, MESH_LESSON, IK_LESSON];

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
