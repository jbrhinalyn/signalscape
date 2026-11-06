'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const src = readFileSync(join(__dirname, '..', 'src/app/forest/forest-scene.ts'), 'utf8');

test('cinematic scene remains procedurally rendered and sensor-gated', () => {
  assert.match(src, /new THREE\.InstancedMesh\([\s\S]*?luminousLeaves/);
  assert.match(src, /pose\.fireflyOpacity \* 0\.42/);
  assert.match(src, /this\.heroGlowMaterial = null/);
  assert.match(src, /this\.visualization\.step\(this\.view, Date\.now\(\)\)/);
  assert.doesNotMatch(src, /TextureLoader|ImageLoader|externalForest|fakePulse/);
});
