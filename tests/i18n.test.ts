import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { setLang, tr } from '@/i18n';
import { RU } from '@/i18n/ru';
import { ZH } from '@/i18n/zh';
import { shownTexts } from './i18nscan';

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternRes = Object.keys(RU)
  .filter((k) => /\{#?\}/.test(k))
  .map(
    (k) =>
      new RegExp(
        '^' +
          k
            .split(/(\{#?\})/)
            .map((tok) => (tok === '{}' ? '(.+?)' : tok === '{#}' ? '(\\d+(?:\\.\\d+)?)' : escapeRe(tok)))
            .join('') +
          '$',
      ),
  );
const covered = (text: string) => Object.prototype.hasOwnProperty.call(RU, text) || patternRes.some((re) => re.test(text));

/** Plain English text, not code that happens to sit between angle brackets. */
const looksLikeText = (t: string) =>
  /^[A-Za-z][A-Za-z0-9 .,:!'"()+\-–—·…→⇄←/&%×−°]*$/.test(t) && /[A-Za-z]{2}/.test(t) && !t.includes('&&');

/** UI strings written literally in the sources: JSX text, text props, toasts, undo labels, menu items. */
function staticStrings(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const seen = new Set<string>();
  const add = (file: string, raw: string) => {
    const text = raw.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (!looksLikeText(text) || seen.has(text)) return;
    seen.add(text);
    out.push({ file, text });
  };
  for (const dir of ['src/editor', 'src/store']) {
    for (const f of sources(join(process.cwd(), dir))) {
      const src = readFileSync(f, 'utf8');
      const file = f.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/');
      if (f.endsWith('.tsx')) {
        for (const m of src.matchAll(/>([^<>{}]+)</g)) add(file, m[1]);
        for (const m of src.matchAll(/\b(?:title|label|placeholder|aria-label|alt)="([^"{}]+)"/g)) add(file, m[1]);
      }
      for (const m of src.matchAll(/\b(?:toast|item)\(\s*'([^'$\\]+)'/g)) add(file, m[1]);
      for (const m of src.matchAll(/\.update\(\s*'([^'$\\]+)'/g)) add(file, m[1]);
      for (const m of src.matchAll(/\b(?:label|title|hint|text):\s*'([^'$\\]+)'/g)) add(file, m[1]);
    }
  }
  return out;
}

describe('interface language', () => {
  afterAll(() => setLang('en'));

  it('has the same keys in Russian and in Chinese', () => {
    expect(Object.keys(ZH).sort()).toEqual(Object.keys(RU).sort());
  });

  it('keeps the placeholders of every pattern', () => {
    for (const [en, ru] of [...Object.entries(RU), ...Object.entries(ZH)]) {
      const parts = (en.match(/\{#?\}/g) ?? []).length;
      const used = [...ru.matchAll(/\{(\d*)\}/g)];
      if (parts === 0) {
        expect(used.length, `"${en}" has no {} but its translation does`).toBe(0);
        continue;
      }
      expect(used.length, `"${en}" drops its {}`).toBeGreaterThan(0);
      let next = 0;
      for (const m of used) {
        const index = m[1] ? Number(m[1]) : ++next;
        expect(index >= 1 && index <= parts, `"${en}" -> "${ru}" refers to part ${index} of ${parts}`).toBe(true);
      }
    }
  });

  it('translates, keeps surrounding spaces, and leaves English, numbers and unknown text alone', () => {
    setLang('ru');
    expect(tr('Save')).toBe('Сохранить');
    expect(tr('  Save ')).toBe('  Сохранить ');
    expect(tr('arm-upper')).toBe('arm-upper');
    expect(tr('42')).toBe('42');
    expect(tr('')).toBe('');
    setLang('en');
    expect(tr('Save')).toBe('Save');
  });

  it('translates texts built from parts, including the parts', () => {
    setLang('ru');
    expect(tr('Copied 3 keys')).toBe('Скопировано ключей: 3');
    expect(tr('Copied 1 key')).toBe('Скопировано ключей: 1');
    expect(tr('Set Rotation key at the playhead')).toBe('Поставить ключ «Поворот» в текущем кадре');
    expect(tr('Undo Move vertices')).toBe('Отменить: Переместить вершины');
    expect(tr('Mesh: 24 vertices, 40 triangles')).toBe('Меш: вершин — 24, треугольников — 40');
    expect(tr('"leg" is part of the IK constraint "walk" — remove the constraint to move it')).toBe(
      '«leg» входит в IK-констрейнт «walk» — удали констрейнт, чтобы переместить кость',
    );
    expect(tr('Opened bolt.bone2d (2 problems repaired, 1 image could not be read)')).toBe(
      'Открыто: bolt.bone2d (исправлено проблем: 2, не удалось прочитать картинок: 1)',
    );
    expect(tr('Opened bolt.bone2d')).toBe('Открыто: bolt.bone2d');
    expect(tr('arm · rotation')).toBe('arm · поворот');
    expect(tr('Interpolation · 3 keys')).toBe('Интерполяция · ключей: 3');
    setLang('en');
  });

  it('translates the counters of the empty inspector and the hint titles', () => {
    setLang('ru');
    expect(tr('Bones: 12')).toBe('Кости: 12');
    expect(tr('Warnings: 3')).toBe('Предупреждения: 3');
    expect(tr('Click to read all')).not.toBe('Click to read all');
    expect(tr('Click to fold')).not.toBe('Click to fold');
  });

  it('writes Chinese where it should: no Russian letters, and no sentence left in English', () => {
    expect(Object.values(ZH).filter((zh) => /[а-яё]/i.test(zh) || zh.trim() === '')).toEqual([]);
    // what has no Chinese character is a name that stays as it is: a format, a key, a unit, a product
    const kept = Object.entries(ZH).filter(([, zh]) => !/[\u4e00-\u9fff]/.test(zh));
    expect(kept.filter(([en]) => /[a-z]{3,} [a-z]{3,}/.test(en)).map(([en]) => en)).toEqual([]);
  });

  it('translates texts built from parts into Chinese, with the parts in the order Chinese needs', () => {
    setLang('zh');
    expect(tr('Save')).toBe('保存');
    expect(tr('arm-upper')).toBe('arm-upper');
    expect(tr('Copied 3 keys')).toBe('已复制 3 个关键帧');
    expect(tr('Made 3 animations from "walk"')).toBe('已从“walk”生成 3 个动画');
    expect(tr('Took 2 from old save')).toBe('已从 old save 取回 2 项');
    expect(tr('Opened bolt.bone2d (2 problems repaired, 1 image could not be read)')).toBe(
      '已打开 bolt.bone2d（修复了 2 个问题，1 张图片无法读取）',
    );
    expect(tr('arm · rotation')).toBe('arm · 旋转');
    setLang('en');
  });

  it('translates every message, error, undo label and hint that the sources build, into both languages', () => {
    const texts = shownTexts();
    expect(texts.length).toBeGreaterThan(800); // the scan itself works
    for (const [lang, table] of [
      ['ru', RU],
      ['zh', ZH],
    ] as const) {
      setLang(lang);
      const left = texts
        .filter((s) => !Object.hasOwn(table, s.text))
        // unchanged, or a catch-all pattern took a part of the sentence and left the rest in English
        .filter((s) => tr(s.text) === s.text || /[A-Za-z]{2,} [a-z]{2,} [a-z]{2,}/.test(tr(s.text)))
        .map((s) => `${s.file}:${s.line}: ${s.text}`);
      expect(left, `add these to src/i18n/${lang}.ts`).toEqual([]);
    }
  });

  it('translates a message about an imported file with the names in their places', () => {
    setLang('ru');
    expect(tr('bone "arm" ignores part of a parent that stretches one way more than the other: its angle can differ')).toMatch(
      /^кость «arm» частично/,
    );
    expect(tr('skin "red": mesh attachment "cape" is not supported and was skipped')).toBe(
      'скин «red»: вложение «cape» типа mesh не поддерживается и пропущено',
    );
    expect(tr('Could not import: The binary file is cut off or damaged')).toBe(
      'Не удалось импортировать: Бинарный файл обрезан или повреждён',
    );
    setLang('en');
  });

  it('has a text in every language for every static UI string in the sources', () => {
    const strings = staticStrings();
    expect(strings.length).toBeGreaterThan(150); // the scan itself works
    const missing = strings.filter((s) => !covered(s.text)).map((s) => `${s.file}: ${s.text}`);
    expect(missing, 'add these to src/i18n/ru.ts and src/i18n/zh.ts').toEqual([]);
  });
});
