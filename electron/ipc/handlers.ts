import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  IPC_API_VERSION,
  IPC_CHANNEL,
  type AppStatus,
  type DesktopPlatform,
  type PublicAppConfig,
} from './contracts.js';

export interface DesktopIpcDependencies {
  readonly ipcMain: Pick<IpcMain, 'handle'>;
  readonly isTrustedSender: (event: IpcMainInvokeEvent) => boolean;
  readonly getVersion: () => string;
  readonly isPackaged: boolean;
  readonly platform: NodeJS.Platform;
}

/**
 * Only two no-argument request channels are registered. Authorization is
 * repeated for every call, including calls issued from subframes or after
 * an unexpected navigation.
 */
export function registerDesktopIpc(deps: DesktopIpcDependencies): void {
  const assertAuthorized = (event: IpcMainInvokeEvent, args: unknown[]): void => {
    if (!deps.isTrustedSender(event) || args.length !== 0) {
      throw new Error('Unauthorized SignalScape IPC request');
    }
  };

  deps.ipcMain.handle(IPC_CHANNEL.appStatus, (event, ...args: unknown[]): AppStatus => {
    assertAuthorized(event, args);
    const platform: DesktopPlatform =
      deps.platform === 'linux' || deps.platform === 'darwin' || deps.platform === 'win32'
        ? deps.platform
        : 'other';
    return {
      apiVersion: IPC_API_VERSION,
      version: deps.getVersion(),
      platform,
      ready: true,
    };
  });

  deps.ipcMain.handle(IPC_CHANNEL.publicConfig, (event, ...args: unknown[]): PublicAppConfig => {
    assertAuthorized(event, args);
    // Explicit public allowlist: never serialize process.env, SDK credentials,
    // local paths, native configuration objects, or Electron app internals.
    return {
      mode: deps.isPackaged ? 'production' : 'development',
      features: {
        cameraEnabled: false,
        smartSpectraEnabled: false,
        telemetryEnabled: false,
      },
    };
  });
}
