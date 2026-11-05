import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import type { CameraEvent } from '../../electron/ipc/contracts';

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
  private unsubscribe: (() => void) | null = null;

  protected readonly runtime = this.desktop ? 'Electron desktop' : 'Browser preview';
  protected readonly desktopVersion = signal<string | null>(null);
  protected readonly nativeAvailable = Boolean(this.desktop);
  protected readonly busy = signal(false);
  protected readonly previewing = signal(false);
  protected readonly measuring = signal(false);
  protected readonly cameraState = signal('Off');
  protected readonly guidance = signal('Show your face and upper chest within the frame.');
  protected readonly message = signal('No camera access until you choose Preview camera.');
  protected readonly packets = signal(0);
  protected readonly breathing = signal(false);
  protected readonly pulse = signal(false);
  protected readonly framesReceived = signal(0);
  protected readonly framesAccepted = signal(0);
  protected readonly framesRejected = signal(0);
  protected readonly framesForwarded = signal(0);

  private clearFrameTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  constructor() {
    this.canvas.width = 640;
    this.canvas.height = 480;
    if (!this.desktop) return;
    this.unsubscribe = this.desktop.onCameraEvent((event) => this.handleCameraEvent(event));
    void this.desktop.getAppStatus().then((status) => {
      if (status.apiVersion === 1) this.desktopVersion.set(status.version);
    }).catch(() => this.desktopVersion.set(null));
  }

  private handleCameraEvent(event: CameraEvent): void {
    if (event.kind === 'validation') {
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
        this.clearFrameTimer();
        this.message.set('SmartSpectra reported an error' +
          (event.errorCode == null ? '.' : ' (code ' + event.errorCode + ').') +
          ' Stop measurement or camera to retry.');
      } else if (event.state === 'stopped') {
        this.clearFrameTimer();
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

  protected async enablePreview(): Promise<void> {
    if (!this.desktop || this.previewing() || this.busy()) return;
    this.busy.set(true);
    try {
      await this.desktop.authorizeCameraPreview();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 }, facingMode: 'user' },
      });
      const video = this.video?.nativeElement;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('preview-element-not-found');
      }
      this.stream = stream;
      video.srcObject = stream;
      await video.play();
      this.previewing.set(true);
      this.cameraState.set('Preview active');
      this.message.set('Preview is local and is not recorded. You can start a measurement or stop.');
    } catch {
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      await this.desktop.releaseCameraPreview().catch(() => {});
      this.message.set('Camera unavailable or permission denied. Check system settings and try again.');
      this.cameraState.set('Off');
    } finally {
      this.busy.set(false);
    }
  }

  protected async startMeasurement(): Promise<void> {
    if (!this.desktop || !this.stream || this.measuring() || this.busy()) return;
    this.busy.set(true);
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
      if (!result.ok) {
        this.cameraState.set('Preview active');
        this.message.set(result.reason === 'api-key-not-configured'
          ? 'Configure SMARTSPECTRA_API_KEY in the Electron main-process environment.'
          : result.reason === 'sdk-unavailable'
            ? 'SmartSpectra is not installed for this development build. See SDK setup.'
            : 'Unable to start the measurement. Check the camera and try again.');
        return;
      }
      this.measuring.set(true);
      if (this.cameraState() !== 'Error') {
        this.message.set('SDK started. Waiting for camera frame confirmation…');
        this.timer = setInterval(() => this.sendFrame(), 33);
        this.sendFrame();
      }
    } catch {
      this.cameraState.set('Preview active');
      this.message.set('The native SDK did not respond. Stop the camera and retry.');
    } finally {
      this.busy.set(false);
    }
  }

  private sendFrame(): void {
    if (!this.measuring() || !this.desktop || !this.context) return;
    const video = this.video?.nativeElement;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !this.stream?.getVideoTracks().some((track) => track.readyState === 'live')) {
      this.message.set('Camera stream disconnected. Stop the session and check permissions.');
      void this.stopPreview();
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
      this.message.set('Unable to read the camera frame. Stop the session and try again.');
      void this.stopPreview();
    }
  }

  protected async stopMeasurement(): Promise<void> {
    if (!this.desktop || this.busy() || !this.measuring()) return;
    this.busy.set(true);
    this.clearFrameTimer();
    this.measuring.set(false);
    this.cameraState.set('Stopping');
    this.message.set('Stopping measurement…');
    try {
      await this.desktop.stopNativeMeasurement();
      this.cameraState.set(this.previewing() ? 'Preview active' : 'Off');
      this.message.set(this.previewing()
        ? 'Measurement stopped. Camera preview remains on.'
        : 'Camera stopped. No frames are retained.');
    } catch {
      this.message.set('Native measurement did not stop cleanly. Close the camera to release it.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async stopPreview(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    // Release the OS webcam BEFORE waiting for native teardown, which can
    // be slow or fail. Do not leave the camera active behind a pending SDK.
    this.clearFrameTimer();
    this.measuring.set(false);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) this.video.nativeElement.srcObject = null;
    this.previewing.set(false);
    this.cameraState.set('Off');
    this.message.set('Releasing the camera and native SDK…');
    try {
      await this.desktop?.releaseCameraPreview();
      this.message.set('Camera stopped. No frames are retained.');
    } catch {
      this.message.set('Webcam closed, but native SDK teardown failed. Close the app before retrying.');
    } finally {
      this.busy.set(false);
    }
  }

  ngOnDestroy(): void {
    this.clearFrameTimer();
    this.unsubscribe?.();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.desktop?.releaseCameraPreview().catch(() => {});
  }
}
