/**
 * Every action of the editor by name, for the command palette (Ctrl+K): type a few letters of what you want. Spine has no such thing.
 * The titles are English strings like the rest of the interface and get translated where they are shown.
 */
import { selectAnimation, setMode, setTool, togglePlay } from '@/store/actions';
import { docStore } from '@/store/doc';
import { LAYOUTS, VIEW_LIST } from '@/store/layout';
import { copyPose, duplicateSelection, pastePose, resetPose } from '@/store/poseActions';
import { newProject, openProjectFile, saveProjectFile } from '@/store/project';
import { loadSample } from '@/store/sample';
import { uiStore } from '@/store/ui';
import { applyLayout, toggleAllViews, toggleView } from '@/store/viewActions';
import { KEYS } from './hotkeys';
import { openSpineImport } from './importSpine';
import { TOOLS, hotkeyOf } from './tools';
import { viewportApi } from './viewport/Viewport';

export interface Command {
  id: string;
  title: string;
  /** Where it lives in the interface; shown dimmed next to the title. */
  group: string;
  keys?: string;
  run: () => void;
}

const open = (key: 'exportOpen' | 'helpOpen' | 'updatesOpen' | 'feedbackOpen' | 'settingsOpen' | 'welcomeOpen') => () => uiStore.patch({ [key]: true });

export function buildCommands(): Command[] {
  const doc = docStore.get().skeleton;
  const list: Command[] = [
    { id: 'file.new', group: 'File', title: 'New project', run: () => newProject() },
    { id: 'file.open', group: 'File', title: 'Open…', keys: KEYS.open, run: () => void openProjectFile() },
    { id: 'file.save', group: 'File', title: 'Save', keys: KEYS.save, run: () => void saveProjectFile() },
    { id: 'file.export', group: 'File', title: 'Export', keys: KEYS.export, run: open('exportOpen') },
    { id: 'file.import', group: 'File', title: 'Import Spine data (JSON 4.0–4.3, binary 4.3)…', run: () => openSpineImport() },
    { id: 'file.demo', group: 'File', title: 'Load demo rig (Kit)', run: () => loadSample() },
    { id: 'file.welcome', group: 'File', title: 'Welcome screen', run: open('welcomeOpen') },
    { id: 'edit.undo', group: 'Edit', title: 'Undo', keys: KEYS.undo, run: () => docStore.undo() },
    { id: 'edit.redo', group: 'Edit', title: 'Redo', keys: KEYS.redo, run: () => docStore.redo() },
    { id: 'edit.duplicate', group: 'Edit', title: 'Duplicate bones', keys: KEYS.duplicate, run: () => duplicateSelection(false) },
    { id: 'edit.mirror', group: 'Edit', title: 'Mirror bones', keys: KEYS.mirror, run: () => duplicateSelection(true) },
    { id: 'edit.reset', group: 'Edit', title: 'Reset pose', run: () => resetPose() },
    { id: 'edit.copypose', group: 'Edit', title: 'Copy pose', run: () => copyPose() },
    { id: 'edit.pastepose', group: 'Edit', title: 'Paste pose', run: () => pastePose() },
    { id: 'mode.toggle', group: 'Animation', title: 'Setup ⇄ Animate', keys: KEYS.mode, run: () => setMode(uiStore.get().mode === 'setup' ? 'animate' : 'setup') },
    { id: 'anim.play', group: 'Animation', title: 'Play / pause', keys: KEYS.play, run: () => togglePlay() },
    { id: 'view.frame', group: 'View', title: 'Frame skeleton', keys: KEYS.frame, run: () => viewportApi.frame() },
    { id: 'view.onion', group: 'View', title: 'Onion skin', run: () => uiStore.patch({ view: { ...uiStore.get().view, onion: !uiStore.get().view.onion } }) },
    { id: 'view.grid', group: 'View', title: 'Grid', run: () => uiStore.patch({ view: { ...uiStore.get().view, grid: !uiStore.get().view.grid } }) },
    { id: 'view.names', group: 'View', title: 'Bone names', run: () => uiStore.patch({ view: { ...uiStore.get().view, names: !uiStore.get().view.names } }) },
    { id: 'view.hide', group: 'Windows', title: 'Hide / show all windows', keys: KEYS.hideViews, run: () => toggleAllViews() },
    { id: 'app.settings', group: 'Help', title: 'Settings', keys: KEYS.settings, run: open('settingsOpen') },
    { id: 'app.shortcuts', group: 'Help', title: 'Shortcuts & help', keys: KEYS.help, run: open('helpOpen') },
    { id: 'app.updates', group: 'Help', title: 'Updates: what is new and the project activity', run: open('updatesOpen') },
    { id: 'app.feedback', group: 'Help', title: 'Send feedback to the author', run: open('feedbackOpen') },
  ];
  for (const t of TOOLS) list.push({ id: `tool.${t.tool}`, group: 'Tools', title: t.title, keys: hotkeyOf(t.tool), run: () => setTool(t.tool) });
  for (const v of VIEW_LIST) list.push({ id: `win.${v.id}`, group: 'Windows', title: v.label, run: () => toggleView(v.id) });
  for (const l of LAYOUTS) list.push({ id: `layout.${l.id}`, group: 'Windows', title: `Layout: ${l.label}`, run: () => applyLayout(l.id) });
  for (const a of doc.animations) list.push({ id: `anim.${a.id}`, group: 'Animations', title: a.name, run: () => (selectAnimation(a.id), setMode('animate')) });
  return list;
}

/** The commands that contain every word typed, best first (a title that starts with the text, then shorter ones). */
export function filterCommands(all: Command[], query: string, translate: (s: string) => string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return all;
  const scored: { c: Command; score: number }[] = [];
  for (const c of all) {
    const title = translate(c.title).toLowerCase();
    const hay = `${title} ${translate(c.group).toLowerCase()} ${c.title.toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    scored.push({ c, score: (title.startsWith(words[0]) ? 0 : 100) + title.length });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.c);
}
