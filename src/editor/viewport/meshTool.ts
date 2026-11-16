/** Viewport behaviour for the Mesh and Weights tools (vertex editing, deform keys, weight painting, heat map). */
import type { Id, MeshAttachment } from '@/core/model';
import type { GLRenderer } from '@/render/gl';
import { addMeshVertex, currentDeform, deleteMeshVertices, getMesh, moveMeshVertices, paintWeights, setDeformKey } from '@/store/meshActions';
import { docStore } from '@/store/doc';
import { setSelection } from '@/store/actions';
import { toast, uiStore } from '@/store/ui';
import { worldToScreen } from '../scene';
import type { Scene } from '../scene';
import { COLORS } from './overlay';
import type { OverlayInput } from './overlay';
import { slotWorldVertices } from './hit';

type Drag =
  | { kind: 'vertices'; moves: Map<number, [number, number]>; p0: [number, number]; base: number[] | null }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; base: number[] }
  | { kind: 'paint' };

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
  private drag: Drag | null = null;

  constructor(private invalidate: () => void) {}

  get dragging() {
    return this.drag !== null;
  }

  private worldVerts(scene: Scene, slotId: Id) {
    return slotWorldVertices(scene.skeleton, slotId);
  }

  private hitVertex(v: Float32Array, count: number, wx: number, wy: number, zoom: number, tolPx = 9): number {
    let best = -1;
    let bd = (tolPx / zoom) ** 2;
    for (let i = 0; i < count; i++) {
      const d = (v[i * 2] - wx) ** 2 + (v[i * 2 + 1] - wy) ** 2;
      if (d <= bd) {
        bd = d;
        best = i;
      }
    }
    return best;
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
      // clicking a bone that influences the mesh makes it the active brush bone
      const influencing = new Set(am.mesh.weights.flat().map((i) => i[0]));
      let hitBone: Id | null = null;
      let bestD = (7 / zoom) ** 2;
      for (const b of scene.skeleton.bones) {
        if (!influencing.has(b.data.id)) continue;
        const dx = b.tipX - b.worldX;
        const dy = b.tipY - b.worldY;
        const l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((wx - b.worldX) * dx + (wy - b.worldY) * dy) / l2));
        const d = (b.worldX + dx * t - wx) ** 2 + (b.worldY + dy * t - wy) ** 2;
        if (d < bestD) {
          bestD = d;
          hitBone = b.data.id;
        }
      }
      if (hitBone) {
        uiStore.patch({ brush: { ...ui.brush, bone: hitBone } });
        setSelection({ slot: am.slotId, attachment: am.name, bones: [hitBone] });
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
      paintWeights(am.slotId, am.name, { x: wx, y: wy }, bone);
      return true;
    }

    // mesh tool
    const hit = this.hitVertex(geo.vertices, geo.count, wx, wy, zoom);
    if (hit >= 0) {
      const cur = ui.selection.vertices;
      let vertices: number[];
      if (e.shiftKey) vertices = cur.includes(hit) ? cur.filter((v) => v !== hit) : [...cur, hit];
      else vertices = cur.includes(hit) ? cur : [hit];
      setSelection({ ...ui.selection, vertices });
      if (!vertices.includes(hit)) return true;
      const moves = new Map<number, [number, number]>();
      for (const v of vertices) moves.set(v, [geo.vertices[v * 2], geo.vertices[v * 2 + 1]]);
      docStore.beginGesture(ui.mode === 'animate' ? 'Deform' : 'Move vertices');
      this.drag = { kind: 'vertices', moves, p0: [wx, wy], base: ui.mode === 'animate' ? currentDeform(am.slotId) : null };
      return true;
    }
    if ((e.ctrlKey || e.metaKey || e.detail >= 2) && ui.mode === 'setup') {
      addMeshVertex(am.slotId, am.name, wx, wy);
      return true;
    }
    if (!e.shiftKey) setSelection({ ...ui.selection, vertices: [] });
    this.drag = { kind: 'marquee', x0: wx, y0: wy, x1: wx, y1: wy, base: e.shiftKey ? ui.selection.vertices : [] };
    return true;
  }

  pointerMove(e: PointerEvent, wx: number, wy: number, scene: Scene): boolean {
    const ui = uiStore.get();
    const am = activeMesh();
    this.brush = ui.tool === 'weights' ? [wx, wy] : null;
    if (!am) return false;
    const geo = this.worldVerts(scene, am.slotId);
    if (!geo) return false;
    const d = this.drag;
    if (!d) {
      const h = ui.tool === 'mesh' ? this.hitVertex(geo.vertices, geo.count, wx, wy, ui.camera.zoom) : -1;
      if (h !== this.hoverVertex || ui.tool === 'weights') {
        this.hoverVertex = h;
        this.invalidate();
      }
      return ui.tool === 'mesh' || ui.tool === 'weights';
    }
    if (d.kind === 'vertices') {
      const dx = wx - d.p0[0];
      const dy = wy - d.p0[1];
      if (ui.mode === 'setup') moveMeshVertices(am.slotId, am.name, [...d.moves].map(([index, p]) => ({ index, x: p[0] + dx, y: p[1] + dy })));
      else if (d.base) setDeformKey(am.slotId, am.name, d.base, [...d.moves.keys()].map((index) => ({ index, dx, dy })));
    } else if (d.kind === 'marquee') {
      d.x1 = wx;
      d.y1 = wy;
      const x0 = Math.min(d.x0, d.x1);
      const x1 = Math.max(d.x0, d.x1);
      const y0 = Math.min(d.y0, d.y1);
      const y1 = Math.max(d.y0, d.y1);
      const picked = new Set(d.base);
      for (let i = 0; i < geo.count; i++) {
        const x = geo.vertices[i * 2];
        const y = geo.vertices[i * 2 + 1];
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) picked.add(i);
      }
      setSelection({ ...ui.selection, vertices: [...picked] });
      this.invalidate();
    } else if (d.kind === 'paint') {
      const bone = ui.brush.bone;
      if (bone) paintWeights(am.slotId, am.name, { x: wx, y: wy }, bone);
    }
    return true;
  }

  pointerUp(): boolean {
    if (!this.drag) return false;
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

  // ---------------------------------------------------------------- drawing

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
    ctx.lineWidth = 1;
    ctx.strokeStyle = edit ? 'rgba(49,208,170,0.55)' : 'rgba(49,208,170,0.22)';
    ctx.beginPath();
    for (let t = 0; t < tri.length; t += 3) {
      const a = P(tri[t]);
      const b = P(tri[t + 1]);
      const c = P(tri[t + 2]);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
    }
    ctx.stroke();
    // outline
    ctx.strokeStyle = edit ? '#31d0aa' : 'rgba(49,208,170,0.5)';
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
      return;
    }
    const sel = new Set(ui.selection.vertices);
    for (let i = 0; i < geo.count; i++) {
      const [x, y] = P(i);
      const selected = sel.has(i);
      const hovered = i === this.hoverVertex;
      const hullV = i < am.mesh.hull;
      const r = selected || hovered ? 5 : hullV ? 4 : 3.6;
      ctx.fillStyle = selected ? COLORS.accent : hovered ? '#ffffff' : hullV ? '#bff5e8' : '#e6e9ef';
      ctx.strokeStyle = 'rgba(8,10,14,0.95)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.rect(x - r, y - r, r * 2, r * 2);
      ctx.fill();
      ctx.stroke();
    }
    const d = this.drag;
    if (d?.kind === 'marquee') {
      const [x0, y0] = worldToScreen(cam, w, h, d.x0, d.y0);
      const [x1, y1] = worldToScreen(cam, w, h, d.x1, d.y1);
      ctx.fillStyle = COLORS.accentSoft;
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 1;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  };

  /** Weight heat map for the active bone drawn into the GL layer. */
  drawHeat(renderer: GLRenderer, scene: Scene) {
    const ui = uiStore.get();
    if (ui.tool !== 'weights') return;
    const am = activeMesh();
    if (!am || !am.mesh.weights || !ui.brush.bone) return;
    const geo = this.worldVerts(scene, am.slotId);
    if (!geo) return;
    const n = geo.count;
    const colors = new Array<number>(n * 4);
    for (let i = 0; i < n; i++) heatColor(am.mesh.weights[i]?.find((e) => e[0] === ui.brush.bone)?.[3] ?? 0, colors, i * 4);
    renderer.pushColored(geo.vertices, colors, am.mesh.triangles, n, am.mesh.triangles.length);
    renderer.flush();
  }
}
