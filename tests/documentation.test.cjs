'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('M5 documentation links live demo, privacy and architecture from README', () => {
  const readme = read('README.md');
  for (const link of ['docs/demo.md', 'docs/privacy.md', 'docs/architecture.md',
    'docs/environment.md', 'docs/m5-acceptance.md']) {
    assert.ok(readme.includes(link), 'README should link ' + link);
  }
  assert.match(readme, /real.camera developer demonstration/i);
  assert.match(readme, /not a medical device/i);
  assert.doesNotMatch(readme, /Live measurement is \*\*not\*\* included in the app/);
});

test('privacy disclosure tracks actual rate IPC, telemetry opt-out and provider network use', () => {
  const privacy = read('docs/privacy.md');
  const architecture = read('docs/architecture.md');
  const capture = read('electron/camera/capture.ts');
  const model = read('electron/signals/model.ts');
  const pkg = JSON.parse(read('package.json'));

  assert.match(capture, /enableTelemetry:\s*false/);
  assert.match(capture, /SmartSpectraLogLevel\.kNone/);
  assert.match(capture, /adaptSmartSpectraRates\(decoded/);
  assert.match(model, /kind:\s*'rate'/);
  assert.match(privacy, /enableTelemetry:\s*false/);
  assert.match(privacy, /telemetry.*default/i);
  assert.match(privacy, /authentication.*network|network.*authentication/i);
  assert.match(privacy, /numeric pulse\/breathing rate/i);
  assert.match(privacy, /not a medical device/i);
  assert.match(architecture, /quality machine|signal quality machine/i);
  assert.match(architecture, /validated numeric rate events/i);
  assert.ok(!Object.keys(pkg.dependencies).some((name) => name.startsWith('@smartspectra/')),
    'production dependency lock must not imply native SDK bundling');
});

test('fresh-machine demo documents opt-in, real evidence and explicit mock exclusion', () => {
  const demo = read('docs/demo.md');
  const env = read('docs/environment.md');
  const markup = read('src/app/app.html');
  const acceptance = read('docs/m5-acceptance.md');

  for (const command of ['nvm install', 'npm ci', 'npm run quality',
    'npm run dev', 'npm run spike:sdk -- --probe']) {
    assert.ok(demo.includes(command), 'demo should include ' + command);
  }
  assert.match(demo, /Preview camera/);
  assert.match(demo, /Start measurement/);
  assert.match(demo, /Metric packets/);
  assert.match(demo, /Validated readings/);
  assert.match(demo, /NONPRODUCTION SYNTHETIC TEST DATA/);
  assert.match(demo, /never.*substitute.*fabricated|never.*substitute.*tests/i);
  assert.match(demo, /Stop camera/);
  assert.match(env, /SMARTSPECTRA_API_KEY/);
  assert.match(env, /not automatically loaded/);
  assert.match(markup, /No simulated pulse or breathing readings/);
  assert.match(acceptance, /M5 developer-build status.*13\/13 PASS, owner-reported/);
  assert.doesNotMatch(acceptance, /PENDING physical re-test/);
});

test('developer SDK setup and review packages are distinguished', () => {
  const readme = read('README.md');
  const env = read('docs/environment.md');
  const privacy = read('docs/privacy.md');
  const packaging = read('docs/packaging.md');
  assert.match(readme, /native SDK and credentials are \*\*not\*\* included/i);
  assert.match(env, /@smartspectra\/node-sdk@3\.4\.0/);
  assert.match(privacy, /do not distribute a shared long-lived API key/i);
  assert.match(packaging, /NOT APPROVED FOR PUBLIC DISTRIBUTION/);
});

test('M5 owner attestation is consistently distinguished from independent release evidence', () => {
  const acceptance = read('docs/m5-acceptance.md');
  const readme = read('README.md');
  const demo = read('docs/demo.md');
  const runbook = read('docs/m5-physical-runbook.md');

  for (const [name, content] of [
    ['acceptance', acceptance], ['README', readme],
    ['demo', demo], ['runbook', runbook],
  ]) {
    assert.match(content, /13\/13 PASS/, name + ' must retain owner-reported result');
    assert.match(content, /owner.reported|owner.attest/i,
      name + ' must disclose owner attestation');
    assert.match(content, /not independent|not independently/i,
      name + ' must distinguish independent verification');
    assert.match(content, /packaged|installer/i,
      name + ' must describe packaged-build limitation');
  }
  const rows = acceptance.split('\n').filter((line) =>
    /^\| (?:[1-9]|1[0-3]) \|/.test(line));
  assert.equal(rows.length, 13, 'one developer-build status per scenario');
  assert.ok(rows.every((line) => line.endsWith('| PASS* |')),
    'developer scenario rows represent the owner-reported grouped attestation');
  assert.match(acceptance, /Linux packaged AppImage\/deb[^\n]*NOT RUN/);
  assert.match(acceptance, /Windows packaged installer[^\n]*NOT RUN/);
  assert.match(acceptance, /NO-GO for SDK-enabled public distribution/);
  assert.match(runbook, /git switch main/);
  assert.doesNotMatch(runbook, /git switch test\/m5-zorin-physical-acceptance/);
  assert.doesNotMatch(runbook, /Status: execution pending/);
});
