'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');
const source = read('src/app/forest/scene-layout.ts');
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', output)(mod, mod.exports);
const { forestLayout, clampPixelRatio, neutralAmbient, FOREST_PINE_COUNT } = mod.exports;

test('a bounded, seeded forest keeps the foreground clearing and lake accessible', () => {
  const a = forestLayout();
  const b = forestLayout();
  assert.equal(a.length, FOREST_PINE_COUNT);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, forestLayout(14027));
  assert.equal(new Set(a.map((tree) => `${tree.x}:${tree.z}`)).size, a.length);
  for (const tree of a) {
    assert.ok(Number.isFinite(tree.x) && Number.isFinite(tree.z));
    assert.ok(tree.height >= 2.8 && tree.height <= 5.9);
    assert.ok(tree.width >= 0.75 && tree.width <= 1.23);
    assert.ok(!(Math.abs(tree.x) < 3.7 && tree.z > -7 && tree.z < 9));
    assert.ok(((tree.x - 4.3) / 5.3) ** 2 +
      ((tree.z + 0.6) / 3.4) ** 2 >= 1.2);
  }
  assert.deepEqual(forestLayout(1, 0), []);
  assert.equal(forestLayout(123, 256).length, 256);
  for (const invalid of [-1, 257, 1.5, NaN, Infinity]) {
    assert.throws(() => forestLayout(1, invalid), RangeError);
  }
});

test('pixel ratio cap prevents unbounded GPU memory on high-DPI displays', () => {
  assert.equal(clampPixelRatio(0.5), 1);
  assert.equal(clampPixelRatio(1), 1);
  assert.equal(clampPixelRatio(1.25), 1.25);
  assert.equal(clampPixelRatio(2), 1.5);
  assert.equal(clampPixelRatio(Infinity), 1);
  assert.equal(clampPixelRatio(NaN), 1);
});

test('neutral animation is gentle, deterministic and motion-off remains static', () => {
  const still = neutralAmbient(10, false);
  assert.deepEqual(still, neutralAmbient(600, false));
  assert.deepEqual(still, { sway: 0, sparkle: 0.45, ripple: 0 });
  assert.deepEqual(neutralAmbient(NaN, true), still);
  for (let seconds = 0; seconds <= 100; seconds += 0.25) {
    const pose = neutralAmbient(seconds, true);
    assert.ok(Math.abs(pose.sway) <= 0.024001);
    assert.ok(pose.sparkle >= 0.37 && pose.sparkle <= 0.53);
    assert.ok(pose.ripple >= 0 && pose.ripple <= 1);
    assert.deepEqual(pose, neutralAmbient(seconds, true));
  }
});

test('Angular maps only the gated SignalView to forest presentation, without starting a camera', () => {
  const app = read('src/app/app.ts');
  const template = read('src/app/app.html');
  const forest = read('src/app/forest/forest-scene.ts');
  assert.match(app, /imports: \[ForestSceneComponent\]/);
  assert.match(template, /<app-forest-scene \[signalView\]="sceneView\(\)" \/>/);
  assert.match(app, /this\.sceneView\.set\(view\)/);
  assert.match(forest, /VisualizationSignalEngine/);
  assert.match(forest, /visualization\.reset\(\)/);
  assert.match(forest, /forestVisualPose/);
  assert.match(forest, /\@Input\(\{ required: true \}\)/);
  assert.match(forest, /prefers-reduced-motion/);
  assert.match(forest, /visibilitychange/);
  assert.match(forest, /ResizeObserver/);
  assert.match(forest, /updateProjectionMatrix\(\)/);
  assert.match(forest, /cancelAnimationFrame/);
  assert.match(forest, /\.dispose\(\)/);
  assert.match(forest, /forceContextLoss\(\)/);
  assert.match(forest, /NEUTRAL_UNIFORMS/);
  assert.doesNotMatch(forest, /getUserMedia|startNativeMeasurement|onCameraEvent/);
  assert.match(forest, /runOutsideAngular/);
});

test('lockfile contains the same pinned Three.js runtime and typing dependencies', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.dependencies.three, '0.181.2');
  assert.equal(pkg.devDependencies['@types/three'], '0.181.0');
  assert.equal(lock.packages[''].dependencies.three, pkg.dependencies.three);
  assert.equal(lock.packages[''].devDependencies['@types/three'], pkg.devDependencies['@types/three']);
  assert.equal(lock.packages['node_modules/three'].version, pkg.dependencies.three);
  assert.equal(lock.packages['node_modules/@types/three'].version,
    pkg.devDependencies['@types/three']);
});
