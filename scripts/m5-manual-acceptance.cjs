'use strict';

// Manual evidence recorder ONLY. Never opens a camera, loads the SDK or reads its API key.
const { execFileSync } = require('node:child_process');
const { writeFileSync, mkdirSync } = require('node:fs');
const os = require('node:os');
const { join } = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const ROOT = join(__dirname, '..');
const REPORT_DIR = join(ROOT, '.m5-manual-reports');
const MODES = ['developer', 'packaged-linux', 'packaged-windows'];
const STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'];
const LED_REQUIRED = new Set([1, 2, 3, 6, 8, 10]);
const NEEDS_NATIVE_SDK = new Set([4, 5, 7, 8, 9, 10, 11, 13]);
const SCENARIOS = Object.freeze([
  { id: 1, title: 'Launch, enumerate without Preview', expect: 'No permission request; OS camera indicator remains off.' },
  { id: 2, title: 'Deny Preview, explicitly retry', expect: 'Denied is reported; only an explicit retry can open preview.' },
  { id: 3, title: 'Revoke camera permission while previewing', expect: 'Stream closes, native SDK disarms, LED is off.' },
  { id: 4, title: 'Live SmartSpectra measurement', expect: 'Real SDK packets and at least one fresh quality-gated rate in Electron.' },
  { id: 5, title: 'Framing / lighting quality and recovery', expect: 'Readings disappear when unreliable; forest neutralizes; fresh samples recover.' },
  { id: 6, title: 'Unplug active USB camera', expect: 'Capture stops, no auto-retry; clear unavailable message and LED off.' },
  { id: 7, title: 'Stop and restart measurement', expect: 'Stop leaves preview running; Start is explicitly required for another measurement.' },
  { id: 8, title: 'Stop camera, preview and restart', expect: 'Old resources released, OS LED off, no stale values; fresh opt-in required.' },
  { id: 9, title: 'Cancel during permission / SDK startup', expect: 'Late completion cannot reopen preview or start measurement.' },
  { id: 10, title: 'Exit Electron during measurement', expect: 'App exits, no capture process remains; OS camera indicator off.' },
  { id: 11, title: 'Switch five forest looks during live session', expect: 'Live signals stay responsive; no camera ownership/consent change.' },
  { id: 12, title: 'Reduced motion, hidden/narrow window, keyboard', expect: 'Motion reduces/pauses, focus and readable controls work without overlap.' },
  { id: 13, title: 'Continuous measurement for at least 15 minutes', expect: 'No freezes/leaks; document FPS, CPU/GPU, RAM trend and SDK errors.' },
]);

function getSha() {
  try {
    const value = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
    return /^[0-9a-f]{40}$/.test(value) ? value : null;
  } catch { return null; }
}

function createReport(mode, now = new Date()) {
  if (!MODES.includes(mode)) throw new Error('Invalid build mode');
  return {
    schemaVersion: 1,
    title: 'M5 HUMAN-OBSERVED PHYSICAL CAMERA CHECKLIST — NOT CI EVIDENCE',
    recordedAt: now.toISOString(),
    application: 'SignalScape',
    mode,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    commitSha: getSha(),
    sdkVersionExpected: '3.4.0 (not verified by recorder)',
    cameraAutomation: false,
    sdkAutomation: false,
    scenarios: SCENARIOS.map((s) => ({ id: s.id, status: 'NOT_RUN',
      ledOffConfirmed: null, packetEvidence: null, liveRateEvidence: null,
      durationMinutes: null, performanceEvidence: null })),
    summary: { passed: 0, failed: 0, blocked: 0, notRun: SCENARIOS.length,
      hardwareMatrixComplete: false, releaseApproved: false },
  };
}

function updateSummary(report) {
  const count = (name) => report.scenarios.filter((s) => s.status === name).length;
  report.summary = {
    passed: count('PASS'), failed: count('FAIL'), blocked: count('BLOCKED'),
    notRun: count('NOT_RUN'),
    hardwareMatrixComplete: count('PASS') === SCENARIOS.length,
    // Credential distribution, licensing, package SDK and signing are independent gates.
    releaseApproved: false,
  };
  return report;
}

function validateScenario(mode, entry) {
  const scenario = SCENARIOS.find((s) => s.id === entry.id);
  if (!scenario || !STATUSES.includes(entry.status)) return 'Invalid scenario/status';
  if (entry.status !== 'PASS') return null;
  if (mode !== 'developer' && NEEDS_NATIVE_SDK.has(entry.id)) {
    return 'Packaged review builds do not bundle the SmartSpectra SDK; mark this scenario BLOCKED';
  }
  if (LED_REQUIRED.has(entry.id) && entry.ledOffConfirmed !== true) {
    return 'The OS camera indicator must be personally verified off';
  }
  if (entry.id === 4 && (entry.packetEvidence !== 'nonzero' ||
      !['pulse', 'breathing', 'both'].includes(entry.liveRateEvidence))) {
    return 'Real SDK packets AND at least one fresh, quality-gated rate must be observed';
  }
  if (entry.id === 13 && (!(Number.isInteger(entry.durationMinutes) &&
      entry.durationMinutes >= 15) || entry.performanceEvidence !== 'recorded')) {
    return 'At least 15 minutes and observed FPS/CPU/GPU/RAM trend must be recorded';
  }
  return null;
}

