import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Diamond, Eraser, Film, KeyRound, Maximize, Pause, Pencil, Play, Plus, Repeat, SkipBack, SkipForward, Spline, Trash2, ZoomIn } from 'lucide-react';
import { GraphEditor } from './GraphEditor';
import { CURVE_PRESETS } from '@/core/curve';
import { decodeKey, encodeKey } from '@/core/keyrefs';
import type { KeyRef } from '@/core/keyrefs';
import { cleanUpKeys, copyKeys, createAnimation, currentAnimation, deleteAnimation, deleteKeys, duplicateAnimation, pasteKeys, renameAnimation, selectAnimation, selectBone, selectSlot, setAnimationDuration, setKeysCurve, setMode, setSelection, setTime, togglePlay } from '@/store/actions';
import { useProject } from '@/store/doc';
import { useSettings } from '@/store/settings';
import { uiStore, useUi } from '@/store/ui';
import type { CurveKind } from '@/store/ui';
import { KEYS } from '../hotkeys';
import { Button, IconButton, SelectField, TextField, menuKeys, useFocusFirstItem, useOutsideClose } from '../ui/controls';
import { Dopesheet, ROW_H } from './Dopesheet';
import type { TimelineMenuRequest } from './Dopesheet';
import { buildRows } from './rows';
import type { Row } from './rows';

function FrameField({ fps, time }: { fps: number; time: number }) {
  const [text, setText] = useState<string | null>(null);
  const frame = Math.round(time * fps);
  return (
    <div className="tl-time" title="Frame · seconds (type a frame number)">
      <input
        value={text ?? `${frame}`}
        onFocus={(e) => {
          setText(String(frame));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null) {
            const v = parseFloat(text);
            if (Number.isFinite(v)) setTime(v / fps);
          }
          setText(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        style={{ width: 38, background: 'transparent', border: 0, outline: 'none', textAlign: 'right', color: 'inherit', font: 'inherit' }}
      />
      <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{time.toFixed(2)}s</span>
    </div>
  );
}

function TimelineMenu({ menu, onClose }: { menu: TimelineMenuRequest; onClose: () => void }) {
  const ref = useOutsideClose(true, onClose);
  useFocusFirstItem(ref);
  const refs = menu.refs;
  const item = (label: string, fn: () => void, hot?: string) => (
    <button
      type="button"
      role="menuitem"
      className="menu-item"
      onClick={() => {
        fn();
        onClose();
      }}
    >
      <span>{label}</span>
      {hot && <kbd className="kbd">{hot}</kbd>}
    </button>
  );
  return (
    <div
      ref={ref}
      className="menu-pop"
      role="menu"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation(); // closes the menu, not the selection
          onClose();
        } else menuKeys(e);
      }}
      style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 330), zIndex: 120 }}
    >
      <div className="section-label" style={{ paddingTop: 4 }}>
        {`Interpolation · ${refs.length} key${refs.length === 1 ? '' : 's'}`}
      </div>
      {item('Linear', () => setKeysCurve(refs, 'linear'))}
      {item('Stepped', () => setKeysCurve(refs, 'stepped'))}
      {item('Bezier (smooth)', () => setKeysCurve(refs, 'bezier'))}
      {item('Ease in', () => setKeysCurve(refs, CURVE_PRESETS.easeIn))}
      {item('Ease out', () => setKeysCurve(refs, CURVE_PRESETS.easeOut))}
      {item('Ease in-out', () => setKeysCurve(refs, CURVE_PRESETS.easeInOut))}
      {item('Overshoot', () => setKeysCurve(refs, CURVE_PRESETS.overshoot))}
      <div className="menu-sep" />
      {item('Copy', () => copyKeys(refs), KEYS.copy)}
      {item('Paste at playhead', () => pasteKeys(uiStore.get().time), KEYS.paste)}
      {item('Delete', () => deleteKeys(refs), KEYS.delete)}
    </div>
  );
}

