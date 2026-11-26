/** Viewport behaviour for the Mesh and Weights tools (vertex editing, deform keys, weight painting, test pose, heat map). */
import { deformedVertices } from '@/core/deformMarks';
import type { Id, MeshAttachment } from '@/core/model';
import { trianglesAt } from '@/core/mesh';
import { dragFrom, grabFor } from '@/core/testPose';
import type { Grab, LocalPose } from '@/core/testPose';
import { softMoves, softWeights } from '@/core/soft';
import type { GLRenderer } from '@/render/gl';
import {
  addMeshVertex,
  toggleMeshEdge,
  currentDeform,
  deleteMeshVertices,
  getMesh,
  moveMeshVertices,
  paintWeightsGroup,
  setDeformKey,
} from '@/store/meshActions';
import { docStore } from '@/store/doc';
import { setSelection } from '@/store/actions';
import { toast, uiStore } from '@/store/ui';
import { getViewScene, worldToScreen } from '@/store/scene';
import type { Scene } from '@/store/scene';
import { dragMarquee, drawMarquee, hitVertex, startMarquee } from './marquee';
import type { Marquee } from './marquee';
import { COLORS } from './overlay';
import type { OverlayInput } from './overlay';
import { hitBone, slotWorldVertices } from './hit';
import { settingsStore } from '@/store/settings';
import { alpha, token } from '../ui/tokens';
import { boneCss, boundBones, overlayColors, pieVertices } from './weightColors';

type Drag =
  | { kind: 'vertices'; start: Float32Array; weights: Map<number, number>; p0: [number, number]; base: number[] | null }
  | Marquee
  | { kind: 'paint' }
  | PoseDrag
  | { kind: 'edge'; from: number; x: number; y: number };

/** A press on a bone in the Weights tool. Dragged, it tries a pose; until the pointer has gone a few pixels it is still a click. */
interface PoseDrag {
  kind: 'pose';
  bone: Id;
  /** The bone a click makes the brush bone, when the press was on one that moves the mesh. */
  pick: Id | null;
  x: number;
  y: number;
  from: [number, number];
  move: { grab: Grab; at: (to: [number, number]) => Partial<LocalPose> } | null;
}

/** How far the pointer goes (pixels) before a press on a bone is a drag. */
const DRAG_PX = 4;

export interface ActiveMesh {
  slotId: Id;
  name: string;
  mesh: MeshAttachment;
}

export function activeMesh(): ActiveMesh | null {
  const sel = uiStore.get().selection;
  if (!sel.slot || !sel.attachment) return null;
  const mesh = getMesh(sel.slot, sel.attachment);
  return mesh ? { slotId: sel.slot, name: sel.attachment, mesh } : null;
}

function heatColor(w: number, out: number[], o: number) {
  // blue -> cyan -> green -> yellow -> red
  const t = Math.max(0, Math.min(1, w));
  let r: number, g: number, b: number;
  if (t < 0.25) {
    r = 0.1;
    g = 0.3 + t * 2.4;
    b = 0.85;
  } else if (t < 0.5) {
    r = 0.1;
    g = 0.9;
    b = 0.85 - (t - 0.25) * 3.2;
  } else if (t < 0.75) {
    r = 0.1 + (t - 0.5) * 3.6;
    g = 0.9;
    b = 0.05;
  } else {
    r = 1;
    g = 0.9 - (t - 0.75) * 3.4;
    b = 0.05;
  }
  out[o] = r;
  out[o + 1] = g;
  out[o + 2] = b;
  out[o + 3] = 0.62;
}

export class MeshTool {
  hoverVertex = -1;
  brush: [number, number] | null = null;
  /** The pointer is over a bone that a drag would pose (Weights tool). */
  hoverPose = false;
  private drag: Drag | null = null;

  constructor(private invalidate: () => void) {}

  get dragging() {
    return this.drag !== null;
  }

  private worldVerts(scene: Scene, slotId: Id) {
    return slotWorldVertices(scene.skeleton, slotId);
  }

