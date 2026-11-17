import { useEffect, useState } from 'react';
import { Bone, BoxSelect, Download, Eye, FilePlus2, FolderOpen, Grid3x3, Bell, Search, Home, Layers, ClipboardCopy, ClipboardPaste, Copy, FlipHorizontal2, RotateCcw, SlidersHorizontal, Image as ImageIcon, CircleHelp, MessageSquareText, Link2, Maximize, Play, Redo2, Route, Save, Sparkles, Type, Undo2 } from 'lucide-react';
import { decodeKey } from '@/core/keyrefs';
import { clearSelection, copyKeys, deleteBones, deleteKeys, keySelectedBones, pasteKeys, sanitizeSelection, setMode, setSelection, setTime, setTool, togglePlay } from '@/store/actions';
import { docStore, useProject } from '@/store/doc';
import { newProject, openProjectFile, restoreAutosave, saveProjectFile, startAutosave } from '@/store/project';
import { openSpineImport } from './importSpine';
import { deleteConstraint } from '@/store/ikActions';
import { loadSample } from '@/store/sample';
import { toast, uiStore, useUi } from '@/store/ui';
import { setLang, useLang } from '@/i18n';
import { startPlaybackLoop } from './playback';
import { AssetsPanel } from './panels/AssetsPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { TreePanel } from './panels/TreePanel';
import { Timeline } from './timeline/Timeline';
import { Button, Dialog, IconButton, Menu, MenuItem, Splitter } from './ui/controls';
import { Segmented } from './ui/Segmented';
import { TooltipHost } from './ui/Tooltip';
import { Viewport, viewportApi } from './viewport/Viewport';
import { ExportDialog } from './ExportDialog';
import { FeedbackDialog } from './Feedback';
import { UpdatesDialog, hasUnseenUpdate } from './Updates';
import { focusArea, setFocusArea } from './focus';
import { hotkeyGroups, KEYS } from './hotkeys';
import { HINTS, TOOLS, hotkeyOf, toolForKey } from './tools';
import { SettingsDialog } from './Settings';
import { WelcomeDialog } from './Welcome';
import { Palette } from './Palette';
import { settingsStore } from '@/store/settings';
import { copyPose, duplicateSelection, pastePose, resetPose } from '@/store/poseActions';
import { useSettings } from '@/store/settings';
import { AnimationsPanel } from './panels/AnimationsPanel';
import { SkinsPanel } from './panels/SkinsPanel';
import { PlaybackPanel } from './panels/PlaybackPanel';
import { MetricsPanel } from './panels/MetricsPanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { LAYOUTS, VIEW_LIST, sameViews } from '@/store/layout';
import { applyLayout, startLayoutPersist, toggleAllViews, toggleView } from '@/store/viewActions';

function LangToggle() {
  const lang = useLang();
  return <Segmented className="lang" label="Language" value={lang} onChange={setLang} options={(['en', 'ru'] as const).map((l) => ({ value: l, label: l.toUpperCase() }))} />;
}

