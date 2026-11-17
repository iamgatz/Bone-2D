/**
 * The keys of the editor are named once (src/editor/tools.ts for the tool letters, src/editor/hotkeys.ts for the rest) and three things read
 * that table: the tooltips, the shortcuts window and the key handler. This test keeps them together: a row of the shortcuts window that the handler does
 * not implement, or a key in a tooltip that is typed by hand, fails it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOTKEY_GROUPS, KEYS } from '@/editor/hotkeys';
import { HINTS, TOOLS, toolForKey } from '@/editor/tools';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const app = read('src/editor/App.tsx');

describe('tools', () => {
  it('have one letter each, and no two share it', () => {
    const letters = TOOLS.map((t) => t.hotkey);
    expect(letters.every((l) => /^[A-Z]$/.test(l))).toBe(true);
    expect(new Set(letters).size).toBe(letters.length);
  });

  it('are the tools that have a hint, and the letter finds the tool in either case', () => {
    expect(TOOLS.map((t) => t.tool).sort()).toEqual(Object.keys(HINTS).sort());
    for (const t of TOOLS) {
      expect(toolForKey(t.hotkey)).toBe(t.tool);
      expect(toolForKey(t.hotkey.toLowerCase())).toBe(t.tool);
    }
    expect(toolForKey('q')).toBeUndefined();
  });
});

describe('the shortcuts window', () => {
  const rows = HOTKEY_GROUPS.flatMap((g) => g.rows);

  it('lists every tool and names every combination once', () => {
    for (const t of TOOLS) expect(rows.some((r) => r.keys.includes(t.hotkey) && r.label === t.title)).toBe(true);
    const combos = rows.flatMap((r) => r.keys);
    expect(combos.filter((c, i) => combos.indexOf(c) !== i)).toEqual([]);
    const labels = rows.map((r) => r.label);
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
  });

  it('is implemented by the key handler', () => {
    // a key as the handler sees it (e.key in lower case) -> where it must appear in App.tsx
    const handled = (combo: string): string | null => {
      if (/drag|Wheel/.test(combo)) return null; // the pointer, not the keyboard: the viewport and the timeline handle it
      const parts = combo.split('+');
      const key = parts[parts.length - 1];
      const lower: Record<string, string> = { Tab: 'tab', Space: ' ', Del: 'delete', Backspace: 'backspace', Home: 'home', Enter: 'enter', Esc: 'escape', '←': 'arrowleft', '→': 'arrowright', '?': '?' };
      const name = lower[key] ?? key.toLowerCase();
      if (parts.includes('Ctrl')) return `key === '${name}'`;
      if (parts.includes('Shift')) return `e.shiftKey`; // Shift with an arrow: ten frames
      if (/^[A-Z]$/.test(key) && TOOLS.some((t) => t.hotkey === key)) return 'toolForKey(key)';
      return `case '${name}'`;
    };
    const missing: string[] = [];
    for (const r of rows) for (const combo of r.keys) {
      const needle = handled(combo);
      if (needle && !app.includes(needle)) missing.push(`${r.label}: ${combo} (App.tsx has no ${needle})`);
    }
    expect(missing).toEqual([]);
  });
});

describe('tooltips', () => {
  it('take the keys from the table, never typed by hand', () => {
    for (const f of ['src/editor/App.tsx', 'src/editor/timeline/Timeline.tsx']) {
      const typed = [...read(f).matchAll(/hotkey="([^"]*)"/g)].map((m) => m[1]);
      expect(typed, f).toEqual([]);
    }
    expect(KEYS.undo).toBe('Ctrl+Z');
  });
});