function validateReport(report) {
  if (!MODES.includes(report.mode) || report.scenarios.length !== SCENARIOS.length) {
    throw new Error('Invalid report shape');
  }
  for (let index = 0; index < SCENARIOS.length; index += 1) {
    const entry = report.scenarios[index];
    if (entry.id !== SCENARIOS[index].id) throw new Error('Unexpected scenario index');
    const reason = validateScenario(report.mode, entry);
    if (reason) throw new Error('Scenario #' + entry.id + ': ' + reason);
  }
  return updateSummary(report);
}

function writeReport(report, now = new Date()) {
  validateReport(report);
  mkdirSync(REPORT_DIR, { recursive: true, mode: 0o700 });
  const slug = now.toISOString().replace(/[:.]/g, '-');
  const filename = join(REPORT_DIR, slug + '-' + report.mode + '.json');
  writeFileSync(filename, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return filename;
}

function parseArgs(args) {
  let mode = 'developer';
  let template = false;
  for (const arg of args) {
    if (arg === '--template') template = true;
    else if (arg.startsWith('--mode=')) mode = arg.slice('--mode='.length);
    else throw new Error('Unknown option: ' + arg);
  }
  if (!MODES.includes(mode)) throw new Error('Use --mode=developer|packaged-linux|packaged-windows');
  return { mode, template };
}

async function askChoice(rl, prompt, options) {
  while (true) {
    const choice = (await rl.question(prompt)).trim().toLowerCase();
    if (Object.hasOwn(options, choice)) return options[choice];
    stdout.write('Choose ' + Object.keys(options).join('/') + '.\n');
  }
}

async function captureManualResults(report, rl, out = stdout) {
  out.write('\nM5 PHYSICAL-CAMERA CHECKLIST — HUMAN OBSERVATION REQUIRED\n');
  out.write('This tool does NOT start a camera, load SDK or test the app.\n');
  out.write('Open SignalScape separately and perform each scenario yourself.\n');
  out.write('Never enter credentials, face data, physiological values or free-form logs.\n');
  out.write('Packaged builds have no native SDK: SDK-only tests must be BLOCKED.\n\n');
  for (const scenario of SCENARIOS) {
    const entry = report.scenarios[scenario.id - 1];
    out.write('#' + scenario.id + ' ' + scenario.title + '\nExpected: ' + scenario.expect + '\n');
    while (true) {
      entry.ledOffConfirmed = null;
      entry.packetEvidence = null;
      entry.liveRateEvidence = null;
      entry.durationMinutes = null;
      entry.performanceEvidence = null;
      entry.status = await askChoice(rl, 'Your observed result [p=PASS/f=FAIL/b=BLOCKED/n=NOT RUN]: ',
        { p: 'PASS', f: 'FAIL', b: 'BLOCKED', n: 'NOT_RUN' });
      if (entry.status === 'PASS' && LED_REQUIRED.has(entry.id)) {
        entry.ledOffConfirmed = await askChoice(rl,
          'Did you personally verify the OS camera indicator was OFF when expected? [y/n]: ',
          { y: true, n: false });
      }
      if (entry.status === 'PASS' && entry.id === 4) {
        entry.packetEvidence = await askChoice(rl,
          'Actual native SDK metric packets observed? [y=nonzero/n=zero/u=not observed]: ',
          { y: 'nonzero', n: 'zero', u: 'not-observed' });
        entry.liveRateEvidence = await askChoice(rl,
          'Fresh quality-gated live rate observed? [p=pulse/b=breathing/a=both/n=none]: ',
          { p: 'pulse', b: 'breathing', a: 'both', n: 'none' });
      }
      if (entry.status === 'PASS' && entry.id === 13) {
        const duration = await rl.question('Observed uninterrupted session duration (whole minutes): ');
        entry.durationMinutes = /^\d{1,4}$/.test(duration.trim()) ? Number(duration.trim()) : null;
        entry.performanceEvidence = await askChoice(rl,
          'Did you personally record FPS, CPU/GPU and RAM trend privately? [y/n]: ',
          { y: 'recorded', n: 'not-recorded' });
      }
      const reason = validateScenario(report.mode, entry);
      if (!reason) break;
      out.write('Cannot record PASS: ' + reason + '\nPlease choose FAIL, BLOCKED, or provide evidence.\n');
    }
    out.write('\n');
  }
  return validateReport(report);
}

async function main() {
  const { mode, template } = parseArgs(process.argv.slice(2));
  if (!template && (!stdin.isTTY || !stdout.isTTY)) {
    throw new Error('Interactive mode requires a terminal; use --template for an all-NOT_RUN report');
  }
  const report = createReport(mode);
  if (!template) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try { await captureManualResults(report, rl); }
    finally { rl.close(); }
  }
  const filepath = writeReport(report);
  stdout.write('Saved LOCAL, untracked evidence: ' + filepath + '\n');
  stdout.write('Manual PASS: ' + report.summary.passed + '/13; FAIL: ' + report.summary.failed +
    '; BLOCKED: ' + report.summary.blocked + '; NOT RUN: ' + report.summary.notRun + '\n');
  stdout.write('Release approval: NO (separate SDK, credential, licensing and signing gates).\n');
  stdout.write('Do not upload raw/private diagnostics or pass this template off as completed physical QA.\n');
}

if (require.main === module) {
  main().catch((error) => { process.stderr.write('M5 recorder: ' + error.message + '\n'); process.exitCode = 1; });
}

module.exports = { SCENARIOS, MODES, STATUSES, REPORT_DIR,
  createReport, validateScenario, validateReport, updateSummary, writeReport, parseArgs, captureManualResults };
