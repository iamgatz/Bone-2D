import { ArrowDown, ArrowRight, ArrowUp, Link2, Plus, Trash2, X } from 'lucide-react';
import { TRANSFORM_PROPS } from '@/core/model';
import type { Id, TransformProp } from '@/core/model';
import { useProject } from '@/store/doc';
import { deleteConstraint, moveConstraint, renameConstraint } from '@/store/ikActions';
import { updateTransform } from '@/store/transformActions';
import { Button, IconButton, NumberField, SelectField, TextField, Toggle } from '../ui/controls';

const PROP_LABEL: Record<TransformProp, string> = { rotate: 'Rotation', x: 'X', y: 'Y', scaleX: 'Scale X', scaleY: 'Scale Y', shearY: 'Shear Y' };
const propOptions = TRANSFORM_PROPS.map((p) => ({ value: p, label: PROP_LABEL[p] }));
const MIX_KEYS: TransformProp[] = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'];

function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '62px 1fr', gap: 6, alignItems: 'center', marginBottom: 6 }}>
      <span style={{ color: 'var(--muted)' }}>{props.label}</span>
      <div>{props.children}</div>
    </div>
  );
}

export function TransformInspector({ id }: { id: Id }) {
  const project = useProject();
  const doc = project.skeleton;
  const c = doc.constraints.find((x) => x.id === id);
  if (!c || c.type !== 'transform') return null;
  const index = doc.constraints.findIndex((x) => x.id === id);
  const boneName = (b: Id) => doc.bones.find((x) => x.id === b)?.name ?? '?';
  const usedTo = new Set(c.properties.flatMap((f) => f.to.map((t) => t.prop)));

  return (
    <>
      <div className="group">
        <div className="group-title">
          <Link2 size={14} color="#b38cff" />
          <span>Transform constraint</span>
          <span className="spacer" />
          <IconButton icon={ArrowUp} title="Apply earlier" small disabled={index <= 0} onClick={() => moveConstraint(id, -1)} />
          <IconButton icon={ArrowDown} title="Apply later" small disabled={index >= doc.constraints.length - 1} onClick={() => moveConstraint(id, 1)} />
          <IconButton icon={Trash2} title="Delete constraint" small onClick={() => deleteConstraint(id)} />
        </div>
        <TextField value={c.name} onCommit={(n) => renameConstraint(id, n)} wide />
      </div>

      <div className="group">
        <div className="group-title">Bones</div>
        <Row label="Source">
          <SelectField value={c.source} options={doc.bones.filter((b) => !c.bones.includes(b.id)).map((b) => ({ value: b.id, label: b.name }))} onChange={(v) => updateTransform(id, (x) => void (x.source = v))} />
        </Row>
        <Row label="Drives">
          <span style={{ color: 'var(--text-dim)' }}>{c.bones.map(boneName).join(', ')}</span>
        </Row>
        <div className="row-between">
          <label title="Read the source's local transform instead of its world transform">Local source</label>
          <Toggle on={c.localSource} onChange={(v) => updateTransform(id, (x) => void (x.localSource = v))} />
        </div>
        <div className="row-between">
          <label title="Write the constrained bones' local transforms instead of their world transforms">Local target</label>
          <Toggle on={c.localTarget} onChange={(v) => updateTransform(id, (x) => void (x.localTarget = v))} />
        </div>
        <div className="row-between">
          <label title="Add to the constrained bone instead of replacing the property">Additive</label>
          <Toggle on={c.additive} onChange={(v) => updateTransform(id, (x) => void (x.additive = v))} />
        </div>
        <div className="row-between">
          <label title="Keep each result between the target offset and max">Clamp</label>
          <Toggle on={c.clamp} onChange={(v) => updateTransform(id, (x) => void (x.clamp = v))} />
        </div>
      </div>

      <div className="group">
        <div className="group-title">
          <span>Mappings</span>
          <span className="spacer" />
          <IconButton icon={Plus} title="Add mapping" small onClick={() => updateTransform(id, (x) => void x.properties.push({ prop: 'rotate', offset: 0, to: [{ prop: 'rotate', offset: 0, max: 1, scale: 1 }] }))} />
        </div>
        {c.properties.map((f, fi) =>
          f.to.map((t, ti) => (
            <div key={`${fi}-${ti}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, marginBottom: 8, background: '#10131a' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 16px 1fr 22px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <SelectField value={f.prop} options={propOptions} onChange={(v) => updateTransform(id, (x) => void (x.properties[fi].prop = v))} />
                <ArrowRight size={14} color="var(--muted)" />
                <SelectField value={t.prop} options={propOptions} onChange={(v) => updateTransform(id, (x) => void (x.properties[fi].to[ti].prop = v))} />
                <IconButton
                  icon={X}
                  title="Remove mapping"
                  small
                  onClick={() =>
                    updateTransform(id, (x) => {
                      x.properties[fi].to.splice(ti, 1);
                      if (!x.properties[fi].to.length) x.properties.splice(fi, 1);
                    })
                  }
                />
              </div>
              <div className="grid2">
                <NumberField label="from" value={f.offset} step={1} title="Source value that maps to the target offset" onChange={(v) => updateTransform(id, (x) => void (x.properties[fi].offset = v))} />
                <NumberField label="to" value={t.offset} step={1} title="Target value at the source offset" onChange={(v) => updateTransform(id, (x) => void (x.properties[fi].to[ti].offset = v))} />
                <NumberField label="×" value={t.scale} step={0.05} precision={3} title="Target change per unit of source change" onChange={(v) => updateTransform(id, (x) => void (x.properties[fi].to[ti].scale = v))} />
                <NumberField label="max" value={t.max} step={1} title="Clamp limit (when Clamp is on)" onChange={(v) => updateTransform(id, (x) => void (x.properties[fi].to[ti].max = v))} />
              </div>
            </div>
          )),
        )}
        {!c.properties.length && <p className="hint-text">No mappings: the constraint does nothing.</p>}
      </div>

      <div className="group">
        <div className="group-title">Mix</div>
        {MIX_KEYS.filter((k) => usedTo.has(k)).map((k) => (
          <Row key={k} label={PROP_LABEL[k]}>
            <NumberField label="%" value={c.mix[k] * 100} step={1} precision={0} min={0} max={100} onChange={(v) => updateTransform(id, (x) => void (x.mix[k] = v / 100))} />
          </Row>
        ))}
        {!usedTo.size && <p className="hint-text">Add a mapping to set mixes.</p>}
      </div>

      <div className="group">
        <div className="group-title">Offsets applied to the source</div>
        <div className="grid2">
          {(['rotation', 'x', 'y', 'scaleX', 'scaleY', 'shearY'] as const).map((k) => (
            <NumberField key={k} label={k === 'rotation' ? '°' : k.replace('scale', 'S').replace('shear', 'Sh')} value={c.offsets[k]} step={k.startsWith('scale') ? 0.05 : 1} precision={2} onChange={(v) => updateTransform(id, (x) => void (x.offsets[k] = v))} />
          ))}
        </div>
      </div>

      <div className="group">
        <Button danger icon={Trash2} onClick={() => deleteConstraint(id)}>
          Delete constraint
        </Button>
      </div>
    </>
  );
}
