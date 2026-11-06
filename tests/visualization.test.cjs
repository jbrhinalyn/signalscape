'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

function loadTypeScript(path, imports = {}) {
  const source = readFileSync(join(__dirname, '..', path), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      assert.ok(Object.hasOwn(imports, id), `unexpected import: ${id}`);
      return imports[id];
    }, loaded, loaded.exports,
  );
  return loaded.exports;
}

const model = loadTypeScript('electron/signals/model.ts');
const { VisualizationSignalEngine, NEUTRAL_UNIFORMS,
  DEFAULT_VISUALIZATION_OPTIONS } =
  loadTypeScript('electron/signals/visualization.ts', { './model': model });

const rate = (signal, timestampMs, overrides = {}) => ({
  kind: 'rate', signal, timestampMs,
  unit: signal === 'pulse' ? 'bpm' : 'breaths/min',
  value: signal === 'pulse' ? 75 : 18,
  confidence: 95, stable: true, ...overrides,
});
const view = (pulse = null, breathing = null, quality = 'ready') =>
  ({ quality, pulse, breathing });
const near = (actual, expected, epsilon = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `expected ${actual} ≈ ${expected}`);

test('starts neutral, emits unitless visual controls and never synthesizes vital readings', () => {
  const engine = new VisualizationSignalEngine();
  const initial = engine.step(view(null, null, 'warming'), 1000);
  assert.deepEqual(initial, {
    uniforms: NEUTRAL_UNIFORMS, pulseDriven: false, breathingDriven: false,
  });
  assert.deepEqual(Object.keys(initial).sort(),
    ['breathingDriven', 'pulseDriven', 'uniforms']);
  assert.deepEqual(Object.keys(initial.uniforms).sort(), ['glow', 'particles', 'sway']);
  assert.equal(JSON.stringify(initial).includes('bpm'), false);
  assert.equal(JSON.stringify(initial).includes('rate'), false);
  assert.deepEqual(DEFAULT_VISUALIZATION_OPTIONS, {
    attackMs: 800, releaseMs: 500, maxAgeMs: 3000,
  });
});

test('time-constant smoothing is independent of update cadence for constant inputs', () => {
  const event = rate('pulse', 1000);
  const single = new VisualizationSignalEngine();
  const frequent = new VisualizationSignalEngine();
  single.step(view(event), 1000);
  frequent.step(view(event), 1000);
  const once = single.step(view(event), 1800);
  let many;
  for (let t = 1100; t <= 1800; t += 100) {
    many = frequent.step(view(event), t);
  }
  near(once.uniforms.glow, many.uniforms.glow);
  near(once.uniforms.particles, many.uniforms.particles);
  near(once.uniforms.sway, NEUTRAL_UNIFORMS.sway);
  assert.equal(once.pulseDriven, true);
  assert.equal(once.breathingDriven, false);
  const target = 0.25 + 0.60 * ((75 - 40) / (110 - 40));
  near(once.uniforms.glow,
    NEUTRAL_UNIFORMS.glow + (target - NEUTRAL_UNIFORMS.glow) * (1 - Math.exp(-1)));
});

test('bursty jitter stays bounded and never jumps to raw visual targets', () => {
  const engine = new VisualizationSignalEngine({ attackMs: 1000, releaseMs: 1000 });
  engine.step(view(rate('pulse', 1000)), 1000);
  let previous = NEUTRAL_UNIFORMS.glow;
  for (let i = 1; i <= 25; i++) {
    const now = 1000 + i * 40;
    const output = engine.step(view(rate('pulse', now, {
      value: i % 2 ? 110 : 40,
    })), now);
    assert.ok(Math.abs(output.uniforms.glow - previous) < 0.03);
    assert.ok(output.uniforms.glow >= NEUTRAL_UNIFORMS.glow);
    assert.ok(output.uniforms.glow <= 0.85);
    assert.ok(output.uniforms.particles >= NEUTRAL_UNIFORMS.particles);
    assert.equal(output.pulseDriven, true);
    previous = output.uniforms.glow;
  }
});

test('low confidence, instability, malformed events and degraded quality immediately suspend mapping', () => {
  const engine = new VisualizationSignalEngine({ attackMs: 100, releaseMs: 200 });
  engine.step(view(rate('pulse', 1000), rate('breathing', 1000)), 1000);
  const active = engine.step(view(rate('pulse', 1100), rate('breathing', 1100)), 1100);
  assert.equal(active.pulseDriven, true);
  assert.equal(active.breathingDriven, true);
  assert.ok(active.uniforms.glow > NEUTRAL_UNIFORMS.glow);
  assert.ok(active.uniforms.sway > NEUTRAL_UNIFORMS.sway);

  const blocked = engine.step(view(
    rate('pulse', 1200, { confidence: 69 }),
    rate('breathing', 1200, { stable: false })), 1200);
  assert.equal(blocked.pulseDriven, false);
  assert.equal(blocked.breathingDriven, false);
  assert.ok(blocked.uniforms.glow < active.uniforms.glow);
  assert.ok(blocked.uniforms.sway < active.uniforms.sway);

  const malformed = engine.step(view(
    rate('pulse', 1300, { unit: 'breaths/min' }),
    rate('breathing', 1300, { value: 999 })), 1300);
  assert.equal(malformed.pulseDriven, false);
  assert.equal(malformed.breathingDriven, false);

  const degraded = engine.step(view(rate('pulse', 1400), rate('breathing', 1400),
    'degraded'), 1400);
  assert.equal(degraded.pulseDriven, false);
  assert.equal(degraded.breathingDriven, false);
});