export function Timeline() {
  useSettings((s) => s.keyMap);
  const project = useProject();
  const doc = project.skeleton;
  const mode = useUi((s) => s.mode);
  const animationId = useUi((s) => s.animationId);
  const time = useUi((s) => s.time);
  const playing = useUi((s) => s.playing);
  const loop = useUi((s) => s.loop);
  const autoKey = useUi((s) => s.autoKey);
  const defaultCurve = useUi((s) => s.defaultCurve);
  const selection = useUi((s) => s.selection);
  const expanded = useUi((s) => s.expanded);
  const height = useUi((s) => s.panel.bottom);
  const view = useUi((s) => s.timelineView);
  const selectedKeys = useUi((s) => s.selectedKeys);
  const anim = doc.animations.find((a) => a.id === animationId) ?? null;
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState<TimelineMenuRequest | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => buildRows(doc, anim, selection.bones, selection.slot, expanded), [doc, anim, selection.bones, selection.slot, expanded]);
  const onMenu = useCallback((m: TimelineMenuRequest) => setMenu(m), []);

  const toggleRow = (r: Row) => uiStore.patch({ expanded: { ...uiStore.get().expanded, [r.id]: !r.expanded } });
  const clickRow = (r: Row, e: React.MouseEvent) => {
    if (r.type === 'entity' && r.target) {
      if (r.target.kind === 'bone') selectBone(r.target.id, e.shiftKey);
      else if (r.target.kind === 'slot') selectSlot(r.target.id);
      else setSelection({ constraint: r.target.id });
    }
    uiStore.patch({ selectedKeys: r.keys.flatMap((k) => k.refs).map(encodeKey) });
  };

  const fit = () => {
    const w = (bodyRef.current?.clientWidth ?? 800) - 232 - 24;
    const d = Math.max(0.1, anim?.duration ?? 1);
    uiStore.patch({ tlZoom: Math.max(20, w / d), tlScroll: -8 / Math.max(20, w / d) });
  };

  /** Zoom Keys: the timeline fits the selected keys (all of the animation when none is selected). */
  const zoomKeys = () => {
    if (!anim) return;
    const times = selectedKeys.length ? selectedKeys.map((s) => decodeKey(s).time) : [0, anim.duration];
    let lo = Math.min(...times);
    let hi = Math.max(...times);
    if (hi - lo < 0.05) {
      lo -= 0.25;
      hi += 0.25;
    }
    const pad = (hi - lo) * 0.06;
    const w = (bodyRef.current?.clientWidth ?? 800) - 232 - 24;
    uiStore.patch({ tlZoom: Math.min(3000, Math.max(20, w / (hi - lo + 2 * pad))), tlScroll: lo - pad });
  };

  const animate = mode === 'animate';
  const jump = (t: number) => (uiStore.patch({ playing: false }), setTime(t));

  return (
    <div className="timeline" style={{ height }}>
      <div className="tl-bar">
        <div className="anim-select" style={{ flex: 'none' }}>
          <Film size={15} color="var(--animate)" />
          {renaming && anim ? (
            <TextField
              value={anim.name}
              onCommit={(v) => {
                renameAnimation(anim.id, v);
                setRenaming(false);
              }}
            />
          ) : (
            <SelectField value={animationId ?? ''} options={doc.animations.length ? doc.animations.map((a) => ({ value: a.id, label: a.name })) : [{ value: '', label: 'no animations' }]} onChange={(v) => v && selectAnimation(v)} />
          )}
          <IconButton icon={Plus} title="New animation" small onClick={() => (createAnimation(), setMode('animate'))} />
          <IconButton icon={Pencil} title="Rename animation" small disabled={!anim} onClick={() => setRenaming((r) => !r)} />
          <IconButton icon={Eraser} title="Clean up: remove the keys that change nothing" small disabled={!anim} onClick={() => anim && cleanUpKeys(anim.id)} />
          <IconButton icon={Copy} title="Duplicate animation" small disabled={!anim} onClick={() => anim && duplicateAnimation(anim.id)} />
          <IconButton icon={Trash2} title="Delete animation" small disabled={!anim} onClick={() => anim && deleteAnimation(anim.id)} />
        </div>
        <span className="sep" />
        <IconButton icon={SkipBack} title="Go to start" onClick={() => jump(0)} disabled={!anim} />
        <IconButton icon={playing ? Pause : Play} title={playing ? 'Pause' : 'Play'} hotkey={KEYS.play} active={playing} animate onClick={() => togglePlay()} disabled={!anim} />
        <IconButton icon={SkipForward} title="Go to end" onClick={() => anim && jump(anim.duration)} disabled={!anim} />
        <IconButton icon={Repeat} title="Loop" active={loop} onClick={() => uiStore.patch({ loop: !loop })} />
        <FrameField fps={doc.fps} time={time} />
        <span className="sep" />
        <IconButton icon={KeyRound} title="Auto-key: pose edits create keys at the playhead" active={autoKey} animate onClick={() => uiStore.patch({ autoKey: !autoKey })} />
        <div className="tl-opt" style={{ width: 112 }}>
          <SelectField value={defaultCurve} options={[{ value: 'bezier', label: 'Smooth keys' }, { value: 'linear', label: 'Linear keys' }, { value: 'stepped', label: 'Stepped keys' }] as { value: CurveKind; label: string }[]} onChange={(v) => uiStore.patch({ defaultCurve: v })} />
        </div>
        <span className="spacer" />
        {anim && (
          <div className="tl-opt" title="Animation length in seconds" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
            Length
            <LengthField value={anim.duration} onChange={(v) => setAnimationDuration(anim.id, v)} />
          </div>
        )}
        <IconButton icon={Maximize} title="Fit timeline to the animation" onClick={fit} />
        <IconButton icon={ZoomIn} title="Zoom to the selected keys (all keys when none is selected)" disabled={!anim} onClick={zoomKeys} />
        <span className="sep tl-opt2" />
        <IconButton icon={Diamond} title="Dopesheet" active={view === 'dopesheet'} onClick={() => uiStore.patch({ timelineView: 'dopesheet' })} />
        <IconButton icon={Spline} title="Curve graph" active={view === 'graph'} onClick={() => uiStore.patch({ timelineView: 'graph' })} />
      </div>

      <div className="tl-body" ref={bodyRef}>
        {view === 'graph' ? (
          <GraphEditor anim={anim} doc={doc} selection={selection} selectedKeys={selectedKeys} fps={doc.fps} />
        ) : (
        <>
        <div className="tl-labels">
          <div className="tl-labels-head">{anim ? anim.name : 'Timeline'}</div>
          <div className="tl-scroll" id="tl-label-scroll" style={{ scrollbarWidth: 'none' }} onScroll={(e) => {
            const host = document.querySelector('.tl-canvas-host') as HTMLElement | null;
            if (host && host.scrollTop !== e.currentTarget.scrollTop) host.scrollTop = e.currentTarget.scrollTop;
          }}>
            {rows.map((r) => (
              <div
                key={r.id}
                className={`tl-label${r.selected ? ' selected' : ''}${r.type === 'prop' ? ' child' : ''}`}
                style={{ height: ROW_H, paddingLeft: 8 + r.depth * 12, fontWeight: r.type === 'group' ? 650 : 400, fontSize: r.type === 'group' ? 10.5 : undefined, textTransform: r.type === 'group' ? 'uppercase' : undefined, letterSpacing: r.type === 'group' ? 0.6 : undefined, color: r.type === 'group' ? 'var(--muted)' : undefined }}
                onClick={(e) => r.type !== 'group' && clickRow(r, e)}
              >
                {r.type !== 'group' && (
                  <span className="chev" onClick={(e) => (e.stopPropagation(), r.expandable && toggleRow(r))} style={{ visibility: r.expandable ? 'visible' : 'hidden' }}>
                    {r.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </span>
                )}
                <span className="lbl">{r.label}</span>
              </div>
            ))}
          </div>
        </div>
        <Dopesheet rows={rows} duration={anim?.duration ?? 1} fps={doc.fps} onMenu={onMenu} />
        </>
        )}
        {view === 'dopesheet' && (!animate || !anim || rows.length === 0) && (
          <div className="tl-empty" style={{ left: 232, top: 28, pointerEvents: !animate || !anim ? 'auto' : 'none', ...(!animate ? { placeItems: 'start end', padding: 10 } : {}) }}>
            {!animate ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(20,23,29,0.94)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '6px 6px 6px 12px', boxShadow: 'var(--shadow)' }}>
                <span>
                  <b>Setup</b> mode · switch to Animate to pose and key
                </span>
                <Button primary onClick={() => setMode('animate')}>
                  Animate
                </Button>
              </div>
            ) : !anim ? (
              <Button primary onClick={() => createAnimation()}>
                Create animation
              </Button>
            ) : (
              <div>
                Nothing keyed yet.
                <br />
                Select a bone, move the playhead and pose it —
                <br />
                keys are created automatically.
              </div>
            )}
          </div>
        )}
      </div>
      {menu && <TimelineMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function LengthField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="field" style={{ width: 74 }}>
      <input
        value={text ?? value.toFixed(2)}
        onFocus={(e) => (setText(value.toFixed(2)), requestAnimationFrame(() => e.target.select()))}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null) {
            const v = parseFloat(text.replace(',', '.'));
            if (Number.isFinite(v) && v > 0) onChange(v);
          }
          setText(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        style={{ paddingLeft: 8 }}
      />
      <span className="flabel" style={{ cursor: 'default' }}>
        s
      </span>
    </div>
  );
}

export { currentAnimation, decodeKey };
export type { KeyRef };
