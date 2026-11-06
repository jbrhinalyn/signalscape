'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '../electron/signals/model.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleInstance = { exports: {} };
new Function('module', 'exports', code)(moduleInstance, moduleInstance.exports);
const {
  adaptSmartSpectraRates, isSignalEvent, SignalQualityMachine, MAX_SIGNAL_AGE_MS,
} = moduleInstance.exports;

const rate = (signal, timestampMs, overrides = {}) => ({
  kind: 'rate', signal, timestampMs,
  unit: signal === 'pulse' ? 'bpm' : 'breaths/min',
  value: signal === 'pulse' ? 72 : 16,
  confidence: 90, stable: true, ...overrides,
});

test('typed rate contract accepts only finite, unit-matched, timestamped samples', () => {
  assert.equal(isSignalEvent(rate('pulse', 10)), true);
  assert.equal(isSignalEvent(rate('breathing', 10)), true);
  assert.equal(isSignalEvent({ kind: 'unavailable', signal: 'pulse',
    reason: 'missing', timestampMs: 10 }), true);
  const invalid = [
    rate('pulse', 10, { value: 0 }),
    rate('pulse', 10, { value: 39 }),
    rate('pulse', 10, { value: 111 }),
    rate('breathing', 10, { value: 4 }),
    rate('breathing', 10, { value: 41 }),
    rate('pulse', 10, { value: Infinity }),
    rate('pulse', 10, { value: NaN }),
    rate('pulse', 10, { unit: 'breaths/min' }),
    rate('pulse', 10, { confidence: -1 }),
    rate('pulse', 10, { confidence: 101 }),
    rate('pulse', 10, { confidence: null }),
    rate('pulse', 10, { stable: 'true' }),
    rate('pulse', -1),
    rate('pulse', 1.5),
    rate('pulse', 10, { rawFrame: 'no' }),
    { kind: 'unavailable', signal: 'pulse', reason: 'other', timestampMs: 10 },
  ];
  for (const input of invalid) {
    assert.equal(isSignalEvent(input), false, JSON.stringify(input));
  }
});

test('SmartSpectra adapter uses only latest samples and never fabricates absent metrics', () => {
  const result = adaptSmartSpectraRates({
    cardio: { pulseRate: [{ value: 70, confidence: 75, stable: true }] },
    breathing: { rate: [{ value: 15, confidence: 92, stable: false }] },
    face: { landmarks: 'private-face-data' },
  }, 1000);
  assert.deepEqual(result, [rate('pulse', 1000, { value: 70, confidence: 75 }),
    rate('breathing', 1000, { value: 15, confidence: 92, stable: false })]);
  assert.equal(JSON.stringify(result).includes('face'), false);
  assert.deepEqual(adaptSmartSpectraRates({}, 2000), []);
  assert.deepEqual(adaptSmartSpectraRates({
    cardio: { pulseRate: [
      { value: 70, confidence: 90, stable: true },
      { value: 0, confidence: 90, stable: true },
    ] },
    breathing: { rate: [{ value: 12 }] },
  }, 2000), [
    { kind: 'unavailable', signal: 'pulse', reason: 'invalid', timestampMs: 2000 },
    { kind: 'unavailable', signal: 'breathing', reason: 'invalid', timestampMs: 2000 },
  ]);
  assert.deepEqual(adaptSmartSpectraRates({ cardio: { pulseRate: [rate('pulse', 100)] } }, -1), []);
});

test('quality is disconnected until consented measurement, then warms up', () => {
  const machine = new SignalQualityMachine();
  assert.deepEqual(machine.snapshot(1000), {
    quality: 'disconnected', pulse: null, breathing: null,
  });
  machine.connect(1000);
  machine.validate(0);
  machine.accept(rate('pulse', 5000), 5000);
  assert.deepEqual(machine.snapshot(5000), {
    quality: 'warming', pulse: null, breathing: null,
  });
  machine.accept(rate('pulse', 13000), 13000);
  assert.deepEqual(machine.snapshot(13000), {
    quality: 'ready', pulse: rate('pulse', 13000), breathing: null,
  });
  machine.accept(rate('breathing', 31000), 31000);
  assert.deepEqual(machine.snapshot(31000), {
    quality: 'ready', pulse: null, breathing: rate('breathing', 31000),
  });
  machine.disconnect();
  assert.equal(machine.snapshot(31000).quality, 'disconnected');
  assert.equal(machine.snapshot(31000).breathing, null);
});

test('unstable, low-confidence, stale and missing metrics can never be shown', () => {
  const machine = new SignalQualityMachine();
  machine.connect(1000);
  machine.validate(0);
  machine.accept(rate('pulse', 14000, { confidence: 20 }), 14000);
  assert.equal(machine.snapshot(14000).pulse, null);
  machine.accept(rate('pulse', 15000, { stable: false }), 15000);
  assert.equal(machine.snapshot(15000).pulse, null);
  machine.accept(rate('pulse', 16000), 16000);
  assert.equal(machine.snapshot(16000).quality, 'ready');
  assert.equal(machine.snapshot(16000 + MAX_SIGNAL_AGE_MS + 1).quality, 'warming');
  assert.equal(machine.snapshot(16000 + MAX_SIGNAL_AGE_MS + 1).pulse, null);
  assert.equal(machine.snapshot(40000).quality, 'degraded');
  machine.accept({ kind: 'unavailable', signal: 'pulse', reason: 'invalid',
    timestampMs: 40000 }, 40000);
  assert.equal(machine.snapshot(40000).pulse, null);
});

test('framing, out-of-order values and connection transitions are fail closed', () => {
  const machine = new SignalQualityMachine();
  machine.connect(1000);
  machine.accept(rate('pulse', 13000), 13000);
  assert.equal(machine.snapshot(13000).pulse, null); // validation not yet OK
  machine.validate(7);
  assert.equal(machine.snapshot(13000).quality, 'degraded');
  machine.validate(0);
  assert.equal(machine.snapshot(13000).pulse, null); // old good sample cleared
  machine.accept(rate('pulse', 14000), 14000);
  assert.equal(machine.snapshot(14000).quality, 'ready');
  machine.accept(rate('pulse', 13999, { value: 95 }), 14000);
  assert.equal(machine.snapshot(14000).pulse.value, 72);
  machine.accept(rate('pulse', 14001, { value: 90 }), 19002);
  assert.equal(machine.snapshot(19002).pulse, null);
  machine.accept(rate('pulse', 20000, { value: 90 }), 20000);
  assert.equal(machine.snapshot(20000).pulse.value, 90);
  machine.disconnect();
  machine.accept(rate('pulse', 30000), 30000);
  machine.connect(30000);
  assert.equal(machine.snapshot(30000).pulse, null);
});
