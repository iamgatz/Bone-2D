import { useEffect, useRef } from 'react';
import { decodeKey, encodeKey } from '@/core/keyrefs';
import type { KeyRef } from '@/core/keyrefs';
import { moveKeysBy, setTime } from '@/store/actions';
import { docStore } from '@/store/doc';
import { uiStore } from '@/store/ui';
import type { Row } from './rows';

export const ROW_H = 24;

const TONES: Record<NonNullable<Row['tone']>, string> = {
  bone: '#c9d4e6',
  slot: '#d9c7f0',
  ik: '#ffb08f',
  deform: '#9fd6ff',
  order: '#e6dd9f',
  event: '#ffd0e6',
};

export interface TimelineMenuRequest {
  x: number;
  y: number;
  refs: KeyRef[];
}

interface Props {
  rows: Row[];
  duration: number;
  fps: number;
  onMenu: (m: TimelineMenuRequest) => void;
}

type Drag =
  | { kind: 'scrub' }
  | { kind: 'pan'; x: number; scroll: number }
  | { kind: 'keys'; anchor: KeyRef; grab: number; refs: KeyRef[] }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; base: string[] };

function timeToX(t: number, scroll: number, zoom: number) {
  return (t - scroll) * zoom;
}

function frameStep(pxPerFrame: number): number {
  for (const n of [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]) if (n * pxPerFrame >= 54) return n;
  return 3600;
}

