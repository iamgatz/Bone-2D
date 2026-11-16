import { useEffect, useState } from 'react';
import { Bone, BoxSelect, Brush, Crosshair, Download, Eye, FilePlus2, FolderOpen, Grid3x3, Image as ImageIcon, CircleHelp, Link2, Maximize, MousePointer2, Move, Play, Redo2, RotateCw, Save, Scaling, Scissors, Sparkles, Triangle, Type, Undo2 } from 'lucide-react';
import { decodeKey } from '@/core/keyrefs';
import { clearSelection, copyKeys, deleteBones, deleteKeys, keySelectedBones, pasteKeys, sanitizeSelection, setMode, setSelection, setTime, setTool, togglePlay } from '@/store/actions';
import { docStore, useProject } from '@/store/doc';
import { newProject, openProjectFile, restoreAutosave, saveProjectFile, startAutosave } from '@/store/project';
import { openSpineImport } from './importSpine';
import { deleteConstraint } from '@/store/ikActions';
import { loadSample } from '@/store/sample';
import { toast, uiStore, useUi } from '@/store/ui';
import type { Tool } from '@/store/ui';
import { setLang, useLang } from '@/i18n';
import { startPlaybackLoop } from './playback';
import { AssetsPanel } from './panels/AssetsPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { TreePanel } from './panels/TreePanel';
import { Timeline } from './timeline/Timeline';
import { Button, Dialog, IconButton, Menu, MenuItem, Splitter } from './ui/controls';
import { Viewport, viewportApi } from './viewport/Viewport';
import { ExportDialog } from './ExportDialog';
import { focusArea, setFocusArea } from './focus';

const TOOLS: { tool: Tool; icon: typeof Bone; title: string; hotkey: string; setupOnly?: boolean }[] = [
  { tool: 'select', icon: MousePointer2, title: 'Pose / select', hotkey: 'V' },
  { tool: 'create', icon: Bone, title: 'Create bone', hotkey: 'B', setupOnly: true },
  { tool: 'translate', icon: Move, title: 'Translate', hotkey: 'T' },
  { tool: 'rotate', icon: RotateCw, title: 'Rotate', hotkey: 'R' },
  { tool: 'scale', icon: Scaling, title: 'Scale', hotkey: 'S' },
  { tool: 'mesh', icon: Triangle, title: 'Edit mesh / deform', hotkey: 'M' },
  { tool: 'weights', icon: Brush, title: 'Paint weights', hotkey: 'W', setupOnly: true },
  { tool: 'ik', icon: Link2, title: 'IK constraint', hotkey: 'I', setupOnly: true },
  { tool: 'clipping', icon: Scissors, title: 'Clipping polygon', hotkey: 'C', setupOnly: true },
  { tool: 'boundingbox', icon: BoxSelect, title: 'Bounding box', hotkey: 'X', setupOnly: true },
  { tool: 'point', icon: Crosshair, title: 'Point', hotkey: 'P', setupOnly: true },
];

const HINTS: Record<Tool, string> = {
  select: 'Click a bone or image to select · drag a bone to rotate it · drag an IK target to move it',
  create: 'Drag to create a bone · it attaches to the selected bone · start from a bone tip to chain',
  translate: 'Drag to move the selected bone (or grab an axis) · Shift = add to selection',
  rotate: 'Drag anywhere to rotate the selected bones around their origins',
  scale: 'Drag to scale · Shift = X only · Alt = Y only',
  mesh: 'Drag vertices · Ctrl-click or double-click adds a vertex · Del removes · in Animate mode dragging keys a deform',
  weights: 'Paint over the mesh · click a bone to switch the brush bone · adjust size and strength in the Inspector',
  ik: 'Drag from the end of a bone chain to a target bone (or empty space to create one)',
  clipping: 'Click to place polygon points · click the first point, double-click or Enter to finish · Esc cancels · it is created on the selected bone',
  boundingbox: 'Click to place polygon points · click the first point, double-click or Enter to finish · Esc cancels · it is created on the selected bone',
  point: 'Click to place a point attachment on the selected bone · set its rotation in the Inspector',
};

