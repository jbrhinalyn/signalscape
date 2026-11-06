import * as THREE from 'three';

/**
 * Transparent real-time highlights drawn over the local forest artwork.
 * This layer never reads the webcam or invents physiological signals.
 */
export interface HybridEffects {
  update(
    seconds: number, fireflyOpacity: number, fireflySize: number,
    rippleAmplitude: number, motionEnabled: boolean,
  ): void;
}

export function createHybridEffects(scene: THREE.Scene): HybridEffects {
  let seed = 20261107;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const count = 144;
  const points = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = ['#d8d0ff', '#72e8fb', '#f1b9ff', '#f8e3a2'];
  for (let i = 0; i < count; i++) {
    points[i * 3] = (random() - 0.5) * 31;
    points[i * 3 + 1] = (random() - 0.5) * 16;
    points[i * 3 + 2] = (random() - 0.5) * 2;
    const color = new THREE.Color(palette[i % palette.length]);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const origins = points.slice();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.12, transparent: true, opacity: 0.32, vertexColors: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(geometry, material));

  // High-contrast pinprick sparkles are a separate GPU-light Points layer.
  // Twinkling is decorative, not a pulse or breathing waveform.
  const sparkleCount = 96;
  const sparkleGeometry = new THREE.BufferGeometry();
  const sparklePositions = new Float32Array(sparkleCount * 3);
  const sparklePhases = new Float32Array(sparkleCount);
  const sparkleSizes = new Float32Array(sparkleCount);
  const sparkleColors = new Float32Array(sparkleCount * 3);
  for (let i = 0; i < sparkleCount; i++) {
    sparklePositions[i * 3] = (random() - 0.5) * 31;
    sparklePositions[i * 3 + 1] = (random() - 0.5) * 14;
    sparklePositions[i * 3 + 2] = (random() - 0.5) * 1.3 + 0.8;
    sparklePhases[i] = random() * Math.PI * 2;
    sparkleSizes[i] = 2.8 + random() * 4.4;
    const c = new THREE.Color(palette[(i + 1) % palette.length]);
    sparkleColors[i * 3] = c.r;
    sparkleColors[i * 3 + 1] = c.g;
    sparkleColors[i * 3 + 2] = c.b;
  }
  sparkleGeometry.setAttribute('position',
    new THREE.BufferAttribute(sparklePositions, 3));
  sparkleGeometry.setAttribute('aPhase',
    new THREE.BufferAttribute(sparklePhases, 1));
  sparkleGeometry.setAttribute('aSize',
    new THREE.BufferAttribute(sparkleSizes, 1));
  sparkleGeometry.setAttribute('color',
    new THREE.BufferAttribute(sparkleColors, 3));
  const sparkleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.22 },
    },
    vertexShader: `
      attribute float aPhase;
      attribute float aSize;
      attribute vec3 color;
      uniform float uTime;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = color;
        vTwinkle = 0.47 + 0.53 * pow(
          0.5 + 0.5 * sin(uTime * 1.35 + aPhase), 2.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * clamp(20.0 / -mvPosition.z, 0.4, 1.5);
      }
    `,
    fragmentShader: `
      uniform float uIntensity;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 q = gl_PointCoord.xy - vec2(0.5);
        float radius = length(q);
        float core = 1.0 - smoothstep(0.04, 0.18, radius);
        float cross = exp(-abs(q.x) * 52.0) * exp(-abs(q.y) * 6.0)
          + exp(-abs(q.y) * 52.0) * exp(-abs(q.x) * 6.0);
        float glow = exp(-radius * radius * 22.0) * 0.42;
        float a = (core + cross * 0.25 + glow) * vTwinkle * uIntensity;
        gl_FragColor = vec4(vColor * 1.6, clamp(a, 0.0, 1.0));
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(sparkleGeometry, sparkleMaterial));

  // Subtle caustic-like glimmers across the artwork's lower stream.
  // The existing quality-gated visualization pose controls intensity.
  const ripples = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uMotion: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uEnergy;
      uniform float uMotion;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float wave = sin(p.y * 72.0 + p.x * 12.0
          - uTime * uMotion * 1.4);
        float crossWave = sin(p.x * 34.0 - p.y * 9.0
          + uTime * uMotion * 0.7);
        float fleck = pow(max(0.0, wave * crossWave), 9.0);
        float edge = (1.0 - smoothstep(0.4, 1.0, abs(p.x)))
          * (1.0 - smoothstep(0.35, 1.0, abs(p.y)));
        vec3 cyan = vec3(0.2, 0.91, 1.0);
        vec3 violet = vec3(0.75, 0.37, 1.0);
        vec3 color = mix(cyan, violet, 0.5 + 0.5 * sin(p.x * 7.0));
        float alpha = edge * fleck * (0.07 + min(1.0, uEnergy) * 0.26);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const waterOverlay = new THREE.Mesh(new THREE.PlaneGeometry(26, 5), ripples);
  waterOverlay.position.set(0, -5.0, 0.2);
  scene.add(waterOverlay);

  return {
    update(
      seconds: number, fireflyOpacity: number, fireflySize: number,
      rippleAmplitude: number, motionEnabled: boolean,
    ): void {
      material.opacity = Math.max(0.10, Math.min(0.85, fireflyOpacity));
      material.size = Math.max(0.07, Math.min(0.35, fireflySize));
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
      const positions = attribute.array as Float32Array;
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] = origins[i * 3 + 1] +
          (motionEnabled ? Math.sin(seconds * 0.35 + i * 1.7) * 0.22 : 0);
      }
      attribute.needsUpdate = true;
      sparkleMaterial.uniforms['uTime'].value = motionEnabled ? seconds : 0;
      // Neutral sparkles remain gentle; only validated visual pose intensifies
      // their glow. Paused/reduced-motion renders are temporally static.
      sparkleMaterial.uniforms['uIntensity'].value = Math.max(0.12,
        Math.min(0.75, 0.15 + fireflyOpacity * 0.52));
      ripples.uniforms['uTime'].value = motionEnabled ? seconds : 0;
      ripples.uniforms['uMotion'].value = motionEnabled ? 1 : 0;
      ripples.uniforms['uEnergy'].value = Math.max(
        0, Math.min(1.5, rippleAmplitude),
      );
    },
  };
}