function TopBar() {
  const project = useProject();
  const mode = useUi((s) => s.mode);
  const view = useUi((s) => s.view);
  const views = useUi((s) => s.views);
  const updatesOpen = useUi((s) => s.updatesOpen); // the dot goes out once the window has been opened
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = docStore.subscribe(() => force((n) => n + 1));
    return () => void unsub();
  }, []);

  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <svg width="16" height="16" viewBox="0 0 32 32">
            <path d="M9 22 L16 10 L23 22" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="22" r="2.6" fill="currentColor" />
            <circle cx="16" cy="10" r="2.6" fill="currentColor" />
            <circle cx="23" cy="22" r="2.6" fill="currentColor" />
          </svg>
        </span>
        Bone 2D
      </div>
      <input className="project-name" value={project.name} spellCheck={false} onChange={(e) => docStore.update('Rename project', (d) => void (d.name = e.target.value))} aria-label="Project name" data-tip="Project name" />
      {docStore.dirty && <span className="dirty-dot" role="status" aria-label="Unsaved changes" data-tip="Unsaved changes" />}
      <Menu label="File">
        {(close) => (
          <>
            <MenuItem icon={FilePlus2} close={close} onClick={() => newProject()}>New project</MenuItem>
            <MenuItem icon={FolderOpen} close={close} hotkey={KEYS.open} onClick={() => openProjectFile()}>Open…</MenuItem>
            <MenuItem icon={Save} close={close} hotkey={KEYS.save} onClick={() => saveProjectFile()}>Save</MenuItem>
            <MenuItem icon={Save} close={close} hotkey={KEYS.saveAs} onClick={() => saveProjectFile(true)}>Save as…</MenuItem>
            <div className="menu-sep" />
            <MenuItem icon={Download} close={close} hotkey={KEYS.export} onClick={() => uiStore.patch({ exportOpen: true })}>Export for Spine 4.3…</MenuItem>
            <MenuItem icon={FolderOpen} close={close} onClick={() => openSpineImport()}>Import Spine data (JSON 4.0–4.3, binary 4.3)…</MenuItem>
            <div className="menu-sep" />
            <MenuItem icon={Sparkles} close={close} onClick={() => loadSample()}>Load demo rig (Kit)</MenuItem>
            <MenuItem icon={Home} close={close} onClick={() => uiStore.patch({ welcomeOpen: true })}>Welcome screen</MenuItem>
          </>
        )}
      </Menu>
      <Menu label="Edit">
        {(close) => (
          <>
            <MenuItem icon={Undo2} close={close} hotkey={KEYS.undo} disabled={!docStore.canUndo} onClick={() => docStore.undo()}>
              Undo
            </MenuItem>
            <MenuItem icon={Redo2} close={close} hotkey={KEYS.redo} disabled={!docStore.canRedo} onClick={() => docStore.redo()}>
              Redo
            </MenuItem>
            <div className="menu-sep" />
            <MenuItem icon={Copy} close={close} hotkey={KEYS.duplicate} disabled={mode !== 'setup'} onClick={() => duplicateSelection(false)}>
              Duplicate bones
            </MenuItem>
            <MenuItem icon={FlipHorizontal2} close={close} hotkey={KEYS.mirror} disabled={mode !== 'setup'} onClick={() => duplicateSelection(true)}>
              Mirror bones
            </MenuItem>
            <div className="menu-sep" />
            <MenuItem icon={RotateCcw} close={close} disabled={mode !== 'animate'} onClick={() => resetPose()}>
              Reset pose
            </MenuItem>
            <MenuItem icon={ClipboardCopy} close={close} onClick={() => copyPose()}>
              Copy pose
            </MenuItem>
            <MenuItem icon={ClipboardPaste} close={close} onClick={() => pastePose()}>
              Paste pose
            </MenuItem>
          </>
        )}
      </Menu>
      <Menu label="Windows">
        {(close) => (
          <>
            {VIEW_LIST.map((v) => (
              <MenuItem key={v.id} close={close} checked={views[v.id]} onClick={() => toggleView(v.id)}>
                {v.label}
              </MenuItem>
            ))}
            <div className="menu-sep" />
            {LAYOUTS.map((l) => (
              <MenuItem key={l.id} close={close} checked={sameViews(views, l.views)} onClick={() => applyLayout(l.id)}>
                {`Layout: ${l.label}`}
              </MenuItem>
            ))}
            <div className="menu-sep" />
            <MenuItem close={close} hotkey={KEYS.hideViews} onClick={() => toggleAllViews()}>
              Hide / show all windows
            </MenuItem>
          </>
        )}
      </Menu>
      <Menu label="View">
        {(close) => (
          <>
            <MenuItem close={close} icon={Grid3x3} checked={view.grid} onClick={() => uiStore.patch({ view: { ...view, grid: !view.grid } })}>Grid</MenuItem>
            <MenuItem close={close} icon={Type} checked={view.names} onClick={() => uiStore.patch({ view: { ...view, names: !view.names } })}>Bone names</MenuItem>
            <MenuItem close={close} icon={ImageIcon} checked={view.images} onClick={() => uiStore.patch({ view: { ...view, images: !view.images } })}>Images</MenuItem>
            <MenuItem close={close} icon={Bone} checked={view.bones} onClick={() => uiStore.patch({ view: { ...view, bones: !view.bones } })}>Bones</MenuItem>
            <MenuItem close={close} icon={Link2} checked={view.constraints} onClick={() => uiStore.patch({ view: { ...view, constraints: !view.constraints } })}>Constraints</MenuItem>
            <MenuItem close={close} icon={BoxSelect} checked={view.outlines} onClick={() => uiStore.patch({ view: { ...view, outlines: !view.outlines } })}>Clips, boxes &amp; points</MenuItem>
            <MenuItem close={close} icon={Layers} checked={view.onion} onClick={() => uiStore.patch({ view: { ...view, onion: !view.onion } })}>Onion skin</MenuItem>
            <MenuItem close={close} icon={Route} checked={view.trails} onClick={() => uiStore.patch({ view: { ...view, trails: !view.trails } })}>Motion trails</MenuItem>
            <div className="menu-sep" />
            <MenuItem close={close} icon={Maximize} hotkey={KEYS.frame} onClick={() => viewportApi.frame()}>Frame skeleton</MenuItem>
          </>
        )}
      </Menu>
      <span className="spacer" />
      <Segmented
        label="Mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'setup', label: 'Setup', icon: Bone, tone: 'setup', title: 'Setup: build the rig (Tab)' },
          { value: 'animate', label: 'Animate', icon: Play, tone: 'animate', title: 'Animate: pose and key (Tab)' },
        ]}
      />
      <span className="spacer" />
      <IconButton icon={Undo2} title={docStore.undoLabel ? `Undo ${docStore.undoLabel}` : 'Undo'} hotkey={KEYS.undo} disabled={!docStore.canUndo} onClick={() => docStore.undo()} />
      <IconButton icon={Redo2} title="Redo" hotkey={KEYS.redo} disabled={!docStore.canRedo} onClick={() => docStore.redo()} />
      <span className="sep" />
      <LangToggle />
      <IconButton icon={Search} title="Command palette: find any command or tool by name" hotkey={KEYS.palette} onClick={() => uiStore.patch({ paletteOpen: true })} />
      <span className="badge-wrap">
        <IconButton icon={Bell} title="Updates: what is new and the project activity" onClick={() => uiStore.patch({ updatesOpen: true })} />
        {hasUnseenUpdate() && !updatesOpen && <span className="notify-dot" role="status" aria-label="New updates" />}
      </span>
      <IconButton icon={SlidersHorizontal} title="Settings" hotkey={KEYS.settings} onClick={() => uiStore.patch({ settingsOpen: true })} />
      <IconButton icon={MessageSquareText} title="Send feedback to the author" onClick={() => uiStore.patch({ feedbackOpen: true })} />
      <IconButton icon={CircleHelp} title="Shortcuts & help" hotkey={KEYS.help} onClick={() => uiStore.patch({ helpOpen: true })} />
      <Button primary icon={Download} onClick={() => uiStore.patch({ exportOpen: true })}>Export</Button>
    </div>
  );
}

