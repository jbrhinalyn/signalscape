'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

const root = join(__dirname, '..');

function createApp(options = {}) {
  let eventListener = () => {};
  let releases = 0;
  let nativeStops = 0;
  let frameCount = 0;
  let trackStops = 0;
  let releaseBarrier = null;
  let captureError = options.captureError ?? null;
  let startResult = options.startResult ?? { ok: true };
  let captureBarrier = null;
  let devices = [
    { kind: 'videoinput', deviceId: 'front', label: 'Built-in webcam' },
    { kind: 'videoinput', deviceId: 'usb', label: 'USB camera' },
  ];
  const requests = [];
  const mediaListeners = new Map();
  const permissionListeners = new Map();
  const permission = {
    state: 'prompt',
    addEventListener: (type, callback) => permissionListeners.set(type, callback),
    removeEventListener: (type) => permissionListeners.delete(type),
  };
  function newStream(id) {
    const listeners = new Map();
    const track = {
      readyState: 'live',
      getSettings: () => ({ deviceId: id }),
      addEventListener: (type, callback) => listeners.set(type, callback),
      removeEventListener: (type) => listeners.delete(type),
      stop() { if (this.readyState === 'live') { this.readyState = 'ended'; trackStops += 1; } },
      endUnexpectedly() {
        this.readyState = 'ended';
        listeners.get('ended')?.();
      },
    };
    return { getTracks: () => [track], getVideoTracks: () => [track] };
  }
  const mediaDevices = {
    addEventListener: (type, callback) => mediaListeners.set(type, callback),
    removeEventListener: (type) => mediaListeners.delete(type),
    enumerateDevices: async () => devices,
    getUserMedia: async (constraints) => {
      requests.push(constraints);
      if (captureBarrier) await captureBarrier;
      if (captureError) throw { name: captureError };
      const id = constraints.video.deviceId?.exact ?? devices[0]?.deviceId;
      if (!id || !devices.some((device) => device.deviceId === id)) {
        throw { name: 'NotFoundError' };
      }
      return newStream(id);
    },
  };
  const video = { readyState: 3, srcObject: null, async play() {} };
  const pixels = new Uint8ClampedArray(640 * 480 * 4);
  const signal = (initial) => {
    let value = initial;
    const observable = () => value;
    observable.set = (next) => { value = next; };
    return observable;
  };
  const original = {
    window: global.window,
    document: global.document,
    navigator: Object.getOwnPropertyDescriptor(global, 'navigator'),
    HTMLMediaElement: global.HTMLMediaElement,
  };
  const native = {
    apiVersion: 1,
    onCameraEvent(listener) { eventListener = listener; return () => { eventListener = () => {}; }; },
    getAppStatus: async () => ({ apiVersion: 1, version: '0.1.0' }),
    authorizeCameraPreview: async () => true,
    releaseCameraPreview: async () => {
      releases += 1;
      if (releaseBarrier) await releaseBarrier;
    },
    startNativeMeasurement: async () => {
      if (options.startError) throw new Error('PRIVATE_NATIVE_FAILURE');
      return startResult;
    },
    stopNativeMeasurement: async () => {
      nativeStops += 1;
      eventListener({ kind: 'state', state: 'stopped' });
    },
    pushCameraFrame: () => { frameCount += 1; },
  };
  global.window = { signalScape: native };
  global.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data: pixels }),
      }),
    }),
  };
  Object.defineProperty(global, 'navigator', {
    configurable: true, value: {
      mediaDevices, permissions: { query: async () => permission },
    },
  });
  global.HTMLMediaElement = { HAVE_CURRENT_DATA: 2 };
  const source = readFileSync(join(root, 'src/app/app.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    experimentalDecorators: true,
  } }).outputText;
  const module = { exports: {} };
  try {
    new Function('require', 'module', 'exports', code)((id) => {
      if (id === '../../electron/signals/model') {
        const source = readFileSync(join(root, 'electron/signals/model.ts'), 'utf8');
        const code = ts.transpileModule(source, { compilerOptions: {
          module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        } }).outputText;
        const loaded = { exports: {} };
        new Function('module', 'exports', code)(loaded, loaded.exports);
        return loaded.exports;
      }
      if (id === './forest/forest-scene') return { ForestSceneComponent: class {} };
      assert.equal(id, '@angular/core');
      return {
        ChangeDetectionStrategy: { OnPush: 0 },
        Component: () => (target) => target,
        ViewChild: () => () => {},
        signal,
      };
    }, module, module.exports);
  } finally {
    // Keep browser mocks for the instance; each test restores before leaving.
  }
  const app = new module.exports.App();
  app.video = { nativeElement: video };
  const restore = () => {
    app.ngOnDestroy();
    if (original.window === undefined) delete global.window;
    else global.window = original.window;
    if (original.document === undefined) delete global.document;
    else global.document = original.document;
    if (original.navigator) Object.defineProperty(global, 'navigator', original.navigator);
    else delete global.navigator;
    if (original.HTMLMediaElement === undefined) delete global.HTMLMediaElement;
    else global.HTMLMediaElement = original.HTMLMediaElement;
  };
  return {
    app, video, native, emit: (e) => eventListener(e), restore,
    get trackStops() { return trackStops; },
    get frameCount() { return frameCount; },
    get releases() { return releases; },
    get nativeStops() { return nativeStops; },
    get requests() { return requests; },
    permission,
    setCaptureError(name) { captureError = name; },
    setStartResult(result) { startResult = result; },
    setDevices(next) { devices = next; },
    emitDeviceChange() { mediaListeners.get('devicechange')?.(); },
    emitPermissionChange() { permissionListeners.get('change')?.(); },
    endActiveTrack() { video.srcObject?.getVideoTracks()[0]?.endUnexpectedly(); },
    holdCapture() {
      let resolve;
      captureBarrier = new Promise((done) => { resolve = done; });
      return () => { captureBarrier = null; resolve(); };
    },
    holdRelease() {
      let resolve;
      releaseBarrier = new Promise((done) => { resolve = done; });
      return () => { releaseBarrier = null; resolve(); };
    },
  };
}

