'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(join(__dirname, '..', path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `unexpected import ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

const model = load('electron/signals/model.ts');
const visualization = load('electron/signals/visualization.ts', { './model': model });
const ambient = load('src/app/forest/scene-layout.ts');
const { forestVisualPose } = load('src/app/forest/scene-effects.ts', {
  '../../../electron/signals/visualization': visualization,
});
const { NEUTRAL_UNIFORMS, VisualizationSignalEngine } = visualization;
const { neutralAmbient } = ambient;

const sample = (signal, time, overrides = {}) => ({
  kind: 'rate', signal, timestampMs: time,
  unit: signal === 'pulse' ? 'bpm' : 'breaths/min',
  value: signal === 'pulse' ? 80 : 20,
  confidence: 98, stable: true, ...overrides,
});
const pose = (frame, t = 10, motion = true) =>
  forestVisualPose(frame.uniforms, neutralAmbient(t, motion), motion);

test('neutral scene is reproducible and reduced motion eliminates all scene movement', () => {
  const engine = new VisualizationSignalEngine();
  const neutral = engine.reset();
  const baseline = pose(neutral);
  assert.equal(baseline.foliageSway, neutralAmbient(10, true).sway);
  assert.equal(baseline.fireflySize, 0.12);
  assert.equal(baseline.lanternIntensity, 28);
  assert.equal(baseline.rippleAmplitude, 0.026);
  assert.deepEqual(pose(neutral), baseline);
  const still = pose(neutral, 10, false);
  assert.equal(still.foliageSway, 0);
  assert.equal(still.rippleAmplitude, 0);
  assert.deepEqual(still, pose(neutral, 9999, false));
  assert.deepEqual(Object.keys(baseline).sort(), [
    'fireflyOpacity', 'fireflySize', 'foliageSway', 'lanternIntensity',
    'pondEmission', 'rippleAmplitude',
  ]);
});

test('warm-up and poor framing never change the scene, while live validated rates do', () => {
  const machine = new model.SignalQualityMachine();
  const engine = new VisualizationSignalEngine();
  machine.connect(1000);
  machine.validate(0);
  machine.accept(sample('pulse', 2000), 2000);
  machine.accept(sample('breathing', 2000), 2000);
  let frame = engine.step(machine.snapshot(2000), 2000);
  assert.equal(frame.pulseDriven, false);
  assert.equal(frame.breathingDriven, false);
  assert.deepEqual(frame.uniforms, NEUTRAL_UNIFORMS);

  machine.accept(sample('pulse', 32000), 32000);
  machine.accept(sample('breathing', 32000), 32000);
  frame = engine.step(machine.snapshot(32000), 32000);
  frame = engine.step(machine.snapshot(32800), 32800);
  assert.equal(frame.pulseDriven, true);
  assert.equal(frame.breathingDriven, true);
  const live = pose(frame);
  const neutral = pose(engine.reset());
  assert.ok(live.fireflyOpacity > neutral.fireflyOpacity);
  assert.ok(live.fireflySize > neutral.fireflySize);
  assert.ok(live.pondEmission > neutral.pondEmission);
  assert.ok(live.lanternIntensity > neutral.lanternIntensity);
  assert.ok(Math.abs(live.foliageSway) > Math.abs(neutral.foliageSway));
  assert.ok(live.rippleAmplitude > neutral.rippleAmplitude);

  machine.validate(12); // lost framing clears earlier samples
  frame = engine.step(machine.snapshot(32900), 32900);
  assert.equal(frame.pulseDriven, false);
  assert.equal(frame.breathingDriven, false);
  frame = engine.step(machine.snapshot(37000), 37000);
  const faded = pose(frame);
  assert.ok(Math.abs(faded.pondEmission - neutral.pondEmission) < 0.001);
  assert.ok(Math.abs(faded.rippleAmplitude - neutral.rippleAmplitude) < 0.001);
  assert.ok(Math.abs(faded.fireflyOpacity - neutral.fireflyOpacity) < 0.001);
});

test('one missing or stale metric disables only its own effect; fresh recovery and Stop reset', () => {
  const machine = new model.SignalQualityMachine();
  const engine = new VisualizationSignalEngine();
  machine.connect(1000);
  machine.validate(0);
  machine.accept(sample('pulse', 32000), 32000);
  machine.accept(sample('breathing', 32000), 32000);
  engine.step(machine.snapshot(32000), 32000);
  const before = engine.step(machine.snapshot(32800), 32800);
  assert.equal(before.pulseDriven, true);

  machine.accept(sample('breathing', 34500), 34500);
  const partial = engine.step(machine.snapshot(35200), 35200);
  assert.equal(partial.pulseDriven, false); // 3s visualization freshness
  assert.equal(partial.breathingDriven, true);
  assert.ok(pose(partial).rippleAmplitude > pose(engine.reset()).rippleAmplitude);

  machine.accept(sample('pulse', 35300), 35300);
  const recovered = engine.step(machine.snapshot(35800), 35800);
  assert.equal(recovered.pulseDriven, true);
  assert.equal(recovered.breathingDriven, true);

  machine.disconnect();
  const stopped = engine.step(machine.snapshot(35810), 35810);
  assert.equal(stopped.pulseDriven, false);
  assert.equal(stopped.breathingDriven, false);
  assert.deepEqual(stopped.uniforms, NEUTRAL_UNIFORMS);
});

test('low confidence, unstable rates, and missing values cannot energize the forest', () => {
  for (const change of [
    { confidence: 69 }, { stable: false }, { value: 140 },
  ]) {
    const machine = new model.SignalQualityMachine();
    const engine = new VisualizationSignalEngine();
    machine.connect(1000);
    machine.validate(0);
    machine.accept(sample('pulse', 32000, change), 32000);
    engine.step(machine.snapshot(32000), 32000);
    const frame = engine.step(machine.snapshot(33000), 33000);
    assert.equal(frame.pulseDriven, false);
    assert.deepEqual(frame.uniforms, NEUTRAL_UNIFORMS);
  }
});