function Toolbox() {
  useSettings((s) => s.toolKeys); // the letters can be changed in Settings
  const tool = useUi((s) => s.tool);
  const mode = useUi((s) => s.mode);
  return (
    <div className="toolbox">
      {TOOLS.map((t) => (
        <IconButton key={t.tool} icon={t.icon} title={t.title} hotkey={hotkeyOf(t.tool)} tipPlace="right" active={tool === t.tool} animate={mode === 'animate'} disabled={!!t.setupOnly && mode !== 'setup'} onClick={() => setTool(t.tool)} />
      ))}
    </div>
  );
}

function ViewportHud() {
  const tool = useUi((s) => s.tool);
  const mode = useUi((s) => s.mode);
  const zoom = useUi((s) => s.camera.zoom);
  const project = useProject();
  const view = useUi((s) => s.view);
  const empty = project.skeleton.bones.length <= 1 && project.skeleton.slots.length === 0;
  return (
    <>
      <div className={`vp-border${mode === 'animate' ? ' animate' : ''}`} />
      <Toolbox />
      <div className="vp-top-right">
        <span className="chip plain">{Math.round(zoom * 100)}%</span>
        <IconButton icon={Maximize} title="Frame skeleton" hotkey={KEYS.frame} small onClick={() => viewportApi.frame()} />
        <IconButton icon={Layers} title="Onion skin: faded poses of the frames around the playhead (Animate mode)" small active={view.onion} onClick={() => uiStore.patch({ view: { ...uiStore.get().view, onion: !uiStore.get().view.onion } })} />
        <IconButton icon={Route} title="Motion trails: the path the selected bones travel in the animation, keys marked (Animate mode)" small active={view.trails} onClick={() => uiStore.patch({ view: { ...uiStore.get().view, trails: !uiStore.get().view.trails } })} />
        <IconButton icon={Eye} title="Toggle names" small onClick={() => uiStore.patch({ view: { ...uiStore.get().view, names: !uiStore.get().view.names } })} />
      </div>
      {empty && (
        <div className="vp-empty">
          <div className="vp-empty-card">
            <b>Start rigging</b>
            Drop PNG images here, then press <span className="kbd">B</span> and drag to draw bones.
            <div style={{ margin: '14px 0 4px' }}>
              <Button primary icon={Sparkles} onClick={() => loadSample()}>
                Load the demo rig
              </Button>
            </div>
            <span className="hint-text">a finished character with IK legs and a walk cycle</span>
          </div>
        </div>
      )}
      {HINTS[tool] && <div className="vp-hint">{HINTS[tool]}</div>}
    </>
  );
}

