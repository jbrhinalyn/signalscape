'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, rmSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const recorder = require('../scripts/m5-manual-acceptance.cjs');

function scenario(report, id) { return report.scenarios[id - 1]; }

test('template cannot claim camera acceptance or release approval', () => {
  const r = recorder.createReport('developer', new Date('2026-11-07T00:00:00Z'));
  assert.equal(r.scenarios.length, 13);
  assert.ok(r.scenarios.every((item) => item.status === 'NOT_RUN'));
  assert.deepEqual(r.scenarios.map((item) => item.id), Array.from({ length: 13 }, (_, i) => i + 1));
  assert.equal(r.cameraAutomation, false);
  assert.equal(r.sdkAutomation, false);
  assert.equal(r.summary.hardwareMatrixComplete, false);
  assert.equal(r.summary.releaseApproved, false);
  assert.ok(!JSON.stringify(r).includes(process.env.SMARTSPECTRA_API_KEY || 'THIS_IS_NOT_A_REAL_KEY'));
});

test('real live SDK evidence is mandatory for scenario 4 PASS', () => {
  const r = recorder.createReport('developer');
  const s = scenario(r, 4);
  s.status = 'PASS';
  assert.match(recorder.validateScenario(r.mode, s), /Real SDK packets/);
  s.packetEvidence = 'nonzero';
  assert.match(recorder.validateScenario(r.mode, s), /quality-gated rate/);
  s.liveRateEvidence = 'both';
  assert.equal(recorder.validateScenario(r.mode, s), null);
  assert.throws(() => recorder.validateReport(recorder.createReport('other')));
});

test('review packages without bundled native SDK cannot pass measurement scenarios', () => {
  for (const mode of ['packaged-linux', 'packaged-windows']) {
    const r = recorder.createReport(mode);
    for (const id of [4, 5, 7, 8, 9, 10, 11, 13]) {
      scenario(r, id).status = 'PASS';
      assert.match(recorder.validateScenario(mode, scenario(r, id)), /do not bundle/);
      scenario(r, id).status = 'BLOCKED';
    }
    recorder.validateReport(r);
    assert.equal(r.summary.blocked, 8);
    assert.equal(r.summary.releaseApproved, false);
  }
});

test('sensitive hardware assertions require an explicit observed OS camera LED off', () => {
  const r = recorder.createReport('developer');
  for (const id of [1, 2, 3, 6, 8, 10]) {
    const s = scenario(r, id);
    s.status = 'PASS';
    assert.match(recorder.validateScenario(r.mode, s), /camera indicator/);
    s.ledOffConfirmed = false;
    assert.match(recorder.validateScenario(r.mode, s), /camera indicator/);
    s.ledOffConfirmed = true;
    assert.equal(recorder.validateScenario(r.mode, s), null);
  }
});

test('long-running scenario requires duration and private FPS/CPU/GPU/RAM observation', () => {
  const r = recorder.createReport('developer');
  const s = scenario(r, 13);
  s.status = 'PASS';
  s.durationMinutes = 14;
  s.performanceEvidence = 'recorded';
  assert.match(recorder.validateScenario(r.mode, s), /15 minutes/);
  s.durationMinutes = 15;
  s.performanceEvidence = 'not-recorded';
  assert.match(recorder.validateScenario(r.mode, s), /FPS/);
  s.performanceEvidence = 'recorded';
  assert.equal(recorder.validateScenario(r.mode, s), null);
});

test('only enumerated CLI modes are supported; no SDK keys are accepted on CLI', () => {
  assert.deepEqual(recorder.parseArgs(['--mode=packaged-linux', '--template']),
    { mode: 'packaged-linux', template: true });
  assert.throws(() => recorder.parseArgs(['--mode=other']), /Use --mode/);
  assert.throws(() => recorder.parseArgs(['--api-key=something']), /Unknown option/);
});

test('reports do not turn unrun scenarios into PASS or read camera data', () => {
  const r = recorder.createReport('developer');
  scenario(r, 4).status = 'BLOCKED';
  const dir = mkdtempSync(join(tmpdir(), 'signalscape-manual-test-'));
  const script = readFileSync(join(__dirname, '../scripts/m5-manual-acceptance.cjs'), 'utf8');
  assert.match(script, /\.m5-manual-reports/);
  assert.match(script, /mode: 0o700/);
  assert.match(script, /mode: 0o600, flag: 'wx'/);
  assert.doesNotMatch(script, /getUserMedia|sendFrame\(|SmartSpectraSDK\(/);
  assert.equal(recorder.validateReport(r).summary.blocked, 1);
  assert.equal(recorder.validateReport(r).summary.notRun, 12);
  assert.equal(recorder.validateReport(r).summary.hardwareMatrixComplete, false);
  assert.equal(readdirSync(dir).length, 0);
  rmSync(dir, { recursive: true, force: true });
});
