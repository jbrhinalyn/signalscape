'use strict';

// Advisory review gate for Issue #24. NO release/publish code or credential access.
// Approval records are not a substitute for provider verification and owner sign-off.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const REQUIRED_GATES = Object.freeze([
  'providerRedistributionRights',
  'supportedNativePlatformRuntime',
  'productionCredentialArchitecture',
  'privacyAndNetworkReview',
  'physicalCameraAcceptance',
  'signedInstallerValidation',
  'explicitOwnerDistributionApproval',
]);
const ROOT = join(__dirname, '..');
const CRITERIA_FILE = join(ROOT, 'config', 'release-readiness.json');

function evaluateReadiness(config) {
  if (!config || config.schemaVersion !== 1 ||
    config.target !== 'sdk-enabled-public-desktop' ||
    !config.gates || typeof config.gates !== 'object' ||
    Array.isArray(config.gates)) {
    throw new Error('Invalid release criteria format');
  }
  if (Object.keys(config.gates).length !== REQUIRED_GATES.length ||
    Object.keys(config.gates).some((key) => !REQUIRED_GATES.includes(key))) {
    throw new Error('Unexpected or missing release gate');
  }
  const blockers = [];
  for (const gate of REQUIRED_GATES) {
    const record = config.gates[gate];
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
      typeof record.approved !== 'boolean' ||
      (record.evidenceRef !== null && typeof record.evidenceRef !== 'string')) {
      throw new Error('Invalid release gate record: ' + gate);
    }
    // A bare boolean or reference is not sufficient. Both must be explicit.
    if (record.approved !== true ||
      typeof record.evidenceRef !== 'string' ||
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:issues|pull)\/\d+(?:#.*)?$/.test(record.evidenceRef)) {
      blockers.push(gate);
    }
  }
  // This only evaluates documented preconditions. It never authorizes a
  // release, signs installers, bundles SDK binaries, or contacts Presage.
  return Object.freeze({
    target: config.target,
    gateCount: REQUIRED_GATES.length,
    satisfied: REQUIRED_GATES.length - blockers.length,
    blockers,
    decision: blockers.length ? 'NO_GO' : 'OWNER_REVIEW_REQUIRED',
    isPublicDistributionApproved: false,
  });
}

function currentStatus() {
  return evaluateReadiness(JSON.parse(readFileSync(CRITERIA_FILE, 'utf8')));
}

function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--status', '--assert-ready'].includes(args[0])) {
    throw new Error('Use --status or --assert-ready');
  }
  const status = currentStatus();
  // Only a fixed allowlist of gate identifiers is printed; no evidenceRefs,
  // API secrets, SDK data, local paths, or camera details enter logs.
  process.stdout.write(JSON.stringify(status, null, 2) + '\n');
  if (args[0] === '--assert-ready') {
    // Even all documented gates being true still requires a separate owner
    // distribution action, not performed by any build workflow.
    if (status.decision !== 'OWNER_REVIEW_REQUIRED') process.exitCode = 1;
  }
  return status;
}

if (require.main === module) {
  try { main(); } catch {
    process.stderr.write('Invalid release readiness configuration or arguments\n');
    process.exitCode = 2;
  }
}

module.exports = { REQUIRED_GATES, evaluateReadiness, currentStatus, main };
