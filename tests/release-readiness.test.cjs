'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { REQUIRED_GATES, evaluateReadiness, currentStatus } =
  require('../scripts/release-readiness.cjs');

const root = join(__dirname, '..');
const file = (path) => readFileSync(join(root, path), 'utf8');
const config = () => JSON.parse(file('config/release-readiness.json'));

test('SDK public release gates default to NO_GO without approvals', () => {
  const status = currentStatus();
  assert.equal(status.decision, 'NO_GO');
  assert.equal(status.isPublicDistributionApproved, false);
  assert.equal(status.blockers.length, REQUIRED_GATES.length);
  assert.equal(status.satisfied, 0);
  assert.deepEqual(REQUIRED_GATES, Object.keys(config().gates));
});

test('each release gate requires both explicit approved status and a cited issue or PR', () => {
  const x = config();
  for (const key of REQUIRED_GATES) {
    x.gates[key] = { approved: true, evidenceRef: 'https://github.com/jbrhinalyn/signalscape/issues/24' };
  }
  const complete = evaluateReadiness(x);
  assert.equal(complete.decision, 'OWNER_REVIEW_REQUIRED');
  assert.equal(complete.isPublicDistributionApproved, false);
  assert.equal(complete.blockers.length, 0);
  delete x.gates[REQUIRED_GATES[0]];
  assert.throws(() => evaluateReadiness(x), /Unexpected or missing/);
  x.gates[REQUIRED_GATES[0]] = { approved: true, evidenceRef: 'not-a-reviewed-link' };
  assert.ok(evaluateReadiness(x).blockers.includes(REQUIRED_GATES[0]));
  x.gates[REQUIRED_GATES[0]] = { approved: false,
    evidenceRef: 'https://github.com/jbrhinalyn/signalscape/issues/24' };
  assert.ok(evaluateReadiness(x).blockers.includes(REQUIRED_GATES[0]));
});

test('malformed readiness manifests cannot silently skip blockers', () => {
  assert.throws(() => evaluateReadiness({}), /Invalid release criteria/);
  const x = config();
  x.gates.providerRedistributionRights = { approved: 'yes', evidenceRef: null };
  assert.throws(() => evaluateReadiness(x), /Invalid release gate/);
  x.gates.providerRedistributionRights = { approved: false, evidenceRef: null };
  x.gates.extraGate = { approved: true, evidenceRef: null };
  assert.throws(() => evaluateReadiness(x), /Unexpected or missing/);
});

test('status command is sanitized; assert-ready returns failure on unapproved default manifest', () => {
  const status = spawnSync(process.execPath,
    ['scripts/release-readiness.cjs', '--status'], { cwd: root, encoding: 'utf8' });
  assert.equal(status.status, 0);
  const json = JSON.parse(status.stdout);
  assert.equal(json.decision, 'NO_GO');
  assert.equal(json.isPublicDistributionApproved, false);
  assert.doesNotMatch(status.stdout, /apiKey|SMARTSPECTRA_API_KEY|evidenceRef|face|pulseRate/);
  const assertReady = spawnSync(process.execPath,
    ['scripts/release-readiness.cjs', '--assert-ready'], { cwd: root, encoding: 'utf8' });
  assert.equal(assertReady.status, 1);
  assert.equal(JSON.parse(assertReady.stdout).decision, 'NO_GO');
  assert.equal(assertReady.stderr, '');
});

test('measurement is statically restricted to unpackaged Electron main, not user flags', () => {
  const main = file('electron/main.ts');
  const ipc = file('electron/camera/ipc.ts');
  assert.match(main, /nativeMeasurementAllowed:\s*!app\.isPackaged/);
  assert.match(ipc, /nativeMeasurementAllowed = deps\.nativeMeasurementAllowed === true/);
  assert.match(ipc, /if \(!nativeMeasurementAllowed\) return \{ ok: false, reason: 'sdk-unavailable' \}/);
  assert.doesNotMatch(ipc, /process\.env\[['"]SIGNALSCAPE_ALLOW/);
  assert.match(file('docs/packaging.md'), /review builds.*(native|SDK)/is);
  assert.match(file('docs/release-readiness.md'), /no.*reusable.*shared.*API key/is);
});

test('packaged builds cannot switch to an untrusted localhost renderer or log error objects', () => {
  const main = file('electron/main.ts');
  assert.match(main, /USE_DEV_SERVER = !app\.isPackaged && process\.env\['SIGNALSCAPE_DEV_SERVER'\]/);
  assert.doesNotMatch(main, /console\.error\([^\n]*(?:\bdescription\b|,\s*error\b)/);
  assert.match(main, /nativeMeasurementAllowed:\s*!app\.isPackaged/);
});