test('measurement stop resets stale message and leaves preview active', async () => {
  const fixture = createApp();
  try {
    await fixture.app.enablePreview();
    assert.equal(fixture.app.previewing(), true);
    await fixture.app.startMeasurement();
    assert.equal(fixture.app.measuring(), true);
    fixture.emit({ kind: 'transport', framesReceived: 7, framesAccepted: 7,
      framesRejected: 0, framesForwarded: 5 });
    assert.equal(fixture.app.framesAccepted(), 7);
    assert.match(fixture.app.message(), /waiting for metric packets/i);
    await fixture.app.stopMeasurement();
    assert.equal(fixture.app.measuring(), false);
    assert.equal(fixture.app.previewing(), true);
    assert.equal(fixture.app.cameraState(), 'Preview active');
    assert.deepEqual(fixture.app.sceneView(), {
      quality: 'disconnected', pulse: null, breathing: null,
    });
    assert.match(fixture.app.message(), /Measurement stopped/);
    assert.equal(fixture.nativeStops, 1);
  } finally {
    fixture.restore();
  }
});

test('Stop camera releases the OS stream immediately, even if native teardown is pending', async () => {
  const fixture = createApp();
  try {
    await fixture.app.enablePreview();
    await fixture.app.startMeasurement();
    const release = fixture.holdRelease();
    const stopped = fixture.app.stopPreview();
    assert.equal(fixture.trackStops, 1);
    assert.equal(fixture.app.previewing(), false);
    assert.equal(fixture.app.measuring(), false);
    assert.deepEqual(fixture.app.sceneView(), {
      quality: 'disconnected', pulse: null, breathing: null,
    });
    assert.equal(fixture.video.srcObject, null);
    assert.equal(fixture.releases, 1);
    assert.match(fixture.app.message(), /Releasing the camera/);
    release();
    await stopped;
    assert.equal(fixture.app.cameraState(), 'Off');
    assert.match(fixture.app.message(), /Camera stopped/);
  } finally {
    fixture.restore();
  }
});

