'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

const root = join(__dirname, '..');

function createApp() {
  let eventListener = () => {};
  let releases = 0;
  let nativeStops = 0;
  let frameCount = 0;
  let trackStops = 0;
  let releaseBarrier = null;
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; trackStops += 1; } };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
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
    configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } },
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
