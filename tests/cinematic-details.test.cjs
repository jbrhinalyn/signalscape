'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const scene = readFileSync(join(__dirname, '..', 'src/app/forest/forest-scene.ts'), 'utf8');
const effects = readFileSync(join(__dirname, '..', 'src/app/forest/hybrid-effects.ts'), 'utf8');

test('hybrid effects replace the earlier geometric meadow without changing signal gates', () => {
  assert.match(scene, /createHybridEffects\(scene\)/);
  assert.match(scene, /VisualizationSignalEngine/);
  assert.match(scene, /this\.visualization\.reset\(\)/);
  assert.match(effects, /new THREE\.BufferGeometry/);
  assert.match(effects, /new THREE\.PlaneGeometry/);
});

test('decorative animations stop under reduced motion and do not start a camera', () => {
  assert.match(scene, /this\.effects\?\.update\(/);
  assert.match(scene, /this\.reducedMotion\(\)/);
  assert.match(effects, /motionEnabled \? seconds : 0/);
  assert.doesNotMatch(effects, /getUserMedia|startNativeMeasurement|fakePulse/);
});
