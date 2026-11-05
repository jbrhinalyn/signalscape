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
    startNativeMeasurement: async () => ({ ok: true }),
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
