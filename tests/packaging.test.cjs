const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { isForbiddenPath, isNativeSdkPath, hasEmbeddedSdkCredential,
  validateReviewDependencies, preflight, validateArchiveEntries, inspectUnpackedFiles,
  expectedArtifacts } = require('../scripts/packaging.cjs');
const packageJson = require('../package.json');

test('package targets are versioned, use the checked-in lock and never publish', () => {
  assert.match(packageJson.scripts['package:linux'], /--linux AppImage deb --x64 --publish never/);
  assert.match(packageJson.scripts['package:win'], /--win nsis --x64 --publish never/);
  assert.match(packageJson.scripts['package:linux'], /package:preflight/);
  assert.match(packageJson.scripts['package:win'], /package:preflight/);
  assert.equal(packageJson.build.asar, true);
  assert.deepEqual(packageJson.build.win.target, ['nsis']);
  assert.match(packageJson.build.linux.artifactName, /\$\{version\}/);
  assert.match(packageJson.build.win.artifactName, /\$\{version\}/);
  assert.equal(packageJson.build.files.includes('package.json'), true);
  const lock = require('../package-lock.json');
  assert.equal(lock.packages[''].version, packageJson.version);
  assert.ok(lock.packages['node_modules/@electron/asar']);
});

test('secret-looking paths and source maps are forbidden in packaged archives', () => {
  for (const name of ['dist/.env', 'dist/.env.production', 'dist/secret.key',
    'dist/token.p12', 'dist/app.js.map', 'secrets/data', 'id_rsa']) {
    assert.equal(isForbiddenPath(name), true, name);
  }
  assert.equal(isForbiddenPath('dist/renderer/index.html'), false);
});

