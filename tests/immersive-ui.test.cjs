'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const read = (name) => readFileSync(join(__dirname, '..', name), 'utf8');
const template = read('src/app/app.html');
const css = read('src/app/app.css');
const sceneCss = read('src/app/forest/forest-scene.css');

test('forest takes the window behind an accessible session dock', () => {
  assert.ok(template.indexOf('<app-forest-scene') < template.indexOf('metric-stack'));
  assert.match(css, /app-forest-scene \{ position: absolute; inset: 0/);
  assert.match(sceneCss, /\.forest-viewport \{ position: absolute; inset: 0/);
  assert.match(template, /class="session-dock"/);
  assert.match(template, /class="session-state"[\s\S]*?role="status" aria-live="polite"/);
});

test('floating rate cards are quality-gated and missing values are explicitly not ready', () => {
  assert.match(template, /formatRate\(pulseRate\(\), 'bpm'\)/);
  assert.match(template, /formatRate\(breathingRate\(\), 'breaths\/min'\)/);
  assert.match(template, /pulseRate\(\) === null \? 'Not ready'/);
  assert.match(template, /breathingRate\(\) === null \? 'Not ready'/);
  assert.doesNotMatch(template, /72 bpm|16 breaths\/min|demo waveform/);
});

test('explicit opt-in, independent start and emergency camera stop remain in dock', () => {
  assert.match(template, /\(click\)="enablePreview\(\)"/);
  assert.match(template, /\(click\)="startMeasurement\(\)"/);
  assert.match(template, /\(click\)="stopMeasurement\(\)"/);
  assert.match(template, /\(click\)="stopPreview\(\)"/);
  assert.match(template, /aria-describedby="camera-consent-note"/);
  assert.match(template, /Camera: \{\{ previewing\(\) \? 'On' : 'Off' \}\}/);
  assert.match(template, /<video #cameraVideo autoplay muted playsinline/);
});

test('camera setup and diagnostics remain accessible without a fake signal claim', () => {
  assert.match(template, /<details class="utility-popover camera-menu">/);
  assert.match(template, /<details class="utility-popover diagnostics-menu">/);
  assert.match(template, /<label for="camera-choice">Video input<\/label>/);
  assert.match(template, /Frames received by SDK bridge/);
  assert.match(template, /Only metric packets demonstrate SDK output/);
  assert.match(template, /Not for diagnosis|not for medical diagnosis/);
  assert.match(css, /summary:focus-visible/);
  assert.match(css, /@media \(max-width: 560px\)/);
});
