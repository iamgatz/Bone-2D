import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { setLang, useLang } from '@/i18n';
import { BONE_SCALES, DEFAULT_SETTINGS, resetSettings, setSettings, useSettings } from '@/store/settings';
import { toast, uiStore } from '@/store/ui';
import { Button, ColorSwatch, Dialog, SelectField, Toggle } from './ui/controls';
import { Segmented } from './ui/Segmented';
import { assignToolKey, comboOf, hotkeyGroups, isDefaultBinding, resetBinding, setBinding } from './hotkeys';
import type { HotkeyRow, KeyId } from './hotkeys';
import { TOOLS, hotkeyOf, setToolKey } from './tools';

type Tab = 'general' | 'viewport' | 'hotkeys';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <span>{label}</span>
        {hint && <span className="hint-text">{hint}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

/** One tool letter: press the button, then the new letter. */
function ToolKey({ tool, title }: { tool: (typeof TOOLS)[number]['tool']; title: string }) {
  const [listening, setListening] = useState(false);
  const letter = hotkeyOf(tool);
  const isDefault = letter === TOOLS.find((t) => t.tool === tool)!.hotkey;
  useEffect(() => {
    if (!listening) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setListening(false);
      if (!/^[a-z]$/i.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
      const clash = assignToolKey(tool, e.key);
      if (clash) toast(`Key ${e.key.toUpperCase()} is already used by ${clash}`, 'error');
      setListening(false);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [listening, tool]);
  return (
    <div className="set-row">
      <div className="set-label">{title}</div>
      <div className="set-control">
        <button type="button" className={`keycap${listening ? ' listening' : ''}${isDefault ? '' : ' changed'}`} onClick={() => setListening(!listening)} aria-label={`${title}: key`} data-tip="Click, then press a letter (Esc cancels)">
          {listening ? '…' : letter}
        </button>
        {!isDefault && (
          <Button small ghost onClick={() => setToolKey(tool, TOOLS.find((t) => t.tool === tool)!.hotkey)}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

/** One command: press the button, then the new combination. */
function CommandKey({ id, row }: { id: KeyId; row: HotkeyRow }) {
  const [listening, setListening] = useState(false);
  const combo = row.keys[0];
  const rest = row.keys.slice(1);
  const isDefault = isDefaultBinding(id);
  useEffect(() => {
    if (!listening) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setListening(false);
      const next = comboOf(e);
      if (!next) return; // a modifier on its own, an arrow…: wait for the rest of the combination
      const clash = setBinding(id, next);
      if (clash) toast(`Key ${next} is already used by ${clash}`, 'error');
      setListening(false);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [listening, id]);
  return (
    <div className="set-row">
      <div className="set-label">{row.label}</div>
      <div className="set-control">
        {rest.length > 0 && <span className="muted">{rest.join('  /  ')}</span>}
        <button type="button" className={`keycap wide${listening ? ' listening' : ''}${isDefault ? '' : ' changed'}`} onClick={() => setListening(!listening)} aria-label={`${row.label}: key`} data-tip="Click, then press the new combination (Esc cancels)">
          {listening ? '…' : combo}
        </button>
        {!isDefault && (
          <Button small ghost onClick={() => resetBinding(id)}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

const OFFSETS = [-200, -100, -50, -25, -10, 0, 10, 25, 50, 100, 200];

export function SettingsDialog() {
  const lang = useLang();
  const [tab, setTab] = useState<Tab>('general');
  const autosave = useSettings((s) => s.autosave);
  const showWelcome = useSettings((s) => s.showWelcome);
  const bg = useSettings((s) => s.viewportBg);
  const smoothing = useSettings((s) => s.smoothing);
  const zoomToMouse = useSettings((s) => s.zoomToMouse);
  const onionBefore = useSettings((s) => s.onionBefore);
  const onionAfter = useSettings((s) => s.onionAfter);
  const onionGap = useSettings((s) => s.onionGap);
  const onionMode = useSettings((s) => s.onionMode);
  const onionOffsetX = useSettings((s) => s.onionOffsetX);
  const onionOffsetY = useSettings((s) => s.onionOffsetY);
  const onionStyle = useSettings((s) => s.onionStyle);
  const onionTop = useSettings((s) => s.onionTop);
  const onionColorBefore = useSettings((s) => s.onionColorBefore);
  const onionColorAfter = useSettings((s) => s.onionColorAfter);
  const boneScale = useSettings((s) => s.boneScale);
  const pixelGrid = useSettings((s) => s.pixelGrid);
  const showFps = useSettings((s) => s.showFps);
  const tooltips = useSettings((s) => s.tooltips);
  useSettings((s) => s.toolKeys);
  useSettings((s) => s.keyMap);
  const close = () => uiStore.patch({ settingsOpen: false });
  const others = hotkeyGroups().slice(1);

  return (
    <Dialog
      title="Settings"
      width={620}
      onClose={close}
      footer={
        <>
          <Button ghost icon={RotateCcw} onClick={resetSettings}>
            Reset to defaults
          </Button>
          <Button primary onClick={close}>
            Close
          </Button>
        </>
      }
    >
      <Segmented
        label="Settings"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'general', label: 'General', tone: 'plain' },
          { value: 'viewport', label: 'Viewport', tone: 'plain' },
          { value: 'hotkeys', label: 'Hotkeys', tone: 'plain' },
        ]}
      />
      <div className="settings-body">
        {tab === 'general' && (
          <>
            <Row label="Language">
              <Segmented className="lang" label="Language" value={lang} onChange={setLang} options={(['en', 'ru'] as const).map((l) => ({ value: l, label: l.toUpperCase() }))} />
            </Row>
            <Row label="Welcome window" hint="Shown when the editor starts with an empty project">
              <Toggle on={showWelcome} onChange={(v) => setSettings({ showWelcome: v })} title="Welcome window" />
            </Row>
            <Row label="Autosave" hint="Keeps the open project in this browser a moment after every change">
              <Toggle on={autosave} onChange={(v) => setSettings({ autosave: v })} title="Autosave" />
            </Row>
            <Row label="Hints" hint="The hints that pop up over buttons and fields">
              <Toggle on={tooltips} onChange={(v) => setSettings({ tooltips: v })} title="Hints" />
            </Row>
          </>
        )}
        {tab === 'viewport' && (
          <>
            <Row label="Background">
              <ColorSwatch value={bg} onChange={(rgb) => setSettings({ viewportBg: rgb })} title="Viewport background" />
              {bg.some((v, i) => v !== DEFAULT_SETTINGS.viewportBg[i]) && (
                <Button small ghost onClick={() => setSettings({ viewportBg: DEFAULT_SETTINGS.viewportBg })}>
                  Reset
                </Button>
              )}
            </Row>
            <Row label="Bone size" hint="How thick the bones and joints are drawn">
              <SelectField value={String(boneScale)} options={BONE_SCALES.map((n) => ({ value: String(n), label: `${n}%` }))} onChange={(v) => setSettings({ boneScale: Number(v) })} />
            </Row>
            <Row label="Smooth images" hint="Off shows the pixels as they are (pixel art)">
              <Toggle on={smoothing} onChange={(v) => setSettings({ smoothing: v })} title="Smooth images" />
            </Row>
            <Row label="Pixel grid" hint="A line at every whole unit when zoomed in far enough to tell them apart (6 pixels or more per unit)">
              <Toggle on={pixelGrid} onChange={(v) => setSettings({ pixelGrid: v })} title="Pixel grid" />
            </Row>
            <Row label="Show FPS" hint="Frames drawn in the last second and the time of the last one, in the corner of the viewport (the viewport draws only when something changes, so it reads 0 at rest)">
              <Toggle on={showFps} onChange={(v) => setSettings({ showFps: v })} title="Show FPS" />
            </Row>
            <Row label="Zoom to mouse" hint="The wheel zooms around the pointer, not the middle of the viewport">
              <Toggle on={zoomToMouse} onChange={(v) => setSettings({ zoomToMouse: v })} title="Zoom to mouse" />
            </Row>
            <Row label="Onion skin: frames before" hint="Faded poses before the playhead (red)">
              <SelectField value={String(onionBefore)} options={[0, 1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => setSettings({ onionBefore: Number(v) })} />
            </Row>
            <Row label="Onion skin: frames after" hint="Faded poses after the playhead (blue)">
              <SelectField value={String(onionAfter)} options={[0, 1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => setSettings({ onionAfter: Number(v) })} />
            </Row>
            <Row label="Onion skin: frames between ghosts">
              <SelectField value={String(onionGap)} options={[1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => setSettings({ onionGap: Number(v) })} />
            </Row>
            <Row label="Onion skin: ghosts at" hint="Every few frames, or at the keys around the playhead (of the selected bones, when some are selected)">
              <Segmented
                label="Onion skin: ghosts at"
                value={onionMode}
                onChange={(v) => setSettings({ onionMode: v })}
                options={[
                  { value: 'frames', label: 'Frames' },
                  { value: 'keys', label: 'Keys' },
                ]}
              />
            </Row>
            <Row label="Onion skin: look" hint="Faded pictures, a flat colour, or a flat colour drawn over the pose so it shows through">
              <Segmented
                label="Onion skin: look"
                value={onionStyle}
                onChange={(v) => setSettings({ onionStyle: v })}
                options={[
                  { value: 'image', label: 'Pictures' },
                  { value: 'silhouette', label: 'Silhouette' },
                  { value: 'xray', label: 'X-ray' },
                ]}
              />
            </Row>
            <Row label="Onion skin: over the pose" hint="Draw the ghosts over the pose instead of under it (always so for X-ray)">
              <Toggle on={onionTop || onionStyle === 'xray'} onChange={(v) => setSettings({ onionTop: v })} title="Onion skin: over the pose" />
            </Row>
            <Row label="Onion skin: shift X" hint="Moves each ghost sideways, more for the ones farther from the playhead: the motion reads as a trail">
              <SelectField value={String(onionOffsetX)} options={OFFSETS.map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => setSettings({ onionOffsetX: Number(v) })} />
            </Row>
            <Row label="Onion skin: shift Y">
              <SelectField value={String(onionOffsetY)} options={OFFSETS.map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => setSettings({ onionOffsetY: Number(v) })} />
            </Row>
            <Row label="Onion skin: colours" hint="Before the playhead, after it">
              <ColorSwatch value={onionColorBefore} onChange={(rgb) => setSettings({ onionColorBefore: rgb })} title="Onion skin: colour before" />
              <ColorSwatch value={onionColorAfter} onChange={(rgb) => setSettings({ onionColorAfter: rgb })} title="Onion skin: colour after" />
            </Row>
          </>
        )}
        {tab === 'hotkeys' && (
          <>
            <p className="hint-text flush mb">Click a key and press the new one to change it. What the mouse does is listed for reference.</p>
            <h3 className="section-label flush">Tools</h3>
            {TOOLS.map((t) => (
              <ToolKey key={t.tool} tool={t.tool} title={t.title} />
            ))}
            {others.map((g) => (
              <section key={g.title}>
                <h3 className="section-label flush mt">{g.title}</h3>
                {g.rows.map((r) =>
                  r.id ? (
                    <CommandKey key={r.label} id={r.id} row={r} />
                  ) : (
                    <div key={r.label} className="set-row">
                      <div className="set-label">{r.label}</div>
                      <div className="set-control muted">{r.keys.join('  /  ')}</div>
                    </div>
                  ),
                )}
              </section>
            ))}
          </>
        )}
      </div>
    </Dialog>
  );
}
