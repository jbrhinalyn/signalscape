const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeText, lintTypeScript } = require('../scripts/quality.cjs');
const { isSensitivePath, validateTrackedFiles } = require('../scripts/check-secrets.cjs');

test('formatting normalizes CRLF, trailing whitespace and terminal newlines', () => {
  assert.equal(normalizeText('const ok = true;  \r\n\r\n'), 'const ok = true;\n');
  assert.equal(normalizeText('a\nb\n'), 'a\nb\n');
  assert.equal(normalizeText('a\tb\n'), 'a\tb\n');
});

test('TypeScript lint rejects unsafe dynamic code, explicit any and debugger', () => {
  assert.deepEqual(lintTypeScript('const value: string = "safe";', 'fixture.ts'), []);
  for (const code of [
    'debugger;',
    'let value: any;',
    'eval("2 + 2");',
    'new Function("return 1");',
    '// @ts-ignore\nconst value = 1;',
    'const broken: = 1;',
  ]) {
    assert.notEqual(lintTypeScript(code, 'fixture.ts').length, 0, code);
  }
});

test('secret guard prohibits env overrides, private keys and secret folders', () => {
  for (const unsafe of [
    '.env', '.env.local', 'nested/.env.production', 'config/.env.test',
    '.envrc', 'certs/server.pem', 'key.p12', 'user.key',
    'id_ed25519', 'secrets/config.json',
  ]) assert.equal(isSensitivePath(unsafe), true, unsafe);
  for (const safe of [
    '.env.example', 'docs/environment.md', 'README.md', 'src/app/app.ts',
  ]) assert.equal(isSensitivePath(safe), false, safe);
});

test('secret scanner checks all tracked text, including .env.example', () => {
  // Split the test marker so that the guard does not flag its own fixtures.
  const marker = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  const files = ['.env.example', 'docs/README', 'public/sound.bin'];
  const contents = {
    '.env.example': Buffer.from('TEST_KEY=' + marker + '\n'),
    'docs/README': Buffer.from('No secrets here\n'),
    'public/sound.bin': Buffer.from([0, 1, 2]),
  };
  assert.deepEqual(
    validateTrackedFiles(files, (path) => contents[path]),
    ['Private key marker found in tracked file: .env.example'],
  );
  assert.deepEqual(
    validateTrackedFiles(['.env.example'], () => Buffer.from('SIGNALSCAPE_DEV_SERVER=0\n')),
    [],
  );
});

test('quality and secret checks are wired to npm scripts', () => {
  const { scripts } = require('../package.json');
  for (const task of ['lint', 'format', 'format:check', 'check:secrets', 'typecheck', 'test', 'build', 'quality']) {
    assert.equal(typeof scripts[task], 'string', task);
  }
});