  /**
   * The bone a drag here would pose in the Weights tool: one that moves the mesh, or the target of an IK chain with such a bone. With
   * Alt it is any bone that is shown and not locked.
   */
  poseBoneAt(e: PointerEvent, wx: number, wy: number, scene: Scene): Id | null {
    const ui = uiStore.get();
    const am = activeMesh();
    if (ui.tool !== 'weights' || ui.mode !== 'setup' || !am?.mesh.weights) return null;
    const bones = docStore.get().skeleton.bones;
    const wanted = new Set<Id>();
    if (!e.altKey) {
      for (const id of am.mesh.weights.flat().map((i) => i[0])) {
        wanted.add(id);
        const grab = grabFor(scene.skeleton, id);
        if (grab?.chain) wanted.add(grab.bone);
      }
    }
    const off = new Set(bones.filter((b) => (e.altKey ? b.hidden || b.locked : !wanted.has(b.id))).map((b) => b.id));
    return hitBone(scene, off, wx, wy, ui.camera.zoom, 7)?.id ?? null;
  }

  /** Is a point of the picked mesh under the pointer? */
  vertexAt(wx: number, wy: number, scene: Scene): boolean {
    const am = activeMesh();
    const geo = am && this.worldVerts(scene, am.slotId);
    return !!geo && hitVertex(geo.vertices, geo.count, wx, wy, uiStore.get().camera.zoom) >= 0;
  }

  pointerDown(e: PointerEvent, wx: number, wy: number, scene: Scene): boolean {
    const ui = uiStore.get();
    const am = activeMesh();
    if (!am) return false;
    const geo = this.worldVerts(scene, am.slotId);
    if (!geo) return false;
    const zoom = ui.camera.zoom;

    if (ui.tool === 'weights') {
      if (!am.mesh.weights) {
        toast('Bind the mesh to bones first (Inspector → Weights → Bind)');
        return true;
      }
      // a press on a bone: dragged, it tries a pose; a click on a bone that moves the mesh makes it the brush bone
      const influencing = new Set(am.mesh.weights.flat().map((i) => i[0]));
      const others = new Set(scene.skeleton.bones.map((b) => b.data.id).filter((id) => !influencing.has(id)));
      const pick = hitBone(scene, others, wx, wy, zoom, 7)?.id ?? null;
      const posed = this.poseBoneAt(e, wx, wy, scene) ?? pick;
      if (posed) {
        this.brush = null;
        this.drag = { kind: 'pose', bone: posed, pick, x: e.clientX, y: e.clientY, from: [wx, wy], move: null };
        return true;
      }
      if (ui.mode !== 'setup') {
        toast('Weights are edited in Setup mode');
        return true;
      }
      const bone = ui.brush.bone ?? [...influencing][0];
      if (!bone) return true;
      docStore.beginGesture('Paint weights');
      this.drag = { kind: 'paint' };
      paintWeightsGroup({ x: wx, y: wy }, bone);
      return true;
    }

    // mesh tool
    if (ui.meshView.pickTriangle) {
      // Triangle order: a click picks the triangle on top at that place, another click there the one under it
      const at = trianglesAt(geo.vertices, am.mesh.triangles, wx, wy);
      const now = ui.meshView.triangle;
      const next = at.length ? (now !== null && at.includes(now) ? at[(at.indexOf(now) + 1) % at.length] : at[0]) : null;
      uiStore.patch({ meshView: { ...ui.meshView, triangle: next } });
      this.invalidate();
      return true;
    }
    const pickable = ui.meshView.hullOnly ? Math.min(geo.count, am.mesh.hull) : geo.count;
    const hit = hitVertex(geo.vertices, pickable, wx, wy, zoom);
    if (hit >= 0 && (e.ctrlKey || e.metaKey) && ui.mode === 'setup') {
      // Ctrl+drag from a vertex to another vertex draws a manual edge (or removes the one that is there)
      this.drag = { kind: 'edge', from: hit, x: wx, y: wy };
      return true;
    }
    if (hit >= 0) {
      const cur = ui.selection.vertices;
      let vertices: number[];
      if (e.shiftKey) vertices = cur.includes(hit) ? cur.filter((v) => v !== hit) : [...cur, hit];
      else vertices = cur.includes(hit) ? cur : [hit];
      setSelection({ ...ui.selection, vertices });
      if (!vertices.includes(hit)) return true;
      if (ui.meshView.freeze) return true; // frozen: selecting only
      const start = geo.vertices.slice(0, geo.count * 2);
      const weights = softWeights(start, vertices, ui.meshView.soft ? ui.meshView.softRadius : 0, ui.meshView.softShape);
      docStore.beginGesture(ui.mode === 'animate' ? 'Deform' : 'Move vertices');
      this.drag = { kind: 'vertices', start, weights, p0: [wx, wy], base: ui.mode === 'animate' ? currentDeform(am.slotId) : null };
      return true;
    }
    if ((e.ctrlKey || e.metaKey || e.detail >= 2) && ui.mode === 'setup') {
      addMeshVertex(am.slotId, am.name, wx, wy);
      return true;
    }
    if (!e.shiftKey) setSelection({ ...ui.selection, vertices: [] });
    this.drag = startMarquee(wx, wy, e.shiftKey ? ui.selection.vertices : []);
    return true;
  }

