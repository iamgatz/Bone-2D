/** Project persistence: new / save / open / autosave (IndexedDB). Images are embedded as data URLs. */
import { emptyProject, migrateProject } from '@/core/model';
import type { Project } from '@/core/model';
import { repairProject } from '@/core/validate';
import { assets, blobToDataURL, dataURLToBlob } from './assets';
import type { ImageAsset } from './assets';
import { docStore } from './doc';
import { emptySelection, toast, uiStore } from './ui';

interface ProjectFile {
  bone2d?: 1;
  /** Signature of files written before the project was renamed from "Marrow"; they still open. */
  marrow?: 1;
  project: Project;
  images: Record<string, string>;
  ui?: { camera?: { x: number; y: number; zoom: number } };
}

const dataUrlCache = new Map<string, string>();

async function assetDataURL(name: string): Promise<string | null> {
  const a = assets.get(name);
  if (!a) return null;
  const key = `${name}@${a.version}`;
  let url = dataUrlCache.get(key);
  if (!url) {
    url = await blobToDataURL(a.blob);
    dataUrlCache.set(key, url);
  }
  return url;
}

export async function serializeProject(): Promise<string> {
  const project = docStore.get();
  const images: Record<string, string> = {};
  for (const img of project.images) {
    const url = await assetDataURL(img.name);
    if (url) images[img.name] = url;
  }
  const file: ProjectFile = { bone2d: 1, project, images, ui: { camera: uiStore.get().camera } };
  return JSON.stringify(file);
}

export interface LoadReport {
  /** Problems found in the file and fixed while opening it (dangling ids, stale deform keys, NaN ...). */
  repaired: string[];
  /** Images that could not be decoded (their attachments stay, the export lists them as missing). */
  failedImages: string[];
}

export async function loadProjectText(text: string): Promise<LoadReport> {
  const file = JSON.parse(text) as ProjectFile;
  if ((file.bone2d !== 1 && file.marrow !== 1) || !file.project?.skeleton) throw new Error('Not a Bone 2D project file');
  // Everything that can fail happens BEFORE the open project is touched: a damaged file must never wipe the session.
  const decoded: ImageAsset[] = [];
  const failedImages: string[] = [];
  for (const name of Object.keys(file.images ?? {})) {
    try {
      decoded.push(await assets.decode(name, await dataURLToBlob(file.images[name])));
    } catch (e) {
      console.warn(`image "${name}" could not be decoded`, e);
      failedImages.push(name);
    }
  }
  const repaired = repairProject(file.project);
  if (repaired.length) console.warn('project repaired while opening:', repaired);
  assets.replaceAll(decoded);
  docStore.replace(migrateProject(file.project));
  const doc = file.project.skeleton;
  uiStore.patch({
    mode: 'setup',
    selection: emptySelection,
    animationId: doc.animations[0]?.id ?? null,
    skinId: null,
    time: 0,
    playing: false,
    overrides: {},
    selectedKeys: [],
    ...(file.ui?.camera ? { camera: file.ui.camera } : {}),
  });
  return { repaired, failedImages };
}

export function newProject(name = 'untitled') {
  assets.clear();
  docStore.replace(emptyProject(name));
  uiStore.patch({ mode: 'setup', selection: emptySelection, animationId: null, skinId: null, time: 0, playing: false, overrides: {}, selectedKeys: [], camera: { x: 0, y: 120, zoom: 1.2 } });
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
}
export { downloadBlob };

export async function saveProjectFile() {
  const text = await serializeProject();
  const name = (docStore.get().name || 'untitled').replace(/[^\w\- ]+/g, '_');
  const blob = new Blob([text], { type: 'application/json' });
  const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>; name: string }> }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: `${name}.bone2d`, types: [{ description: 'Bone 2D project', accept: { 'application/json': ['.bone2d'] } }] });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      docStore.dirty = false;
      toast(`Saved ${handle.name}`, 'ok');
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  downloadBlob(blob, `${name}.bone2d`);
  docStore.dirty = false;
  toast('Project downloaded', 'ok');
}

export async function openProjectFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.bone2d,.marrow,application/json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const r = await loadProjectText(await f.text());
      const notes = [r.repaired.length ? `${r.repaired.length} problem${r.repaired.length === 1 ? '' : 's'} repaired` : '', r.failedImages.length ? `${r.failedImages.length} image${r.failedImages.length === 1 ? '' : 's'} could not be read` : ''].filter(Boolean);
      toast(`Opened ${f.name}${notes.length ? ` (${notes.join(', ')})` : ''}`, notes.length ? 'info' : 'ok');
    } catch (e) {
      toast(`Could not open the file: ${(e as Error).message}`, 'error');
    }
  };
  input.click();
}

// ------------------------------------------------------------------ autosave

const DB = 'bone2d';
/** Database name from before the project was renamed from "Marrow": an autosave left there is still restored, the next one goes to `DB`. */
const LEGACY_DB = 'marrow';
const STORE = 'kv';

function idb(name = DB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      if (name === DB) req.result.createObjectStore(STORE);
      else req.transaction?.abort(); // the legacy database is only read: do not create an empty one when it does not exist
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: string) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet(key: string, name = DB): Promise<string | undefined> {
  const db = await idb(name);
  const v = await new Promise<string | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as string | undefined);
    r.onerror = () => reject(r.error);
  });
  db.close();
  return v;
}

export async function restoreAutosave(): Promise<boolean> {
  try {
    let text = await idbGet('autosave');
    if (!text) text = await idbGet('autosave', LEGACY_DB).catch(() => undefined);
    if (!text) return false;
    await loadProjectText(text);
    return true;
  } catch (e) {
    console.warn('autosave restore failed', e);
    return false;
  }
}

export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await idbPut('autosave', await serializeProject());
      } catch (e) {
        console.warn('autosave failed', e);
      }
    }, 1200);
  };
  const unsubs = [docStore.subscribe(schedule), assets.subscribe(schedule)];
  return () => {
    if (timer) clearTimeout(timer);
    unsubs.forEach((u) => u());
  };
}
