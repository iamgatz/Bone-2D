/**
 * The sounds of the Preview window. Events carry the path of a sound the game engine resolves; the editor has no sound files of its own, so the
 * person loads some here (they stay in this browser session, not in the project) and an event whose sound has the same name (folders and
 * extension left out, see `soundKey`) plays it while the Preview runs.
 */
import type { EventDef, EventKey } from '@/core/model';
import { soundKey } from '@/core/preview';

const urls = new Map<string, string>();
let context: AudioContext | null = null;

export function addSounds(files: readonly File[]): number {
  let n = 0;
  for (const f of files) {
    if (!/^audio\//.test(f.type) && !/\.(wav|ogg|mp3|m4a|flac|aac)$/i.test(f.name)) continue;
    const key = soundKey(f.name);
    const old = urls.get(key);
    if (old) URL.revokeObjectURL(old);
    urls.set(key, URL.createObjectURL(f));
    n++;
  }
  return n;
}

export const soundCount = () => urls.size;
export const hasSound = (path: string) => urls.has(soundKey(path));
export function clearSounds() {
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
}

/** Plays the sound of an event; false when none was loaded for that path. */
export function playSound(path: string, volume = 1, balance = 0): boolean {
  const url = urls.get(soundKey(path));
  if (!url) return false;
  try {
    const el = new Audio(url);
    el.volume = Math.max(0, Math.min(1, volume));
    if (balance !== 0 && typeof AudioContext !== 'undefined') {
      context ??= new AudioContext();
      const pan = context.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, balance));
      context.createMediaElementSource(el).connect(pan).connect(context.destination);
    }
    void el.play().catch(() => undefined);
  } catch {
    return false;
  }
  return true;
}

/** Plays the sound of a fired event (its own volume and balance win over the definition's); false when it has none or none was loaded. */
export function playEventSound(defs: readonly EventDef[], key: EventKey): boolean {
  const def = defs.find((e) => e.id === key.event);
  if (!def?.audio) return false;
  return playSound(def.audio, key.volume ?? def.volume ?? 1, key.balance ?? def.balance ?? 0);
}

/** Opens the file dialog for sound files; `done` runs once they are loaded. */
export function pickSounds(done?: (count: number) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'audio/*,.wav,.ogg,.mp3,.m4a,.flac,.aac';
  input.onchange = () => {
    addSounds([...(input.files ?? [])]);
    done?.(soundCount());
  };
  input.click();
}
