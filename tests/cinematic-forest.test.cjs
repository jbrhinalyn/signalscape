'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const src = read('src/app/forest/forest-scene.ts');
const css = read('src/app/forest/forest-scene.css');
const effects = read('src/app/forest/hybrid-effects.ts');

test('local cinematic art is independent of measurement data and camera access', () => {
  assert.match(css, /url\('\/assets\/signalscape-forest\.webp'\)/);
  assert.match(src, /class="forest-art" aria-hidden="true"/);
  assert.match(src, /VisualizationSignalEngine/);
  assert.match(src, /this\.visualization\.step\(this\.view, Date\.now\(\)\)/);
  assert.match(src, /this\.visualization\.reset\(\)/);
  assert.doesNotMatch(src, /getUserMedia|startNativeMeasurement|onCameraEvent/);
  assert.doesNotMatch(effects, /getUserMedia|SmartSpectra|mockPulse|setInterval/);
  assert.ok(read('public/assets/signalscape-forest.webp').length > 1000);
});

test('effects are truly animated and use quality-gated uniforms', () => {
  assert.match(src, /forestVisualPose\(this\.visual\.uniforms, ambient, motionEnabled\)/);
  assert.match(src, /this\.effects\?\.update\(/);
  assert.match(effects, /new THREE\.PointsMaterial/);
  assert.match(effects, /new THREE\.ShaderMaterial/);
  assert.match(effects, /ripples\.uniforms\['uEnergy'\]/);
  assert.match(effects, /uMotion.*motionEnabled \? 1 : 0/);
  assert.match(src, /prefers-reduced-motion: reduce/);
  assert.match(src, /visibilitychange/);
  assert.match(src, /cancelAnimationFrame/);
  assert.match(src, /forceContextLoss\(\)/);
});

test('no fake physiology is painted on or hidden behind the visual effects', () => {
  assert.doesNotMatch(src, /72 bpm|16 breaths|healthy|diagnosis result/);
  assert.doesNotMatch(effects, /heartRate|breathingRate|pulseRate|72 bpm/);
  assert.match(src, /Only fresh, stable, quality-approved signals/);
});
