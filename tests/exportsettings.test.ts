/** Export settings: what a damaged or foreign file does, and the round trip through a file. */
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXPORT_SETTINGS, exportSettingsFromText, exportSettingsToText, loadExportSettings, readExportSettings, rememberExportSettings } from '../src/core/export/settings';

describe('export settings', () => {
  it('reads defaults from nothing, and from rubbish', () => {
    expect(readExportSettings(undefined)).toEqual(DEFAULT_EXPORT_SETTINGS);
    expect(readExportSettings('x')).toEqual(DEFAULT_EXPORT_SETTINGS);
    expect(readExportSettings({ scale: 7, maxSize: '2048', padding: -1, format: 'xml', pot: 1, filter: 'Cubic' })).toEqual(DEFAULT_EXPORT_SETTINGS);
  });

  it('keeps the valid fields and defaults the rest', () => {
    const s = readExportSettings({ scale: 0.5, trim: true, rotate: true, filter: 'Nearest', maxSize: 99 });
    expect(s).toEqual({ ...DEFAULT_EXPORT_SETTINGS, scale: 0.5, trim: true, rotate: true, filter: 'Nearest' });
  });

  it('survives a trip through a file', () => {
    const s = { ...DEFAULT_EXPORT_SETTINGS, format: 'binary' as const, padding: 4, pretty: true, trim: true, filter: 'Nearest' as const };
    expect(exportSettingsFromText(exportSettingsToText(s))).toEqual(s);
  });

  it('refuses a file that is not an export settings file', () => {
    expect(exportSettingsFromText('{"scale":0.5}')).toBeNull();
    expect(exportSettingsFromText('not json')).toBeNull();
    expect(exportSettingsFromText('[]')).toBeNull();
    expect(exportSettingsFromText('null')).toBeNull();
  });

  it('is kept between sessions', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    const s = { ...DEFAULT_EXPORT_SETTINGS, rotate: true, scale: 0.75 };
    rememberExportSettings(s);
    expect(loadExportSettings()).toEqual(s);
    localStorage.setItem('bone2d.export', '{broken');
    expect(loadExportSettings()).toEqual(DEFAULT_EXPORT_SETTINGS);
    vi.unstubAllGlobals();
  });
});
