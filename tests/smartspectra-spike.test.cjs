'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseArgs, platformCheck, latestValue, safeError, runSpike, SDK_VERSION,
} = require('../scripts/smartspectra-spike.cjs');

const linux = { ok: true, target: 'linux-x64', reason: 'supported' };
function fakeSdk(configure = {}) {
  const record = { stopped: false, destroyed: false, options: null, selected: false, status: 1 };
  class SmartSpectraSDK {
    static version = SDK_VERSION;
    static availableCameras() { return configure.noCamera ? [] : [{ id: 'private-camera-id' }]; }
    constructor(options) { record.options = options; this.handlers = {}; }
    get processingStatus() { return configure.stateAtStop ?? record.status; }
    on(channel, handler) { this.handlers[channel] = handler; return this; }
    useCamera(selection) { record.selected = selection === module.CameraSelection.default; return this; }
    start() {
      if (configure.throwOnStart) throw Object.assign(new Error('key secret'), { code: 2 });
      record.status = 3;
      this.handlers.processingStatus?.(3);
      this.handlers.validationStatus?.(configure.validationCode ?? 0, 0, 'secret hint');
      if (!configure.noPackets) this.handlers.metrics?.(Buffer.from([1]));
      if (configure.emitError) this.handlers.error?.(5, 'secret must not print', true);
    }
    async stopAsync() {
      record.stopped = true;
      if (configure.errorOnStop) this.handlers.error?.(1, 'secret on stop', false);
      if (configure.throwOnStop) throw new Error('secret during cleanup');
      record.status = 1;
      this.handlers.processingStatus?.(1);
    }
    async destroy() {
      record.destroyed = true;
      this.handlers.processingStatus?.(4);
      if (configure.errorOnDestroy) this.handlers.error?.(1, 'secret on destroy', false);
      if (configure.throwOnDestroy) throw new Error('secret during destroy');
      record.status = 1;
      this.handlers.processingStatus?.(1);
    }
  }
  const module = {
    SmartSpectraSDK,
    CameraSelection: { default: { kind: 'default' } },
    breathingMetrics: [1],
    cardioMetrics: [15],
    SmartSpectraLogLevel: { kNone: 4 },
    // The root decoder intentionally returns a raw Buffer in a fresh Node
    // process; the /messages decoder must be used for actual metrics.
    decodeMetrics: () => Buffer.from([1]),
  };
  const messages = { decodeMetrics: () => configure.noSample ? Buffer.from([]) : {
    breathing: { rate: [{ value: 14 }] },
    cardio: { pulseRate: configure.noPulse ? [] : [{ value: 71 }] },
  } };
  return { module, messages, record };
}

const loadFake = (sdk) => (name) =>
  name === '@smartspectra/node-sdk/messages' ? sdk.messages : sdk.module;

test('platform and glibc checks exactly match supported native distributions', () => {
  assert.equal(platformCheck('linux', 'x64', '2.35').ok, true);
  assert.equal(platformCheck('linux', 'arm64', '2.41').ok, true);
  assert.equal(platformCheck('darwin', 'arm64').ok, true);
  assert.equal(platformCheck('win32', 'x64').ok, true);
  assert.equal(platformCheck('linux', 'x64', '2.34').reason, 'glibc-2.35-required');
  assert.equal(platformCheck('linux', 'x64').reason, 'glibc-version-unavailable');
  assert.equal(platformCheck('darwin', 'x64').reason, 'unsupported-platform');
});

test('measurement requires per-run consent and bounded duration', () => {
  assert.deepEqual(parseArgs(['--probe']), { mode: 'probe', consent: false, seconds: 45 });
  assert.deepEqual(parseArgs(['--measure', '--consent', '--seconds', '30']), {
    mode: 'measure', consent: true, seconds: 30,
  });
  for (const args of [['--measure'], ['--measure', '--consent', '--seconds', '121'], ['--probe', '--consent']]) {
    assert.throws(() => parseArgs(args));
  }
});

test('native probe does not require an API key or open camera', async () => {
  const sdk = fakeSdk();
  const result = await runSpike({ mode: 'probe' }, {
    target: linux, apiKey: '', loadSdk: loadFake(sdk),
  });
  assert.deepEqual(result, { ok: true, phase: 'native-load', target: 'linux-x64', sdkVersion: SDK_VERSION });
  assert.equal(sdk.record.options, null);
});

test('native probe identifies missing SDK without printing loader paths or keys', async () => {
  const result = await runSpike({ mode: 'probe' }, {
    target: linux, loadSdk: () => { throw new Error('secret path and key'); },
  });
  assert.equal(result.reason, 'sdk-not-loadable');
  assert.doesNotMatch(JSON.stringify(result), /secret path|key/);
});

test('measurement is blocked before SDK load without private runtime key', async () => {
  const result = await runSpike({ mode: 'measure', consent: true, seconds: 10 }, {
    target: linux, apiKey: '', loadSdk: () => { throw new Error('must not load'); },
  });
  assert.equal(result.reason, 'api-key-not-configured');
});

test('isolated measurement uses native camera, disables telemetry, reports only observation', async () => {
  const sdk = fakeSdk();
  const result = await runSpike({ mode: 'measure', consent: true, seconds: 10 }, {
    target: linux, apiKey: 'DO_NOT_LEAK_SECRET', loadSdk: loadFake(sdk),
    wait: async () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.breathingObserved, true);
  assert.equal(result.pulseObserved, true);
  assert.equal(result.packets, 1);
  assert.equal(sdk.record.options.enableTelemetry, false);
  assert.equal(sdk.record.options.logLevel, 4);
  assert.equal(sdk.record.options.apiKey, 'DO_NOT_LEAK_SECRET');
  assert.equal(sdk.record.stopped, false);
  assert.equal(sdk.record.destroyed, true);
  assert.equal(result.lastProcessingStatus, 1);
  assert.equal(result.processingStatusBeforeStop, 3);
  assert.deepEqual(result.processingStatusesSeen, [3, 4, 1]);
  assert.equal(result.lastValidationCode, 0);
  assert.deepEqual(result.validationCodesSeen, [0]);
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_LEAK_SECRET|private-camera-id|14|71|secret hint/);
});

