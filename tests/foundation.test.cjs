const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const pkg = JSON.parse(read('package.json'));
const angular = JSON.parse(read('angular.json'));

test('Angular is configured with strict TypeScript and a local-file-safe base URL', () => {
  assert.equal(angular.projects.signalscape.architect.build.options.baseHref, './');
  assert.equal(angular.projects.signalscape.architect.build.options.outputPath.base, 'dist/renderer');
  assert.equal(angular.projects.signalscape.architect.build.options.outputPath.browser, '');
  assert.equal(JSON.parse(read('tsconfig.json')).compilerOptions.strict, true);
  assert.equal(JSON.parse(read('tsconfig.json')).angularCompilerOptions.strictTemplates, true);
});

test('Electron isolates and sandboxes the renderer', () => {
  const main = read('electron/main.ts');
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /setPermissionRequestHandler/);
});

test('preload exports only a versioned marker, not raw privileged APIs', () => {
  const preload = read('electron/preload.ts');
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(preload, /ipcRenderer|child_process|node:fs/);
});

test('build and packaging scripts exist for development and Linux releases', () => {
  for (const name of ['dev', 'build', 'build:renderer', 'build:electron', 'typecheck', 'test', 'desktop', 'package:linux']) {
    assert.equal(typeof pkg.scripts[name], 'string', name);
  }
  assert.equal(pkg.main, 'dist/electron/main.js');
});

test('renderer CSP disallows remote scripts and embedding', () => {
  const html = read('src/index.html');
  assert.match(html, /script-src 'self'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /frame-src 'none'/);
});
