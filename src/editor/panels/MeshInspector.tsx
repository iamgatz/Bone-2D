import { useState } from 'react';
import { Brush, Hexagon, Link2, RefreshCw, Sparkles, Triangle, Unlink2, Waves } from 'lucide-react';
import type { Id, MeshAttachment } from '@/core/model';
import { setAttachmentProps, setTool } from '@/store/actions';
import { autoWeightMesh, bindMeshToBones, convertToMesh, regenerateMesh, retriangulateMesh, smoothMeshWeights, unbindMeshFromBones } from '@/store/meshActions';
import { useProject } from '@/store/doc';
import { uiStore, useUi } from '@/store/ui';
import { Button, ColorSwatch, NumberField, SelectField } from '../ui/controls';
import { Field } from '../ui/Field';
import { Section } from '../ui/Section';

export function ConvertToMeshGroup({ slotId, name }: { slotId: Id; name: string }) {
  const [spacing, setSpacing] = useState(34);
  const [padding, setPadding] = useState(2);
  return (
    <Section id="mesh.convert" title="Mesh" icon={Hexagon}>
      <p className="hint-text mb">Turn this image into a deformable mesh. Tracing follows the opaque pixels and fills the shape with triangles.</p>
      <Field label="Density">
        <NumberField label="px" value={spacing} step={1} precision={0} min={8} max={400} onChange={setSpacing} title="Interior vertex spacing in pixels (smaller = more vertices)" />
      </Field>
      <Field label="Padding">
        <NumberField label="px" value={padding} step={1} precision={0} min={-20} max={40} onChange={setPadding} title="How far the outline sits outside the opaque pixels" />
      </Field>
      <div className="hstack">
        <Button primary icon={Sparkles} onClick={() => convertToMesh(slotId, name, 'trace', { spacing, padding })}>
          Trace mesh
        </Button>
        <Button onClick={() => convertToMesh(slotId, name, 'quad')} title="Four corner vertices only">
          Quad
        </Button>
      </div>
    </Section>
  );
}

export function MeshGroup({ slotId, att }: { slotId: Id; att: MeshAttachment }) {
  const project = useProject();
  const tool = useUi((s) => s.tool);
  const brush = useUi((s) => s.brush);
  const mode = useUi((s) => s.mode);
  const selectedBones = useUi((s) => s.selection.bones);
  const [spacing, setSpacing] = useState(34);
  const [padding, setPadding] = useState(2);
  const doc = project.skeleton;
  const slot = doc.slots.find((s) => s.id === slotId);
  const weighted = att.weights != null;
  const influencing = weighted ? [...new Set(att.weights!.flat().map((i) => i[0]))] : [];
  const boneName = (id: Id) => doc.bones.find((b) => b.id === id)?.name ?? '?';
  const setup = mode === 'setup';

  return (
    <>
      <Section id="mesh.main" title={`Mesh · ${att.path}`} icon={Hexagon}>
        <div className="hstack wrap mb">
          <span className="chip">{`${att.uvs.length / 2} vertices`}</span>
          <span className="chip">{`${att.triangles.length / 3} triangles`}</span>
          <span className={`chip${weighted ? ' accent' : ''}`}>{weighted ? `weighted · ${influencing.length} bones` : 'unweighted'}</span>
        </div>
        <div className="hstack mb">
          <Button primary={tool === 'mesh'} icon={Triangle} onClick={() => setTool('mesh')} title="Edit vertices (M)">
            {mode === 'animate' ? 'Deform' : 'Edit mesh'}
          </Button>
          <Button primary={tool === 'weights'} icon={Brush} disabled={!setup} onClick={() => setTool('weights')} title="Paint weights (W)">
            Weights
          </Button>
        </div>
        {setup && (
          <>
            <Field label="Density">
              <NumberField label="px" value={spacing} step={1} precision={0} min={8} max={400} onChange={setSpacing} />
            </Field>
            <Field label="Padding">
              <NumberField label="px" value={padding} step={1} precision={0} min={-20} max={40} onChange={setPadding} />
            </Field>
            <div className="hstack">
              <Button icon={RefreshCw} onClick={() => regenerateMesh(slotId, att.name, { spacing, padding })} title="Trace the image again (unweighted meshes)">
                Re-trace
              </Button>
              <Button onClick={() => retriangulateMesh(slotId, att.name)} title="Rebuild the triangles inside the outline">
                Retriangulate
              </Button>
            </div>
          </>
        )}
      </Section>

      {setup && (
        <Section id="mesh.weights" title="Weights" icon={Link2}>
          {!weighted ? (
            <>
              <p className="hint-text mb">Bind the mesh to bones so it bends with them. Select the bones in the viewport first.</p>
              <Button primary icon={Link2} onClick={() => bindMeshToBones(slotId, att.name, selectedBones)} disabled={!selectedBones.length && !slot} title="Auto-weights to the selected bones">
                {`Bind to ${selectedBones.length || 1} selected bone${selectedBones.length === 1 || !selectedBones.length ? '' : 's'}`}
              </Button>
            </>
          ) : (
            <>
              <div className="hstack wrap mb">
                <Button icon={Link2} onClick={() => bindMeshToBones(slotId, att.name, selectedBones)} title="Add the selected bones as influences (re-computes weights)">
                  Add bones
                </Button>
                <Button icon={Sparkles} onClick={() => autoWeightMesh(slotId, att.name)}>
                  Auto
                </Button>
                <Button icon={Waves} onClick={() => smoothMeshWeights(slotId, att.name, 2)}>
                  Smooth
                </Button>
                <Button icon={Unlink2} danger onClick={() => unbindMeshFromBones(slotId, att.name)}>
                  Unbind
                </Button>
              </div>
              <Field label="Bone">
                <SelectField value={brush.bone ?? influencing[0]} options={influencing.map((id) => ({ value: id, label: boneName(id) }))} onChange={(v) => uiStore.patch({ brush: { ...brush, bone: v } })} />
              </Field>
              <Field label="Mode">
                <SelectField value={brush.mode} options={[{ value: 'add', label: 'Add' }, { value: 'subtract', label: 'Subtract' }, { value: 'replace', label: 'Replace' }, { value: 'smooth', label: 'Smooth' }]} onChange={(v) => uiStore.patch({ brush: { ...brush, mode: v } })} />
              </Field>
              <Field label="Size">
                <NumberField label="px" value={brush.size} step={1} precision={0} min={4} max={400} onChange={(v) => uiStore.patch({ brush: { ...brush, size: v } })} />
              </Field>
              <Field label="Strength">
                <NumberField label="%" value={brush.strength * 100} step={1} precision={0} min={1} max={100} onChange={(v) => uiStore.patch({ brush: { ...brush, strength: v / 100 } })} />
              </Field>
              <p className="hint-text">
                Press <span className="kbd">W</span>, then paint over the mesh. Click an influencing bone in the viewport to switch the brush bone.
              </p>
            </>
          )}
        </Section>
      )}

      <div className="group">
        <Field label="Color">
          <div className="hstack">
            <ColorSwatch value={att.color} onChange={(rgb) => setAttachmentProps(slotId, att.name, { color: [rgb[0], rgb[1], rgb[2], att.color[3]] })} />
            <NumberField label="A" value={att.color[3]} step={0.01} min={0} max={1} onChange={(v) => setAttachmentProps(slotId, att.name, { color: [att.color[0], att.color[1], att.color[2], v] })} />
          </div>
        </Field>
      </div>
    </>
  );
}
