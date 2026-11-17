import { useState } from 'react';
import { ArrowLeftRight, Brush, ClipboardPaste, Copy, Crosshair, Lock, Unlock, FlipHorizontal2, Hexagon, Link2, RefreshCw, Scissors, Sparkles, Triangle, Unlink2, Waves, X } from 'lucide-react';
import type { Id, MeshAttachment, Project } from '@/core/model';
import { linkSource } from '@/core/links';
import { linkMeshTo, setAttachmentProps, setLinkDeform, setTool, unlinkMesh } from '@/store/actions';
import { autoWeightMesh, bindMeshToBones, convertToMesh, copyVertexWeights, pasteVertexWeights, mirrorMeshWeights, pruneMeshWeights, regenerateMesh, removeBoneFromMesh, retriangulateMesh, smoothMeshWeights, swapMeshWeights, unbindMeshFromBones, updateMeshBindings, weldMeshWeights, weldTargets } from '@/store/meshActions';
import { useProject } from '@/store/doc';
import { uiStore, useUi } from '@/store/ui';
import { boneCss, boundBones } from '../viewport/weightColors';
import { Button, ColorSwatch, IconButton, NumberField, SelectField, Toggle } from '../ui/controls';
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

/** The meshes of the default skin a mesh could take its shape from: every other mesh that is not linked itself. */
function shapeSources(doc: Project['skeleton'], slotId: Id, name: string): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (const slot of doc.slots) {
    for (const [n, a] of Object.entries(doc.skins[0].attachments[slot.id] ?? {})) {
      if (a.type === 'mesh' && !a.link && !(slot.id === slotId && n === name)) out.push({ value: `${slot.id}${n}`, label: n === slot.name ? n : `${slot.name} · ${n}` });
    }
  }
  return out;
}

/**
 * What a linked mesh is: its shape is the shape of a source mesh, its picture is its own. Shows the source, whether the deform of the
 * source moves it too, and a way to cut it loose.
 */
export function LinkedMeshFields({ skinId, slotId, name, mesh }: { skinId: Id; slotId: Id; name: string; mesh: MeshAttachment }) {
  const project = useProject();
  const link = mesh.link;
  if (!link) return null;
  const doc = project.skeleton;
  const source = linkSource(doc, slotId, mesh);
  const slot = doc.slots.find((s) => s.id === (link.slot ?? slotId));
  const skin = doc.skins.find((s) => s.id === (link.skin ?? doc.skins[0]?.id));
  const where = [link.source, ...(link.slot && slot ? [slot.name] : []), ...(link.skin && skin ? [skin.name] : [])].join(' · ');
  return (
    <>
      <Field label="Linked to">
        <span className="chip accent" title="The shape of this mesh (vertices, triangles, weights) is the shape of its source mesh">
          {source ? where : `${link.source} (missing)`}
        </span>
      </Field>
      <Field label="Share deform">
        <Toggle on={link.deform} onChange={(on) => setLinkDeform(skinId, slotId, name, on)} title="The deform animation of the source mesh moves this one too; off = it has deform timelines of its own" />
      </Field>
      <div className="hstack mb">
        <Button icon={Unlink2} onClick={() => unlinkMesh(skinId, slotId, name)} title="Keep the shape this mesh has now and edit it on its own">
          Unlink
        </Button>
      </div>
    </>
  );
}

