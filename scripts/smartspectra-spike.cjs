#!/usr/bin/env node
'use strict';

// Standalone Node-only validation spike. NEVER import this module in Angular
// or preload: the SDK key and native FFI must stay outside the renderer.
const SDK_PACKAGE = '@smartspectra/node-sdk';
const SDK_MESSAGES_PACKAGE = '@smartspectra/node-sdk/messages';
const SDK_VERSION = '3.4.0';
const SUPPORTED = new Set(['linux-x64', 'linux-arm64', 'darwin-arm64', 'win32-x64']);

function parseArgs(argv) {
  let mode = 'probe';
  let consent = false;
  let seconds = 45;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--probe') mode = 'probe';
    else if (argv[i] === '--measure') mode = 'measure';
    else if (argv[i] === '--consent') consent = true;
    else if (argv[i] === '--seconds' && /^\d+$/.test(argv[i + 1] ?? '')) {
      seconds = Number(argv[++i]);
    } else throw new Error('invalid-arguments');
  }
  if (seconds < 10 || seconds > 120 || !Number.isSafeInteger(seconds)) {
    throw new Error('invalid-duration');
  }
  if (mode === 'probe' && consent) throw new Error('consent-only-for-measure');
  if (mode === 'measure' && !consent) throw new Error('explicit-consent-required');
  return { mode, consent, seconds };
}

function platformCheck(platform = process.platform, arch = process.arch, glibc) {
  const target = platform + '-' + arch;
  if (!SUPPORTED.has(target)) return { ok: false, target, reason: 'unsupported-platform' };
  if (platform === 'linux') {
    if (!glibc) return { ok: false, target, reason: 'glibc-version-unavailable' };
    const match = /^(\d+)\.(\d+)/.exec(glibc);
    if (!match || Number(match[1]) < 2 ||
      (Number(match[1]) === 2 && Number(match[2]) < 35)) {
      return { ok: false, target, reason: 'glibc-2.35-required' };
    }
  }
  return { ok: true, target, reason: 'supported' };
}

