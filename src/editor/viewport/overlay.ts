/** Canvas2D overlay drawn above the WebGL image layer: grid, bones, constraints, selection outlines, gizmos. */
import type { Id } from '@/core/model';
import type { Bone } from '@/core/skeleton';
import { REGION_TRIANGLES } from '@/core/skeleton';
import type { Camera, UiState } from '@/store/ui';
import { worldToScreen } from '../scene';
import type { Scene } from '../scene';
import { slotWorldVertices } from './hit';

export const COLORS = {
  accent: '#31d0aa',
  accentSoft: 'rgba(49,208,170,0.18)',
  animate: '#ff9f43',
  hover: '#9fe9d6',
  text: '#e6e9ef',
  muted: '#8b93a1',
  axisX: 'rgba(255,100,100,0.45)',
  axisY: 'rgba(110,225,140,0.45)',
  ik: '#ff7a59',
};

export interface Interaction {
  kind: 'create' | 'marquee' | 'link' | 'none';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OverlayInput {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  cam: Camera;
  scene: Scene;
  ui: UiState;
  hoverBone: Id | null;
  hiddenBones: Set<Id>;
  hiddenSlots: Set<Id>;
  interaction: Interaction | null;
  /** Drawn right after the attachment outline, below the bones. */
  under?: (o: OverlayInput) => void;
  extra?: (o: OverlayInput) => void;
}

function niceStep(minWorld: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(minWorld)));
  const n = minWorld / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function drawGrid(o: OverlayInput) {
  const { ctx, w, h, cam } = o;
  const step = niceStep(28 / cam.zoom);
  const [wx0, wy1] = [cam.x - w / 2 / cam.zoom, cam.y + h / 2 / cam.zoom];
  const [wx1, wy0] = [cam.x + w / 2 / cam.zoom, cam.y - h / 2 / cam.zoom];
  ctx.lineWidth = 1;
  const major = step * 5;
  const draw = (v: number, vertical: boolean, color: string) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    if (vertical) {
      const [sx] = worldToScreen(cam, w, h, v, 0);
      const x = Math.round(sx) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    } else {
      const [, sy] = worldToScreen(cam, w, h, 0, v);
      const y = Math.round(sy) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  };
  for (let x = Math.ceil(wx0 / step) * step; x <= wx1; x += step) {
    if (Math.abs(x) < step / 2) continue;
    draw(x, true, Math.abs(x % major) < step / 2 ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.035)');
  }
  for (let y = Math.ceil(wy0 / step) * step; y <= wy1; y += step) {
    if (Math.abs(y) < step / 2) continue;
    draw(y, false, Math.abs(y % major) < step / 2 ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.035)');
  }
  draw(0, true, COLORS.axisY);
  draw(0, false, COLORS.axisX);
}

function boneColor(bone: Bone, o: OverlayInput, selected: boolean, hovered: boolean): { fill: string; stroke: string } {
  if (selected) return { fill: 'rgba(49,208,170,0.55)', stroke: COLORS.accent };
  if (hovered) return { fill: 'rgba(159,233,214,0.5)', stroke: COLORS.hover };
  const c = bone.data.color;
  const r = Math.round(c[0] * 255);
  const g = Math.round(c[1] * 255);
  const b = Math.round(c[2] * 255);
  return { fill: `rgba(${r},${g},${b},0.42)`, stroke: `rgba(${Math.min(255, r + 70)},${Math.min(255, g + 70)},${Math.min(255, b + 70)},0.95)` };
}

