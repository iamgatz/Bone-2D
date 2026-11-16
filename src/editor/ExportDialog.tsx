import { useEffect, useState } from 'react';
import { Download, Package } from 'lucide-react';
import { docStore, useProject } from '@/store/doc';
import { downloadBlob } from '@/store/project';
import { toast, uiStore } from '@/store/ui';
import { buildSpineExport } from './exportSpine';
import type { ExportResult } from './exportSpine';
import { Button, Dialog, SelectField, Toggle } from './ui/controls';

export function ExportDialog() {
  const project = useProject();
  const doc = project.skeleton;
  const [maxSize, setMaxSize] = useState('2048');
  const [padding, setPadding] = useState('2');
  const [pretty, setPretty] = useState(false);
  const [nonessential, setNonessential] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(null);
    buildSpineExport({ maxSize: +maxSize, padding: +padding, pretty, nonessential })
      .then((r) => alive && setResult(r))
      .catch((e: Error) => alive && (setError(e.message), setResult(null)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [maxSize, padding, pretty, nonessential]);

  const close = () => uiStore.patch({ exportOpen: false });
  const base = (doc.name || 'skeleton').replace(/[^\w\-]+/g, '_');

  return (
    <Dialog
      title="Export for Spine 4.3"
      onClose={close}
      footer={
        <>
          <Button ghost onClick={close}>Close</Button>
          <Button
            primary
            icon={Download}
            disabled={!result || busy}
            onClick={() => {
              if (!result) return;
              downloadBlob(new Blob([result.zip as BlobPart], { type: 'application/zip' }), `${base}-spine-4.3.zip`);
              toast('Export downloaded', 'ok');
            }}
          >
            Download ZIP
          </Button>
        </>
      }
    >
      <p className="hint-text" style={{ marginTop: 0 }}>
        Produces <b>.json + .atlas + .png</b> that load in the official Spine 4.3 runtimes (spine-ts, Unity, Godot, Pixi, Phaser…).
      </p>
      <div className="kv">
        <label>Atlas page size</label>
        <SelectField value={maxSize} options={['1024', '2048', '4096'].map((v) => ({ value: v, label: `${v} px` }))} onChange={setMaxSize} />
        <label>Padding</label>
        <SelectField value={padding} options={['0', '1', '2', '4'].map((v) => ({ value: v, label: `${v} px` }))} onChange={setPadding} />
        <label>Editor data</label>
        <Toggle on={nonessential} onChange={setNonessential} title="Bone colors, fps, image path" />
        <label>Pretty JSON</label>
        <Toggle on={pretty} onChange={setPretty} />
      </div>
      <div style={{ background: '#10131a', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
        {busy && <span className="hint-text">Packing atlas…</span>}
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
        {result && !busy && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--text-dim)' }}>
              <Package size={15} />
              {`${doc.bones.length} bones · ${doc.slots.length} slots · ${doc.animations.length} animations · ${result.pages} atlas page${result.pages === 1 ? '' : 's'}`}
            </div>
            {result.files.map((f) => (
              <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: 'var(--text-dim)' }}>
                <span>{f.name}</span>
                <span style={{ color: 'var(--muted)' }}>{(f.size / 1024).toFixed(1)} KB</span>
              </div>
            ))}
            {result.missing.length > 0 && <div style={{ color: 'var(--danger)', marginTop: 8 }}>Missing images: {result.missing.join(', ')}</div>}
          </>
        )}
      </div>
    </Dialog>
  );
}

export { docStore };
