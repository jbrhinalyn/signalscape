import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import type { CameraEvent } from '../../electron/ipc/contracts';
import { SignalQualityMachine, type SignalQuality, type SignalView } from '../../electron/signals/model';
import { ForestSceneComponent } from './forest/forest-scene';

type CameraStopReason = 'user' | 'switch' | 'revoked' | 'disconnected' | 'sdk-error';
interface CameraChoice { readonly deviceId: string; readonly label: string; }
type SessionPhase = 'unavailable' | 'off' | 'permission' | 'starting' |
  'stopping' | 'error' | 'preview' | 'warming' | 'degraded' | 'partial' | 'ready';
interface SessionFeedback {
  readonly phase: SessionPhase;
  readonly title: string;
  readonly detail: string;
}

const GUIDANCE: Readonly<Record<number, string>> = {
  0: 'Framing looks good. Keep still for a moment.',
  1: 'No face detected. Make sure your face is visible.',
  2: 'More than one face detected. Keep one person in view.',
  3: 'Center your face within the guide.',
  4: 'Adjust your distance from the camera.',
  5: 'Lighting is too dark. Add soft frontal light.',
  6: 'Lighting is too bright. Reduce glare.',
  7: 'Your upper chest needs to be visible in the frame.',
  10: 'Camera is adjusting. Keep still.',
  11: 'Camera frame rate is low. Close other camera apps.',
  12: 'Too much movement. Keep the camera steady.',
  13: 'Move a little farther from the camera.',
  14: 'Move a little closer to the camera.',
  16: 'Move your face higher in the frame.',
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ForestSceneComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnDestroy {
  @ViewChild('cameraVideo') private video?: ElementRef<HTMLVideoElement>;

  private readonly desktop = window.signalScape?.apiVersion === 1 ? window.signalScape : null;
  private readonly canvas = document.createElement('canvas');
  private readonly context = this.canvas.getContext('2d', { willReadFrequently: true });
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private qualityTimer: ReturnType<typeof setInterval> | null = null;
  private readonly signals = new SignalQualityMachine();
  private unsubscribe: (() => void) | null = null;
  private operationId = 0;
  private releaseTask: Promise<boolean> | null = null;
  private sdkFailureMessage: string | null = null;
  private permissionStatus: PermissionStatus | null = null;

  private readonly cameraEnded = (): void => {
    if (this.stream) void this.stopPreview('disconnected');
  };

  private readonly deviceChanged = (): void => {
    void this.refreshCameras(true);
  };

  private readonly permissionChanged = (): void => {
    if (this.permissionStatus?.state !== 'denied') return;
    if (this.stream || this.busy()) {
      void this.stopPreview('revoked');
    } else {
      this.cameraAccess.set('Denied');
      this.message.set('Camera access is blocked. Allow it in system settings, then try again.');
    }
  };

  protected readonly runtime = this.desktop ? 'Electron desktop' : 'Browser preview';
  protected readonly desktopVersion = signal<string | null>(null);
  protected readonly nativeAvailable = Boolean(this.desktop);
  protected readonly busy = signal(false);
  protected readonly previewing = signal(false);
  protected readonly measuring = signal(false);
  protected readonly cameraState = signal('Off');
  protected readonly cameraAccess = signal('Not requested');
  protected readonly cameraAvailability = signal('Checking for cameras…');
  protected readonly cameras = signal<readonly CameraChoice[]>([]);
  protected readonly selectedCameraId = signal('');
  protected readonly activeCameraId = signal('');
  protected readonly guidance = signal('Show your face and upper chest within the frame.');
  protected readonly message = signal('No camera access until you choose Preview camera.');
  protected readonly packets = signal(0);
  protected readonly breathing = signal(false);
  protected readonly pulse = signal(false);
  protected readonly signalQuality = signal<SignalQuality>('disconnected');
  protected readonly sceneView = signal<SignalView>({ quality: 'disconnected', pulse: null, breathing: null });
  protected readonly pulseRate = signal<number | null>(null);
  protected readonly breathingRate = signal<number | null>(null);
  protected readonly framesReceived = signal(0);
  protected readonly framesAccepted = signal(0);
  protected readonly framesRejected = signal(0);
  protected readonly framesForwarded = signal(0);

  /** Readiness represents gated signal availability, never a health assessment. */
  protected sessionFeedback(): SessionFeedback {
    if (!this.nativeAvailable) {
      return { phase: 'unavailable', title: 'Desktop camera unavailable',
        detail: 'Open the Electron app to preview a camera. The forest needs no camera access.' };
    }
    if (this.cameraState() === 'Requesting access') {
      return { phase: 'permission', title: 'Waiting for camera permission',
        detail: 'Accept or decline the video-only camera request. You can stop at any time.' };
    }
    if (this.cameraState() === 'Starting') {
      return { phase: 'starting', title: 'Starting measurement',
        detail: 'Signals are not ready. You can cancel and release the camera now.' };
    }
    if (this.busy() && !this.previewing()) {
      return { phase: 'stopping', title: 'Releasing camera',
        detail: 'The local video stream is closed. Native cleanup may still be finishing.' };
    }
    if (!this.previewing()) {
      if (['Denied', 'Revoked', 'Busy', 'Unavailable'].includes(this.cameraAccess())) {
        return { phase: 'error', title: 'Camera needs attention', detail: this.message() };
      }
      return { phase: 'off', title: 'Camera and measurement off',
        detail: 'No camera is active. Preview requires an explicit permission request.' };
    }
    if (!this.measuring()) {
      return { phase: 'preview', title: 'Preview ready · measurement off',
        detail: 'Position one face and your upper chest, then explicitly start measurement.' };
    }
    const view = this.sceneView();
    if (view.quality === 'degraded') {
      return { phase: 'degraded', title: 'Tracking needs attention',
        detail: `Readings are not ready. ${this.guidance()}` };
    }
    if (view.quality === 'ready') {
      if (view.pulse && view.breathing) {
        return { phase: 'ready', title: 'Both signals available',
          detail: 'Fresh, quality-gated pulse and breathing estimates can influence the forest.' };
      }
      return { phase: 'partial', title: 'One signal available',
        detail: 'The other signal is not ready. Only available readings influence the forest.' };
    }
    return { phase: 'warming', title: 'Waiting for reliable signals',
      detail: 'Warm-up and tracking checks are in progress; no rates are shown until ready.' };
  }

  private refreshSignals(): void {
    const view = this.signals.snapshot(Date.now());
    this.sceneView.set(view);
    this.signalQuality.set(view.quality);
    this.pulseRate.set(view.pulse?.value ?? null);
    this.breathingRate.set(view.breathing?.value ?? null);
  }

  private resetSignals(): void {
    if (this.qualityTimer) clearInterval(this.qualityTimer);
    this.qualityTimer = null;
    this.signals.disconnect();
    this.refreshSignals();
  }

  private clearFrameTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  constructor() {
    this.canvas.width = 640;
    this.canvas.height = 480;
    if (!this.desktop) return;
    navigator.mediaDevices?.addEventListener?.('devicechange', this.deviceChanged);
    void this.refreshCameras();
    if (navigator.permissions?.query) {
      void navigator.permissions.query({ name: 'camera' as PermissionName }).then((status) => {
        this.permissionStatus = status;
        status.addEventListener?.('change', this.permissionChanged);
        this.permissionChanged();
      }).catch(() => { /* Electron/OS may not expose camera permission queries. */ });
    }
    this.unsubscribe = this.desktop.onCameraEvent((event) => this.handleCameraEvent(event));
    void this.desktop.getAppStatus().then((status) => {
      if (status.apiVersion === 1) this.desktopVersion.set(status.version);
    }).catch(() => this.desktopVersion.set(null));
  }

  private handleCameraEvent(event: CameraEvent): void {
    // Delayed SDK teardown events must not reactivate an already closed camera.
    if (event.kind === 'state' && !this.previewing() && !this.measuring()) return;
    if (event.kind === 'rate' || event.kind === 'unavailable') {
      if (!this.measuring()) return;
      this.signals.accept(event, Date.now());
      this.refreshSignals();
    } else if (event.kind === 'validation') {
      if (this.measuring()) {
        this.signals.validate(event.code);
        this.refreshSignals();
      }
      this.guidance.set(GUIDANCE[event.code] ?? 'Adjust your position and lighting.');
    } else if (event.kind === 'metrics') {
      this.packets.set(event.packets);
      this.breathing.set(event.breathingObserved);
      this.pulse.set(event.pulseObserved);
      if (this.measuring() && event.packets > 0) {
        this.message.set('SmartSpectra metric packets received. Keep the camera steady.');
      }
    } else if (event.kind === 'transport') {
      this.framesReceived.set(event.framesReceived);
      this.framesAccepted.set(event.framesAccepted);
      this.framesRejected.set(event.framesRejected);
      this.framesForwarded.set(event.framesForwarded);
      if (this.measuring() && this.packets() === 0 &&
        this.cameraState() !== 'Error') {
        this.message.set(event.framesAccepted > 0
          ? 'Video frames accepted by SmartSpectra. Waiting for metric packets…'
          : event.framesRejected > 0
            ? 'SmartSpectra is rejecting camera frames. Check SDK status and framing.'
            : 'Preparing camera frames for SmartSpectra…');
      }
    } else {
      this.cameraState.set(event.state.charAt(0).toUpperCase() + event.state.slice(1));
      if (event.state === 'error') {
        this.sdkFailureMessage = 'SmartSpectra reported an error' +
          (event.errorCode == null ? '.' : ' (code ' + event.errorCode + ').');
        // SDK failure must not leave the OS camera streaming, even when
        // the native event arrived before startNativeMeasurement() returned.
        void this.stopPreview('sdk-error');
      } else if (event.state === 'stopped') {
        this.clearFrameTimer();
        this.resetSignals();
        this.measuring.set(false);
        this.cameraState.set(this.previewing() ? 'Preview active' : 'Off');
        this.message.set(this.previewing()
          ? 'Measurement stopped. Camera preview remains on.'
          : 'Camera stopped. No frames are retained.');
      } else if (event.state === 'running' && this.measuring()) {
        this.message.set('SmartSpectra running. Checking incoming frames for measurements…');
      }
    }
  }

  /** Listing devices never opens a video stream or requests consent. */
  protected async refreshCameras(checkActive = false): Promise<void> {
    if (!this.desktop || !navigator.mediaDevices?.enumerateDevices) {
      this.cameraAvailability.set('Camera discovery is unavailable.');
      return;
    }
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === 'videoinput');
      const choices = devices.filter((device) => device.deviceId)
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1} (name hidden until allowed)`,
        }));
      this.cameras.set(choices);
      this.cameraAvailability.set(devices.length
        ? `${devices.length} camera${devices.length === 1 ? '' : 's'} detected`
        : 'No camera detected. Check the device connection.');
      if (this.selectedCameraId() &&
        !choices.some((choice) => choice.deviceId === this.selectedCameraId())) {
        this.selectedCameraId.set('');
      }
      if (checkActive && this.stream && this.activeCameraId() &&
        !choices.some((choice) => choice.deviceId === this.activeCameraId())) {
        void this.stopPreview('disconnected');
      }
    } catch {
      this.cameraAvailability.set('Unable to list cameras. Check privacy settings.');
    }
  }

  protected selectCamera(id: string): void {
    if (!this.busy()) this.selectedCameraId.set(id);
  }

  private releaseStream(): void {
    const stream = this.stream;
    this.stream = null;
    stream?.getVideoTracks().forEach((track) =>
      track.removeEventListener?.('ended', this.cameraEnded));
    stream?.getTracks().forEach((track) => track.stop());
    if (this.video) this.video.nativeElement.srcObject = null;
  }

  private showCameraError(error: unknown): void {
    const name = typeof error === 'object' && error !== null &&
      'name' in error ? String(error.name) : '';
    if (name === 'NotAllowedError' || name === 'SecurityError' ||
      name === 'PermissionDeniedError') {
      this.cameraAccess.set('Denied');
      this.message.set('Camera permission denied. Enable camera access in system settings and retry Preview camera.');
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      this.cameraAccess.set('Busy');
      this.message.set('Camera is in use or cannot be opened. Close other camera apps and retry.');
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError' ||
      name === 'DevicesNotFoundError') {
      this.cameraAccess.set('Unavailable');
      this.message.set('Selected camera not found. Connect it or select System default and retry.');
    } else {
      this.cameraAccess.set('Unavailable');
      this.message.set('Unable to open the camera. Check the connection and system permissions.');
    }
  }

  protected async enablePreview(): Promise<void> {
    if (!this.desktop || this.previewing() || this.busy()) return;
    const operation = ++this.operationId;
    this.busy.set(true);
    this.cameraAccess.set('Requesting access');
    this.cameraState.set('Requesting access');
    let opened: MediaStream | null = null;
    try {
      await this.desktop.authorizeCameraPreview();
      if (operation !== this.operationId) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        throw { name: 'NotFoundError' };
      }
      const chosenId = this.selectedCameraId();
      opened = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
          ...(chosenId ? { deviceId: { exact: chosenId } } : { facingMode: 'user' }) },
      });
      if (operation !== this.operationId) {
        opened.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = this.video?.nativeElement;
      if (!video) throw new Error('preview-element-not-found');
      this.stream = opened;
      video.srcObject = opened;
      await video.play();
      if (operation !== this.operationId) {
        opened.getTracks().forEach((track) => track.stop());
        if (video.srcObject === opened) video.srcObject = null;
        return;
      }
      opened.getVideoTracks().forEach((track) =>
        track.addEventListener?.('ended', this.cameraEnded));
      const activeId = opened.getVideoTracks()[0]?.getSettings?.().deviceId || chosenId;
      this.activeCameraId.set(activeId);
      this.selectedCameraId.set(activeId);
      this.previewing.set(true);
      this.cameraAccess.set('Allowed for preview');
      this.cameraState.set('Preview active');
      this.message.set('Preview is local and is not recorded. Start a measurement or stop the camera.');
      await this.refreshCameras();
    } catch (error) {
      if (operation !== this.operationId) return;
      this.releaseStream();
      opened?.getTracks().forEach((track) => {
        if (track.readyState !== 'ended') track.stop();
      });
      this.cameraState.set('Off');
      this.showCameraError(error);
      await this.desktop.releaseCameraPreview().catch(() => {});
    } finally {
      if (operation === this.operationId) this.busy.set(false);
    }
  }

  /** Switch requires an existing consented preview; measurement never auto-resumes. */
  protected async switchCamera(): Promise<void> {
    if (!this.previewing() || this.busy() ||
      this.selectedCameraId() === this.activeCameraId()) return;
    const selected = this.selectedCameraId();
    const stopping = this.stopPreview('switch');
    const operation = this.operationId;
    await stopping;
    if (operation !== this.operationId) return; // User pressed Stop during switching.
    this.selectedCameraId.set(selected);
    await this.enablePreview();
    if (this.previewing() && this.operationId === operation + 1) {
      this.message.set('Camera switched. Preview active; start measurement when ready.');
    }
  }

  protected async startMeasurement(): Promise<void> {
    if (!this.desktop || !this.stream || this.measuring() || this.busy()) return;
    const operation = this.operationId;
    this.busy.set(true);
    this.sdkFailureMessage = null;
    this.signals.connect(Date.now());
    this.refreshSignals();
    this.packets.set(0);
    this.breathing.set(false);
    this.pulse.set(false);
    this.framesReceived.set(0);
    this.framesAccepted.set(0);
    this.framesRejected.set(0);
    this.framesForwarded.set(0);
    this.guidance.set('Show one face and your upper chest in even light.');
    this.cameraState.set('Starting');
    this.message.set('Starting SmartSpectra…');
    try {
      const result = await this.desktop.startNativeMeasurement();
      if (operation !== this.operationId) return;
      if (!result.ok) {
        this.sdkFailureMessage = result.reason === 'api-key-not-configured'
          ? 'Configure SMARTSPECTRA_API_KEY in the Electron main-process environment.'
          : result.reason === 'sdk-unavailable'
            ? 'SmartSpectra is not installed for this development build. See SDK setup.'
            : 'Unable to start SmartSpectra. Check SDK status before retrying.';
        await this.stopPreview('sdk-error');
        return;
      }
      this.measuring.set(true);
      if (this.cameraState() !== 'Error') {
        // A successful SDK start must leave the UI in Running even when the
        // native running event is delayed or absent. Stop then keeps preview.
        this.cameraState.set('Running');
        this.qualityTimer = setInterval(() => this.refreshSignals(), 1000);
        this.message.set('SDK started. Waiting for camera frame confirmation…');
        this.timer = setInterval(() => this.sendFrame(), 33);
        this.sendFrame();
      }
    } catch {
      if (operation === this.operationId) {
        this.sdkFailureMessage = 'The native SDK did not respond.';
        await this.stopPreview('sdk-error');
      }
    } finally {
      if (operation === this.operationId) this.busy.set(false);
    }
  }

  private sendFrame(): void {
    if (!this.measuring() || !this.desktop || !this.context) return;
    const video = this.video?.nativeElement;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !this.stream?.getVideoTracks().some((track) => track.readyState === 'live')) {
      void this.stopPreview('disconnected');
      return;
    }
    try {
      this.context.drawImage(video, 0, 0, 640, 480);
      const pixels = this.context.getImageData(0, 0, 640, 480).data;
      this.desktop.pushCameraFrame({
        width: 640, height: 480,
        timestampUs: Math.round(performance.now() * 1000),
        pixels: new Uint8Array(pixels.buffer),
      });
    } catch {
      void this.stopPreview('disconnected');
    }
  }

  protected async stopMeasurement(): Promise<void> {
    if (!this.desktop) return;
    // Pending native startup cannot be safely stopped with the ordinary
    // measurement-stop IPC. Cancel the session and close the OS camera first.
    if (this.cameraState() === 'Starting' || (this.busy() && this.measuring())) {
      await this.stopPreview('user');
      return;
    }
    if (!this.measuring() || this.busy()) return;
    const operation = this.operationId;
    this.busy.set(true);
    this.clearFrameTimer();
    this.resetSignals();
    this.measuring.set(false);
    this.cameraState.set('Stopping');
    this.message.set('Stopping measurement…');
    try {
      await this.desktop.stopNativeMeasurement();
      // A later Stop camera always wins over a pending native stop response.
      if (operation !== this.operationId) return;
      this.cameraState.set(this.previewing() ? 'Preview active' : 'Off');
      this.message.set(this.previewing()
        ? 'Measurement stopped. Camera preview remains on.'
        : 'Camera stopped. No frames are retained.');
    } catch {
      if (operation === this.operationId) {
        this.sdkFailureMessage = 'Native measurement did not stop cleanly.';
        await this.stopPreview('sdk-error');
      }
    } finally {
      if (operation === this.operationId) this.busy.set(false);
    }
  }

  /** Always available, even during an OS permission prompt or slow SDK start. */
  protected async stopPreview(reason: CameraStopReason = 'user'): Promise<void> {
    const operation = ++this.operationId;
    this.clearFrameTimer();
    this.resetSignals();
    this.measuring.set(false);
    this.releaseStream(); // OS webcam must stop before any awaited native teardown.
    this.previewing.set(false);
    this.activeCameraId.set('');
    this.cameraState.set('Off');
    this.busy.set(true);
    this.cameraAccess.set(reason === 'revoked' ? 'Revoked' :
      reason === 'disconnected' ? 'Unavailable' : 'Released');
    this.message.set(reason === 'revoked'
      ? 'Camera permission revoked. Allow access in system settings before previewing again.'
      : reason === 'disconnected'
        ? 'Camera disconnected or its stream ended. Check the device and try again.'
        : reason === 'switch'
          ? 'Switching camera; measurement stopped…'
          : reason === 'sdk-error'
            ? 'SmartSpectra failed. Releasing the camera and native SDK…'
            : 'Releasing the camera and native SDK…');
    if (this.releaseTask) {
      const released = await this.releaseTask;
      if (operation === this.operationId) {
        this.busy.set(false);
        // Repeated Stop must still report the actual final teardown outcome.
        if (!released) {
          this.message.set('Webcam closed, but native SDK teardown failed. Restart the app before retrying.');
        } else if (reason === 'user') {
          this.message.set('Camera stopped. No frames are retained.');
        } else if (reason === 'sdk-error') {
          this.message.set((this.sdkFailureMessage ?? 'SmartSpectra measurement failed.') +
            ' Camera released. Select Preview camera to retry.');
        }
      }
      return;
    }
    const task = (async (): Promise<boolean> => {
      try {
        await this.desktop?.releaseCameraPreview();
        if (operation === this.operationId && reason === 'user') {
          this.message.set('Camera stopped. No frames are retained.');
        } else if (operation === this.operationId && reason === 'sdk-error') {
          this.message.set((this.sdkFailureMessage ?? 'SmartSpectra measurement failed.') +
            ' Camera released. Select Preview camera to retry.');
        }
        return true;
      } catch {
        if (operation === this.operationId) {
          this.message.set('Webcam closed, but native SDK teardown failed. Restart the app before retrying.');
        }
        return false;
      }
    })();
    this.releaseTask = task;
    try {
      await task;
    } finally {
      if (this.releaseTask === task) this.releaseTask = null;
      if (operation === this.operationId) this.busy.set(false);
    }
  }

  ngOnDestroy(): void {
    ++this.operationId;
    this.clearFrameTimer();
    this.resetSignals();
    this.unsubscribe?.();
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.deviceChanged);
    this.permissionStatus?.removeEventListener?.('change', this.permissionChanged);
    this.releaseStream();
    void this.desktop?.releaseCameraPreview().catch(() => {});
  }
}