test('metric loss, stale data, and fresh recovery are independent and deterministic', () => {
  const engine = new VisualizationSignalEngine({ attackMs: 100, releaseMs: 100,
    maxAgeMs: 500 });
  engine.step(view(rate('pulse', 1000), rate('breathing', 1000)), 1000);
  const before = engine.step(view(rate('pulse', 1100), rate('breathing', 1100)), 1100);
  assert.ok(before.uniforms.glow > NEUTRAL_UNIFORMS.glow);
  assert.ok(before.uniforms.sway > NEUTRAL_UNIFORMS.sway);

  // Pulse is stale while the independently valid breathing metric stays live.
  const stale = engine.step(view(rate('pulse', 1100), rate('breathing', 1700)), 1700);
  assert.equal(stale.pulseDriven, false);
  assert.equal(stale.breathingDriven, true);
  near(stale.uniforms.glow, NEUTRAL_UNIFORMS.glow +
    (before.uniforms.glow - NEUTRAL_UNIFORMS.glow) * Math.exp(-6));
  assert.ok(stale.uniforms.sway > NEUTRAL_UNIFORMS.sway);

  const recovered = engine.step(view(rate('pulse', 1800), rate('breathing', 1800)), 1800);
  assert.equal(recovered.pulseDriven, true);
  assert.ok(recovered.uniforms.glow > stale.uniforms.glow);
  assert.equal(recovered.breathingDriven, true);

  const interrupted = engine.step(view(rate('pulse', 1800)), 3000);
  assert.equal(interrupted.pulseDriven, false);
  assert.equal(interrupted.breathingDriven, false);
  near(interrupted.uniforms.glow, NEUTRAL_UNIFORMS.glow, 0.0001);
  near(interrupted.uniforms.sway, NEUTRAL_UNIFORMS.sway, 0.0001);
});

test('disconnect, invalid clocks and backward time fail closed with immediate neutral reset', () => {
  const engine = new VisualizationSignalEngine({ attackMs: 100 });
  engine.step(view(rate('pulse', 1000)), 1000);
  engine.step(view(rate('pulse', 1100)), 1100);
  assert.ok(engine.step(view(rate('pulse', 1200)), 1200).uniforms.glow >
    NEUTRAL_UNIFORMS.glow);
  assert.deepEqual(engine.step(view(rate('pulse', 1200), null, 'disconnected'), 1300),
    { uniforms: NEUTRAL_UNIFORMS, pulseDriven: false, breathingDriven: false });
  engine.step(view(rate('pulse', 2000)), 2000);
  assert.deepEqual(engine.step(view(rate('pulse', 2000)), 1999),
    { uniforms: NEUTRAL_UNIFORMS, pulseDriven: false, breathingDriven: false });
  assert.deepEqual(engine.step(view(rate('pulse', 2000)), NaN),
    { uniforms: NEUTRAL_UNIFORMS, pulseDriven: false, breathingDriven: false });
  assert.deepEqual(engine.step(view(rate('pulse', 2000)), -1),
    { uniforms: NEUTRAL_UNIFORMS, pulseDriven: false, breathingDriven: false });
  assert.equal(engine.step(view(rate('pulse', 5000)), 1000).pulseDriven, false);
});

test('future-skew bounds, options validation and defensive output copies', () => {
  const engine = new VisualizationSignalEngine();
  const first = engine.step(view(rate('pulse', 1250)), 1000);
  assert.equal(first.pulseDriven, true); // matches 250ms quality-machine allowance
  const tooFuture = engine.step(view(rate('pulse', 1352)), 1100);
  assert.equal(tooFuture.pulseDriven, false);
  first.uniforms.glow = 999;
  const next = engine.step(view(rate('pulse', 1200)), 1200);
  assert.ok(next.uniforms.glow < 1);
  for (const options of [
    { attackMs: 0 }, { releaseMs: -1 }, { maxAgeMs: 4001 },
    { attackMs: Infinity }, { maxAgeMs: NaN },
  ]) assert.throws(() => new VisualizationSignalEngine(options), RangeError);
});
