import { uiStore } from '@/store/ui';
import { docStore } from '@/store/doc';
import { findAnimation } from '@/core/edit';
import { advancePlayback } from '@/core/playback';

/** Drives `ui.time` while playing. Runs for the whole app lifetime. */
export function startPlaybackLoop(): () => void {
  let raf = 0;
  let last = performance.now();
  let dir: 1 | -1 = 1;
  let wasPlaying = false;
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const ui = uiStore.get();
    if (ui.playing) {
      if (!wasPlaying) dir = 1; // every play starts forward
      const anim = findAnimation(docStore.get().skeleton, ui.animationId);
      if (!anim) uiStore.patch({ playing: false });
      else {
        const next = advancePlayback({ time: ui.time, dir }, dt * ui.speed, anim.duration, { loop: ui.loop, pingPong: ui.pingPong, range: ui.range });
        dir = next.dir;
        uiStore.patch(next.stopped ? { time: next.time, playing: false } : { time: next.time });
      }
    }
    wasPlaying = uiStore.get().playing;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
