import { contextBridge } from 'electron';

// Deliberately expose no raw Electron messaging, Node, or file-system APIs.
// Issue #7 will add a typed, allowlisted IPC contract.
contextBridge.exposeInMainWorld(
  'signalScape',
  Object.freeze({ apiVersion: 1 as const }),
);