test('preflight prevents packaging a developer SmartSpectra API key', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalscape-package-test-'));
  try {
    mkdirSync(join(dir, 'renderer'));
    writeFileSync(join(dir, 'renderer', 'index.html'), '<html></html>');
    assert.doesNotThrow(() => preflight({}, dir));
    assert.throws(() => preflight({ SMARTSPECTRA_API_KEY: 'private-runtime-value' }, dir),
      /Unset SMARTSPECTRA_API_KEY/);
    writeFileSync(join(dir, '.env'), 'SHOULD_NOT_SHIP=1');
    assert.throws(() => preflight({}, dir), /forbidden file/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('archive validation enforces boot assets and excludes secrets and native SDK', () => {
  const entries = ['/package.json', '/dist/electron/main.js', '/dist/electron/preload.js',
    '/dist/renderer/index.html'];
  assert.deepEqual(validateArchiveEntries(entries), []);
  const windowsEntries = entries.map((entry) => entry.replace(/\//g, '\\'));
  assert.deepEqual(validateArchiveEntries(windowsEntries), []);
  assert.ok(validateArchiveEntries(entries.slice(1)).some((line) => /package.json/.test(line)));
  assert.ok(validateArchiveEntries([...entries, '/node_modules/@smartspectra/node-sdk/index.js'])
    .some((line) => /native SDK/.test(line)));
  assert.ok(validateArchiveEntries([...entries, '/dist/renderer/.env.local'])
    .some((line) => /Forbidden packaged entry/.test(line)));
});

test('release verification requires versioned Linux artifacts or Windows installer', () => {
  const version = packageJson.version;
  const linux = ['SignalScape-' + version + '-linux-x64.AppImage',
    'SignalScape-' + version + '-linux-amd64.deb'];
  assert.deepEqual(expectedArtifacts(version, 'linux', linux), linux);
  assert.deepEqual(expectedArtifacts(version, 'win',
    ['SignalScape-' + version + '-win-x64.exe']),
    ['SignalScape-' + version + '-win-x64.exe']);
  assert.throws(() => expectedArtifacts(version, 'linux', [linux[0]]), /Missing versioned/);
  assert.throws(() => expectedArtifacts(version, 'win', ['SignalScape-0.0.0-win-x64.exe']),
    /Missing versioned/);
});

test('review manifests reject SDK dependencies even when only marked optional or dev', () => {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    assert.throws(() => validateReviewDependencies({
      [field]: { '@smartspectra/node-sdk': '3.4.0' },
    }), /Unapproved SmartSpectra dependency/);
  }
  assert.doesNotThrow(() => validateReviewDependencies({ dependencies: { rxjs: '^7.8.2' } }));
});

test('native sidecars and unapproved SDK packages are rejected outside ASAR', () => {
  assert.equal(isNativeSdkPath('resources/app.asar.unpacked/node_modules/@smartspectra/node-sdk'), true);
  assert.equal(isNativeSdkPath('libsmartspectra_capi.so'), true);
  assert.equal(isNativeSdkPath('SmartSpectra.dll'), true);
  assert.equal(isNativeSdkPath('libsmartspectra_capi.dylib'), true);
  assert.equal(isNativeSdkPath('resources/app.asar'), false);
  const dir = mkdtempSync(join(tmpdir(), 'signalscape-unpacked-test-'));
  const root = join(dir, 'linux-unpacked');
  const resources = join(root, 'resources');
  try {
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, 'app.asar'), 'stand-in');
    assert.doesNotThrow(() => inspectUnpackedFiles('linux', dir));
    const sdk = join(resources, 'app.asar.unpacked', 'node_modules', '@smartspectra');
    mkdirSync(sdk, { recursive: true });
    writeFileSync(join(sdk, 'index.js'), 'module.exports = {};');
    assert.throws(() => inspectUnpackedFiles('linux', dir), /Unapproved native SDK sidecar/);
    rmSync(join(resources, 'app.asar.unpacked'), { recursive: true, force: true });
    writeFileSync(join(root, 'libsmartspectra_capi.so'), 'binary');
    assert.throws(() => inspectUnpackedFiles('linux', dir), /Unapproved native SDK sidecar/);
    rmSync(join(root, 'libsmartspectra_capi.so'));
    writeFileSync(join(resources, '.env.production'), 'KEY=example');
    assert.throws(() => inspectUnpackedFiles('linux', dir), /Forbidden unpacked entry/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('unpacked resource scanner rejects private keys without printing their content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalscape-unpacked-secret-test-'));
  const resources = join(dir, 'win-unpacked', 'resources');
  try {
    mkdirSync(resources, { recursive: true });
    const secret = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    writeFileSync(join(resources, 'override.json'), JSON.stringify({ value: secret }));
    assert.throws(() => inspectUnpackedFiles('win', dir), (error) =>
      /Private key marker in unpacked entry/.test(error.message) &&
      !error.message.includes(secret));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inline SmartSpectra credentials are blocked without printing secret values', () => {
  const key = 'FAKE-TEST-KEY-DO-NOT-USE';
  for (const literal of [
    "sdk = { apiKey: '" + key + "' };",
    '{"apiKey":"' + key + '"}',
    '{"SMARTSPECTRA_API_KEY":"' + key + '"}',
    'const config = { SMARTSPECTRA_API_KEY: "' + key + '" };',
    'process.env.SMARTSPECTRA_API_KEY = "' + key + '";',
    "process.env['SMARTSPECTRA_API_KEY'] = '" + key + "';",
  ]) {
    assert.equal(hasEmbeddedSdkCredential(literal), true, literal.split(key).length === 2);
  }
  assert.equal(hasEmbeddedSdkCredential("apiKey: key, process.env['SMARTSPECTRA_API_KEY']"), false);
  assert.equal(hasEmbeddedSdkCredential("enableTelemetry: false"), false);

  const dir = mkdtempSync(join(tmpdir(), 'signalscape-inline-key-test-'));
  try {
    mkdirSync(join(dir, 'renderer'));
    writeFileSync(join(dir, 'renderer', 'index.html'), '<html></html>');
    const target = join(dir, 'renderer', 'app.js');
    writeFileSync(target, "const runtime = { apiKey: '" + key + "' };");
    assert.throws(() => preflight({}, dir), (error) =>
      /embedded SDK credential marker/.test(error.message) &&
      !error.message.includes(key));
    rmSync(target);

    const sdk = join(dir, 'renderer', 'libsmartspectra_capi.so');
    writeFileSync(sdk, 'placeholder native content');
    assert.throws(() => preflight({}, dir), /unapproved native SDK asset/);
    rmSync(sdk);

    assert.doesNotThrow(() => preflight({}, dir));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('unpacked review files reject inline SDK keys without exposing values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalscape-unpacked-inline-test-'));
  const resources = join(dir, 'linux-unpacked', 'resources');
  const key = 'FAKE-TEST-KEY-DO-NOT-USE';
  try {
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, 'settings.json'), '{"apiKey":"' + key + '"}');
    assert.throws(() => inspectUnpackedFiles('linux', dir), (error) =>
      /Embedded SDK credential marker/.test(error.message) &&
      !error.message.includes(key));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
