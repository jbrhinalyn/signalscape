const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

const root = join(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Exercise the actual TypeScript modules before the production compilation step.
// No Node or Electron runtime is necessary to run these isolated contract tests.
function loadTs(path, requireModule = () => { throw new Error('Unexpected import'); }) {
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(requireModule, module, module.exports);
  return module.exports;
}

const contracts = loadTs('electron/ipc/contracts.ts');
const { IPC_CHANNEL, IPC_API_VERSION, isSdkStatusEvent } = contracts;

test('IPC contract exports named channels and a version', () => {
  assert.equal(IPC_API_VERSION, 1);
  assert.deepEqual({ ...IPC_CHANNEL }, {
    appStatus: 'signalscape:app-status',
    publicConfig: 'signalscape:public-config',
    sdkStatus: 'signalscape:sdk-status',
    cameraArm: 'signalscape:camera-arm',
    cameraDisarm: 'signalscape:camera-disarm',
    measurementStart: 'signalscape:measurement-start',
    measurementStop: 'signalscape:measurement-stop',
    cameraFrame: 'signalscape:camera-frame',
    cameraEvent: 'signalscape:camera-event',
  });
  assert.equal(Object.isFrozen(IPC_CHANNEL), true);
});

test('SDK status contract rejects malformed, unexpected or inconsistent events', () => {
  assert.equal(isSdkStatusEvent({ status: 'idle' }), true);
  assert.equal(isSdkStatusEvent({ status: 'error', errorCode: 'camera-permission-denied' }), true);
  for (const payload of [
    null, [], 'ready', {}, { status: 'not-a-status' },
    { status: 'ready', errorCode: 'unknown' },
    { status: 'error' }, { status: 'error', errorCode: 'secrets' },
    { status: 'ready', token: 'unexpected' },
  ]) assert.equal(isSdkStatusEvent(payload), false);
});

test('native IPC handlers reject untrusted callers and arguments', () => {
  const handlers = new Map();
  const { registerDesktopIpc } = loadTs('electron/ipc/handlers.ts', (id) => {
    assert.equal(id, './contracts.js');
    return contracts;
  });
  const trusted = { id: 'trusted-main-frame' };
  registerDesktopIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: (event) => event === trusted,
    getVersion: () => '0.1.0',
    isPackaged: false,
    platform: 'linux',
  });

  assert.deepEqual([...handlers.keys()].sort(), [
    IPC_CHANNEL.appStatus, IPC_CHANNEL.publicConfig,
  ].sort());
  assert.deepEqual(handlers.get(IPC_CHANNEL.appStatus)(trusted), {
    apiVersion: 1, version: '0.1.0', platform: 'linux', ready: true,
  });
  assert.deepEqual(handlers.get(IPC_CHANNEL.publicConfig)(trusted), {
    mode: 'development',
    features: {
      cameraEnabled: false, smartSpectraEnabled: false, telemetryEnabled: false,
    },
  });

  for (const handler of handlers.values()) {
    assert.throws(() => handler({ id: 'untrusted' }), /Unauthorized/);
    assert.throws(() => handler(trusted, 'unauthorized-argument'), /Unauthorized/);
  }
});

test('native public config never leaks environment secrets or device paths', () => {
  const { registerDesktopIpc } = loadTs('electron/ipc/handlers.ts', () => contracts);
  const handlers = new Map();
  registerDesktopIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: () => true,
    getVersion: () => '0.1.0',
    isPackaged: true,
    platform: 'freebsd',
  });
  const result = JSON.stringify([
    handlers.get(IPC_CHANNEL.appStatus)({}),
    handlers.get(IPC_CHANNEL.publicConfig)({}),
  ]);
  assert.equal(JSON.parse(result)[0].platform, 'other');
  assert.equal(JSON.parse(result)[1].mode, 'production');
  assert.doesNotMatch(result, /process|env|token|secret|credential|privateKey|homeDir/i);
});

