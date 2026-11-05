#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join, posix } = require('node:path');

const ROOT = join(__dirname, '..');

function isSensitivePath(filename) {
  const normalized = filename.replace(/\\/g, '/');
  const basename = posix.basename(normalized);
  return (
    basename === '.env' ||
    (basename.startsWith('.env.') && basename !== '.env.example') ||
    basename === '.envrc' ||
    /\.(?:pem|p12|pfx|key)$/i.test(basename) ||
    /^(?:id_rsa|id_ed25519|id_ecdsa)$/i.test(basename) ||
    normalized.split('/').includes('secrets')
  );
}

// Check every tracked text file, not just selected extensions: allowed
// templates such as .env.example can still accidentally contain credentials.
function validateTrackedFiles(tracked, readTrackedFile) {
  const problems = tracked.filter(isSensitivePath)
    .map((name) => `Tracked secret-like file is forbidden: ${name}`);

  for (const name of tracked) {
    const content = readTrackedFile(name);
    // Ignore binary assets while still scanning extensionless and dotfiles.
    if (content.includes(0)) continue;
    if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(content.toString('utf8'))) {
      problems.push(`Private key marker found in tracked file: ${name}`);
    }
  }
  return problems;
}

function checkTrackedFiles() {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  return validateTrackedFiles(tracked, (name) => readFileSync(join(ROOT, name)));
}

if (require.main === module) {
  const problems = checkTrackedFiles();
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
  } else {
    console.log('Secret-file guard passed: no tracked env secrets or private keys.');
  }
}

module.exports = { isSensitivePath, validateTrackedFiles };
