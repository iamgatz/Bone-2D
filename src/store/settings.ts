/**
 * Preferences (Spine's Settings window, F12). Kept in the browser, applied at once. Unlike the project they belong to the person, not to the file.
 */
import { createStore, useStore } from './store';

export interface Settings {
  /** Save the open project to the browser every moment it changes. */
  autosave: boolean;
  /** Viewport background, r g b in 0..1. */
  viewportBg: [number, number, number];
  /** Smooth (linear) textures; off shows the pixels as they are. */
  smoothing: boolean;
  /** The wheel zooms around the pointer; off zooms around the middle of the viewport. */
  zoomToMouse: boolean;
  /** Show the welcome window when the editor starts with nothing to restore. */
  showWelcome: boolean;
  /** Onion skin: frames shown before and after the playhead, and the frames between two of them. */
  onionBefore: number;
  onionAfter: number;
  onionGap: number;
  /** How thick the bones are drawn in the viewport, in percent of the default. */
  boneScale: number;
  /** Show the hints that pop up over buttons and fields. */
  tooltips: boolean;
  /** Letters of the tools that differ from the defaults (tools.ts). */
  toolKeys: Record<string, string>;
  /** Key combinations of the commands that differ from the defaults (hotkeys.ts), by command id: "Ctrl+Shift+S". */
  keyMap: Record<string, string>;
}

/** A combination as the editor writes it: Ctrl, Alt and Shift in that order, then one key. */
export const BONE_SCALES = [50, 75, 100, 150, 200] as const;

export const COMBO = /^(Ctrl\+)?(Alt\+)?(Shift\+)?(F\d{1,2}|Tab|Space|[^\s+])$/;

export const DEFAULT_SETTINGS: Settings = {
  autosave: true,
  viewportBg: [0.075, 0.082, 0.1],
  smoothing: true,
  zoomToMouse: true,
  showWelcome: true,
  onionBefore: 2,
  onionAfter: 2,
  onionGap: 3,
  boneScale: 100,
  tooltips: true,
  toolKeys: {},
  keyMap: {},
};

const KEY = 'bone2d.settings';

const isRgb = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && n >= 0 && n <= 1);

/** Takes stored text for what it is worth: what is not valid keeps its default. */
export function readSettings(raw: string | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, toolKeys: {}, keyMap: {} };
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as Partial<Settings>;
    if (typeof data.autosave === 'boolean') out.autosave = data.autosave;
    if (isRgb(data.viewportBg)) out.viewportBg = data.viewportBg;
    if (typeof data.smoothing === 'boolean') out.smoothing = data.smoothing;
    if (typeof data.zoomToMouse === 'boolean') out.zoomToMouse = data.zoomToMouse;
    if (typeof data.showWelcome === 'boolean') out.showWelcome = data.showWelcome;
    const whole = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
    if (whole(data.onionBefore, 0, 6)) out.onionBefore = data.onionBefore;
    if (whole(data.onionAfter, 0, 6)) out.onionAfter = data.onionAfter;
    if (whole(data.onionGap, 1, 30)) out.onionGap = data.onionGap;
    if ((BONE_SCALES as readonly unknown[]).includes(data.boneScale)) out.boneScale = data.boneScale as number;
    if (typeof data.tooltips === 'boolean') out.tooltips = data.tooltips;
    if (data.toolKeys && typeof data.toolKeys === 'object') {
      const used = new Set<string>();
      for (const [tool, letter] of Object.entries(data.toolKeys)) {
        if (typeof letter === 'string' && /^[A-Z]$/.test(letter) && !used.has(letter)) {
          out.toolKeys[tool] = letter;
          used.add(letter);
        }
      }
    }
    if (data.keyMap && typeof data.keyMap === 'object') {
      const used = new Set<string>();
      for (const [id, combo] of Object.entries(data.keyMap)) {
        if (typeof combo === 'string' && COMBO.test(combo) && !used.has(combo)) {
          out.keyMap[id] = combo;
          used.add(combo);
        }
      }
    }
  } catch {
    /* damaged: defaults */
  }
  return out;
}

function load(): Settings {
  try {
    return readSettings(localStorage.getItem(KEY));
  } catch {
    return readSettings(null);
  }
}

export const settingsStore = createStore<Settings>(load());

export function useSettings<S>(selector: (s: Settings) => S): S {
  return useStore(settingsStore, selector);
}

/** Changes preferences and remembers them. */
export function setSettings(patch: Partial<Settings>) {
  settingsStore.patch(patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settingsStore.get()));
  } catch {
    /* not persisted */
  }
}

export function resetSettings() {
  setSettings({ ...DEFAULT_SETTINGS, toolKeys: {}, keyMap: {} });
}
