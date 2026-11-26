/** Whether the auto-rig dialog is open. */
import { createStore, useStore } from './store';

const autoRigDialogStore = createStore<{ open: boolean }>({ open: false });
export const useAutoRigDialog = (): boolean => useStore(autoRigDialogStore, (s) => s.open);
export const openAutoRig = () => autoRigDialogStore.set({ open: true });
export const closeAutoRig = () => autoRigDialogStore.set({ open: false });