export function Dopesheet({ rows, duration, fps, onMenu }: Props) {
  const rulerRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({ rows, duration, fps });
  propsRef.current = { rows, duration, fps };
  const drag = useRef<Drag | null>(null);
  const dirty = useRef(true);

  useEffect(() => {
    const ruler = rulerRef.current!;
    const canvas = canvasRef.current!;
    const host = hostRef.current!;
    const rctx = ruler.getContext('2d')!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let w = 0;
    let hostH = 0;
    let lastRows: Row[] | null = null;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = host.clientWidth;
      hostH = host.clientHeight;
      const rowsH = Math.max(hostH, propsRef.current.rows.length * ROW_H + 8);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(rowsH * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = rowsH + 'px';
      ruler.width = Math.round(w * dpr);
      ruler.height = Math.round(28 * dpr);
      ruler.style.width = w + 'px';
      ruler.style.height = '28px';
      dirty.current = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const mark = () => {
      dirty.current = true;
    };
    const unsubs = [uiStore.subscribe(mark), docStore.subscribe(mark)];

    const selectedSet = () => new Set(uiStore.get().selectedKeys);

    const draw = () => {
      const { rows, duration, fps } = propsRef.current;
      const ui = uiStore.get();
      const dpr = window.devicePixelRatio || 1;
      if (lastRows !== rows) {
        lastRows = rows;
        resize();
      }
      const zoom = ui.tlZoom;
      const scroll = ui.tlScroll;
      const sel = selectedSet();
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;

      // ------------------------------------------------ ruler
      rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rctx.clearRect(0, 0, w, 28);
      rctx.fillStyle = '#12151b';
      rctx.fillRect(0, 0, w, 28);
      const pxPerFrame = zoom / fps;
      const step = frameStep(pxPerFrame);
      const firstFrame = Math.floor((scroll * fps) / step) * step;
      rctx.font = '10.5px ui-monospace, Consolas, monospace';
      rctx.textBaseline = 'middle';
      for (let f = firstFrame; timeToX(f / fps, scroll, zoom) < w + 40; f += step) {
        const x = Math.round(timeToX(f / fps, scroll, zoom)) + 0.5;
        const isSecond = f % fps === 0;
        rctx.strokeStyle = isSecond ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.2)';
        rctx.beginPath();
        rctx.moveTo(x, 28);
        rctx.lineTo(x, isSecond ? 8 : 14);
        rctx.stroke();
        rctx.fillStyle = isSecond ? '#cfd6e3' : '#7d8696';
        rctx.fillText(isSecond ? `${f / fps}s` : String(f), x + 4, 11);
        if (pxPerFrame >= 7 && step === 1 && !isSecond) {
          rctx.strokeStyle = 'rgba(255,255,255,0.08)';
        }
      }
      if (pxPerFrame >= 6) {
        rctx.strokeStyle = 'rgba(255,255,255,0.1)';
        rctx.beginPath();
        const f0 = Math.floor(scroll * fps);
        for (let f = f0; timeToX(f / fps, scroll, zoom) < w; f++) {
          const x = Math.round(timeToX(f / fps, scroll, zoom)) + 0.5;
          rctx.moveTo(x, 28);
          rctx.lineTo(x, 22);
        }
        rctx.stroke();
      }
      const endX = timeToX(duration, scroll, zoom);
      if (endX < w) {
        rctx.fillStyle = 'rgba(0,0,0,0.4)';
        rctx.fillRect(Math.max(0, endX), 0, w, 28);
      }
      const px = timeToX(ui.time, scroll, zoom);
      rctx.fillStyle = '#ff9f43';
      rctx.beginPath();
      rctx.moveTo(px - 6, 18);
      rctx.lineTo(px + 6, 18);
      rctx.lineTo(px, 28);
      rctx.closePath();
      rctx.fill();
      rctx.fillRect(px - 0.5, 0, 1, 18);

      // ------------------------------------------------ keys
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = '#10131a';
      ctx.fillRect(0, 0, cw, ch);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const y = i * ROW_H;
        if (r.type === 'group') {
          ctx.fillStyle = 'rgba(255,255,255,0.045)';
          ctx.fillRect(0, y, cw, ROW_H);
        } else if (r.selected) {
          ctx.fillStyle = 'rgba(49,208,170,0.09)';
          ctx.fillRect(0, y, cw, ROW_H);
        } else if (i % 2 === 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.018)';
          ctx.fillRect(0, y, cw, ROW_H);
        }
      }
      // vertical grid (every second, and every frame when zoomed in)
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      const s0 = Math.floor(scroll);
      for (let s = s0; timeToX(s, scroll, zoom) < cw; s++) {
        const x = Math.round(timeToX(s, scroll, zoom)) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ch);
      }
      ctx.stroke();
      if (pxPerFrame >= 9) {
        ctx.strokeStyle = 'rgba(255,255,255,0.025)';
        ctx.beginPath();
        for (let f = Math.floor(scroll * fps); timeToX(f / fps, scroll, zoom) < cw; f++) {
          const x = Math.round(timeToX(f / fps, scroll, zoom)) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, ch);
        }
        ctx.stroke();
      }
      // beyond the end
      if (endX < cw) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(Math.max(0, endX), 0, cw, ch);
        ctx.fillStyle = 'rgba(255,159,67,0.5)';
        ctx.fillRect(Math.round(endX), 0, 1, ch);
      }
      // keys
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.type === 'group') continue;
        const cy = i * ROW_H + ROW_H / 2;
        const keys = r.keys;
        const size = r.type === 'entity' ? 5.6 : 4.6;
        for (const k of keys) {
          const x = timeToX(k.time, scroll, zoom);
          if (x < -10 || x > cw + 10) continue;
          const selected = k.refs.some((ref) => sel.has(encodeKey(ref)));
          ctx.beginPath();
          ctx.moveTo(x, cy - size);
          ctx.lineTo(x + size, cy);
          ctx.lineTo(x, cy + size);
          ctx.lineTo(x - size, cy);
          ctx.closePath();
          ctx.fillStyle = selected ? '#31d0aa' : TONES[r.tone ?? 'bone'];
          if (r.type === 'prop' && !selected) ctx.globalAlpha = 0.82;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = selected ? '#bff5e8' : 'rgba(10,12,16,0.9)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      // playhead
      ctx.fillStyle = 'rgba(255,159,67,0.9)';
      ctx.fillRect(Math.round(px), 0, 1, ch);
      // marquee
      const d = drag.current;
      if (d?.kind === 'marquee') {
        ctx.fillStyle = 'rgba(49,208,170,0.12)';
        ctx.strokeStyle = '#31d0aa';
        ctx.lineWidth = 1;
        const x = Math.min(d.x0, d.x1);
        const y = Math.min(d.y0, d.y1);
        ctx.fillRect(x, y, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
        ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      }
    };

    const loop = () => {
      if (dirty.current) {
        dirty.current = false;
        try {
          draw();
        } catch (e) {
          console.error(e);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // ------------------------------------------------ interaction helpers
    const local = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const xToTime = (x: number) => x / uiStore.get().tlZoom + uiStore.get().tlScroll;

    const hitKey = (x: number, y: number): { row: Row; key: Row['keys'][number] } | null => {
      const rows = propsRef.current.rows;
      const i = Math.floor(y / ROW_H);
      const row = rows[i];
      if (!row || row.type === 'group') return null;
      const { tlZoom, tlScroll } = uiStore.get();
      let best: { row: Row; key: Row['keys'][number]; d: number } | null = null;
      for (const k of row.keys) {
        const d = Math.abs(timeToX(k.time, tlScroll, tlZoom) - x);
        if (d <= 8 && (!best || d < best.d)) best = { row, key: k, d };
      }
      return best;
    };

    // ruler scrubbing
    const scrubTo = (e: PointerEvent) => {
      const [x] = local(e, ruler);
      setTime(xToTime(x));
    };
    const onRulerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      ruler.setPointerCapture(e.pointerId);
      drag.current = { kind: 'scrub' };
      uiStore.patch({ playing: false });
      scrubTo(e);
    };
    const onRulerMove = (e: PointerEvent) => {
      if (drag.current?.kind === 'scrub') scrubTo(e);
    };
    const onRulerUp = () => {
      drag.current = null;
    };
    ruler.addEventListener('pointerdown', onRulerDown);
    ruler.addEventListener('pointermove', onRulerMove);
    ruler.addEventListener('pointerup', onRulerUp);

    // keys canvas
    const onDown = (e: PointerEvent) => {
      const [x, y] = local(e, canvas);
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        canvas.setPointerCapture(e.pointerId);
        drag.current = { kind: 'pan', x: e.clientX, scroll: uiStore.get().tlScroll };
        e.preventDefault();
        return;
      }
      const hit = hitKey(x, y);
      const ui = uiStore.get();
      if (e.button === 2) {
        e.preventDefault();
        if (hit) {
          const enc = hit.key.refs.map(encodeKey);
          let selected = ui.selectedKeys;
          if (!enc.every((s) => selected.includes(s))) {
            selected = enc;
            uiStore.patch({ selectedKeys: selected });
          }
          onMenu({ x: e.clientX, y: e.clientY, refs: selected.map(decodeKey) });
        }
        return;
      }
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      if (hit) {
        const enc = hit.key.refs.map(encodeKey);
        let selected: string[];
        const already = enc.every((s) => ui.selectedKeys.includes(s));
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          selected = already ? ui.selectedKeys.filter((s) => !enc.includes(s)) : [...new Set([...ui.selectedKeys, ...enc])];
        } else selected = already ? ui.selectedKeys : enc;
        uiStore.patch({ selectedKeys: selected });
        if (selected.length && !(already && (e.shiftKey || e.ctrlKey || e.metaKey))) {
          docStore.beginGesture('Move keys');
          drag.current = { kind: 'keys', anchor: hit.key.refs[0], grab: xToTime(x) - hit.key.time, refs: selected.map(decodeKey) };
        }
        return;
      }
      // empty space: start marquee
      drag.current = { kind: 'marquee', x0: x, y0: y, x1: x, y1: y, base: e.shiftKey ? ui.selectedKeys : [] };
      if (!e.shiftKey) uiStore.patch({ selectedKeys: [] });
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const [x, y] = local(e, canvas);
      if (d.kind === 'pan') {
        const ui = uiStore.get();
        uiStore.patch({ tlScroll: d.scroll - (e.clientX - d.x) / ui.tlZoom });
      } else if (d.kind === 'keys') {
        const fps = propsRef.current.fps;
        const target = Math.max(0, Math.round((xToTime(x) - d.grab) * fps) / fps);
        const delta = target - d.anchor.time;
        if (Math.abs(delta) > 1e-6) {
          const anchorIndex = d.refs.findIndex((r) => encodeKey(r) === encodeKey(d.anchor));
          const moved = moveKeysBy(d.refs, delta);
          d.anchor = { ...d.anchor, time: (moved[anchorIndex] ?? moved[0]).time };
          d.refs = moved;
          uiStore.patch({ selectedKeys: moved.map(encodeKey) });
        }
      } else if (d.kind === 'marquee') {
        d.x1 = x;
        d.y1 = y;
        const { tlZoom, tlScroll } = uiStore.get();
        const x0 = Math.min(d.x0, d.x1);
        const x1 = Math.max(d.x0, d.x1);
        const y0 = Math.min(d.y0, d.y1);
        const y1 = Math.max(d.y0, d.y1);
        const picked = new Set(d.base);
        const rows = propsRef.current.rows;
        for (let i = Math.floor(y0 / ROW_H); i <= Math.floor(y1 / ROW_H); i++) {
          const r = rows[i];
          if (!r || r.type === 'group') continue;
          for (const k of r.keys) {
            const kx = timeToX(k.time, tlScroll, tlZoom);
            if (kx >= x0 - 4 && kx <= x1 + 4) for (const ref of k.refs) picked.add(encodeKey(ref));
          }
        }
        uiStore.patch({ selectedKeys: [...picked] });
        dirty.current = true;
      }
    };
    const onUp = () => {
      if (drag.current?.kind === 'keys') docStore.endGesture();
      drag.current = null;
      dirty.current = true;
    };
    const onWheel = (e: WheelEvent) => {
      const ui = uiStore.get();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const [x] = local(e, canvas);
        const t = xToTime(x);
        const zoom = Math.min(3000, Math.max(20, ui.tlZoom * Math.exp(-e.deltaY * 0.0022)));
        uiStore.patch({ tlZoom: zoom, tlScroll: t - x / zoom });
      } else if (e.shiftKey) {
        e.preventDefault();
        uiStore.patch({ tlScroll: ui.tlScroll + (e.deltaY + e.deltaX) / ui.tlZoom });
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        uiStore.patch({ tlScroll: ui.tlScroll + e.deltaX / ui.tlZoom });
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    ruler.addEventListener('wheel', onWheel, { passive: false });
    const noCtx = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', noCtx);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      unsubs.forEach((u) => u());
      ruler.removeEventListener('pointerdown', onRulerDown);
      ruler.removeEventListener('pointermove', onRulerMove);
      ruler.removeEventListener('pointerup', onRulerUp);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      ruler.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', noCtx);
    };
  }, [onMenu]);

  useEffect(() => {
    dirty.current = true;
  });

  return (
    <div className="tl-canvas-wrap">
      <div className="tl-ruler">
        <canvas ref={rulerRef} />
      </div>
      <div
        className="tl-canvas-host"
        ref={hostRef}
        onScroll={(e) => {
          const labels = document.getElementById('tl-label-scroll');
          if (labels && labels.scrollTop !== e.currentTarget.scrollTop) labels.scrollTop = e.currentTarget.scrollTop;
        }}
      >
        <canvas ref={canvasRef} className="tl-canvas" />
      </div>
    </div>
  );
}
