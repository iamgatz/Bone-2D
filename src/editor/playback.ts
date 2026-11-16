import { uiStore } from '@/store/ui';
import { docStore } from '@/store/doc';
import { findAnimation } from '@/core/edit';

/** Drives `ui.time` while playing. Runs for the whole app lifetime. */
export function startPlaybackLoop(): () => void {
  let raf = 0;
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const ui = uiStore.get();
    if (ui.playing) {
      const anim = findAnimation(docStore.get().skeleton, ui.animationId);
      if (!anim) uiStore.patch({ playing: false });
      else {
        let t = ui.time + dt * ui.speed;
        if (t >= anim.duration) {
          if (ui.loop) t = anim.duration > 0 ? t % anim.duration : 0;
          else {
            t = anim.duration;
            uiStore.patch({ time: t, playing: false });
            raf = requestAnimationFrame(tick);
            return;
          }
        }
        uiStore.patch({ time: t });
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