export function MeshGroup({ slotId, att }: { slotId: Id; att: MeshAttachment }) {
  const project = useProject();
  const tool = useUi((s) => s.tool);
  const brush = useUi((s) => s.brush);
  const weightView = useUi((s) => s.weightView);
  const mode = useUi((s) => s.mode);
  const selectedBones = useUi((s) => s.selection.bones);
  const pickedVertices = useUi((s) => (s.selection.slot === slotId && s.selection.attachment === att.name ? s.selection.vertices.length : 0));
  const [spacing, setSpacing] = useState(34);
  const [padding, setPadding] = useState(2);
  const [pruneBones, setPruneBones] = useState(4);
  const [pruneBelow, setPruneBelow] = useState(5);
  const [swapA, setSwapA] = useState<Id>('');
  const [swapB, setSwapB] = useState<Id>('');
  const [weldPick, setWeldPick] = useState('');
  const [weldMode, setWeldMode] = useState<'all' | 'overlapping'>('overlapping');
  const doc = project.skeleton;
  const slot = doc.slots.find((s) => s.id === slotId);
  const weighted = att.weights != null;
  const influencing = weighted ? [...new Set(att.weights!.flat().map((i) => i[0]))] : [];
  const boneName = (id: Id) => doc.bones.find((b) => b.id === id)?.name ?? '?';
  const setup = mode === 'setup';
  const linked = !!att.link;
  const swapFrom = influencing.includes(swapA) ? swapA : (influencing[0] ?? '');
  const swapTo = influencing.includes(swapB) && swapB !== swapFrom ? swapB : (influencing.find((b) => b !== swapFrom) ?? '');
  const welds = weighted && setup && !linked ? weldTargets(slotId, att.name) : [];
  const bound = weighted ? boundBones(att.weights!, doc.bones.map((b) => b.id)) : [];
  const weld = welds[Number(weldPick)] ?? welds.find((w) => w.shared >= 2) ?? welds[0];
  const weldKey = String(welds.indexOf(weld));

  return (
    <>
      <Section id="mesh.main" title={`Mesh · ${att.path}`} icon={Hexagon}>
        <div className="hstack wrap mb">
          <span className="chip">{`${att.uvs.length / 2} vertices`}</span>
          <span className="chip">{`${att.triangles.length / 3} triangles`}</span>
          <span className={`chip${weighted ? ' accent' : ''}`}>{weighted ? `weighted · ${influencing.length} bones` : 'unweighted'}</span>
        </div>
        <div className="hstack mb">
          <Button primary={tool === 'mesh'} icon={Triangle} disabled={linked && setup} onClick={() => setTool('mesh')} title="Edit vertices (M)">
            {mode === 'animate' ? 'Deform' : 'Edit mesh'}
          </Button>
          <Button primary={tool === 'weights'} icon={Brush} disabled={!setup || linked} onClick={() => setTool('weights')} title="Paint weights (W)">
            Weights
          </Button>
        </div>
        {linked && att.link && <LinkedMeshFields skinId={project.skeleton.skins[0].id} slotId={slotId} name={att.name} mesh={att} />}
        {setup && !linked && (
          <>
            <Field label="Share shape with">
              <SelectField
                value=""
                options={[{ value: '', label: '— none —' }, ...shapeSources(project.skeleton, slotId, att.name)]}
                onChange={(v) => {
                  const [sid, ...rest] = v.split('');
                  if (sid) linkMeshTo(slotId, att.name, { slotId: sid, name: rest.join('') });
                }}
              />
            </Field>
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

      {setup && !linked && (
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
                <Button icon={Scissors} onClick={() => pruneMeshWeights(slotId, att.name, pruneBelow / 100, pruneBones)} title="Drop the influences lighter than the threshold and keep at most the given number of bones per vertex">
                  Prune
                </Button>
                <Button icon={Crosshair} onClick={() => updateMeshBindings(slotId, att.name)} title="Make the bind pose the pose the bones have now (after moving bones in the setup pose), so weight edits stop shifting the vertices">
                  Update bindings
                </Button>
                <Button icon={FlipHorizontal2} onClick={() => mirrorMeshWeights(slotId, att.name, true)} title="Copy the weights of the left half to the right half (bones swapped for their mirror twins)">
                  Mirror L→R
                </Button>
                <Button icon={FlipHorizontal2} onClick={() => mirrorMeshWeights(slotId, att.name, false)} title="Copy the weights of the right half to the left half (bones swapped for their mirror twins)">
                  Mirror R→L
                </Button>
                <Button icon={Unlink2} danger onClick={() => unbindMeshFromBones(slotId, att.name)}>
                  Unbind
                </Button>
              </div>
              <p className="hint-text mb">{pickedVertices ? `Auto, Smooth, Prune, Swap, Weld and Update bindings work on the ${pickedVertices} selected vertices.` : 'Select vertices with the mesh tool (M) to limit Auto, Smooth, Prune, Swap, Weld and Update bindings to them; with none selected they work on the whole mesh.'}</p>
              <Field label="Prune">
                <NumberField label="bones" value={pruneBones} step={1} precision={0} min={1} max={4} onChange={(v) => setPruneBones(Math.max(1, Math.min(4, Math.round(v))))} title="Most bones one vertex may keep" />
                <NumberField label="%" value={pruneBelow} step={1} precision={0} min={0} max={50} onChange={(v) => setPruneBelow(Math.max(0, Math.min(50, v)))} title="Weights lighter than this are removed" />
              </Field>
              {influencing.length > 1 && (
                <Field label="Swap">
                  <SelectField value={swapFrom} options={influencing.map((id) => ({ value: id, label: boneName(id) }))} onChange={setSwapA} />
                  <SelectField value={swapTo} options={influencing.map((id) => ({ value: id, label: boneName(id) }))} onChange={setSwapB} />
                  <Button icon={ArrowLeftRight} onClick={() => swapMeshWeights(slotId, att.name, swapFrom, swapTo)} title="The two bones exchange their weights on the selected vertices (or the whole mesh)">
                    Swap
                  </Button>
                </Field>
              )}
              {welds.length > 0 && (
                <Field label="Weld">
                  <SelectField value={weldKey} options={welds.map((w, i) => ({ value: String(i), label: `${w.label} (${w.shared})` }))} onChange={setWeldPick} />
                  <SelectField value={weldMode} options={[{ value: 'overlapping', label: 'Overlapping' }, { value: 'all', label: 'All' }]} onChange={(v) => setWeldMode(v as 'all' | 'overlapping')} />
                  <Button icon={Link2} disabled={!weld || weld.shared < 2} onClick={() => weld && weldMeshWeights(slotId, att.name, weld.slotId, weld.name, weldMode)} title="Take the weights of the other mesh where this one lies over it (both need the same two or more bones; the number in brackets is how many they share)">
                    Weld
                  </Button>
                </Field>
              )}
              <div className="hstack wrap mb">
                <Button icon={Copy} onClick={() => copyVertexWeights(slotId, att.name)} title="Remember the weights of the selected vertices">
                  Copy weights
                </Button>
                <Button icon={ClipboardPaste} onClick={() => pasteVertexWeights(slotId, att.name)} title="Give the remembered weights to the same number of selected vertices">
                  Paste weights
                </Button>
              </div>
              <Field label="Bones">
                <div className="stack" style={{ gap: 3, width: '100%' }}>
                  {influencing.map((id) => {
                    const on = brush.locked.includes(id);
                    return (
                      <div key={id} className="hstack" style={{ gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 5, flex: 'none', background: boneCss(bound.indexOf(id)) }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{boneName(id)}</span>
                        <IconButton small active={on} icon={on ? Lock : Unlock} title="A locked bone keeps its weights while you paint" onClick={() => uiStore.patch({ brush: { ...brush, locked: on ? brush.locked.filter((x) => x !== id) : [...brush.locked, id] } })} />
                        <IconButton small icon={X} title="The mesh stops following this bone; its weights go to the other bones of each vertex (or to the parent bone)" onClick={() => void removeBoneFromMesh(slotId, att.name, id)} />
                      </div>
                    );
                  })}
                </div>
              </Field>
              <Field label="Pies">
                <Toggle on={weightView.pies} onChange={(v) => uiStore.patch({ weightView: { ...weightView, pies: v } })} title="Draw a pie chart of the weights on every vertex while the Weights tool is on" />
              </Field>
              <Field label="Overlay">
                <Toggle on={weightView.overlay} onChange={(v) => uiStore.patch({ weightView: { ...weightView, overlay: v } })} title="Fill the mesh with the colours of its bones instead of the heat map of the brush bone" />
              </Field>
              <Field label="Selected">
                <Toggle on={weightView.selected} onChange={(v) => uiStore.patch({ weightView: { ...weightView, selected: v } })} title="Pies only for the selected vertices and the vertices weighted to selected bones; Overlay shows the other bones black" />
              </Field>
              <Field label="Bone">
                <SelectField value={brush.bone ?? influencing[0]} options={influencing.map((id) => ({ value: id, label: boneName(id) }))} onChange={(v) => uiStore.patch({ brush: { ...brush, bone: v } })} />
              </Field>
              <Field label="Mode">
                <SelectField value={brush.mode} options={[{ value: 'add', label: 'Add' }, { value: 'subtract', label: 'Subtract' }, { value: 'replace', label: 'Replace' }, { value: 'smooth', label: 'Smooth' }]} onChange={(v) => uiStore.patch({ brush: { ...brush, mode: v } })} />
              </Field>
              <Field label="Size">
                <NumberField label="px" value={brush.size} step={1} precision={0} min={4} max={400} onChange={(v) => uiStore.patch({ brush: { ...brush, size: v } })} />
              </Field>
              <Field label="Feather">
                <NumberField label="%" value={brush.feather} step={5} precision={0} min={0} max={100} onChange={(v) => uiStore.patch({ brush: { ...brush, feather: Math.max(0, Math.min(100, v)) } })} title="How much of the brush size fades out: 100% from the centre, 0% a hard edge" />
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