test('preload exposes only typed methods, fixed channels, and removable validated listener', async () => {
  const invocations = [];
  const listeners = new Map();
  let exposedName;
  let exposed;
  const fakeElectron = {
    contextBridge: { exposeInMainWorld(name, api) { exposedName = name; exposed = api; } },
    ipcRenderer: {
      send(channel, ...args) {
        invocations.push([channel, args]);
      },
      invoke(channel, ...args) {
        invocations.push([channel, args]);
        return Promise.resolve(channel === IPC_CHANNEL.appStatus ? {
          apiVersion: 1, version: '0.1.0', platform: 'linux', ready: true,
        } : { mode: 'development', features: {} });
      },
      on(channel, callback) { listeners.set(channel, callback); },
      removeListener(channel, callback) {
        if (listeners.get(channel) === callback) listeners.delete(channel);
      },
    },
  };
  const preloadSource = read('electron/preload.ts');
  assert.doesNotMatch(ts.transpileModule(preloadSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, /require\(['"]\.\/ipc\//);
  loadTs('electron/preload.ts', (id) => {
    assert.equal(id, 'electron');
    return fakeElectron;
  });

  assert.equal(exposedName, 'signalScape');
  assert.equal(Object.isFrozen(exposed), true);
  assert.deepEqual(Object.keys(exposed).sort(), [
    'apiVersion', 'getAppStatus', 'getPublicConfig', 'onSdkStatus',
    'authorizeCameraPreview', 'releaseCameraPreview',
    'startNativeMeasurement', 'stopNativeMeasurement', 'pushCameraFrame', 'onCameraEvent',
  ].sort());
  assert.equal(exposed.apiVersion, 1);
  assert.equal(exposed.send, undefined);
  assert.equal(exposed.invoke, undefined);
  assert.equal(exposed.ipcRenderer, undefined);

  assert.equal((await exposed.getAppStatus()).version, '0.1.0');
  await exposed.getPublicConfig();
  assert.deepEqual(invocations, [
    [IPC_CHANNEL.appStatus, []], [IPC_CHANNEL.publicConfig, []],
  ]);

  const seen = [];
  assert.throws(() => exposed.onSdkStatus(null), TypeError);
  const unsubscribe = exposed.onSdkStatus((event) => seen.push(event));
  assert.deepEqual([...listeners.keys()], [IPC_CHANNEL.sdkStatus]);
  const emit = listeners.get(IPC_CHANNEL.sdkStatus);
  emit({ secret: 'electron-event' }, { status: 'ready', token: 'ignored' });
  emit({ secret: 'electron-event' }, { status: 'ready' });
  emit({}, { status: 'error', errorCode: 'unknown' });
  assert.deepEqual(seen, [{ status: 'ready' }, { status: 'error', errorCode: 'unknown' }]);
  assert.equal(Object.isFrozen(seen[0]), true);
  assert.equal(seen[0].secret, undefined);
  unsubscribe();
  assert.equal(listeners.size, 0);
  // The only send capability is bounded camera-frame submission.
  assert.throws(() => exposed.onCameraEvent(null), TypeError);
  const captureEvents = [];
  const stopCameraListener = exposed.onCameraEvent((event) => captureEvents.push(event));
  const onCamera = listeners.get(IPC_CHANNEL.cameraEvent);
  onCamera({}, { kind: 'state', state: 'running', key: 'PRIVATE' });
  onCamera({}, { kind: 'rate', signal: 'pulse', value: 72, unit: 'bpm',
    confidence: 90, stable: true, timestampMs: 1, credentials: 'REJECT' });
  onCamera({}, { kind: 'rate', signal: 'pulse', value: 72, unit: 'bpm',
    confidence: 90, stable: true, timestampMs: 1 });
  onCamera({}, { kind: 'unavailable', signal: 'breathing',
    reason: 'invalid', timestampMs: 1 });
  onCamera({}, { kind: 'validation', code: 7 });
  onCamera({}, { kind: 'metrics', packets: 2,
    breathingObserved: true, pulseObserved: false });
  onCamera({}, { kind: 'transport', framesReceived: 3, framesAccepted: 2,
    framesRejected: 1, framesForwarded: 1, privateFrame: 'REJECT' });
  onCamera({}, { kind: 'transport', framesReceived: 3, framesAccepted: 2,
    framesRejected: 1, framesForwarded: 1 });
  assert.deepEqual(captureEvents, [
    { kind: 'rate', signal: 'pulse', value: 72, unit: 'bpm',
      confidence: 90, stable: true, timestampMs: 1 },
    { kind: 'unavailable', signal: 'breathing', reason: 'invalid', timestampMs: 1 },
    { kind: 'validation', code: 7 },
    { kind: 'metrics', packets: 2, breathingObserved: true, pulseObserved: false },
    { kind: 'transport', framesReceived: 3, framesAccepted: 2,
      framesRejected: 1, framesForwarded: 1 },
  ]);
  assert.doesNotMatch(JSON.stringify(captureEvents), /REJECT|privateFrame/);
  assert.equal(Object.isFrozen(captureEvents[0]), true);
  stopCameraListener();
  assert.equal(listeners.size, 0);

  const frame = { width: 640, height: 480, timestampUs: 1000,
    pixels: new Uint8Array(640 * 480 * 4) };
  exposed.pushCameraFrame(frame);
  exposed.pushCameraFrame({ ...frame, width: 641 });
  assert.equal(invocations.filter((x) => x[0] === IPC_CHANNEL.cameraFrame).length, 1);
});

test('renderer consumes only type declarations, never runtime Node or Electron packages', () => {
  const declarations = read('src/types/desktop.d.ts');
  const component = read('src/app/app.ts');
  assert.match(declarations, /import type \{ SignalScapeDesktopApi \}/);
  assert.doesNotMatch(component, /from ['"](?:node:|electron)|require\(|process\.env/);
});
