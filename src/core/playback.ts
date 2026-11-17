/**
 * How the playhead moves while an animation plays: forward or ping-pong (forward, then backward), looping or playing once,
 * over the whole animation or over a chosen range (Spine's loop range). Pure: the playback loop feeds it the elapsed time.
 */
export interface PlayMode {
  loop: boolean;
  pingPong: boolean;
  /** Seconds [start, end] to play instead of the whole animation. */
  range: [number, number] | null;
}

export interface PlayState {
  time: number;
  /** 1 forward, -1 backward (only a ping-pong runs backward). */
  dir: 1 | -1;
}

/** The part of the animation that plays: the range clamped to the animation, or all of it when the range is empty or missing. */
export function playSpan(duration: number, range: PlayMode['range']): [number, number] {
  if (!range) return [0, Math.max(0, duration)];
  const lo = Math.min(Math.max(0, range[0]), duration);
  const hi = Math.min(Math.max(0, range[1]), duration);
  return hi - lo >= 1e-3 ? [lo, hi] : [0, Math.max(0, duration)];
}

/** Moves the playhead by `delta` seconds (already multiplied by the speed). `stopped` is true when a one-shot play reached its end. */
export function advancePlayback(state: PlayState, delta: number, duration: number, mode: PlayMode): PlayState & { stopped: boolean } {
  const [lo, hi] = playSpan(duration, mode.range);
  const length = hi - lo;
  if (length <= 0) return { time: lo, dir: 1, stopped: true };
  const t = Math.min(Math.max(state.time, lo), hi);
  if (!mode.pingPong) {
    let p = t - lo + delta;
    if (p >= length) {
      if (!mode.loop) return { time: hi, dir: 1, stopped: true };
      p %= length;
    }
    return { time: lo + p, dir: 1, stopped: false };
  }
  // ping-pong: one position along a cycle that runs there and back
  const period = length * 2;
  let p = (state.dir > 0 ? t - lo : period - (t - lo)) + delta;
  if (p >= period) {
    if (!mode.loop) return { time: lo, dir: 1, stopped: true };
    p %= period;
  }
  return p <= length ? { time: lo + p, dir: 1, stopped: false } : { time: lo + period - p, dir: -1, stopped: false };
}