test('camera discovery is passive; selecting a camera does not request permission', async () => {
  const fixture = createApp();
  try {
    await fixture.app.refreshCameras();
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.app.previewing(), false);
    assert.equal(fixture.app.cameras().length, 2);
    fixture.app.selectCamera('usb');
    assert.equal(fixture.requests.length, 0);
    await fixture.app.enablePreview();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].audio, false);
    assert.equal(fixture.requests[0].video.deviceId.exact, 'usb');
    assert.equal(fixture.app.cameraAccess(), 'Allowed for preview');
  } finally {
    fixture.restore();
  }
});

test('permission denial is explained and retry can recover without automatic camera startup', async () => {
  const fixture = createApp({ captureError: 'NotAllowedError' });
  try {
    await fixture.app.enablePreview();
    assert.equal(fixture.app.previewing(), false);
    assert.equal(fixture.app.cameraAccess(), 'Denied');
    assert.match(fixture.app.message(), /permission denied/i);
    assert.equal(fixture.releases, 1);
    fixture.setCaptureError(null);
    assert.equal(fixture.requests.length, 1);
    await fixture.app.enablePreview();
    assert.equal(fixture.app.previewing(), true);
    assert.equal(fixture.requests.length, 2);
  } finally {
    fixture.restore();
  }
});

test('switching cameras stops measurement and requests only the chosen device', async () => {
  const fixture = createApp();
  try {
    await fixture.app.enablePreview();
    assert.equal(fixture.app.activeCameraId(), 'front');
    await fixture.app.startMeasurement();
    fixture.app.selectCamera('usb');
    await fixture.app.switchCamera();
    assert.equal(fixture.app.activeCameraId(), 'usb');
    assert.equal(fixture.app.measuring(), false);
    assert.equal(fixture.app.previewing(), true);
    assert.equal(fixture.trackStops, 1);
    assert.equal(fixture.requests[1].video.deviceId.exact, 'usb');
    assert.match(fixture.app.message(), /Camera switched/);
  } finally {
    fixture.restore();
  }
});

test('revoking permission closes preview and disarms native capture', async () => {
  const fixture = createApp();
  try {
    await fixture.app.enablePreview();
    await Promise.resolve(); // wait for the asynchronous permissions query listener
    fixture.permission.state = 'denied';
    fixture.emitPermissionChange();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fixture.app.previewing(), false);
    assert.equal(fixture.app.cameraAccess(), 'Revoked');
    assert.equal(fixture.trackStops, 1);
    assert.match(fixture.app.message(), /permission revoked/i);
    assert.ok(fixture.releases >= 1);
  } finally {
    fixture.restore();
  }
});

test('disconnecting an active camera stops the preview and selects the default', async () => {
  const fixture = createApp();
  try {
    await fixture.app.enablePreview();
    fixture.setDevices([{ kind: 'videoinput', deviceId: 'usb', label: 'USB camera' }]);
    fixture.emitDeviceChange();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fixture.app.previewing(), false);
    assert.equal(fixture.app.selectedCameraId(), '');
    assert.equal(fixture.app.cameraAccess(), 'Unavailable');
    assert.match(fixture.app.message(), /disconnected/i);
  } finally {
    fixture.restore();
  }
});

test('Stop camera cancels an in-flight camera permission/device request', async () => {
  const fixture = createApp();
  try {
    const releaseCapture = fixture.holdCapture();
    const opening = fixture.app.enablePreview();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fixture.app.busy(), true);
    await fixture.app.stopPreview();
    releaseCapture();
    await opening;
    assert.equal(fixture.app.previewing(), false);
    assert.equal(fixture.app.busy(), false);
    assert.equal(fixture.video.srcObject, null);
    assert.equal(fixture.trackStops, 1);
    assert.match(fixture.app.message(), /Camera stopped/i);
  } finally {
    fixture.restore();
  }
});

test('camera access errors distinguish busy cameras from missing devices', async () => {
  const fixture = createApp({ captureError: 'NotReadableError' });
  try {
    await fixture.app.enablePreview();
    assert.equal(fixture.app.cameraAccess(), 'Busy');
    assert.match(fixture.app.message(), /in use/i);
    fixture.setCaptureError('NotFoundError');
    await fixture.app.enablePreview();
    assert.equal(fixture.app.cameraAccess(), 'Unavailable');
    assert.match(fixture.app.message(), /not found/i);
  } finally {
    fixture.restore();
  }
});


