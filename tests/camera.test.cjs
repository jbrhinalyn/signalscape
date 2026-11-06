'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

const root = join(__dirname, '..');
function loadTs(path, mock = () => { throw new Error('Unexpected module'); }) {
  const source = readFileSync(join(root, path), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(mock, module, module.exports);
  return module.exports;
}
const contracts = loadTs('electron/ipc/contracts.ts');
const { SmartSpectraCapture } = loadTs('electron/camera/capture.ts');
const { registerCameraIpc } = loadTs('electron/camera/ipc.ts', (id) => {
  if (id === './capture.js') return { SmartSpectraCapture };
  if (id === '../ipc/contracts.js') return contracts;
  throw new Error('Unexpected module');
});

function fakeSdk(configure = {}) {
  const info = { options: null, frameCalls: [], destroyed: false, destroyCalls: 0, sdk: null };
  class Session {
    constructor(options) { info.options = options; info.sdk = this; this.listeners = {}; }
    on(event, fn) { this.listeners[event] = fn; return this; }
    useCustomInput() {
      if (configure.failStage === 'custom') throw new Error('SECRET_CUSTOM_INPUT');
      return this;
    }
    start() {
      if (configure.failStage === 'start') throw new Error('SECRET_START');
      this.listeners.processingStatus?.(3);
      if (configure.failStage === 'sync-error') this.listeners.error?.(1);
      if (configure.failStage === 'status-error') this.listeners.processingStatus?.(5);
    }
    sendFrame(...args) {
      info.frameCalls.push(args);
      if (configure.throwsOnFrame) throw new Error('PRIVATE_FRAME_ERROR');
      return !configure.rejectFrames;
    }
    async destroy() {
      info.destroyCalls += 1;
      if (configure.destroyBarrier) await configure.destroyBarrier;
      if (configure.failDestroyCount > 0) {
        configure.failDestroyCount -= 1;
        throw new Error('PRIVATE_DESTROY_FAILURE');
      }
      info.destroyed = true;
      this.listeners.processingStatus?.(1);
    }
  }
  const runtime = { SmartSpectraSDK: Session, PixelFormat: { kRGBA: 2 },
    SmartSpectraLogLevel: { kNone: 4 }, breathingMetrics: [2], cardioMetrics: [15] };
  const decoder = { decodeMetrics: () => ({
    breathing: { rate: [{ value: 15 }] }, cardio: { pulseRate: [{ value: 70 }] },
  }) };
  return { info, load: (name) => name.endsWith('/messages') ? decoder : runtime };
}

test('camera event validator rejects arbitrary health values or forged status fields', () => {
  assert.equal(contracts.isCameraEvent({ kind: 'state', state: 'running' }), true);
  assert.equal(contracts.isCameraEvent({ kind: 'validation', code: 7 }), true);
  assert.equal(contracts.isCameraEvent({
    kind: 'metrics', packets: 1, pulseObserved: true, breathingObserved: false,
  }), true);
  assert.equal(contracts.isCameraEvent({
    kind: 'metrics', packets: 1, pulseObserved: true, breathingObserved: false, pulseBpm: 70,
  }), false);
  assert.equal(contracts.isCameraEvent({ kind: 'validation', code: 100 }), false);
  assert.equal(contracts.isCameraEvent({ kind: 'state', state: 'running', apiKey: 'bad' }), false);
  assert.equal(contracts.isCameraEvent({
    kind: 'transport', framesReceived: 12, framesAccepted: 11,
    framesRejected: 1, framesForwarded: 10,
  }), true);
  assert.equal(contracts.isCameraEvent({
    kind: 'transport', framesReceived: 12, framesAccepted: 11,
    framesRejected: 1, framesForwarded: 10, rawPixels: 'private',
  }), false);
  assert.equal(contracts.isCameraEvent({
    kind: 'transport', framesReceived: 1, framesAccepted: 2,
    framesRejected: 0, framesForwarded: 0,
  }), false);
});

test('native SDK uses only main-process key and opts out of telemetry', async () => {
  const sdk = fakeSdk();
  const events = [];
  const capture = new SmartSpectraCapture((event) => events.push(event), sdk.load, () => 'PRIVATE_KEY');
  assert.deepEqual(capture.start(), { ok: true });
  assert.equal(sdk.info.options.apiKey, 'PRIVATE_KEY');
  assert.equal(sdk.info.options.enableTelemetry, false);
  assert.equal(sdk.info.options.logLevel, 4);
  const frame = new Uint8Array(640 * 480 * 4);
  capture.submit(frame, 640, 480, 1000);
  assert.equal(sdk.info.frameCalls.length, 1);
  assert.equal(sdk.info.frameCalls[0][4], 2);
  sdk.info.sdk.listeners.validationStatus(7, 0, 'SECRET_CAMERA_HINT');
  sdk.info.sdk.listeners.frameSentThrough(true, 1000);
  sdk.info.sdk.listeners.metrics(Uint8Array.from([1,2,3]));
  assert.equal(events.some((x) => x.kind === 'metrics' &&
    x.pulseObserved && x.breathingObserved), true);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_KEY|SECRET_CAMERA_HINT|70|15/);
  await capture.stop();
  assert.equal(sdk.info.destroyed, true);
  const transport = events.filter((event) => event.kind === 'transport').at(-1);
  assert.deepEqual(transport, { kind: 'transport', framesReceived: 1,
    framesAccepted: 1, framesRejected: 0, framesForwarded: 1 });
});