export function drawBone(o: OverlayInput, bone: Bone, selected: boolean, hovered: boolean) {
  const { ctx, w, h, cam } = o;
  const [ox, oy] = worldToScreen(cam, w, h, bone.worldX, bone.worldY);
  const tipWX = bone.worldX + bone.a * bone.data.length;
  const tipWY = bone.worldY + bone.c * bone.data.length;
  const [tx, ty] = worldToScreen(cam, w, h, tipWX, tipWY);
  const len = Math.hypot(tx - ox, ty - oy);
  const colors = boneColor(bone, o, selected, hovered);
  ctx.lineJoin = 'round';
  if (len < 3) {
    ctx.fillStyle = colors.fill;
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = selected ? 2 : 1.25;
    ctx.beginPath();
    ctx.arc(ox, oy, selected ? 7 : 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const ux = (tx - ox) / len;
    const uy = (ty - oy) / len;
    const wd = Math.min(9, Math.max(3.5, len * 0.13));
    const px = -uy * wd;
    const py = ux * wd;
    const kx = ox + ux * len * 0.2;
    const ky = oy + uy * len * 0.2;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(kx + px, ky + py);
    ctx.lineTo(tx, ty);
    ctx.lineTo(kx - px, ky - py);
    ctx.closePath();
    ctx.fillStyle = colors.fill;
    ctx.fill();
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = selected ? 2 : 1.25;
    ctx.stroke();
  }
  // origin joint
  ctx.beginPath();
  ctx.arc(ox, oy, selected ? 3.6 : 3, 0, Math.PI * 2);
  ctx.fillStyle = selected ? COLORS.accent : 'rgba(235,238,245,0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,12,16,0.9)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawBones(o: OverlayInput) {
  const { scene, ui } = o;
  const sel = new Set(ui.selection.bones);
  const targets = new Set(scene.data.constraints.flatMap((c) => (c.kind === 'ik' ? [scene.data.bones[c.target].id] : [])));
  for (const bone of scene.skeleton.bones) {
    const id = bone.data.id;
    if (o.hiddenBones.has(id)) continue;
    if (targets.has(id) && bone.data.length < 1) continue; // drawn by constraint visuals
    drawBone(o, bone, sel.has(id), o.hoverBone === id);
  }
  if (ui.view.names) {
    const { ctx, w, h, cam } = o;
    ctx.font = '11px Inter Variable, Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const bone of scene.skeleton.bones) {
      if (o.hiddenBones.has(bone.data.id)) continue;
      const mx = bone.worldX + (bone.a * bone.data.length) / 2;
      const my = bone.worldY + (bone.c * bone.data.length) / 2;
      const [sx, sy] = worldToScreen(cam, w, h, mx, my);
      const label = bone.data.name;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(13,15,19,0.72)';
      ctx.fillRect(sx - tw / 2 - 4, sy - 16, tw + 8, 15);
      ctx.fillStyle = sel.has(bone.data.id) ? COLORS.accent : COLORS.text;
      ctx.fillText(label, sx - tw / 2, sy - 8.5);
    }
  }
}

