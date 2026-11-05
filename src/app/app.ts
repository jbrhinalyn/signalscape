import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly runtime = window.signalScape?.apiVersion === 1
    ? 'Electron desktop'
    : 'Browser preview';
  protected readonly desktopVersion = signal<string | null>(null);

  constructor() {
    const desktop = window.signalScape;
    if (desktop?.apiVersion !== 1) return;

    // A browser preview has no desktop bridge and never makes an IPC request.
    void desktop.getAppStatus().then((status) => {
      if (status.apiVersion === 1) this.desktopVersion.set(status.version);
    }).catch(() => {
      // Keep the renderer usable if the native process becomes unavailable.
      this.desktopVersion.set(null);
    });
  }
}
