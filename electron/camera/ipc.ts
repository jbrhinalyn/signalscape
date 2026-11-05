import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNEL, type CameraEvent, type CameraFrame, type CameraStartResult } from '../ipc/contracts.js';
import { SmartSpectraCapture } from './capture.js';

export interface CameraIpcDependencies {
  readonly ipcMain: Pick<IpcMain, 'handle' | 'on'>;
  readonly isTrustedSender: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean;
  readonly emitToRenderer: (event: CameraEvent) => void;
  readonly capture?: SmartSpectraCapture;
}

export function registerCameraIpc(deps: CameraIpcDependencies): {
  isCameraArmed(): boolean;
  shutdown(): Promise<void>;
} {
  let armed = false;
  const capture = deps.capture ?? new SmartSpectraCapture(deps.emitToRenderer);
  function assertTrusted(event: IpcMainInvokeEvent, args: unknown[]): void {
    if (!deps.isTrustedSender(event) || args.length !== 0) {
      throw new Error('Unauthorized camera IPC request');
    }
  }

  deps.ipcMain.handle(IPC_CHANNEL.cameraArm, (event, ...args: unknown[]) => {
    assertTrusted(event, args);
    // The Angular UI invokes this only from its explicit Preview button.
    armed = true;
    return true;
  });

  deps.ipcMain.handle(IPC_CHANNEL.cameraDisarm, async (event, ...args: unknown[]) => {
    assertTrusted(event, args);
    armed = false;
    await capture.stop();
  });

  deps.ipcMain.handle(IPC_CHANNEL.measurementStart, (event, ...args: unknown[]): CameraStartResult => {
    assertTrusted(event, args);
    if (!armed) return { ok: false, reason: 'camera-permission-denied' };
    return capture.start();
  });

  deps.ipcMain.handle(IPC_CHANNEL.measurementStop, async (event, ...args: unknown[]) => {
    assertTrusted(event, args);
    await capture.stop();
  });

  deps.ipcMain.on(IPC_CHANNEL.cameraFrame, (event, ...args: unknown[]) => {
    // Every frame must be from the live app main frame and explicitly armed.
    if (!armed || !deps.isTrustedSender(event) || args.length !== 1) return;
    const frame = args[0] as Partial<CameraFrame> | null;
    if (typeof frame !== 'object' || frame === null ||
      frame.width !== 640 || frame.height !== 480 ||
      typeof frame.timestampUs !== 'number' ||
      !(frame.pixels instanceof Uint8Array) ||
      frame.pixels.byteLength !== 640 * 480 * 4) return;
    capture.submit(frame.pixels, frame.width, frame.height, frame.timestampUs);
  });

  return {
    isCameraArmed: () => armed,
    shutdown: async () => {
      armed = false;
      await capture.stop();
    },
  };
}
