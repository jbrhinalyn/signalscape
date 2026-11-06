'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const src = (path) => readFileSync(join(__dirname, '..', path), 'utf8');
const html = src('src/app/app.html');
const css = src('src/app/app.css');
const app = src('src/app/app.ts');

test('metric cards match reference shapes without shipping fixed sample readings', () => {
  assert.match(html, /class="metric-rhythm pulse-rhythm"/);
  assert.match(html, /class="metric-rhythm breathing-rhythm"/);
  assert.match(html, /formatRate\(pulseRate\(\), 'bpm'\)/);
  assert.match(html, /formatRate\(breathingRate\(\), 'breaths\/min'\)/);
  assert.doesNotMatch(html, /72 bpm|16 breaths\/min/);
});

test('decorative rhythms appear only for quality-gated individual signals', () => {
  assert.match(html, /@if \(pulseRate\(\) !== null\) \{/);
  assert.match(html, /@if \(breathingRate\(\) !== null\) \{/);
  assert.match(html, /rhythmDuration\(pulseRate\(\)\)/);
  assert.match(html, /rhythmDuration\(breathingRate\(\)\)/);
  assert.match(html, /not measured SDK waveforms/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.metric-rhythm path \{ animation: none; \}/);
  assert.match(app, /rate === null \|\| !Number\.isFinite\(rate\) \|\| rate <= 0/);
});

test('quality bars indicate categorical readiness, never a fabricated numeric score', () => {
  assert.match(html, /signalQuality\(\) === 'ready' \? 'Good'/);
  assert.match(html, /Categorical readiness, not a numeric SDK confidence score/);
  assert.match(html, /<i><\/i><i><\/i><i><\/i><i><\/i><i><\/i><i><\/i><i><\/i>/);
  assert.match(css, /data-quality="ready".*nth-child\(n\+6\)/);
});