function latestValue(data, section, key) {
  if (typeof data !== 'object' || data === null || Buffer.isBuffer(data)) return undefined;
  const group = data[section];
  if (typeof group !== 'object' || group === null) return undefined;
  const series = group[key];
  if (!Array.isArray(series) || series.length === 0) return undefined;
  const value = series[series.length - 1]?.value;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function safeError(error) {
  // Never print SDK error messages, stack traces, paths, or credentials.
  if (error && typeof error === 'object' && typeof error.code === 'number') {
    return { reason: 'sdk-error', sdkErrorCode: error.code };
  }
  return { reason: 'sdk-failure' };
}

async function runSpike(options, deps = {}) {
  if (options.mode === 'measure' && options.consent !== true) {
    return { ok: false, phase: 'consent', reason: 'explicit-consent-required' };
  }
  const target = deps.target ?? platformCheck(
    process.platform,
    process.arch,
    process.report?.getReport()?.header?.glibcVersionRuntime,
  );
  if (!target.ok) return { ok: false, phase: 'platform', target: target.target, reason: target.reason };

  const apiKey = deps.apiKey ?? process.env.SMARTSPECTRA_API_KEY;
  if (options.mode === 'measure' && (!apiKey || !apiKey.trim())) {
    return { ok: false, phase: 'auth', target: target.target, reason: 'api-key-not-configured' };
  }

  let sdkModule;
  let metricsModule;
  try {
    const loadSdk = deps.loadSdk ?? require;
    sdkModule = loadSdk(SDK_PACKAGE);
    // Unlike the root decodeMetrics export, /messages always registers and
    // decodes the bundled protobuf Metrics class. Root may return raw Buffer.
    metricsModule = loadSdk(SDK_MESSAGES_PACKAGE);
    if (typeof sdkModule.SmartSpectraSDK !== 'function' ||
      typeof sdkModule.SmartSpectraSDK.availableCameras !== 'function' ||
      typeof metricsModule.decodeMetrics !== 'function') {
      return { ok: false, phase: 'native-load', target: target.target, reason: 'sdk-api-unavailable' };
    }
  } catch {
    return { ok: false, phase: 'native-load', target: target.target, reason: 'sdk-not-loadable' };
  }

  const version = String(sdkModule.SmartSpectraSDK.version ?? 'unknown');
  if (options.mode === 'probe') {
    return { ok: true, phase: 'native-load', target: target.target, sdkVersion: version };
  }

  let cameraCount;
  try {
    cameraCount = sdkModule.SmartSpectraSDK.availableCameras().length;
  } catch {
    return { ok: false, phase: 'camera', target: target.target, reason: 'camera-discovery-failed' };
  }
  if (cameraCount === 0) {
    return { ok: false, phase: 'camera', target: target.target, reason: 'camera-unavailable' };
  }

  const metrics = { packets: 0, breathingObserved: false, pulseObserved: false };
  // Lifecycle and validation codes are safe diagnostics; never capture raw
  // camera frames, SDK error messages, or the physiological sample values.
  const diagnostics = {
    lastProcessingStatus: null,
    processingStatusesSeen: [],
    processingStatusBeforeStop: null,
    lastValidationCode: null,
    validationCodesSeen: [],
  };
  let sdk;
  let failure = null;
  let started = false;
  let lifecycleStage = 'initializing';
  try {
    sdk = new sdkModule.SmartSpectraSDK({
      apiKey,
      requestedMetrics: [...sdkModule.breathingMetrics, ...sdkModule.cardioMetrics],
      enableTelemetry: false,
      logLevel: sdkModule.SmartSpectraLogLevel.kNone,
    });
    sdk.on('metrics', (buffer) => {
      metrics.packets += 1;
      let decoded;
      try { decoded = metricsModule.decodeMetrics(buffer); } catch { return; }
      if (latestValue(decoded, 'breathing', 'rate') !== undefined) metrics.breathingObserved = true;
      if (latestValue(decoded, 'cardio', 'pulseRate') !== undefined) metrics.pulseObserved = true;
    });
    sdk.on('processingStatus', (status) => {
      if (Number.isInteger(status) && status >= 0 && status <= 5) {
        diagnostics.lastProcessingStatus = status;
        if (diagnostics.processingStatusesSeen.at(-1) !== status &&
          diagnostics.processingStatusesSeen.length < 24) {
          diagnostics.processingStatusesSeen.push(status);
        }
      }
    });
    sdk.on('validationStatus', (code) => {
      if (Number.isInteger(code) && code >= 0 && code <= 17) {
        diagnostics.lastValidationCode = code;
        if (!diagnostics.validationCodesSeen.includes(code)) {
          diagnostics.validationCodesSeen.push(code);
        }
      }
    });
    sdk.on('error', (code, _message, retryable) => {
      // Retain the first failure rather than overwriting it during teardown.
      failure = failure ?? {
        reason: 'sdk-error',
        sdkErrorCode: Number.isInteger(code) ? code : null,
        sdkErrorStage: lifecycleStage,
        sdkErrorRetryable: retryable === true,
        packetsAtError: metrics.packets,
      };
    });
    sdk.useCamera(sdkModule.CameraSelection.default);
    lifecycleStage = 'starting';
    sdk.start();
    started = true;
    lifecycleStage = 'measuring';

    // Cancellation is explicit; always release the device via finally.
    const wait = deps.wait ?? ((ms) => new Promise((resolve) => {
      const timeout = setTimeout(() => { cleanup(); resolve(); }, ms);
      const cancel = () => { clearTimeout(timeout); cleanup(); resolve(); };
      const cleanup = () => {
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGTERM', cancel);
      };
      process.once('SIGINT', cancel);
      process.once('SIGTERM', cancel);
    }));
    await wait(options.seconds * 1000);
  } catch (error) {
    failure = failure ?? { ...safeError(error), sdkErrorStage: lifecycleStage };
  } finally {
    if (sdk) {
      // Snapshot BEFORE stopping. The last status alone is often Idle because
      // teardown has already completed and doesn't describe active capture.
      const currentStatus = sdk.processingStatus;
      diagnostics.processingStatusBeforeStop =
        Number.isInteger(currentStatus) && currentStatus >= 0 && currentStatus <= 5
          ? currentStatus : diagnostics.lastProcessingStatus;
      lifecycleStage = 'stopping';
      // Avoid redundant stop when the graph is already idle. Still call
      // destroy() unconditionally and retain any actual SDK error event.
      if (started && diagnostics.processingStatusBeforeStop !== 1) {
        try { await sdk.stopAsync(); } catch {
          failure = failure ?? { reason: 'sdk-cleanup-failed', sdkErrorStage: lifecycleStage };
        }
      }
      lifecycleStage = 'destroying';
      try { await sdk.destroy(); } catch {
        failure = failure ?? { reason: 'sdk-cleanup-failed', sdkErrorStage: lifecycleStage };
      }
    }
  }

  return {
    ok: !failure && (metrics.breathingObserved || metrics.pulseObserved),
    phase: 'measurement',
    target: target.target,
    sdkVersion: version,
    cameraAvailable: true,
    ...metrics,
    ...diagnostics,
    ...(!failure && !metrics.breathingObserved && !metrics.pulseObserved
      ? { reason: 'no-valid-metric-samples' } : failure ?? {}),
  };
}

if (require.main === module) {
  (async () => {
    try {
      const result = await runSpike(parseArgs(process.argv.slice(2)));
      process.stdout.write(JSON.stringify(result) + '\n');
      if (!result.ok) process.exitCode = 1;
    } catch {
      process.stderr.write('SmartSpectra spike: invalid arguments; see docs/sdk-validation.md\n');
      process.exitCode = 2;
    }
  })();
}

module.exports = { parseArgs, platformCheck, latestValue, safeError, runSpike, SDK_VERSION };
