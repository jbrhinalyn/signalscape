'use strict';
// M5 NONPRODUCTION TEST FIXTURES ONLY. All rates and SDK callbacks below
// are synthetic; these tests never request a real camera or SDK credential.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

const root = join(__dirname, '..');
function loadTs(path, imports = {}) {
  const code = ts.transpileModule(readFileSync(join(root, path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    assert.ok(Object.hasOwn(imports, name), 'Unexpected module: ' + name);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const model = loadTs('electron/signals/model.ts');
const contracts = loadTs('electron/ipc/contracts.ts');
const visual = loadTs('electron/signals/visualization.ts', { './model': model });
const { SmartSpectraCapture } = loadTs('electron/camera/capture.ts', {
  '../signals/model.js': model,
});
const { registerCameraIpc } = loadTs('electron/camera/ipc.ts', {
  './capture.js': { SmartSpectraCapture },
  '../ipc/contracts.js': contracts,
});

// The fake module deliberately cannot access the OS camera or Presage network.
function fakeNativeSdk() {
  const instances = [];
  let decoded = {
    cardio: { pulseRate: [{ value: 76, confidence: 95, stable: true }] },
    breathing: { rate: [{ value: 17, confidence: 90, stable: true }] },
    face: { landmarks: 'PRIVATE_TEST_ONLY_FACE' },
  };
  class Session {
    constructor(options) {
      this.options = options;
      this.listeners = {};
      this.frames = [];
      this.destroyed = false;
      instances.push(this);
    }
    on(name, fn) { this.listeners[name] = fn; return this; }
    useCustomInput() { return this; }
    start() { this.fire('processingStatus', 3); }
    sendFrame(...args) { this.frames.push(args); return true; }
    async destroy() { this.destroyed = true; }
    fire(name, ...args) { this.listeners[name]?.(...args); }
  }
  const runtime = {
    SmartSpectraSDK: Session,
    PixelFormat: { kRGBA: 2 },
    SmartSpectraLogLevel: { kNone: 4 },
    breathingMetrics: [2],
    cardioMetrics: [15],
  };
  return {
    instances,
    load: (name) => name === '@smartspectra/node-sdk' ? runtime :
      name === '@smartspectra/node-sdk/messages' ? { decodeMetrics: () => decoded } :
        (() => { throw new Error('Unexpected native module'); })(),
    setDecoded: (value) => { decoded = value; },
  };
}

test('M5 pipeline: native adapter to validated IPC to quality gates to neutral visualization', async () => {
  const sdk = fakeNativeSdk();
  const machine = new model.SignalQualityMachine();
  const events = [];
  const now = Date.now();
  machine.connect(now - 40000);
  const capture = new SmartSpectraCapture((event) => {
    assert.equal(contracts.isCameraEvent(event), true);
    events.push(event);
    if (event.kind === 'validation') machine.validate(event.code);
    if (event.kind === 'rate' || event.kind === 'unavailable') {
      machine.accept(event, Date.now());
    }
  }, sdk.load, () => 'NONPRODUCTION_TEST_KEY');

  try {
    assert.deepEqual(capture.start(), { ok: true });
    const session = sdk.instances[0];
    assert.equal(session.options.enableTelemetry, false);
    assert.equal(session.options.apiKey, 'NONPRODUCTION_TEST_KEY');

    // No reading is visible before native framing validation and a sample.
    assert.equal(machine.snapshot(Date.now()).pulse, null);
    session.fire('validationStatus', 0);
    session.fire('metrics', Uint8Array.of(2));
    const ready = machine.snapshot(Date.now());
    assert.equal(ready.quality, 'ready');
    assert.equal(ready.pulse.value, 76);
    assert.equal(ready.breathing.value, 17);

    const scene = new visual.VisualizationSignalEngine();
    const baseline = scene.step(ready, now);
    const active = scene.step(ready, now + 1000);
    assert.equal(active.pulseDriven, true);
    assert.equal(active.breathingDriven, true);
    assert.ok(active.uniforms.glow > baseline.uniforms.glow);
    assert.ok(active.uniforms.sway > baseline.uniforms.sway);

    // Losing valid framing must clear both readings, not reuse cached rates.
    session.fire('validationStatus', 7);
    const degraded = machine.snapshot(Date.now());
    assert.equal(degraded.quality, 'degraded');
    assert.equal(degraded.pulse, null);
    assert.equal(degraded.breathing, null);
    const neutral = scene.step({ quality: 'disconnected',
      pulse: null, breathing: null }, now + 1500);
    assert.deepEqual(neutral.uniforms, visual.NEUTRAL_UNIFORMS);
    assert.equal(neutral.pulseDriven, false);
    assert.equal(neutral.breathingDriven, false);
    assert.doesNotMatch(JSON.stringify(events),
      /NONPRODUCTION_TEST_KEY|PRIVATE_TEST_ONLY_FACE|landmarks/);
    assert.equal(events.filter((event) => event.kind === 'rate').length, 2);
  } finally {
    await capture.stop();
    machine.disconnect();
  }
  assert.equal(sdk.instances[0].destroyed, true);
  assert.deepEqual(machine.snapshot(Date.now()), {
    quality: 'disconnected', pulse: null, breathing: null,
  });
});

test('M5 lifecycle: untrusted frames, disarm, explicit restart and shutdown are fail closed', async () => {
  const sdk = fakeNativeSdk();
  const events = [];
  const capture = new SmartSpectraCapture((event) => events.push(event),
    sdk.load, () => 'NONPRODUCTION_TEST_KEY');
  const handlers = new Map();
  const listeners = new Map();
  const trusted = {};
  const bridge = registerCameraIpc({
    ipcMain: {
      handle: (channel, callback) => handlers.set(channel, callback),
      on: (channel, callback) => listeners.set(channel, callback),
    },
    isTrustedSender: (event) => event === trusted,
    emitToRenderer: (event) => events.push(event),
    capture,
    nativeMeasurementAllowed: true, // Explicit unpackaged developer fixture.
  });
  const call = (channel) => handlers.get(channel)(trusted);
  const send = listeners.get(contracts.IPC_CHANNEL.cameraFrame);
  const frame = { width: 640, height: 480, timestampUs: 1000,
    pixels: new Uint8Array(640 * 480 * 4) };

  assert.equal(bridge.isCameraArmed(), false);
  assert.deepEqual(call(contracts.IPC_CHANNEL.measurementStart), {
    ok: false, reason: 'camera-permission-denied',
  });
  assert.equal(sdk.instances.length, 0);
  assert.equal(call(contracts.IPC_CHANNEL.cameraArm), true);
  assert.deepEqual(call(contracts.IPC_CHANNEL.measurementStart), { ok: true });
  const first = sdk.instances[0];
  send({}, frame);
  send(trusted, { ...frame, pixels: new Uint8Array(1) });
  assert.equal(first.frames.length, 0);
  send(trusted, frame);
  assert.equal(first.frames.length, 1);
  await call(contracts.IPC_CHANNEL.cameraDisarm);
  assert.equal(bridge.isCameraArmed(), false);
  assert.equal(first.destroyed, true);
  send(trusted, { ...frame, timestampUs: 2000 });
  assert.equal(first.frames.length, 1);
  assert.deepEqual(call(contracts.IPC_CHANNEL.measurementStart), {
    ok: false, reason: 'camera-permission-denied',
  });

  // Consent to preview never restarts a measurement by itself.
  call(contracts.IPC_CHANNEL.cameraArm);
  send(trusted, { ...frame, timestampUs: 3000 });
  assert.equal(sdk.instances.length, 1);
  assert.deepEqual(call(contracts.IPC_CHANNEL.measurementStart), { ok: true });
  assert.equal(sdk.instances.length, 2);
  send(trusted, { ...frame, timestampUs: 4000 });
  assert.equal(sdk.instances[1].frames.length, 1);
  await bridge.shutdown();
  assert.equal(sdk.instances[1].destroyed, true);
  assert.equal(bridge.isCameraArmed(), false);
  assert.deepEqual(call(contracts.IPC_CHANNEL.measurementStart), {
    ok: false, reason: 'camera-permission-denied',
  });
  assert.equal(events.every(contracts.isCameraEvent), true);
  assert.doesNotMatch(JSON.stringify(events), /NONPRODUCTION_TEST_KEY/);
});

test('M5 synthetic test fixtures cannot be mistaken for production measurements', () => {
  const markup = readFileSync(join(root, 'src/app/app.html'), 'utf8');
  const guide = readFileSync(join(root, 'docs/m5-acceptance.md'), 'utf8');
  assert.match(markup, /No simulated pulse or breathing readings/);
  assert.match(guide, /NONPRODUCTION SYNTHETIC TEST DATA/);
  assert.match(guide, /Physical camera evidence/);
  assert.match(guide, /Release blockers/);
});
