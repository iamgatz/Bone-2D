/** Preferences: what is read back from storage, and the tool letters that can be changed. */
import { afterEach, describe, expect, it } from 'vitest';
import { hotkeyGroups } from '../src/editor/hotkeys';
import { TOOLS, hotkeyOf, setToolKey, toolForKey } from '../src/editor/tools';
import { DEFAULT_SETTINGS, readSettings, resetSettings } from '../src/store/settings';

afterEach(resetSettings);

describe('settings', () => {
  it('start from the defaults when nothing or garbage is stored', () => {
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings('{broken')).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(JSON.stringify({ autosave: 'yes', viewportBg: [2, 0, 0], smoothing: 1 }))).toEqual(DEFAULT_SETTINGS);
  });

  it('keep what is valid', () => {
    const s = readSettings(JSON.stringify({ autosave: false, viewportBg: [0.5, 0.5, 0.5], zoomToMouse: false, smoothing: false }));
    expect(s).toMatchObject({ autosave: false, zoomToMouse: false, smoothing: false, viewportBg: [0.5, 0.5, 0.5] });
  });

  it('drop tool letters that are not one capital letter or that two tools share', () => {
    const s = readSettings(JSON.stringify({ toolKeys: { select: 'Q', create: 'Q', rotate: 'ab', scale: '5' } }));
    expect(s.toolKeys).toEqual({ select: 'Q' });
  });
});

describe('tool letters', () => {
  it('can be changed, and the key handler and the shortcuts table follow', () => {
    expect(toolForKey('q')).toBeUndefined();
    expect(setToolKey('rotate', 'q')).toBeNull();
    expect(hotkeyOf('rotate')).toBe('Q');
    expect(toolForKey('q')).toBe('rotate');
    expect(toolForKey('r')).toBeUndefined(); // the old letter is free
    expect(hotkeyGroups()[0].rows.find((r) => r.label === 'Rotate')?.keys).toEqual(['Q']);
  });

  it('refuse a letter that another tool has, and change nothing', () => {
    const owner = TOOLS.find((t) => t.hotkey === 'V')!.tool;
    expect(setToolKey('rotate', 'v')).toBe(owner);
    expect(hotkeyOf('rotate')).toBe('R');
  });

  it('go back to the default when the default letter is typed again', () => {
    setToolKey('rotate', 'q');
    expect(setToolKey('rotate', 'r')).toBeNull();
    expect(hotkeyOf('rotate')).toBe('R');
  });
});