export function drawConstraints(o: OverlayInput) {
  const { ctx, w, h, cam, scene } = o;
  for (const c of scene.skeleton.constraints) {
    if (!c.active) continue;
    if (c.kind === 'slider') {
      // slider driven by a bone: a small diamond on the driver bone
      if (!c.bone) continue;
      const [bx, by] = worldToScreen(cam, w, h, c.bone.worldX, c.bone.worldY);
      ctx.save();
      ctx.strokeStyle = '#4cc9f0';
      ctx.fillStyle = 'rgba(76,201,240,0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, by - 8);
      ctx.lineTo(bx + 8, by);
      ctx.lineTo(bx, by + 8);
      ctx.lineTo(bx - 8, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if (c.kind === 'transform') {
      // transform constraint: dotted link from the source bone to the constrained bones
      const s = c.source;
      const [sx, sy] = worldToScreen(cam, w, h, s.worldX, s.worldY);
      ctx.save();
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = '#b38cff';
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.5;
      for (const b of c.bones) {
        const [bx, by] = worldToScreen(cam, w, h, b.worldX, b.worldY);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    if (c.kind === 'path') {
      // path constraint: a dot on every constrained bone, in the color of paths
      ctx.save();
      ctx.fillStyle = 'rgba(255,127,0,0.9)';
      ctx.strokeStyle = 'rgba(8,10,14,0.9)';
      ctx.lineWidth = 1.2;
      for (const b of c.bones) {
        const [bx, by] = worldToScreen(cam, w, h, b.worldX, b.worldY);
        ctx.beginPath();
        ctx.arc(bx, by, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    const t = c.target;
    const last = c.bones[c.bones.length - 1];
    const [tx, ty] = worldToScreen(cam, w, h, t.worldX, t.worldY);
    const [ex, ey] = worldToScreen(cam, w, h, last.tipX, last.tipY);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = COLORS.ik;
    ctx.globalAlpha = 0.55 + 0.45 * c.mix;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // chain through constrained bones to the target
    const [fx, fy] = worldToScreen(cam, w, h, c.bones[0].worldX, c.bones[0].worldY);
    ctx.moveTo(fx, fy);
    for (const b of c.bones) {
      const [bx, by] = worldToScreen(cam, w, h, b.tipX, b.tipY);
      ctx.lineTo(bx, by);
    }
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
    // target marker
    const selected = o.ui.selection.bones.includes(t.data.id);
    ctx.strokeStyle = selected ? COLORS.accent : COLORS.ik;
    ctx.fillStyle = selected ? 'rgba(49,208,170,0.25)' : 'rgba(255,122,89,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - 13, ty);
    ctx.lineTo(tx + 13, ty);
    ctx.moveTo(tx, ty - 13);
    ctx.lineTo(tx, ty + 13);
    ctx.lineWidth = 1.25;
    ctx.stroke();
    void ex;
    void ey;
  }
}

export function drawAttachmentOutline(o: OverlayInput) {
  const { ctx, w, h, cam, scene, ui } = o;
  const slotId = ui.selection.slot;
  if (!slotId) return;
  const geo = slotWorldVertices(scene.skeleton, slotId);
  if (!geo || geo.kind === 'polygon') return; // polygons draw their own (colored) outline
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  if (geo.kind === 'region') {
    for (let i = 0; i < 4; i++) {
      const [x, y] = worldToScreen(cam, w, h, geo.vertices[i * 2], geo.vertices[i * 2 + 1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else {
    const slot = scene.skeleton.slotById(slotId);
    const att = slot ? scene.skeleton.slotAttachment(slot) : null;
    const hull = att && att.kind === 'mesh' ? att.hull : 0;
    for (let i = 0; i < hull; i++) {
      const [x, y] = worldToScreen(cam, w, h, geo.vertices[i * 2], geo.vertices[i * 2 + 1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  ctx.stroke();
  ctx.setLineDash([]);
  void REGION_TRIANGLES;
}

export function drawOriginCross(o: OverlayInput) {
  const { ctx, w, h, cam } = o;
  const [x, y] = worldToScreen(cam, w, h, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.stroke();
}

/** Tool gizmo at the origin of the first selected bone. */
export function drawGizmo(o: OverlayInput) {
  const { ctx, w, h, cam, scene, ui } = o;
  const id = ui.selection.bones[0];
  if (!id || ui.tool === 'select' || ui.tool === 'create') return;
  const bone = scene.skeleton.boneById(id);
  if (!bone) return;
  const [x, y] = worldToScreen(cam, w, h, bone.worldX, bone.worldY);
  ctx.lineWidth = 2;
  if (ui.tool === 'translate') {
    const L = 54;
    ctx.strokeStyle = '#ff6464';
    ctx.fillStyle = '#ff6464';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + L, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + L + 9, y);
    ctx.lineTo(x + L - 1, y - 5);
    ctx.lineTo(x + L - 1, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6ee18c';
    ctx.fillStyle = '#6ee18c';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - L);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - L - 9);
    ctx.lineTo(x - 5, y - L + 1);
    ctx.lineTo(x + 5, y - L + 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 10, y - 22, 14, 14);
  } else if (ui.tool === 'rotate') {
    ctx.strokeStyle = 'rgba(255,200,90,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,200,90,0.95)';
    const a = -bone.worldRotationX * (Math.PI / 180);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * 46, y + Math.sin(a) * 46, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (ui.tool === 'scale') {
    ctx.strokeStyle = 'rgba(120,170,255,0.95)';
    ctx.fillStyle = 'rgba(120,170,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 40, y);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 40);
    ctx.stroke();
    ctx.fillRect(x + 36, y - 4, 9, 9);
    ctx.fillRect(x - 4, y - 44, 9, 9);
    ctx.strokeRect(x - 9, y - 9, 18, 18);
  }
}

export function drawInteraction(o: OverlayInput) {
  const { ctx, w, h, cam, interaction } = o;
  if (!interaction || interaction.kind === 'none') return;
  const [x0, y0] = worldToScreen(cam, w, h, interaction.x0, interaction.y0);
  const [x1, y1] = worldToScreen(cam, w, h, interaction.x1, interaction.y1);
  if (interaction.kind === 'create') {
    ctx.strokeStyle = COLORS.accent;
    ctx.fillStyle = COLORS.accentSoft;
    ctx.lineWidth = 2;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len > 2) {
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      const wd = Math.min(9, Math.max(3.5, len * 0.13));
      const kx = x0 + ux * len * 0.2;
      const ky = y0 + uy * len * 0.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(kx - uy * wd, ky + ux * wd);
      ctx.lineTo(x1, y1);
      ctx.lineTo(kx + uy * wd, ky - ux * wd);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x0, y0, 4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.accent;
    ctx.fill();
  } else if (interaction.kind === 'link') {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = COLORS.ik;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,122,89,0.22)';
    ctx.strokeStyle = COLORS.ik;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x1, y1, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (interaction.kind === 'marquee') {
    ctx.strokeStyle = COLORS.accent;
    ctx.fillStyle = COLORS.accentSoft;
    ctx.lineWidth = 1;
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
  }
}

export function drawOverlay(o: OverlayInput) {
  const { ctx, w, h, ui } = o;
  ctx.clearRect(0, 0, w, h);
  if (ui.view.grid) drawGrid(o);
  drawOriginCross(o);
  drawAttachmentOutline(o);
  o.under?.(o);
  if (ui.view.bones) drawBones(o);
  if (ui.view.constraints) drawConstraints(o);
  o.extra?.(o);
  drawGizmo(o);
  drawInteraction(o);
}