/** A combination such as "Ctrl+Shift+Z" as key caps. */
function Keys({ combo }: { combo: string }) {
  return (
    <>
      {combo.split('+').map((k, i) => (
        <kbd key={i} className="kbd">
          {k}
        </kbd>
      ))}
    </>
  );
}

function HelpDialog() {
  useSettings((s) => s.toolKeys);
  return (
    <Dialog title="Bone 2D — shortcuts" onClose={() => uiStore.patch({ helpOpen: false })} width={720}>
      <p className="hint-text flush mb">
        Bone 2D is a browser-based 2D skeletal animation editor. Build a rig in <b>Setup</b>, pose and key it in <b>Animate</b>, then export a Spine 4.3 compatible skeleton + atlas.
      </p>
      <div className="hotkeys">
        {hotkeyGroups().map((g) => (
          <section key={g.title} className="hk-group">
            <h3 className="section-label">{g.title}</h3>
            {g.rows.map((r) => (
              <div key={r.label} className="hk-row">
                <span>{r.label}</span>
                <span className="hk-keys">
                  {r.keys.map((combo, i) => (
                    <span key={combo} className="hk-combo">
                      {i > 0 && <span className="muted">/</span>}
                      <Keys combo={combo} />
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Dialog>
  );
}

function Toast() {
  const t = useUi((s) => s.toast);
  if (!t) return null;
  return <div className={`toast ${t.kind}`}>{t.text}</div>;
}

export function App() {
  const panel = useUi((s) => s.panel);
  const views = useUi((s) => s.views);
  const exportOpen = useUi((s) => s.exportOpen);
  const helpOpen = useUi((s) => s.helpOpen);
  const updatesOpen = useUi((s) => s.updatesOpen);
  const feedbackOpen = useUi((s) => s.feedbackOpen);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const welcomeOpen = useUi((s) => s.welcomeOpen);
  const paletteOpen = useUi((s) => s.paletteOpen);
  useLang(); // the whole tree re-renders when the language changes: strings are translated while rendering

  useEffect(() => {
    const stopPlayback = startPlaybackLoop();
    const stopAutosave = startAutosave();
    const stopLayout = startLayoutPersist();
    const stopSanitize = docStore.subscribe(sanitizeSelection); // undo / redo can remove what is selected
    restoreAutosave().then((ok) => {
      if (!ok) {
        setTimeout(() => viewportApi.frame(), 60);
        if (settingsStore.get().showWelcome) uiStore.patch({ welcomeOpen: true });
      }
    });
    const warn = (e: BeforeUnloadEvent) => {
      if (docStore.dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const ui = uiStore.get();
      const key = e.key.toLowerCase();
      if (el?.closest?.('[role=menu]')) return; // the keys of a menu belong to the menu
      // a control that the keyboard has focused keeps Tab, Space and Enter (a click leaves no focus ring, so after a click Space still plays)
      if (key === 'tab' || key === ' ' || key === 'enter') {
        if (el?.closest?.('button, a, [role=menuitem], [role=radio], [role=switch]') && el.matches(':focus-visible')) return;
      }
      if (ctrl) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) docStore.redo();
          else docStore.undo();
        } else if (key === 'y') {
          e.preventDefault();
          docStore.redo();
        } else if (key === 's') {
          e.preventDefault();
          saveProjectFile(e.shiftKey);
        } else if (key === 'o') {
          e.preventDefault();
          openProjectFile();
        } else if (key === 'e') {
          e.preventDefault();
          uiStore.patch({ exportOpen: true });
        } else if (key === 'c' && ui.selectedKeys.length) {
          e.preventDefault();
          copyKeys(ui.selectedKeys.map(decodeKey));
        } else if (key === 'v' && ui.mode === 'animate') {
          e.preventDefault();
          const refs = pasteKeys(ui.time);
          if (refs.length) uiStore.patch({ selectedKeys: refs.map((r) => JSON.stringify([r.kind, r.target, r.prop, Math.round(r.time * 10000) / 10000])) });
        } else if (key === 'k') {
          e.preventDefault();
          uiStore.patch({ paletteOpen: !ui.paletteOpen });
        } else if (key === 'd') {
          e.preventDefault();
          duplicateSelection(e.shiftKey);
        } else if (key === 'a') {
          e.preventDefault();
          setSelection({ bones: docStore.get().skeleton.bones.map((b) => b.id) });
        }
        return;
      }
      const tool = toolForKey(key);
      if (tool) {
        setTool(tool);
        return;
      }
      switch (key) {
        case 'f': viewportApi.frame(); break;
        case 'f12':
          e.preventDefault();
          uiStore.patch({ settingsOpen: !ui.settingsOpen });
          break;
        case 'f9':
          e.preventDefault();
          toggleAllViews();
          break;
        case 'enter':
          if (viewportApi.controller?.polygonTool.commit() || viewportApi.controller?.pathTool.commit()) e.preventDefault();
          break;
        case 'k': keySelectedBones(); break;
        case 'tab':
          e.preventDefault();
          setMode(ui.mode === 'setup' ? 'animate' : 'setup');
          break;
        case ' ':
          e.preventDefault();
          if (ui.mode === 'animate') togglePlay();
          viewportApi.controller && (viewportApi.controller.spaceDown = false);
          break;
        case 'arrowleft':
        case 'arrowright':
          if (ui.mode === 'animate') {
            e.preventDefault();
            const fps = docStore.get().skeleton.fps;
            uiStore.patch({ playing: false });
            setTime(ui.time + ((key === 'arrowright' ? 1 : -1) * (e.shiftKey ? 10 : 1)) / fps);
          }
          break;
        case 'home': if (ui.mode === 'animate') setTime(0); break;
        case 'delete':
        case 'backspace':
          if (focusArea() === 'timeline' && ui.selectedKeys.length) {
            e.preventDefault();
            deleteKeys(ui.selectedKeys.map(decodeKey));
            uiStore.patch({ selectedKeys: [] });
          } else if (ui.tool === 'mesh' && ui.selection.vertices.length && (viewportApi.controller?.pathTool.deleteSelectedVertices() || viewportApi.controller?.polygonTool.deleteSelectedVertices() || viewportApi.controller?.meshTool.deleteSelectedVertices())) {
            e.preventDefault();
          } else if (ui.selection.constraint && !ui.selection.bones.length) {
            e.preventDefault();
            deleteConstraint(ui.selection.constraint);
          } else if (ui.selection.bones.length) {
            e.preventDefault();
            deleteBones(ui.selection.bones);
          }
          break;
        case 'escape':
          if (viewportApi.controller?.polygonTool.cancel() || viewportApi.controller?.pathTool.cancel()) break; // an unfinished polygon or path is dropped first
          clearSelection();
          uiStore.patch({ selectedKeys: [] });
          break;
        case '?':
          uiStore.patch({ helpOpen: true });
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      stopPlayback();
      stopAutosave();
      stopLayout();
      void stopSanitize();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', warn);
    };
  }, []);

  useEffect(() => {
    const onErr = (e: ErrorEvent) => console.error(e.error ?? e.message);
    window.addEventListener('error', onErr);
    return () => window.removeEventListener('error', onErr);
  }, []);

  const drag = (key: 'left' | 'right' | 'bottom', sign: 1 | -1, min: number, max: number) => (d: number) => {
    const p = uiStore.get().panel;
    uiStore.patch({ panel: { ...p, [key]: Math.min(max, Math.max(min, p[key] + sign * d)) } });
  };

  const leftOn = views.tree || views.images || views.animations || views.skins || views.playback || views.metrics || views.history;

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        {leftOn && (
          <>
            <aside className="left" style={{ width: panel.left }} onPointerDownCapture={() => setFocusArea('tree')}>
              {views.tree && <TreePanel />}
              {views.animations && <AnimationsPanel />}
              {views.skins && <SkinsPanel />}
              {views.playback && <PlaybackPanel />}
              {views.metrics && <MetricsPanel />}
              {views.history && <HistoryPanel />}
              {views.images && <AssetsPanel />}
            </aside>
            <Splitter dir="v" onDrag={drag('left', 1, 200, 480)} />
          </>
        )}
        <section className="center">
          <div className="viewport-wrap" onPointerDownCapture={() => setFocusArea('viewport')}>
            <Viewport />
            <ViewportHud />
          </div>
          {views.timeline && (
            <>
              <Splitter dir="h" onDrag={drag('bottom', -1, 130, 620)} />
              <div onPointerDownCapture={() => setFocusArea('timeline')}>
                <Timeline />
              </div>
            </>
          )}
        </section>
        {views.inspector && (
          <>
            <Splitter dir="v" onDrag={drag('right', -1, 230, 480)} />
            <aside className="right" style={{ width: panel.right }} onPointerDownCapture={() => setFocusArea('viewport')}>
              <InspectorPanel />
            </aside>
          </>
        )}
      </div>
      {exportOpen && <ExportDialog />}
      {helpOpen && <HelpDialog />}
      {updatesOpen && <UpdatesDialog />}
      {feedbackOpen && <FeedbackDialog />}
      {settingsOpen && <SettingsDialog />}
      {welcomeOpen && <WelcomeDialog />}
      {paletteOpen && <Palette />}
      <Toast />
      <TooltipHost />
    </div>
  );
}

export { toast };