function LangToggle() {
  const lang = useLang();
  return (
    <div className="seg lang" title="Language">
      {(['en', 'ru'] as const).map((l) => (
        <button key={l} className={lang === l ? 'active plain' : ''} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function TopBar() {
  const project = useProject();
  const mode = useUi((s) => s.mode);
  const view = useUi((s) => s.view);
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
            <path d="M9 22 L16 10 L23 22" stroke="#31d0aa" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="22" r="2.6" fill="#31d0aa" />
            <circle cx="16" cy="10" r="2.6" fill="#31d0aa" />
            <circle cx="23" cy="22" r="2.6" fill="#31d0aa" />
          </svg>
        </span>
        Bone 2D
      </div>
      <input className="project-name" value={project.name} spellCheck={false} onChange={(e) => docStore.update('Rename project', (d) => void (d.name = e.target.value))} title="Project name" />
      {docStore.dirty && <span className="dirty-dot" title="Unsaved changes" />}
      <Menu label="File">
        {(close) => (
          <>
            <MenuItem icon={FilePlus2} close={close} onClick={() => newProject()}>New project</MenuItem>
            <MenuItem icon={FolderOpen} close={close} hotkey="Ctrl O" onClick={() => openProjectFile()}>Open…</MenuItem>
            <MenuItem icon={Save} close={close} hotkey="Ctrl S" onClick={() => saveProjectFile()}>Save</MenuItem>
            <div className="menu-sep" />
            <MenuItem icon={Download} close={close} hotkey="Ctrl E" onClick={() => uiStore.patch({ exportOpen: true })}>Export for Spine 4.3…</MenuItem>
            <MenuItem icon={FolderOpen} close={close} onClick={() => openSpineImport()}>Import Spine 4.3 JSON…</MenuItem>
            <div className="menu-sep" />
            <MenuItem icon={Sparkles} close={close} onClick={() => loadSample()}>Load demo rig (Bolt)</MenuItem>
          </>
        )}
      </Menu>
      <Menu label="View">
        {(close) => (
          <>
            <MenuItem close={close} icon={Grid3x3} onClick={() => uiStore.patch({ view: { ...view, grid: !view.grid } })}>{view.grid ? '✓ ' : ''}Grid</MenuItem>
            <MenuItem close={close} icon={Type} onClick={() => uiStore.patch({ view: { ...view, names: !view.names } })}>{view.names ? '✓ ' : ''}Bone names</MenuItem>
            <MenuItem close={close} icon={ImageIcon} onClick={() => uiStore.patch({ view: { ...view, images: !view.images } })}>{view.images ? '✓ ' : ''}Images</MenuItem>
            <MenuItem close={close} icon={Bone} onClick={() => uiStore.patch({ view: { ...view, bones: !view.bones } })}>{view.bones ? '✓ ' : ''}Bones</MenuItem>
            <MenuItem close={close} icon={Link2} onClick={() => uiStore.patch({ view: { ...view, constraints: !view.constraints } })}>{view.constraints ? '✓ ' : ''}Constraints</MenuItem>
            <MenuItem close={close} icon={BoxSelect} onClick={() => uiStore.patch({ view: { ...view, outlines: !view.outlines } })}>{view.outlines ? '✓ ' : ''}Clips, boxes &amp; points</MenuItem>
            <div className="menu-sep" />
            <MenuItem close={close} icon={Maximize} hotkey="F" onClick={() => viewportApi.frame()}>Frame skeleton</MenuItem>
          </>
        )}
      </Menu>
      <span className="spacer" />
      <div className="seg">
        <button className={`setup${mode === 'setup' ? ' active' : ''}`} onClick={() => setMode('setup')} title="Setup: build the rig (Tab)">
          <Bone size={14} /> Setup
        </button>
        <button className={`animate${mode === 'animate' ? ' active' : ''}`} onClick={() => setMode('animate')} title="Animate: pose and key (Tab)">
          <Play size={14} /> Animate
        </button>
      </div>
      <span className="spacer" />
      <IconButton icon={Undo2} title={docStore.undoLabel ? `Undo ${docStore.undoLabel}` : 'Undo'} hotkey="Ctrl Z" disabled={!docStore.canUndo} onClick={() => docStore.undo()} />
      <IconButton icon={Redo2} title="Redo" hotkey="Ctrl Y" disabled={!docStore.canRedo} onClick={() => docStore.redo()} />
      <span className="sep" />
      <LangToggle />
      <IconButton icon={CircleHelp} title="Shortcuts & help" hotkey="?" onClick={() => uiStore.patch({ helpOpen: true })} />
      <Button primary icon={Download} onClick={() => uiStore.patch({ exportOpen: true })}>Export</Button>
    </div>
  );
}

function Toolbox() {
  const tool = useUi((s) => s.tool);
  const mode = useUi((s) => s.mode);
  return (
    <div className="toolbox">
      {TOOLS.map((t) => (
        <IconButton key={t.tool} icon={t.icon} title={t.title} hotkey={t.hotkey} active={tool === t.tool} animate={mode === 'animate'} disabled={!!t.setupOnly && mode !== 'setup'} onClick={() => setTool(t.tool)} />
      ))}
    </div>
  );
}

function ViewportHud() {
  const tool = useUi((s) => s.tool);
  const mode = useUi((s) => s.mode);
  const zoom = useUi((s) => s.camera.zoom);
  const project = useProject();
  const empty = project.skeleton.bones.length <= 1 && project.skeleton.slots.length === 0;
  return (
    <>
      <div className={`vp-border${mode === 'animate' ? ' animate' : ''}`} />
      <Toolbox />
      <div className="vp-top-right">
        <span className="chip" style={{ background: 'transparent' }}>{Math.round(zoom * 100)}%</span>
        <IconButton icon={Maximize} title="Frame skeleton" hotkey="F" small onClick={() => viewportApi.frame()} />
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

function HelpDialog() {
  const rows: [string, string][] = [
    ['Pose / select', 'V'],
    ['Create bone', 'B'],
    ['Translate · Rotate · Scale', 'T · R · S'],
    ['Setup ⇄ Animate', 'Tab'],
    ['Play / pause', 'Space'],
    ['Step frame', '← →'],
    ['Key selected bone', 'K'],
    ['Undo / redo', 'Ctrl Z / Y'],
    ['Delete selection / keys', 'Del'],
    ['Copy / paste keys', 'Ctrl C / V'],
    ['Frame skeleton', 'F'],
    ['Pan viewport', 'Mid / Right drag · Alt drag'],
    ['Zoom', 'Wheel'],
    ['Timeline zoom', 'Ctrl + wheel'],
    ['Save · Open · Export', 'Ctrl S · O · E'],
  ];
  return (
    <Dialog title="Bone 2D — shortcuts" onClose={() => uiStore.patch({ helpOpen: false })} width={600}>
      <p className="hint-text" style={{ marginTop: 0 }}>
        Bone 2D is a browser-based 2D skeletal animation editor. Build a rig in <b>Setup</b>, pose and key it in <b>Animate</b>, then export a Spine 4.3 compatible skeleton + atlas.
      </p>
      <div className="shortcuts">
        {rows.map(([a, b]) => (
          <div key={a}>
            <span>{a}</span>
            <span className="kbd">{b}</span>
          </div>
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
  const exportOpen = useUi((s) => s.exportOpen);
  const helpOpen = useUi((s) => s.helpOpen);
  useLang(); // the whole tree re-renders when the language changes: strings are translated while rendering

  useEffect(() => {
    const stopPlayback = startPlaybackLoop();
    const stopAutosave = startAutosave();
    const stopSanitize = docStore.subscribe(sanitizeSelection); // undo / redo can remove what is selected
    restoreAutosave().then((ok) => {
      if (!ok) setTimeout(() => viewportApi.frame(), 60);
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
          saveProjectFile();
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
        } else if (key === 'a') {
          e.preventDefault();
          setSelection({ bones: docStore.get().skeleton.bones.map((b) => b.id) });
        }
        return;
      }
      switch (key) {
        case 'v': setTool('select'); break;
        case 'b': setTool('create'); break;
        case 't': setTool('translate'); break;
        case 'r': setTool('rotate'); break;
        case 's': setTool('scale'); break;
        case 'm': setTool('mesh'); break;
        case 'w': setTool('weights'); break;
        case 'i': setTool('ik'); break;
        case 'c': setTool('clipping'); break;
        case 'x': setTool('boundingbox'); break;
        case 'p': setTool('point'); break;
        case 'f': viewportApi.frame(); break;
        case 'enter':
          if (viewportApi.controller?.polygonTool.commit()) e.preventDefault();
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
          } else if (ui.tool === 'mesh' && ui.selection.vertices.length && (viewportApi.controller?.polygonTool.deleteSelectedVertices() || viewportApi.controller?.meshTool.deleteSelectedVertices())) {
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
          if (viewportApi.controller?.polygonTool.cancel()) break; // an unfinished polygon is dropped first
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

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <aside className="left" style={{ width: panel.left }} onPointerDownCapture={() => setFocusArea('tree')}>
          <TreePanel />
          <AssetsPanel />
        </aside>
        <Splitter dir="v" onDrag={drag('left', 1, 200, 480)} />
        <section className="center">
          <div className="viewport-wrap" onPointerDownCapture={() => setFocusArea('viewport')}>
            <Viewport />
            <ViewportHud />
          </div>
          <Splitter dir="h" onDrag={drag('bottom', -1, 130, 620)} />
          <div onPointerDownCapture={() => setFocusArea('timeline')}>
            <Timeline />
          </div>
        </section>
        <Splitter dir="v" onDrag={drag('right', -1, 230, 480)} />
        <aside className="right" style={{ width: panel.right }} onPointerDownCapture={() => setFocusArea('viewport')}>
          <InspectorPanel />
        </aside>
      </div>
      {exportOpen && <ExportDialog />}
      {helpOpen && <HelpDialog />}
      <Toast />
    </div>
  );
}

export { toast };
