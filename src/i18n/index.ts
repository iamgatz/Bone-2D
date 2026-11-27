/**
 * Interface language (English / Русский / 中文).
 *
 * The strings in the components stay English. `tr()` translates a string when it is displayed: the custom JSX runtime
 * (`jsx-runtime.ts`, selected by `jsxImportSource` in vite.config.ts and tsconfig.json) runs every string child and the text props
 * (`title`, `label`, `placeholder`, ...) through it, so components need no `t()` calls. Strings built in code (toasts, undo labels)
 * are translated the same way when they are rendered.
 *
 * To translate something new, add it to `ru.ts` and `zh.ts` (`{}` in a key matches any text and `{#}` a number; the matched parts are
 * translated too). `tests/i18n.test.ts` fails when a static UI string in the sources has no text in one of the languages.
 */
import { useSyncExternalStore } from 'react';
import { RU } from './ru';
import { ZH } from './zh';

export type Lang = 'en' | 'ru' | 'zh';

/** The languages with the names the switches show. */
export const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'ru', label: 'RU' },
  { value: 'zh', label: '中文' },
];

const STORAGE_KEY = 'bone2d.lang';
const TITLE: Record<Lang, string> = {
  en: 'Bone 2D — free 2D skeletal animation editor, a Spine alternative',
  ru: 'Bone 2D — бесплатный редактор 2D-скелетной анимации, аналог Spine',
  zh: 'Bone 2D — 免费的 2D 骨骼动画编辑器，Spine 替代工具',
};
/** What `<html lang>` says: the browser picks the glyphs of a Chinese text by it. */
const HTML_LANG: Record<Lang, string> = { en: 'en', ru: 'ru', zh: 'zh-CN' };

const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.value === v);

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage can be blocked (private mode, sandboxed frame) */
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language : '';
  // every Chinese browser gets the Simplified text: closer to a reader of the Traditional script than English is
  return /^ru\b/i.test(browser) ? 'ru' : /^zh\b/i.test(browser) ? 'zh' : 'en';
}

interface State {
  lang: Lang;
  listeners: Set<() => void>;
  cache: Map<string, string>;
}
// One state object per page, kept on globalThis: in dev the React plugin pre-bundles the JSX runtime together with its own copy of this module.
const global = globalThis as typeof globalThis & { __bone2dI18n?: State };
const state: State = (global.__bone2dI18n ??= { lang: detect(), listeners: new Set(), cache: new Map() });

function applyDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = HTML_LANG[state.lang];
  document.title = TITLE[state.lang];
}
applyDocument();

export const getLang = (): Lang => state.lang;

export function setLang(next: Lang) {
  if (next === state.lang) return;
  state.lang = next;
  state.cache.clear();
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* not persisted */
  }
  applyDocument();
  state.listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  state.listeners.add(l);
  return () => void state.listeners.delete(l);
}

/** Re-renders the component when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

interface Pattern {
  re: RegExp;
  fill: (parts: string[]) => string;
  /** Length of the literal text: the longer the more specific, tried first. */
  weight: number;
}

interface Dictionary {
  exact: Map<string, string>;
  patterns: Pattern[];
  /** What stands between the items of a translated list. */
  comma: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(table: Record<string, string>, comma: string): Dictionary {
  const exact = new Map<string, string>();
  const patterns: Pattern[] = [];
  for (const [en, text] of Object.entries(table)) {
    if (!/\{#?\}/.test(en)) {
      exact.set(en, text);
      continue;
    }
    // `{}` matches any text, `{#}` only a number
    const source = en
      .split(/(\{#?\})/)
      .map((tok) => (tok === '{}' ? '(.+?)' : tok === '{#}' ? '(\\d+(?:\\.\\d+)?)' : escapeRe(tok)))
      .join('');
    patterns.push({
      re: new RegExp('^' + source + '$'),
      fill: (parts) => {
        let next = 0;
        return text.replace(/\{(\d*)\}/g, (_, n: string) => parts[n ? Number(n) - 1 : next++] ?? '');
      },
      weight: en.replace(/\{#?\}/g, '').length,
    });
  }
  patterns.sort((a, b) => b.weight - a.weight);
  return { exact, patterns, comma };
}

const tables: Record<Exclude<Lang, 'en'>, () => Dictionary> = {
  ru: () => compile(RU, ', '),
  zh: () => compile(ZH, '，'),
};
const compiled: Partial<Record<Lang, Dictionary>> = {};
/** The dictionary of a language, built when it is first needed. */
const dictionary = (lang: Exclude<Lang, 'en'>): Dictionary => (compiled[lang] ??= tables[lang]());

const missing = new Set<string>();
function noteMissing(core: string) {
  // dev aid: English-looking text without a translation (user data such as bone names shows up here too)
  if (import.meta.env.DEV && /^[A-Z][a-z]{2,}/.test(core)) missing.add(core);
}

/** "2 problems repaired, 1 image could not be read": a list whose items are known texts. */
function translateList(core: string, comma: string): { text: string; all: boolean } | null {
  if (!core.includes(', ')) return null;
  const parts = core.split(', ');
  const out = parts.map((s) => tr(s));
  const changed = out.filter((s, i) => s !== parts[i]).length;
  return changed ? { text: out.join(comma), all: changed === parts.length } : null;
}

function translate(core: string, { exact, patterns, comma }: Dictionary): string {
  const hit = exact.get(core);
  if (hit !== undefined) return hit;
  // a list goes first: a lazy `{}` in a pattern would otherwise swallow several items
  const list = translateList(core, comma);
  if (list?.all) return list.text;
  for (const p of patterns) {
    const m = p.re.exec(core);
    if (m) return p.fill(m.slice(1).map((g) => tr(g)));
  }
  if (list) return list.text;
  noteMissing(core);
  return core;
}

/** Translates a UI string into the current language (leading / trailing spaces are kept). English stays as it is. */
export function tr(s: string): string {
  if (state.lang === 'en' || s.length === 0) return s;
  const cached = state.cache.get(s);
  if (cached !== undefined) return cached;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  let out = s;
  if (m[2] && /[A-Za-z]{2}/.test(m[2])) {
    const t = translate(m[2], dictionary(state.lang));
    if (t !== m[2]) out = m[1] + t + m[3];
  }
  if (state.cache.size > 3000) state.cache.clear();
  state.cache.set(s, out);
  return out;
}

const TEXT_PROPS = ['title', 'label', 'placeholder', 'aria-label', 'alt', 'data-tip'] as const;

/** Called by the JSX runtime for every element: translates string children and the text props. */
export function localizeProps<P>(props: P): P {
  if (state.lang === 'en' || props === null || typeof props !== 'object') return props;
  const p = props as Record<string, unknown>;
  let out: Record<string, unknown> | null = null;
  const children = p.children;
  if (typeof children === 'string') {
    const t = tr(children);
    if (t !== children) (out ??= { ...p }).children = t;
  } else if (Array.isArray(children)) {
    let changed = false;
    const mapped = children.map((c: unknown) => {
      if (typeof c !== 'string') return c;
      const t = tr(c);
      if (t !== c) changed = true;
      return t;
    });
    if (changed) (out ??= { ...p }).children = mapped;
  }
  for (const k of TEXT_PROPS) {
    const v = p[k];
    if (typeof v === 'string') {
      const t = tr(v);
      if (t !== v) (out ??= { ...p })[k] = t;
    }
  }
  return (out ?? props) as P;
}