test('native SDK refuses startup without key or SDK dependency', () => {
  const capture = new SmartSpectraCapture(() => {}, () => { throw new Error('SECRET'); }, () => '');
  assert.deepEqual(capture.start(), { ok: false, reason: 'api-key-not-configured' });
  const missing = new SmartSpectraCapture(() => {}, () => { throw new Error('SECRET'); },
    () => 'SECRET');
  assert.deepEqual(missing.start(), { ok: false, reason: 'sdk-unavailable' });
});

test('camera IPC is consent gated and rejects untrusted frames and extra arguments', async () => {
  const handlers = new Map();
  const listeners = new Map();
  const trusted = { sender: 'trusted' };
  const seen = [];
  const sdk = fakeSdk();
  const capture = new SmartSpectraCapture((e) => seen.push(e), sdk.load, () => 'PRIVATE');
  const permission = registerCameraIpc({
    ipcMain: {
      handle: (name, cb) => handlers.set(name, cb),
      on: (name, cb) => listeners.set(name, cb),
    },
    isTrustedSender: (event) => event === trusted,
    emitToRenderer: (event) => seen.push(event),
    capture,
  });
  assert.equal(permission.isCameraArmed(), false);
  assert.deepEqual(handlers.get(contracts.IPC_CHANNEL.measurementStart)(trusted), {
    ok: false, reason: 'camera-permission-denied',
  });
  assert.throws(() => handlers.get(contracts.IPC_CHANNEL.cameraArm)({}), /Unauthorized/);
  assert.throws(() => handlers.get(contracts.IPC_CHANNEL.cameraArm)(trusted, 'extra'), /Unauthorized/);
  assert.equal(handlers.get(contracts.IPC_CHANNEL.cameraArm)(trusted), true);
  assert.equal(permission.isCameraArmed(), true);
  assert.deepEqual(handlers.get(contracts.IPC_CHANNEL.measurementStart)(trusted), { ok: true });
  const frame = { width: 640, height: 480, timestampUs: 1000,
    pixels: new Uint8Array(640 * 480 * 4) };
  const push = listeners.get(contracts.IPC_CHANNEL.cameraFrame);
  push({}, frame);
  push(trusted, { ...frame, pixels: new Uint8Array(10) });
  push(trusted, { ...frame, width: 641 });
  push(trusted, frame);
  assert.equal(sdk.info.frameCalls.length, 1);
  await handlers.get(contracts.IPC_CHANNEL.cameraDisarm)(trusted);
  assert.equal(permission.isCameraArmed(), false);
  push(trusted, { ...frame, timestampUs: 2000 });
  assert.equal(sdk.info.frameCalls.length, 1);
  assert.equal(sdk.info.destroyed, true);
});

