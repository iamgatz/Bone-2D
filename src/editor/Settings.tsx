import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { setLang, useLang } from '@/i18n';
import { DEFAULT_SETTINGS, resetSettings, setSettings, useSettings } from '@/store/settings';
import { toast, uiStore } from '@/store/ui';
import { Button, ColorSwatch, Dialog, SelectField, Toggle } from './ui/controls';
import { Segmented } from './ui/Segmented';
import { hotkeyGroups } from './hotkeys';
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
      const clash = setToolKey(tool, e.key);
      if (clash) toast(`Key ${e.key.toUpperCase()} is already used by ${TOOLS.find((t) => t.tool === clash)!.title}`, 'error');
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

export function SettingsDialog() {
  const lang = useLang();
  const [tab, setTab] = useState<Tab>('general');
  const autosave = useSettings((s) => s.autosave);
  const bg = useSettings((s) => s.viewportBg);
  const smoothing = useSettings((s) => s.smoothing);
  const zoomToMouse = useSettings((s) => s.zoomToMouse);
  const onionBefore = useSettings((s) => s.onionBefore);
  const onionAfter = useSettings((s) => s.onionAfter);
  const onionGap = useSettings((s) => s.onionGap);
  useSettings((s) => s.toolKeys);
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
            <Row label="Autosave" hint="Keeps the open project in this browser a moment after every change">
              <Toggle on={autosave} onChange={(v) => setSettings({ autosave: v })} title="Autosave" />
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
            <Row label="Smooth images" hint="Off shows the pixels as they are (pixel art)">
              <Toggle on={smoothing} onChange={(v) => setSettings({ smoothing: v })} title="Smooth images" />
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
          </>
        )}
        {tab === 'hotkeys' && (
          <>
            <p className="hint-text flush mb">The letters of the tools can be changed. The other keys are listed for reference.</p>
            <h3 className="section-label flush">Tools</h3>
            {TOOLS.map((t) => (
              <ToolKey key={t.tool} tool={t.tool} title={t.title} />
            ))}
            {others.map((g) => (
              <section key={g.title}>
                <h3 className="section-label flush mt">{g.title}</h3>
                {g.rows.map((r) => (
                  <div key={r.label} className="set-row">
                    <div className="set-label">{r.label}</div>
                    <div className="set-control muted">{r.keys.join('  /  ')}</div>
                  </div>
                ))}
              </section>
            ))}
          </>
        )}
      </div>
    </Dialog>
  );
}
