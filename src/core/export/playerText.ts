/**
 * The words of the player page, in the languages of the editor. The page is one file that goes to people who never saw the editor, so it
 * chooses its language by itself from the language of the browser that opens it (Russian or Chinese when it is one of those, English for everything else).
 * Pure: the player script and the tests read the same table.
 */

export type PlayerLang = 'en' | 'ru' | 'zh';

const en = {
  play: 'Play',
  pause: 'Pause',
  background: 'Background',
  backgroundTip: 'Light or dark background',
  comment: 'Comment',
  commentTip: 'Put a comment on this moment of the animation',
  send: 'Send comments ({n})',
  sendTip: 'Download your comments as a file to send to the animator',
  close: 'Close',
  addComment: 'Add comment',
  yourName: 'Your name',
  whatShould: 'What should change here?',
  animation: 'Animation',
  skin: 'Skin',
  defaultSkin: 'default',
  dialogLabel: 'Comment',
  boneHint: 'Click a bone in the picture to point the comment at it',
  bone: 'Bone: {name}',
  clearBone: 'Do not point at a bone',
  couldNotStart: 'Could not start the player: {message}',
} as const;

export type PlayerKey = keyof typeof en;

const ru: Record<PlayerKey, string> = {
  play: 'Играть',
  pause: 'Пауза',
  background: 'Фон',
  backgroundTip: 'Светлый или тёмный фон',
  comment: 'Комментарий',
  commentTip: 'Оставить комментарий на этом моменте анимации',
  send: 'Отправить комментарии ({n})',
  sendTip: 'Скачать комментарии файлом, чтобы отправить аниматору',
  close: 'Закрыть',
  addComment: 'Добавить комментарий',
  yourName: 'Ваше имя',
  whatShould: 'Что здесь нужно изменить?',
  animation: 'Анимация',
  skin: 'Скин',
  defaultSkin: 'по умолчанию',
  dialogLabel: 'Комментарий',
  boneHint: 'Щёлкните кость на картинке, чтобы указать на неё в комментарии',
  bone: 'Кость: {name}',
  clearBone: 'Не указывать кость',
  couldNotStart: 'Не удалось запустить плеер: {message}',
};

const zh: Record<PlayerKey, string> = {
  play: '播放',
  pause: '暂停',
  background: '背景',
  backgroundTip: '浅色或深色背景',
  comment: '评论',
  commentTip: '在动画的当前时刻添加评论',
  send: '发送评论（{n}）',
  sendTip: '把你的评论下载为文件，发给动画师',
  close: '关闭',
  addComment: '添加评论',
  yourName: '你的名字',
  whatShould: '这里需要怎么改？',
  animation: '动画',
  skin: '皮肤',
  defaultSkin: '默认',
  dialogLabel: '评论',
  boneHint: '单击画面中的骨骼，让评论指向它',
  bone: '骨骼：{name}',
  clearBone: '不指向任何骨骼',
  couldNotStart: '无法启动播放器：{message}',
};

export const PLAYER_TEXTS: Record<PlayerLang, Record<PlayerKey, string>> = { en, ru, zh };

/** The language of the page for the language of the browser (`navigator.language`, `ru`, `ru-RU`, `RU_ru`…). */
export function playerLang(browserLanguage: string | null | undefined): PlayerLang {
  const code = typeof browserLanguage === 'string' ? browserLanguage.trim() : '';
  return /^ru(?![a-z])/i.test(code) ? 'ru' : /^zh(?![a-z])/i.test(code) ? 'zh' : 'en';
}

/** A text of the page in a language, with `{name}` places filled in. */
export function playerText(lang: PlayerLang, key: PlayerKey, vars: Record<string, string | number> = {}): string {
  return PLAYER_TEXTS[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}
