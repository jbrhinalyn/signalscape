import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input,
  NgZone, OnDestroy, ViewChild, inject, signal,
} from '@angular/core';
import * as THREE from 'three';
import type { SignalView } from '../../../electron/signals/model';
import {
  NEUTRAL_UNIFORMS, VisualizationSignalEngine, type VisualizationFrame,
} from '../../../electron/signals/visualization';
import { forestVisualPose } from './scene-effects';
import { clampPixelRatio, neutralAmbient } from './scene-layout';
import { createHybridEffects, type HybridEffects } from './hybrid-effects';

/**
 * M4.2 hybrid forest: bundled cinematic artwork + genuine Three.js particles
 * and water effects. Consumes ONLY the quality-gated SignalView.
 */
@Component({
  selector: 'app-forest-scene',
  standalone: true,
  template: `
    <section class="forest-panel" aria-labelledby="forest-title">
      <div class="forest-heading">
        <div>
          <p class="forest-eyebrow">M4.2 · Cinematic hybrid landscape</p>
          <h2 id="forest-title">Whispering forest</h2>
          <p>Pulse influences glow and fireflies; breathing guides gentle forest movement.</p>
        </div>
        <div class="motion-actions">
          <button type="button" class="motion-toggle" aria-describedby="forest-motion-status"
            [attr.aria-pressed]="reducedMotion()" (click)="toggleMotion()">
            {{ reducedMotion() ? 'Enable gentle motion' : 'Reduce motion' }}
          </button>
          <span id="forest-motion-status" class="motion-state" aria-live="polite">
            {{ reducedMotion() ? 'Animation paused' : 'Gentle animation enabled' }}
          </span>
        </div>
      </div>
      <div class="forest-viewport">
        <div #forestArt class="forest-art" aria-hidden="true"></div>
        <div #forestGlow class="forest-glow" aria-hidden="true"></div>
        <canvas #forestCanvas
          aria-label="Live floating lights and water highlights over a cinematic forest artwork"
          role="img"></canvas>
        <div class="forest-caption" aria-live="polite">
          @if (signalView.quality === 'disconnected') {
            Neutral ambience · Measurement off
          } @else if (signalView.quality === 'warming') {
            Warming up · Neutral ambience
          } @else if (signalView.quality === 'degraded') {
            Tracking weak · Returning to neutral
          } @else if (activeSources().pulse || activeSources().breathing) {
            {{ activeSources().pulse ? 'Pulse → light + fireflies' : 'Pulse unavailable' }}
            · {{ activeSources().breathing ? 'Breathing → gentle movement' : 'Breathing unavailable' }}
          } @else {
            Waiting for verified signals · Neutral ambience
          }
        </div>
        @if (unavailable()) {
          <div class="forest-unavailable" role="status">
            Animated effects are unavailable. The forest artwork remains visible.
            Check hardware acceleration to restore live visual effects.
          </div>
        }
      </div>
      <p class="forest-footnote">Cinematic artwork is a static, bundled image; the
        Three.js fireflies, light and water highlights are real-time effects.
        Only fresh, stable, quality-approved signals affect their response.
        Reduced motion pauses animation, and camera access is always opt-in.</p>
    </section>
  `,
  styleUrl: './forest-scene.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForestSceneComponent implements AfterViewInit, OnDestroy {
  @ViewChild('forestCanvas', { static: true }) private canvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('forestArt', { static: true }) private art!: ElementRef<HTMLElement>;
  @ViewChild('forestGlow', { static: true }) private glow!: ElementRef<HTMLElement>;

  @Input({ required: true })
  set signalView(value: SignalView) {
    this.view = value;
    if (value.quality === 'disconnected') {
      this.visual = this.visualization.reset();
      this.updateSourceStatus();
    }
    if (this.renderer && !document.hidden &&
      (value.quality === 'disconnected' || this.reducedMotion())) {
      if (value.quality !== 'disconnected') this.stepVisuals();
      this.animateEnvironment(!this.reducedMotion());
      this.render();
    }
  }
  get signalView(): SignalView { return this.view; }

  private readonly zone = inject(NgZone);
  private readonly media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  protected readonly reducedMotion = signal(this.media?.matches ?? false);
  protected readonly unavailable = signal(false);
  protected readonly activeSources = signal({ pulse: false, breathing: false });

  private view: SignalView = {
    quality: 'disconnected', pulse: null, breathing: null,
  };
  private readonly visualization = new VisualizationSignalEngine();
  private visual: VisualizationFrame = {
    uniforms: { ...NEUTRAL_UNIFORMS }, pulseDriven: false,
    breathingDriven: false,
  };
  private userOverride: boolean | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private effects: HybridEffects | null = null;
  private observer: ResizeObserver | null = null;
  private frame: number | null = null;
  private previousTimestamp: number | null = null;
  private elapsedSeconds = 0;

  private readonly systemMotionChanged = (): void => {
    if (this.userOverride !== null) return;
    this.reducedMotion.set(this.media?.matches ?? false);
    this.syncMotion();
  };
  private readonly visibilityChanged = (): void => this.syncMotion();
  private readonly windowResized = (): void => this.resize();
  private readonly contextLost = (event: Event): void => {
    event.preventDefault();
    this.stopFrame();
    this.unavailable.set(true);
  };
  private readonly frameTick = (timestamp: number): void => {
    this.frame = null;
    if (!this.renderer || this.reducedMotion() || document.hidden || this.unavailable()) return;
    const delta = this.previousTimestamp === null ? 0 :
      Math.max(0, Math.min(0.05, (timestamp - this.previousTimestamp) / 1000));
    this.previousTimestamp = timestamp;
    this.elapsedSeconds += delta;
    this.stepVisuals();
    this.animateEnvironment(true);
    this.render();
    this.scheduleFrame();
  };

  ngAfterViewInit(): void {
    // Relative asset URL is safe for ng serve and packaged Electron file://.
    const artwork = new URL('assets/signalscape-forest.webp', document.baseURI);
    this.art.nativeElement.style.backgroundImage = `url("${artwork.href}")`;
    this.media?.addEventListener('change', this.systemMotionChanged);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    window.addEventListener('resize', this.windowResized);
    this.canvas.nativeElement.addEventListener('webglcontextlost', this.contextLost);
    try {
      this.createScene();
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(this.canvas.nativeElement.parentElement!);
      }
      this.resize();
      this.syncMotion();
    } catch {
      // A WebGL failure never blocks the artwork or live camera controls.
      this.unavailable.set(true);
      this.disposeScene();
    }
  }

  protected toggleMotion(): void {
    this.userOverride = !this.reducedMotion();
    this.reducedMotion.set(this.userOverride);
    this.syncMotion();
  }

  private createScene(): void {
    const scene = new THREE.Scene();
    this.scene = scene;
    const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 110);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    this.camera = camera;
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas.nativeElement, antialias: true,
      powerPreference: 'low-power', alpha: true,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.effects = createHybridEffects(scene);
  }

  private stepVisuals(): void {
    this.visual = this.visualization.step(this.view, Date.now());
    this.updateSourceStatus();
  }

  private updateSourceStatus(): void {
    const previous = this.activeSources();
    const pulse = this.visual.pulseDriven;
    const breathing = this.visual.breathingDriven;
    if (previous.pulse === pulse && previous.breathing === breathing) return;
    this.zone.run(() => this.activeSources.set({ pulse, breathing }));
  }

  private animateEnvironment(motionEnabled: boolean): void {
    const ambient = neutralAmbient(this.elapsedSeconds, motionEnabled);
    const pose = forestVisualPose(this.visual.uniforms, ambient, motionEnabled);
    this.effects?.update(
      this.elapsedSeconds, pose.fireflyOpacity, pose.fireflySize,
      pose.rippleAmplitude, motionEnabled,
    );

    // These are CSS transformations of ARTWORK, not camera frames or metrics.
    const sway = motionEnabled ? Math.max(-8, Math.min(8, pose.foliageSway * 90)) : 0;
    this.art.nativeElement.style.setProperty('--forest-shift', `${sway.toFixed(2)}px`);
    const brightness = Math.max(0.08, Math.min(0.52,
      0.12 + pose.fireflyOpacity * 0.45));
    this.glow.nativeElement.style.setProperty('--signal-glow', brightness.toFixed(3));
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const parent = this.canvas.nativeElement.parentElement;
    if (!parent) return;
    const width = Math.max(1, Math.round(parent.clientWidth));
    const height = Math.max(1, Math.round(parent.clientHeight));
    this.renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }
  private render(): void {
    if (this.renderer && this.scene && this.camera && !this.unavailable()) {
      this.renderer.render(this.scene, this.camera);
    }
  }
  private stopFrame(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.previousTimestamp = null;
  }
  private scheduleFrame(): void {
    if (this.frame !== null || !this.renderer || this.reducedMotion() ||
      document.hidden || this.unavailable()) return;
    this.zone.runOutsideAngular(() => {
      this.frame = requestAnimationFrame(this.frameTick);
    });
  }
  private syncMotion(): void {
    this.stopFrame();
    if (this.reducedMotion()) {
      this.stepVisuals();
      this.animateEnvironment(false);
      this.render();
    } else {
      this.scheduleFrame();
    }
  }
  private disposeScene(): void {
    this.stopFrame();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene?.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        const entries = Array.isArray(object.material)
          ? object.material : [object.material];
        for (const material of entries) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.scene?.clear();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.effects = null;
    this.visual = this.visualization.reset();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.media?.removeEventListener('change', this.systemMotionChanged);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    window.removeEventListener('resize', this.windowResized);
    this.canvas.nativeElement.removeEventListener('webglcontextlost', this.contextLost);
    this.disposeScene();
  }
}
