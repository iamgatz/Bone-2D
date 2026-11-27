/** What the last import could not carry over, while its window is open. */
import { createStore, useStore } from './store';

interface ImportNotes {
  file: string;
  notes: string[];
}

const importNotesStore = createStore<{ shown: ImportNotes | null }>({ shown: null });
export const useImportNotes = (): ImportNotes | null => useStore(importNotesStore, (s) => s.shown);
export const showImportNotes = (file: string, notes: string[]) => importNotesStore.set({ shown: { file, notes } });
export const closeImportNotes = () => importNotesStore.set({ shown: null });
