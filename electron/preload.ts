import { contextBridge } from 'electron';

// Deliberately expose no ipcRenderer, Node primitives, or file-system access.
// Issue #7 will add a typed, allowlisted IPC contract.
contextBridge.exposeInMainWorld(
  'signalScape',
  Object.freeze({ apiVersion: 1 as const }),
);
