const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { isForbiddenPath, preflight, validateArchiveEntries,
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
  const windowsEntries = entries.map((entry) => entry.replace(/\//g, '\\\\'));
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
