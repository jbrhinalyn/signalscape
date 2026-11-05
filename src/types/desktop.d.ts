import type { SignalScapeDesktopApi } from '../../electron/ipc/contracts';

declare global {
  interface Window {
    /** Only defined inside the sandboxed Electron desktop renderer. */
    readonly signalScape?: SignalScapeDesktopApi;
  }
}

export {};