  pointerMove(e: PointerEvent, wx: number, wy: number, scene: Scene): boolean {
    const ui = uiStore.get();
    const am = activeMesh();
    const d = this.drag;
    this.hoverPose = !d && this.poseBoneAt(e, wx, wy, scene) !== null;
    this.brush = ui.tool === 'weights' && !this.hoverPose && d?.kind !== 'pose' ? [wx, wy] : null;
    if (!am) return false;
    const geo = this.worldVerts(scene, am.slotId);
    if (!geo) return false;
    if (d?.kind === 'pose') {
      this.dragPose(d, e, wx, wy);
      return true;
    }
    // the Weights tool shows the shares of the vertex under the pointer
    if (ui.tool === 'weights') this.hoverVertex = this.hoverPose ? -1 : hitVertex(geo.vertices, geo.count, wx, wy, ui.camera.zoom);
    if (!d) {
      const pickable = ui.meshView.hullOnly ? Math.min(geo.count, am.mesh.hull) : geo.count;
      const h =
        ui.tool === 'weights'
          ? this.hoverVertex
          : ui.tool === 'mesh' && !ui.meshView.pickTriangle
            ? hitVertex(geo.vertices, pickable, wx, wy, ui.camera.zoom)
            : -1;
      if (h !== this.hoverVertex || ui.tool === 'weights') {
        this.hoverVertex = h;
        this.invalidate();
      }
      return ui.tool === 'mesh' || ui.tool === 'weights';
    }
    if (d.kind === 'vertices') {
      const dx = wx - d.p0[0];
      const dy = wy - d.p0[1];
      if (ui.mode === 'setup') moveMeshVertices(am.slotId, am.name, softMoves(d.start, d.weights, dx, dy));
      else if (d.base)
        setDeformKey(
          am.slotId,
          am.name,
          d.base,
          [...d.weights].map(([index, w]) => ({ index, dx: dx * w, dy: dy * w })),
        );
    } else if (d.kind === 'marquee') {
      const [x0, y0, x1, y1] = dragMarquee(d, wx, wy);
      const picked = new Set(d.base);
      for (let i = 0; i < (ui.meshView.hullOnly ? Math.min(geo.count, am.mesh.hull) : geo.count); i++) {
        const x = geo.vertices[i * 2];
        const y = geo.vertices[i * 2 + 1];
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) picked.add(i);
      }
      setSelection({ ...ui.selection, vertices: [...picked] });
      this.invalidate();
    } else if (d.kind === 'edge') {
      d.x = wx;
      d.y = wy;
      this.hoverVertex = hitVertex(
        geo.vertices,
        ui.meshView.hullOnly ? Math.min(geo.count, am.mesh.hull) : geo.count,
        wx,
        wy,
        ui.camera.zoom,
      );
      this.invalidate();
    } else if (d.kind === 'paint') {
      const bone = ui.brush.bone;
      if (bone) paintWeightsGroup({ x: wx, y: wy }, bone);
    }
    return true;
  }

  private dragPose(d: PoseDrag, e: PointerEvent, wx: number, wy: number) {
    if (!d.move) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_PX) return;
      // the hand takes over from the wiggle, and starts from the pose without it
      if (uiStore.get().wiggle) uiStore.patch({ wiggle: false });
      const { skeleton } = getViewScene();
      const grab = grabFor(skeleton, d.bone);
      const at = grab && dragFrom(skeleton, grab, d.from);
      if (!grab || !at) return;
      d.move = { grab, at };
    }
    const { testPose } = uiStore.get();
    const bone = d.move.grab.bone;
    uiStore.patch({ testPose: { ...testPose, [bone]: { ...testPose[bone], ...d.move.at([wx, wy]) } } });
    this.invalidate();
  }

  pointerUp(): boolean {
    if (!this.drag) return false;
    if (this.drag.kind === 'pose' && !this.drag.move && this.drag.pick) {
      const am = activeMesh();
      if (am) {
        uiStore.patch({ brush: { ...uiStore.get().brush, bone: this.drag.pick } });
        setSelection({ slot: am.slotId, attachment: am.name, bones: [this.drag.pick] });
      }
    }
    if (this.drag.kind === 'edge') {
      const am = activeMesh();
      const to = this.hoverVertex;
      if (am && to >= 0 && to !== this.drag.from) toggleMeshEdge(am.slotId, am.name, this.drag.from, to);
    }
    if (this.drag.kind === 'vertices' || this.drag.kind === 'paint') docStore.endGesture();
    this.drag = null;
    this.invalidate();
    return true;
  }

  deleteSelectedVertices() {
    const am = activeMesh();
    const sel = uiStore.get().selection;
    if (!am || !sel.vertices.length) return false;
    if (uiStore.get().mode !== 'setup') {
      toast('Vertices can only be removed in Setup mode');
      return true;
    }
    deleteMeshVertices(am.slotId, am.name, sel.vertices);
    return true;
  }

  /** Wire, outline and vertices of the selected mesh. */
  drawOverlay = (o: OverlayInput) => {
    const am = activeMesh();
    if (!am) return;
    const { ctx, w, h, cam, scene, ui } = o;
    const geo = this.worldVerts(scene, am.slotId);
    if (!geo) return;
    const edit = ui.tool === 'mesh' || ui.tool === 'weights';
    const v = geo.vertices;
    const tri = am.mesh.triangles;
    const P = (i: number) => worldToScreen(cam, w, h, v[i * 2], v[i * 2 + 1]);
    if (edit && (ui.meshView.dim || ui.meshView.isolate)) {
      // everything outside the outline of the mesh: dimmed, or (Isolate) painted over with the viewport colour
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      for (let i = 0; i < am.mesh.hull; i++) {
        const p = P(i);
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      const bg = settingsStore.get().viewportBg.map((c) => Math.round(c * 255));
      ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},${ui.meshView.isolate ? 1 : 0.7})`;
      ctx.fill('evenodd');
      ctx.restore();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = edit ? alpha('--accent', 0.55) : alpha('--accent', 0.22);
    ctx.beginPath();
    const hullOnly = edit && ui.tool === 'mesh' && ui.meshView.hullOnly;
    for (let t = 0; !(edit && !ui.meshView.wireframe) && !hullOnly && t < tri.length; t += 3) {
      const a = P(tri[t]);
      const b = P(tri[t + 1]);
      const c = P(tri[t + 2]);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
    }
    ctx.stroke();
    // manual edges (orange) and the edge being drawn
    const manual = am.mesh.edges ?? [];
    if (edit && ui.tool === 'mesh' && !hullOnly && (manual.length || this.drag?.kind === 'edge')) {
      ctx.strokeStyle = token('--mesh-edge');
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i + 1 < manual.length; i += 2) {
        const a = P(manual[i]);
        const b = P(manual[i + 1]);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      if (this.drag?.kind === 'edge') {
        const a = P(this.drag.from);
        const to = this.hoverVertex >= 0 ? P(this.hoverVertex) : worldToScreen(cam, w, h, this.drag.x, this.drag.y);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(to[0], to[1]);
      }
      ctx.stroke();
    }
    // outline
    ctx.strokeStyle = edit ? (ui.tool === 'mesh' ? token('--mesh-hull') : token('--accent')) : alpha('--accent', 0.5);
    ctx.lineWidth = edit ? 1.8 : 1.2;
    ctx.beginPath();
    for (let i = 0; i < am.mesh.hull; i++) {
      const p = P(i);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.stroke();
    if (!edit || ui.tool === 'weights') {
      // weights tool: brush ring
      if (ui.tool === 'weights' && this.brush) {
        const [bx, by] = worldToScreen(cam, w, h, this.brush[0], this.brush[1]);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, ui.brush.size * cam.zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(bx, by, ui.brush.size * cam.zoom + 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (ui.tool === 'weights' && ui.weightView.pies && am.mesh.weights) this.drawPies(o, am.mesh.weights, (i) => P(i));
      if (ui.tool === 'weights' && am.mesh.weights && this.hoverVertex >= 0 && this.hoverVertex < geo.count)
        this.drawShares(o, am.mesh.weights, this.hoverVertex, P(this.hoverVertex));
      return;
    }
    // the triangle picked for Triangle order: filled, with its place in the drawing order
    const picked = ui.meshView.triangle;
    if (ui.tool === 'mesh' && picked !== null && picked * 3 + 2 < tri.length) {
      const a = P(tri[picked * 3]);
      const b = P(tri[picked * 3 + 1]);
      const c = P(tri[picked * 3 + 2]);
      ctx.fillStyle = alpha('--accent', 0.3);
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.fillStyle = COLORS.accent;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${picked + 1}/${tri.length / 3}`, (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3 + 4);
      ctx.restore();
    }
    const sel = new Set(ui.selection.vertices);
    // soft selection: the vertices that follow the selected ones, tinted by how much (the weights are those of the drag while one is going)
    const dragging = this.drag?.kind === 'vertices' ? this.drag : null;
    const soft = dragging
      ? dragging.weights
      : ui.meshView.soft && sel.size
        ? softWeights(v, ui.selection.vertices, ui.meshView.softRadius, ui.meshView.softShape)
        : null;
    // in Animate mode the vertices the current pose deforms stand out
    const slot = scene.skeleton.slotById(am.slotId);
    const shown = slot ? scene.skeleton.slotAttachment(slot) : null;
    const moved =
      ui.mode === 'animate' && slot && shown && shown.kind === 'mesh' && slot.deform.length ? deformedVertices(shown, slot.deform) : null;
    for (let i = 0; i < (hullOnly ? Math.min(geo.count, am.mesh.hull) : geo.count); i++) {
      const [x, y] = P(i);
      const selected = sel.has(i);
      const hovered = i === this.hoverVertex;
      const hullV = i < am.mesh.hull;
      const r = selected || hovered ? 5 : hullV ? 4 : 3.6;
      ctx.fillStyle = selected
        ? COLORS.accent
        : hovered
          ? token('--handle-hover')
          : moved?.[i]
            ? token('--vertex-deformed')
            : hullV
              ? token('--accent-glow')
              : token('--text');
      ctx.strokeStyle = token('--handle-outline');
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.rect(x - r, y - r, r * 2, r * 2);
      ctx.fill();
      ctx.stroke();
      const pull = !selected ? soft?.get(i) : undefined;
      if (pull) {
        ctx.fillStyle = alpha('--accent', 0.25 + 0.7 * pull);
        ctx.beginPath();
        ctx.arc(x, y, 3 + 6 * pull, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const d = this.drag;
    if (d?.kind === 'marquee') drawMarquee(ctx, cam, w, h, d);
  };

  /** Pies: one pie chart per vertex, a slice per bone in the colour of that bone, selected vertices larger. */
  private drawPies(o: OverlayInput, weights: MeshAttachment['weights'] & object, P: (i: number) => [number, number]) {
    const { ctx, ui } = o;
    const order = docStore.get().skeleton.bones.map((b) => b.id);
    const bound = boundBones(weights, order);
    const index = new Map(bound.map((b, i) => [b, i] as const));
    const picked = new Set(ui.selection.vertices);
    const list = pieVertices(weights, picked, new Set(ui.selection.bones), ui.weightView.selected);
    ctx.lineWidth = 1;
    ctx.strokeStyle = token('--handle-outline');
    for (const v of list) {
      const [x, y] = P(v);
      const r = picked.has(v) ? 10 : 6.5;
      let at = -Math.PI / 2;
      for (const e of weights[v]) {
        const end = at + e[3] * Math.PI * 2;
        ctx.fillStyle = boneCss(index.get(e[0]) ?? 0);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, r, at, end);
        ctx.closePath();
        ctx.fill();
        at = end;
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Next to the vertex under the pointer: every bone that moves it with its share, the strongest first. */
  private drawShares(o: OverlayInput, weights: MeshAttachment['weights'] & object, vertex: number, at: [number, number]) {
    const { ctx, w, h } = o;
    const bones = docStore.get().skeleton.bones;
    const bound = boundBones(
      weights,
      bones.map((b) => b.id),
    );
    const rows = [...(weights[vertex] ?? [])]
      .sort((a, b) => b[3] - a[3])
      .map((e) => ({
        text: `${bones.find((b) => b.id === e[0])?.name ?? '?'}  ${Math.round(e[3] * 100)}%`,
        color: boneCss(Math.max(0, bound.indexOf(e[0]))),
      }));
    if (!rows.length) return;
    ctx.save();
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const width = Math.max(...rows.map((r) => ctx.measureText(r.text).width)) + 30;
    const height = rows.length * 18 + 8;
    // to the right of the vertex and above it, or on the other side where the viewport ends
    const x = at[0] + 14 + width > w ? at[0] - 14 - width : at[0] + 14;
    const y = Math.min(h - height - 4, Math.max(4, at[1] - height - 10));
    ctx.fillStyle = alpha('--panel', 0.95);
    ctx.strokeStyle = token('--handle-outline');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.fill();
    ctx.stroke();
    rows.forEach((r, i) => {
      const mid = y + 13 + i * 18;
      ctx.fillStyle = r.color;
      ctx.fillRect(x + 8, mid - 4, 8, 8);
      ctx.fillStyle = token('--text');
      ctx.fillText(r.text, x + 22, mid);
    });
    ctx.strokeStyle = token('--text');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(at[0], at[1], 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Weight heat map for the active bone (or, with Overlay, the bone colours) drawn into the GL layer. */
  drawHeat(renderer: GLRenderer, scene: Scene) {
    const ui = uiStore.get();
    if (ui.tool !== 'weights') return;
    const am = activeMesh();
    if (!am || !am.mesh.weights) return;
    if (!ui.weightView.overlay && !ui.brush.bone) return;
    const geo = this.worldVerts(scene, am.slotId);
    if (!geo) return;
    const n = geo.count;
    let colors = new Array<number>(n * 4);
    if (ui.weightView.overlay) {
      const bound = boundBones(
        am.mesh.weights,
        docStore.get().skeleton.bones.map((b) => b.id),
      );
      colors = overlayColors(am.mesh.weights, bound, ui.weightView.selected ? new Set(ui.selection.bones) : null);
    } else for (let i = 0; i < n; i++) heatColor(am.mesh.weights[i]?.find((e) => e[0] === ui.brush.bone)?.[3] ?? 0, colors, i * 4);
    renderer.pushColored(geo.vertices, colors, am.mesh.triangles, n, am.mesh.triangles.length);
    renderer.flush();
  }
}
