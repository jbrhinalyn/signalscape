import * as THREE from 'three';

/**
 * Decorative detail layer for the M4.1 landscape. Does not read camera data,
 * manufacture measurements or run its own animation timer.
 * Everything is registered on the parent Three.js scene for teardown.
 */
export interface CinematicDetails {
  update(seconds: number, pondEnergy: number, motion: boolean): void;
}

export function createCinematicDetails(scene: THREE.Scene): CinematicDetails {
  // Water reflections are procedural, not screen-space screenshots or
  // invented biometric waveforms. The input is the existing gated visual pose.
  const water = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0.36 },
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
        vec2 p = (vUv - 0.5) * 2.0;
        float flow = sin(p.y * 48.0 + sin(p.x * 17.0) * 3.0
          - uTime * 1.3 * uMotion);
        float crossFlow = sin(p.x * 39.0 - p.y * 12.0
          + uTime * 0.8 * uMotion);
        float glint = pow(max(0.0, flow * crossFlow), 7.0);
        float deep = smoothstep(-1.1, 0.9, p.y);
        vec3 base = mix(vec3(0.02, 0.19, 0.28), vec3(0.08, 0.32, 0.44), deep);
        vec3 cyan = vec3(0.22, 0.91, 1.0);
        vec3 violet = vec3(0.74, 0.37, 1.0);
        float reflection = 0.5 + 0.5 * sin(p.x * 7.0 + p.y * 5.0);
        vec3 highlight = mix(cyan, violet, reflection);
        base += highlight * (0.05 + glint * (0.27 + uEnergy * 0.28));
        float bank = smoothstep(1.0, 0.62, length(p));
        gl_FragColor = vec4(base, 0.76 * bank);
      }
    `,
  });
  const reflectivePond = new THREE.Mesh(new THREE.CircleGeometry(1, 128), water);
  reflectivePond.rotation.x = -Math.PI / 2;
  reflectivePond.scale.set(4.34, 2.61, 1);
  reflectivePond.position.set(4.3, 0.012, -0.6);
  reflectivePond.renderOrder = 2;
  scene.add(reflectivePond);

  // Seeded positions keep startup deterministic across machines.
  let seed = 20261107;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const onGround = (): { x: number; z: number } => {
    for (let i = 0; i < 50; i++) {
      const x = (random() - 0.5) * 43;
      const z = random() * 24 - 8;
      if (((x - 4.3) / 5.3) ** 2 + ((z + 0.6) / 3.4) ** 2 > 1.3) {
        return { x, z };
      }
    }
    return { x: -8, z: 4 };
  };

  const dummy = new THREE.Object3D();
  const grassCount = 2500;
  const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.065, 0.5, 3),
    new THREE.MeshStandardMaterial({
      color: '#c8e7d6', roughness: 1, side: THREE.DoubleSide,
    }),
    grassCount,
  );
  for (let i = 0; i < grassCount; i++) {
    const pos = onGround();
    const height = 0.5 + random() * 1.3;
    dummy.position.set(pos.x, height * 0.23, pos.z);
    dummy.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.3);
    dummy.scale.set(0.6 + random() * 0.65, height, 0.55 + random() * 0.45);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    const shade = random();
    grass.setColorAt(i, new THREE.Color().setHSL(
      0.36 + shade * 0.16, 0.38 + shade * 0.16, 0.14 + shade * 0.2,
    ));
  }
  grass.instanceMatrix.needsUpdate = true;
  grass.frustumCulled = false;
  scene.add(grass);

  // Layered fluorescent wildflowers form foreground depth and pond-side detail.
  const flowersCount = 380;
  const stem = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.018, 0.025, 0.45, 4),
    new THREE.MeshStandardMaterial({ color: '#326b5d', roughness: 0.92 }),
    flowersCount,
  );
  const flowers = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.14, 1),
    new THREE.MeshStandardMaterial({
      color: '#ffffff', emissive: '#845bca', emissiveIntensity: 0.65,
      roughness: 0.7,
    }),
    flowersCount,
  );
  for (let i = 0; i < flowersCount; i++) {
    const pos = onGround();
    const height = 0.28 + random() * 0.35;
    const scale = 0.45 + random() * 0.85;
    dummy.position.set(pos.x, height / 2, pos.z);
    dummy.rotation.set(0, 0, (random() - 0.5) * 0.22);
    dummy.scale.set(1, height / 0.45, 1);
    dummy.updateMatrix();
    stem.setMatrixAt(i, dummy.matrix);
    dummy.position.set(pos.x, height, pos.z);
    dummy.rotation.set(random(), random(), random());
    dummy.scale.set(scale, scale * 0.7, scale);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, new THREE.Color(
      i % 5 === 0 ? '#fff0a6' : i % 4 === 0 ? '#86eaff'
        : i % 3 === 0 ? '#d7a6ff' : '#e89cfa',
    ));
  }
  stem.instanceMatrix.needsUpdate = true;
  flowers.instanceMatrix.needsUpdate = true;
  stem.frustumCulled = false;
  flowers.frustumCulled = false;
  scene.add(stem, flowers);

  // Soft luminous mushroom caps provide color at the closest forest layers.
  const mushroomCount = 76;
  const caps = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: '#d8acff', emissive: '#8657c9', emissiveIntensity: 0.72,
      roughness: 0.62, side: THREE.DoubleSide,
    }),
    mushroomCount,
  );
  const stalks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.028, 0.05, 0.38, 6),
    new THREE.MeshStandardMaterial({ color: '#92cbd2', roughness: 0.9 }),
    mushroomCount,
  );
  for (let i = 0; i < mushroomCount; i++) {
    const pos = onGround();
    const size = 0.6 + random() * 1.2;
    dummy.position.set(pos.x, 0.38 * size, pos.z);
    dummy.rotation.set(0, random() * 6.28, 0);
    dummy.scale.set(size, size * 0.48, size);
    dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
    dummy.position.set(pos.x, 0.18 * size, pos.z);
    dummy.scale.set(size, size, size);
    dummy.updateMatrix();
    stalks.setMatrixAt(i, dummy.matrix);
    caps.setColorAt(i, new THREE.Color(i % 3 === 0 ? '#83dcff' : '#c4a3ff'));
  }
  caps.instanceMatrix.needsUpdate = true;
  stalks.instanceMatrix.needsUpdate = true;
  caps.frustumCulled = false;
  stalks.frustumCulled = false;
  scene.add(caps, stalks);

  // Translucent distance haze creates atmospheric depth without frame buffers
  // or expensive postprocessing. It is visual ambience, not measurement data.
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 20),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          float gradient = exp(-pow((vUv.y - 0.36) * 3.8, 2.0));
          float fade = smoothstep(0.0, 0.25, vUv.x)
            * smoothstep(1.0, 0.75, vUv.x);
          vec3 color = mix(vec3(0.08, 0.35, 0.45),
            vec3(0.32, 0.23, 0.52), vUv.x);
          gl_FragColor = vec4(color, 0.21 * gradient * fade);
        }
      `,
    }),
  );
  haze.position.set(1, 5.8, -19);
  scene.add(haze);

  const shoreLight = new THREE.PointLight('#58d7f3', 6, 12, 2);
  shoreLight.position.set(4.3, 1.3, -0.6);
  scene.add(shoreLight);

  return {
    update(seconds: number, pondEnergy: number, motion: boolean): void {
      water.uniforms['uTime'].value = motion ? seconds : 0;
      water.uniforms['uMotion'].value = motion ? 1 : 0;
      water.uniforms['uEnergy'].value = Math.max(0, Math.min(1.5, pondEnergy));
    },
  };
}
