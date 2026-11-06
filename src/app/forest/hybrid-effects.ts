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
      ripples.uniforms['uTime'].value = motionEnabled ? seconds : 0;
      ripples.uniforms['uMotion'].value = motionEnabled ? 1 : 0;
      ripples.uniforms['uEnergy'].value = Math.max(
        0, Math.min(1.5, rippleAmplitude),
      );
    },
  };
}
