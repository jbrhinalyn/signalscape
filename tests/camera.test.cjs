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

function fakeSdk() {
  const info = { options: null, frameCalls: [], destroyed: false, sdk: null };
  class Session {
    constructor(options) { info.options = options; info.sdk = this; this.listeners = {}; }
    on(event, fn) { this.listeners[event] = fn; return this; }
    useCustomInput() { return this; }
    start() { this.listeners.processingStatus?.(3); }
    sendFrame(...args) { info.frameCalls.push(args); return true; }
    async destroy() { info.destroyed = true; this.listeners.processingStatus?.(1); }
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
  sdk.info.sdk.listeners.metrics(Uint8Array.from([1,2,3]));
  assert.equal(events.some((x) => x.kind === 'metrics' &&
    x.pulseObserved && x.breathingObserved), true);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_KEY|SECRET_CAMERA_HINT|70|15/);
  await capture.stop();
  assert.equal(sdk.info.destroyed, true);
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
