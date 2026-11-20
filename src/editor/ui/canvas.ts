/** Small helpers for the canvases that draw themselves (dopesheet, graph editor). */

/** Calls `draw` once per frame while `dirty.current` is set. Returns the function that stops the loop. */
export function drawWhenDirty(dirty: { current: boolean }, draw: () => void): () => void {
  let raf = 0;
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
  return () => cancelAnimationFrame(raf);
}

/** The position of a pointer event inside an element, in CSS pixels. */
export function localPoint(e: { clientX: number; clientY: number }, el: Element): readonly [number, number] {
  const r = el.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
