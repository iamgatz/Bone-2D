import { TOOLS, hotkeyOf } from './tools';

/**
 * The keys of the editor other than the tool letters (those are in tools.ts), named once: the tooltips of the buttons, the menus and the
 * shortcuts window read them from here. The handler in App.tsx implements them; tests/hotkeys.test.ts holds the two together.
 */
export const KEYS = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
  save: 'Ctrl+S',
  open: 'Ctrl+O',
  export: 'Ctrl+E',
  copy: 'Ctrl+C',
  paste: 'Ctrl+V',
  selectAll: 'Ctrl+A',
  frame: 'F',
  mode: 'Tab',
  play: 'Space',
  key: 'K',
  delete: 'Del',
  help: '?',
  hideViews: 'F9',
  settings: 'F12',
} as const;

export interface HotkeyRow {
  label: string;
  /** Alternatives; each one is a combination whose keys are joined by +. */
  keys: string[];
}
export interface HotkeyGroup {
  title: string;
  rows: HotkeyRow[];
}

/** The table with the tool letters as the person set them (Settings). */
export const hotkeyGroups = (): HotkeyGroup[] => HOTKEY_GROUPS.map((g, i) => (i === 0 ? { ...g, rows: TOOLS.map((t) => ({ label: t.title, keys: [hotkeyOf(t.tool)] })) } : g));

export const HOTKEY_GROUPS: HotkeyGroup[] = [
  { title: 'Tools', rows: TOOLS.map((t) => ({ label: t.title, keys: [t.hotkey] })) },
  {
    title: 'Animation',
    rows: [
      { label: 'Setup ⇄ Animate', keys: [KEYS.mode] },
      { label: 'Play / pause', keys: [KEYS.play] },
      { label: 'Step frame', keys: ['←', '→'] },
      { label: 'Step 10 frames', keys: ['Shift+←', 'Shift+→'] },
      { label: 'Go to the start', keys: ['Home'] },
      { label: 'Key selected bone', keys: [KEYS.key] },
    ],
  },
  {
    title: 'Edit',
    rows: [
      { label: 'Undo', keys: [KEYS.undo] },
      { label: 'Redo', keys: [KEYS.redo, 'Ctrl+Shift+Z'] },
      { label: 'Select all bones', keys: [KEYS.selectAll] },
      { label: 'Copy keys', keys: [KEYS.copy] },
      { label: 'Paste keys', keys: [KEYS.paste] },
      { label: 'Delete selection / keys', keys: [KEYS.delete, 'Backspace'] },
      { label: 'Finish a polygon or path', keys: ['Enter'] },
      { label: 'Cancel / clear the selection', keys: ['Esc'] },
    ],
  },
  {
    title: 'View',
    rows: [
      { label: 'Frame skeleton', keys: [KEYS.frame] },
      { label: 'Hide / show all windows', keys: [KEYS.hideViews] },
      { label: 'Pan viewport', keys: ['Mid drag', 'Right drag', 'Alt+drag'] },
      { label: 'Zoom', keys: ['Wheel'] },
      { label: 'Timeline zoom', keys: ['Ctrl+Wheel'] },
    ],
  },
  {
    title: 'File',
    rows: [
      { label: 'Save', keys: [KEYS.save] },
      { label: 'Open', keys: [KEYS.open] },
      { label: 'Export', keys: [KEYS.export] },
      { label: 'Shortcuts', keys: [KEYS.help] },
      { label: 'Settings', keys: [KEYS.settings] },
    ],
  },
];