test('SDK camera error, auth error and no sample remain non-success states', async () => {
  for (const [configuration, reason] of [
    [{ noCamera: true }, 'camera-unavailable'],
    [{ throwOnStart: true }, 'sdk-error'],
    [{ noSample: true }, 'no-valid-metric-samples'],
    [{ emitError: true }, 'sdk-error'],
  ]) {
    const sdk = fakeSdk(configuration);
    const result = await runSpike({ mode: 'measure', consent: true, seconds: 10 }, {
      target: linux, apiKey: 'KEY_DO_NOT_PRINT', loadSdk: loadFake(sdk),
      wait: async () => {},
    });
    assert.equal(result.ok, false, JSON.stringify(configuration));
    assert.equal(result.reason, reason);
    assert.doesNotMatch(JSON.stringify(result), /KEY_DO_NOT_PRINT|secret/);
    if (!configuration.noCamera) assert.equal(sdk.record.destroyed, true);
  }
});

test('metric extraction rejects malformed values and error messages remain hidden', () => {
  assert.equal(latestValue({ breathing: { rate: [{ value: 0 }] } }, 'breathing', 'rate'), undefined);
  assert.equal(latestValue(Buffer.from([]), 'breathing', 'rate'), undefined);
  assert.deepEqual(safeError(Object.assign(new Error('secret'), { code: 2 })), {
    reason: 'sdk-error', sdkErrorCode: 2,
  });
});

test('error code 1 during measurement start is marked as a startup-stage error', async () => {
  const sdk = fakeSdk({ emitError: true, validationCode: 1 });
  const result = await runSpike({ mode: 'measure', consent: true, seconds: 10 }, {
    target: linux, apiKey: 'SECRET_TEST_KEY', loadSdk: loadFake(sdk), wait: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.sdkErrorCode, 5);
  assert.equal(result.sdkErrorStage, 'starting');
  assert.equal(result.sdkErrorRetryable, true);
  assert.equal(result.packetsAtError, 1);
  assert.equal(result.lastValidationCode, 1);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_TEST_KEY|secret must not print|secret hint/);
});

test('invalid-state event during teardown is distinguishable from a capture failure', async () => {
  const sdk = fakeSdk({ errorOnDestroy: true, noPulse: true });
  const result = await runSpike({ mode: 'measure', consent: true, seconds: 10 }, {
    target: linux, apiKey: 'SECRET_TEST_KEY', loadSdk: loadFake(sdk), wait: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.breathingObserved, true);
  assert.equal(result.pulseObserved, false);
  assert.equal(result.sdkErrorCode, 1);
  assert.equal(result.sdkErrorStage, 'destroying');
  assert.equal(result.sdkErrorRetryable, false);
  assert.equal(result.packetsAtError, 1);
  assert.equal(sdk.record.destroyed, true);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_TEST_KEY|secret on destroy/);
});

test('SDK cleanup failures remain sanitized', async () => {
  const sdk = fakeSdk({ throwOnDestroy: true });
  const result = await runSpike({ mode: 'measure', consent: true, seconds: 10 }, {
    target: linux, apiKey: 'SECRET_TEST_KEY', loadSdk: loadFake(sdk), wait: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'sdk-cleanup-failed');
  assert.equal(result.sdkErrorStage, 'destroying');
  assert.equal(sdk.record.destroyed, true);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_TEST_KEY|secret during destroy/);
});

test('probe requires the /messages decoder entry point', async () => {
  const sdk = fakeSdk();
  const result = await runSpike({ mode: 'probe' }, {
    target: linux, loadSdk: (name) => name.endsWith('/messages') ? {} : sdk.module,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'sdk-api-unavailable');
});

test('destroy-only cleanup works for idle graph and zero packets', async () => {
  const sdk = fakeSdk({ noPackets: true, stateAtStop: 1, validationCode: 16 });
  const result = await runSpike({ mode: 'measure', consent: true, seconds: 10 }, {
    target: linux, apiKey: 'PRIVATE', loadSdk: loadFake(sdk), wait: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-valid-metric-samples');
  assert.equal(result.packets, 0);
  assert.equal(result.lastValidationCode, 16);
  assert.deepEqual(result.validationCodesSeen, [16]);
  assert.deepEqual(result.processingStatusesSeen, [3, 4, 1]);
  assert.equal(result.processingStatusBeforeStop, 1);
  assert.equal(sdk.record.stopped, false);
  assert.equal(sdk.record.destroyed, true);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|secret/);
});

test('destroy-only teardown works for running SDK without calling stopAsync', async () => {
  const sdk = fakeSdk({ noPackets: true });
  const result = await runSpike({ mode: 'measure', consent: true, seconds: 10 }, {
    target: linux, apiKey: 'SECRET_TEST_KEY', loadSdk: loadFake(sdk), wait: async () => {},
  });
  assert.equal(result.reason, 'no-valid-metric-samples');
  assert.equal(result.processingStatusBeforeStop, 3);
  assert.equal(sdk.record.stopped, false);
  assert.equal(sdk.record.destroyed, true);
  assert.deepEqual(result.processingStatusesSeen, [3, 4, 1]);
});