test('renderer uses a single browser video stream and never imports SDK runtime', () => {
  const renderer = readFileSync(join(root, 'src/app/app.ts'), 'utf8');
  assert.match(renderer, /getUserMedia/);
  assert.match(renderer, /pushCameraFrame/);
  assert.match(renderer, /getTracks\(\)\.forEach/);
  assert.doesNotMatch(renderer, /from ['"](?:@smartspectra|electron|node:)/);
  const main = readFileSync(join(root, 'electron/main.ts'), 'utf8');
  assert.match(main, /cameraBridge\?\.isCameraArmed\(\)/);
  assert.match(main, /permission === 'media'/);
  assert.match(main, /!mediaTypes\.includes\('audio'\)/);
});

test('native frame acknowledgements distinguish rejected packets from SDK metrics', async () => {
  const sdk = fakeSdk({ rejectFrames: true });
  const seen = [];
  const capture = new SmartSpectraCapture((event) => seen.push(event),
    sdk.load, () => 'PRIVATE_KEY');
  assert.deepEqual(capture.start(), { ok: true });
  capture.submit(new Uint8Array(640 * 480 * 4), 640, 480, 5000);
  await capture.stop();
  const transport = seen.filter((event) => event.kind === 'transport').at(-1);
  assert.deepEqual(transport, { kind: 'transport', framesReceived: 1,
    framesAccepted: 0, framesRejected: 1, framesForwarded: 0 });
  assert.equal(seen.some((event) => event.kind === 'metrics'), false);
  assert.doesNotMatch(JSON.stringify(seen), /PRIVATE_KEY|PRIVATE_FRAME_ERROR/);
});

test('native frame exceptions are sanitized and camera is still released', async () => {
  const sdk = fakeSdk({ throwsOnFrame: true });
  const events = [];
  const capture = new SmartSpectraCapture((event) => events.push(event),
    sdk.load, () => 'PRIVATE_KEY');
  assert.deepEqual(capture.start(), { ok: true });
  capture.submit(new Uint8Array(640 * 480 * 4), 640, 480, 5000);
  assert.equal(events.some((event) => event.kind === 'state' &&
    event.state === 'error'), true);
  await capture.stop();
  assert.equal(sdk.info.destroyed, true);
  assert.equal(events.filter((event) => event.kind === 'transport').at(-1).framesRejected, 1);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_KEY|PRIVATE_FRAME_ERROR/);
});


test('native startup exceptions clean up and block retry until destroy resolves', async () => {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const sdk = fakeSdk({ failStage: 'start', destroyBarrier: barrier });
  const seen = [];
  const capture = new SmartSpectraCapture((event) => seen.push(event), sdk.load, () => 'PRIVATE');
  assert.deepEqual(capture.start(), { ok: false, reason: 'sdk-error' });
  assert.deepEqual(capture.start(), { ok: false, reason: 'sdk-error' });
  release();
  await capture.stop();
  assert.equal(sdk.info.destroyed, true);
  assert.equal(sdk.info.destroyCalls, 1);
  assert.deepEqual(capture.start(), { ok: false, reason: 'sdk-error' }); // fake still fails
  await capture.stop();
  assert.doesNotMatch(JSON.stringify(seen), /PRIVATE|SECRET/);
});

test('custom-input failure disposes the allocated session and unlocks an explicit retry', async () => {
  const configuration = { failStage: 'custom' };
  const sdk = fakeSdk(configuration);
  const capture = new SmartSpectraCapture(() => {}, sdk.load, () => 'PRIVATE');
  assert.deepEqual(capture.start(), { ok: false, reason: 'sdk-error' });
  await capture.stop();
  assert.equal(sdk.info.destroyed, true);
  configuration.failStage = null;
  assert.deepEqual(capture.start(), { ok: true });
  await capture.stop();
  assert.equal(sdk.info.destroyCalls, 2);
});

test('synchronous SDK error/status during start never reports success', async () => {
  for (const failStage of ['sync-error', 'status-error']) {
    const sdk = fakeSdk({ failStage });
    const events = [];
    const capture = new SmartSpectraCapture((event) => events.push(event),
      sdk.load, () => 'PRIVATE');
    assert.deepEqual(capture.start(), { ok: false, reason: 'sdk-error' });
    assert.equal(events.some((event) => event.kind === 'state' &&
      event.state === 'error'), true);
    await capture.stop();
    assert.equal(sdk.info.destroyed, true);
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE/);
  }
});

test('asynchronous fatal error stops native delivery and stale callbacks stay ignored', async () => {
  const sdk = fakeSdk();
  const events = [];
  const capture = new SmartSpectraCapture((event) => events.push(event),
    sdk.load, () => 'PRIVATE');
  assert.deepEqual(capture.start(), { ok: true });
  const oldSession = sdk.info.sdk;
  oldSession.listeners.error(1, 'PRIVATE_ERROR_DESCRIPTION');
  capture.submit(new Uint8Array(640 * 480 * 4), 640, 480, 1000);
  await capture.stop();
  assert.equal(sdk.info.frameCalls.length, 0);
  assert.equal(sdk.info.destroyed, true);
  const before = events.length;
  oldSession.listeners.metrics(Uint8Array.from([1]));
  oldSession.listeners.processingStatus(3);
  oldSession.listeners.validationStatus(7);
  assert.equal(events.length, before);
  assert.deepEqual(capture.start(), { ok: true });
  oldSession.listeners.error(1);
  assert.equal(events.filter((event) => event.kind === 'state' &&
    event.state === 'error').length, 1);
  await capture.stop();
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE/);
});

test('destroy failure is surfaced and quarantined until teardown retry succeeds', async () => {
  const sdk = fakeSdk({ failDestroyCount: 1 });
  const events = [];
  const capture = new SmartSpectraCapture((event) => events.push(event),
    sdk.load, () => 'PRIVATE');
  assert.deepEqual(capture.start(), { ok: true });
  await assert.rejects(() => capture.stop(), /native cleanup failed/);
  assert.equal(sdk.info.destroyed, false);
  assert.equal(events.some((event) => event.kind === 'state' &&
    event.state === 'error'), true);
  assert.equal(events.some((event) => event.kind === 'state' &&
    event.state === 'stopped'), false);
  assert.deepEqual(capture.start(), { ok: false, reason: 'sdk-error' });
  await capture.stop();
  assert.equal(sdk.info.destroyed, true);
  assert.deepEqual(capture.start(), { ok: true });
  await capture.stop();
});