test('failed native start releases OS camera, disarms bridge, and needs explicit retry', async () => {
  const fixture = createApp({ startResult: { ok: false, reason: 'api-key-not-configured' } });
  try {
    await fixture.app.enablePreview();
    await fixture.app.startMeasurement();
    assert.equal(fixture.app.previewing(), false);
    assert.equal(fixture.app.measuring(), false);
    assert.equal(fixture.video.srcObject, null);
    assert.equal(fixture.trackStops, 1);
    assert.equal(fixture.releases, 1);
    assert.match(fixture.app.message(), /SMARTSPECTRA_API_KEY/);
    assert.match(fixture.app.message(), /Camera released/);
    assert.equal(fixture.frameCount, 0);
    fixture.setStartResult({ ok: true });
    assert.equal(fixture.requests.length, 1); // never reopen without consent
    await fixture.app.enablePreview();
    assert.equal(fixture.app.previewing(), true);
    assert.equal(fixture.app.measuring(), false);
    await fixture.app.startMeasurement();
    assert.equal(fixture.app.measuring(), true);
  } finally {
    fixture.restore();
  }
});

test('rejected native start promise also closes the preview', async () => {
  const fixture = createApp({ startError: true });
  try {
    await fixture.app.enablePreview();
    await fixture.app.startMeasurement();
    assert.equal(fixture.app.previewing(), false);
    assert.equal(fixture.trackStops, 1);
    assert.equal(fixture.releases, 1);
    assert.match(fixture.app.message(), /native SDK did not respond/i);
  } finally {
    fixture.restore();
  }
});

test('asynchronous SDK fatal event immediately stops OS camera before native disarm settles', async () => {
  const fixture = createApp();
  try {
    await fixture.app.enablePreview();
    await fixture.app.startMeasurement();
    const release = fixture.holdRelease();
    fixture.emit({ kind: 'state', state: 'error', errorCode: 1 });
    assert.equal(fixture.app.previewing(), false);
    assert.equal(fixture.app.measuring(), false);
    assert.equal(fixture.video.srcObject, null);
    assert.equal(fixture.trackStops, 1);
    assert.equal(fixture.releases, 1);
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(fixture.app.message(), /error \(code 1\).*Camera released/i);
    assert.equal(fixture.app.cameraState(), 'Off');
  } finally {
    fixture.restore();
  }
});

test('canceling an in-flight native start prevents any late successful result reopening capture', async () => {
  const fixture = createApp();
  try {
    await fixture.app.enablePreview();
    let resolveStart;
    fixture.native.startNativeMeasurement = () =>
      new Promise((resolve) => { resolveStart = resolve; });
    const pendingStart = fixture.app.startMeasurement();
    await Promise.resolve();
    await fixture.app.stopPreview();
    resolveStart({ ok: true });
    await pendingStart;
    assert.equal(fixture.app.previewing(), false);
    assert.equal(fixture.app.measuring(), false);
    assert.equal(fixture.frameCount, 0);
    assert.equal(fixture.trackStops, 1);
    assert.equal(fixture.releases, 1);
  } finally {
    fixture.restore();
  }
});

test('renderer never presents a rate before confidence and warm-up gates pass', async () => {
  const fixture = createApp();
  try {
    await fixture.app.enablePreview();
    await fixture.app.startMeasurement();
    assert.equal(fixture.app.signalQuality(), 'warming');
    fixture.emit({ kind: 'validation', code: 0 });
    fixture.emit({ kind: 'rate', signal: 'pulse', value: 72, unit: 'bpm',
      confidence: 90, stable: true, timestampMs: Date.now() });
    assert.equal(fixture.app.pulseRate(), null);
    assert.equal(fixture.app.breathingRate(), null);
    await fixture.app.stopMeasurement();
    assert.equal(fixture.app.signalQuality(), 'disconnected');
    fixture.emit({ kind: 'rate', signal: 'pulse', value: 72, unit: 'bpm',
      confidence: 90, stable: true, timestampMs: Date.now() });
    assert.equal(fixture.app.pulseRate(), null);
  } finally {
    fixture.restore();
  }
});
