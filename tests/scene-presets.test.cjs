'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const read = (p) => readFileSync(join(__dirname, '..', p), 'utf8');
const scene = read('src/app/forest/forest-scene.ts');
const css = read('src/app/forest/forest-scene.css');
const effects = read('src/app/forest/hybrid-effects.ts');

test('five offline, labeled background looks use the approved artwork without remote fetch', () => {
  for (const name of ['Enchanted Forest', 'Moonlit Blue', 'Emerald Dawn',
    'Golden Hour', 'Mystic Violet']) assert.ok(scene.includes(name), name);
  assert.match(scene, /selectedScene = signal<SceneId>\('original'\)/);
  assert.match(scene, /\[attr\.data-scene\]="selectedScene\(\)"/);
  assert.match(scene, /new URL\('assets\/signalscape-forest\.webp', document\.baseURI\)/);
  assert.match(css, /data-scene="moonlight"/);
  assert.match(css, /data-scene="golden"/);
  assert.match(scene, /\[attr\.aria-pressed\]="selectedScene\(\) === preset\.id"/);
  assert.match(scene, /window\.localStorage\?\.setItem\(SCENE_KEY, value\)/);
});

test('sparkle layer reacts only to gated visual energy, not direct vital measurements', () => {
  assert.match(effects, /const sparkleCount = 96;/);
  assert.match(effects, /new THREE\.ShaderMaterial/);
  assert.match(effects, /sparkleMaterial\.uniforms\['uTime'\]\.value = motionEnabled \? seconds : 0/);
  assert.match(effects, /0\.15 \+ fireflyOpacity \* 0\.52/);
  assert.match(scene, /this\.visualization\.step\(this\.view, Date\.now\(\)\)/);
  assert.doesNotMatch(effects, /getUserMedia|rateBpm|fakePulse|setInterval/);
});

test('scene switching does not manipulate camera or measurement state', () => {
  const method = scene.slice(scene.indexOf('protected chooseScene'),
    scene.indexOf('private view: SignalView'));
  assert.doesNotMatch(method, /stopMeasurement|startMeasurement|stopPreview|enablePreview|cameraState\.set|measuring\.set/);
});
