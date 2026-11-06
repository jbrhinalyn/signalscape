'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const scene = readFileSync(join(__dirname, '..', 'src/app/forest/forest-scene.ts'), 'utf8');
const details = readFileSync(join(__dirname, '..', 'src/app/forest/cinematic-details.ts'), 'utf8');

test('additional landscape geometry stays procedural, seeded and scene-owned', () => {
  assert.match(details, /const grassCount = 2500/);
  assert.match(details, /const flowersCount = 380/);
  assert.match(details, /const mushroomCount = 76/);
  assert.match(details, /new THREE\.ShaderMaterial/);
  assert.match(scene, /this\.cinematic = createCinematicDetails\(scene\)/);
  assert.match(scene, /this\.cinematic\?\.update\(this\.elapsedSeconds, pose\.pondEmission, motionEnabled\)/);
});

test('water follows existing visual pose and motion preference, not made-up vitals', () => {
  assert.match(details, /uEnergy.*Math\.max\(0, Math\.min\(1\.5, pondEnergy\)\)/);
  assert.match(details, /uMotion.*motion \? 1 : 0/);
  assert.doesNotMatch(details, /getUserMedia|SmartSpectra|mockPulse|setInterval|requestAnimationFrame/);
});
