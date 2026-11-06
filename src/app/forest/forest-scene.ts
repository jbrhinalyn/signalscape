import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef,
  NgZone, OnDestroy, ViewChild, inject, signal,
} from '@angular/core';
import * as THREE from 'three';
import { NEUTRAL_UNIFORMS } from '../../../electron/signals/visualization';
import {
  clampPixelRatio, forestLayout, neutralAmbient, type PinePlacement,
} from './scene-layout';

/**
 * M4 scene shell. No camera access or synthetic vital readings are used here.
 * Issue #15 will connect vetted unitless visualization uniforms.
 */
@Component({
  selector: 'app-forest-scene',
  standalone: true,
  template: `
    <section class="forest-panel" aria-labelledby="forest-title">
      <div class="forest-heading">
        <div>
          <p class="forest-eyebrow">M4 · Live landscape preview</p>
          <h2 id="forest-title">Whispering forest</h2>
          <p>A quiet, generative landscape. Camera access is not needed.</p>
        </div>
        <button type="button" class="motion-toggle"
          [attr.aria-pressed]="reducedMotion()" (click)="toggleMotion()">
          {{ reducedMotion() ? 'Enable gentle motion' : 'Reduce motion' }}
        </button>
      </div>
      <div class="forest-viewport">
        <canvas #forestCanvas aria-label="A moonlit evergreen forest with a pond and floating lights"
          role="img"></canvas>
        <div class="forest-caption">Neutral ambience · No sensor-driven effects yet</div>
        @if (unavailable()) {
          <div class="forest-unavailable" role="status">
            3D preview is unavailable. Check hardware acceleration or restart the app.
          </div>
        }
      </div>
      <p class="forest-footnote">Rendering stays on this device. Motion is gentle by default,
        respects your system's reduced-motion setting, and can be changed here.</p>
    </section>
  `,
  styleUrl: './forest-scene.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForestSceneComponent implements AfterViewInit, OnDestroy {
  @ViewChild('forestCanvas', { static: true }) private canvas!: ElementRef<HTMLCanvasElement>;

  private readonly zone = inject(NgZone);
  private readonly media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  private readonly pines: readonly PinePlacement[] = forestLayout();
  protected readonly reducedMotion = signal(this.media?.matches ?? false);
  protected readonly unavailable = signal(false);

  private userOverride: boolean | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private observer: ResizeObserver | null = null;
  private frame: number | null = null;
  private previousTimestamp: number | null = null;
  private elapsedSeconds = 0;
  private foliage: THREE.InstancedMesh[] = [];
  private glowMaterial: THREE.PointsMaterial | null = null;
  private waterMaterial: THREE.MeshStandardMaterial | null = null;
  private lights: THREE.Points | null = null;
  private lightOrigins: Float32Array | null = null;
  private rings: THREE.Mesh[] = [];

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
    this.animateEnvironment();
    this.render();
    this.scheduleFrame();
  };

  ngAfterViewInit(): void {
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
      // An absent WebGL context must never block camera/measurement controls.
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
    scene.background = new THREE.Color('#0a2030');
    scene.fog = new THREE.FogExp2('#0a2030', 0.027);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 110);
    camera.position.set(0, 8.6, 19.5);
    camera.lookAt(1, 1.9, -1.7);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas.nativeElement, antialias: true,
      powerPreference: 'low-power', alpha: false,
    });
    renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.38;
    this.renderer = renderer;

    scene.add(new THREE.HemisphereLight('#aedfd5', '#102a26', 2.2));
    const moon = new THREE.DirectionalLight('#a6e8dd', 2.4);
    moon.position.set(-8, 18, -12);
    scene.add(moon);
    const amber = new THREE.PointLight('#f1c88b', 28, 24, 2);
    amber.position.set(1.4, 4.5, 2);
    scene.add(amber);

    const earth = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: '#18382f', roughness: 0.98 }),
    );
    earth.rotation.x = -Math.PI / 2;
    earth.position.y = -0.09;
    scene.add(earth);

    const shore = new THREE.Mesh(
      new THREE.CircleGeometry(1, 72),
      new THREE.MeshStandardMaterial({ color: '#28594e', roughness: 0.92 }),
    );
    shore.rotation.x = -Math.PI / 2;
    shore.scale.set(4.85, 3.1, 1);
    shore.position.set(4.3, -0.025, -0.6);
    scene.add(shore);

    const waterMaterial = new THREE.MeshStandardMaterial({
      color: '#287a7a', roughness: 0.23, metalness: 0.22,
      emissive: '#0d5755', emissiveIntensity: 0.36,
    });
    this.waterMaterial = waterMaterial;
    const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 72), waterMaterial);
    pond.rotation.x = -Math.PI / 2;
    pond.scale.set(4.35, 2.62, 1);
    pond.position.set(4.3, 0, -0.6);
    scene.add(pond);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: '#8be3d9', transparent: true, opacity: 0.18, depthWrite: false,
    });
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 0.95, 64), ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(4.3, 0.018 + i * 0.008, -0.6);
      ring.scale.set(3.4 - i * 0.65, 1.94 - i * 0.38, 1);
      this.rings.push(ring);
      scene.add(ring);
    }

    // Shared geometries and three instanced canopy layers keep draw calls low.
    const dummy = new THREE.Object3D();
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.16, 0.23, 1, 6),
      new THREE.MeshStandardMaterial({ color: '#5e5142', roughness: 1 }),
      this.pines.length,
    );
    for (let i = 0; i < this.pines.length; i++) {
      const pine = this.pines[i];
      const trunkHeight = pine.height * 0.47;
      dummy.position.set(pine.x, trunkHeight / 2, pine.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(pine.width, trunkHeight, pine.width);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
    }
    trunks.instanceMatrix.needsUpdate = true;
    trunks.frustumCulled = false;
    scene.add(trunks);

    const cone = new THREE.ConeGeometry(1, 1.5, 7);
    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: '#d7e9d4', roughness: 0.96, flatShading: true,
    });
    for (let tier = 0; tier < 3; tier++) {
      const layer = new THREE.InstancedMesh(cone, foliageMaterial, this.pines.length);
      layer.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      layer.frustumCulled = false;
      for (let i = 0; i < this.pines.length; i++) {
        const pine = this.pines[i];
        const shade = new THREE.Color().setHSL(
          0.40 + pine.shade * 0.055, 0.36, 0.17 + tier * 0.035 + pine.shade * 0.05,
        );
        layer.setColorAt(i, shade);
      }
      this.foliage.push(layer);
      scene.add(layer);
    }
    this.updateFoliage(0);

    const stones = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: '#6a8d7a', roughness: 1 }),
      28,
    );
    for (let i = 0; i < 28; i++) {
      const phase = i * 2.39996;
      const radius = 1.4 + (i % 6) * 0.5;
      dummy.position.set(Math.cos(phase) * radius - 0.7, 0.075, Math.sin(phase) * radius + 3);
      dummy.rotation.set(i * 0.3, i * 0.72, 0);
      dummy.scale.set(0.18 + (i % 4) * 0.055, 0.09, 0.18 + (i % 3) * 0.075);
      dummy.updateMatrix();
      stones.setMatrixAt(i, dummy.matrix);
    }
    stones.instanceMatrix.needsUpdate = true;
    scene.add(stones);

    const count = 116;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    let seed = 4019;
    const random = (): number => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let i = 0; i < count; i++) {
      const radius = 2 + Math.sqrt(random()) * 17;
      const angle = random() * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.8 + random() * 6.8;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      const hue = random() > 0.55 ? '#acebd3' : '#e8d5a0';
      const color = new THREE.Color(hue);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const points = new THREE.BufferGeometry();
    points.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    points.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.lightOrigins = positions.slice();
    const glowMaterial = new THREE.PointsMaterial({
      size: 0.12, transparent: true, opacity: 0.45,
      vertexColors: true, depthWrite: false, sizeAttenuation: true,
    });
    this.glowMaterial = glowMaterial;
    this.lights = new THREE.Points(points, glowMaterial);
    scene.add(this.lights);
  }

  private updateFoliage(seconds: number): void {
    const pose = neutralAmbient(seconds, !this.reducedMotion());
    const dummy = new THREE.Object3D();
    for (let tier = 0; tier < this.foliage.length; tier++) {
      const layer = this.foliage[tier];
      for (let i = 0; i < this.pines.length; i++) {
        const pine = this.pines[i];
        const wind = Math.sin(seconds * 0.6 + pine.phase) * pose.sway *
          (NEUTRAL_UNIFORMS.sway / 0.12);
        dummy.position.set(pine.x + wind * (tier + 1) * 0.12,
          pine.height * (0.55 + tier * 0.18), pine.z);
        dummy.rotation.set(0, pine.phase, wind * (tier + 1) * 0.45);
        const width = pine.width * (1.26 - tier * 0.25);
        dummy.scale.set(width, pine.height * (0.42 - tier * 0.06) / 1.5, width);
        dummy.updateMatrix();
        layer.setMatrixAt(i, dummy.matrix);
      }
      layer.instanceMatrix.needsUpdate = true;
    }
  }

  private animateEnvironment(): void {
    const pose = neutralAmbient(this.elapsedSeconds, true);
    this.updateFoliage(this.elapsedSeconds);
    if (this.glowMaterial) {
      this.glowMaterial.opacity = pose.sparkle * (0.72 + NEUTRAL_UNIFORMS.particles);
    }
    if (this.waterMaterial) {
      this.waterMaterial.emissiveIntensity = 0.31 + 0.11 * pose.ripple;
    }
    if (this.lights && this.lightOrigins) {
      const attribute = this.lights.geometry.getAttribute('position') as THREE.BufferAttribute;
      const positions = attribute.array as Float32Array;
      for (let i = 0; i < this.lightOrigins.length / 3; i++) {
        positions[i * 3 + 1] = this.lightOrigins[i * 3 + 1] +
          Math.sin(this.elapsedSeconds * 0.64 + i * 1.7) * 0.26;
      }
      attribute.needsUpdate = true;
    }
    this.rings.forEach((ring, index) => {
      const factor = 1 + 0.026 * Math.sin(this.elapsedSeconds * 0.41 + index * 2.1);
      ring.scale.set((3.4 - index * 0.65) * factor,
        (1.94 - index * 0.38) * factor, 1);
    });
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
      this.updateFoliage(this.elapsedSeconds);
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
        const entries = Array.isArray(object.material) ? object.material : [object.material];
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
    this.foliage = [];
    this.glowMaterial = null;
    this.waterMaterial = null;
    this.lights = null;
    this.lightOrigins = null;
    this.rings = [];
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
