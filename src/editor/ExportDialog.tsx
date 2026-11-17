import { useEffect, useState } from 'react';
import { Download, Package } from 'lucide-react';
import { docStore, useProject } from '@/store/doc';
import { downloadBlob } from '@/store/project';
import { toast, uiStore } from '@/store/ui';
import { buildSpineExport } from './exportSpine';
import type { ExportResult } from './exportSpine';
import { Button, Dialog, SelectField, Toggle } from './ui/controls';
import { Segmented } from './ui/Segmented';
import { ExportAnimation } from './ExportAnimation';

export function ExportDialog() {
  const project = useProject();
  const doc = project.skeleton;
  const [format, setFormat] = useState<'json' | 'binary'>('json');
  const [maxSize, setMaxSize] = useState('2048');
  const [padding, setPadding] = useState('2');
  const [pretty, setPretty] = useState(false);
  const [nonessential, setNonessential] = useState(true);
  const [pot, setPot] = useState(true);
  const [includePreview, setIncludePreview] = useState(true);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [tab, setTab] = useState<'data' | 'animation'>('data');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (tab !== 'data') return;
    setBusy(true);
    setError(null);
    buildSpineExport({ format, maxSize: +maxSize, padding: +padding, pretty, nonessential, pot, includePreview, excludeAnimations: excluded })
      .then((r) => alive && setResult(r))
      .catch((e: Error) => alive && (setError(e.message), setResult(null)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [format, maxSize, padding, pretty, nonessential, pot, includePreview, excluded, tab]);

  const close = () => uiStore.patch({ exportOpen: false });
  const base = (doc.name || 'skeleton').replace(/[^\w\-]+/g, '_');

  return (
    <Dialog
      title="Export"
      width={tab === 'animation' ? 640 : undefined}
      onClose={close}
      footer={
        <>
          <Button ghost onClick={close}>Close</Button>
          {tab === 'data' && (
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
          )}
        </>
      }
    >
      <Segmented
        label="Export"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'data', label: 'Spine 4.3 data', tone: 'plain', title: 'Skeleton data (JSON or binary), texture atlas and a preview page' },
          { value: 'animation', label: 'Animation (GIF / PNG / video)', tone: 'plain', title: 'Render an animation to pictures' },
        ]}
      />
      {tab === 'animation' ? (
        <ExportAnimation />
      ) : (
        <>
      <p className="hint-text flush">
        Produces <b>{format === 'binary' ? '.skel' : '.json'} + .atlas + .png</b> that load in the official Spine 4.3 runtimes (spine-ts, Unity, Godot, Pixi, Phaser…).
      </p>
      <div className="kv">
        <label>Skeleton file</label>
        <SelectField value={format} options={[{ value: 'json', label: 'JSON (.json)' }, { value: 'binary', label: 'Binary (.skel), smaller' }]} onChange={setFormat} />
        <label>Atlas page size</label>
        <SelectField value={maxSize} options={['1024', '2048', '4096'].map((v) => ({ value: v, label: `${v} px` }))} onChange={setMaxSize} />
        <label>Padding</label>
        <SelectField value={padding} options={['0', '1', '2', '4'].map((v) => ({ value: v, label: `${v} px` }))} onChange={setPadding} />
        <label>Editor data</label>
        <Toggle on={nonessential} onChange={setNonessential} title="Bone colors, fps, image path" />
        {format === 'json' && (
          <>
            <label>Pretty JSON</label>
            <Toggle on={pretty} onChange={setPretty} />
          </>
        )}
        <label>Power-of-two pages</label>
        <Toggle on={pot} onChange={setPot} title="Atlas page sizes are powers of two" />
        <label>Preview page</label>
        <Toggle on={includePreview} onChange={setIncludePreview} title="A page that plays the export with the official Spine player" />
      </div>
      {doc.animations.length > 0 && (
        <div className="anim-pick">
          <span className="section-label flush">Animations to export</span>
          {doc.animations.map((a) => (
            <label key={a.id} className="check">
              <input type="checkbox" checked={!excluded.includes(a.id)} onChange={(e) => setExcluded(e.target.checked ? excluded.filter((x) => x !== a.id) : [...excluded, a.id])} />
              <span>{a.name}</span>
            </label>
          ))}
        </div>
      )}
      <div className="card roomy">
        {busy && <span className="hint-text">Packing atlas…</span>}
        {error && <span className="danger-text">{error}</span>}
        {result && !busy && (
          <>
            <div className="hstack mb dim">
              <Package size={15} />
              {`${doc.bones.length} bones · ${doc.slots.length} slots · ${doc.animations.length} animations · ${result.pages} atlas page${result.pages === 1 ? '' : 's'}`}
            </div>
            {result.files.map((f) => (
              <div key={f.name} className="spread dim">
                <span>{f.name}</span>
                <span className="muted">{(f.size / 1024).toFixed(1)} KB</span>
              </div>
            ))}
            {result.missing.length > 0 && <div className="danger-text mt">Missing images: {result.missing.join(', ')}</div>}
          </>
        )}
      </div>
        </>
      )}
    </Dialog>
  );
}

export { docStore };
