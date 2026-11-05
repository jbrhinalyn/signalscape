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

function checkTrackedFiles() {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const problems = tracked.filter(isSensitivePath)
    .map((name) => `Tracked secret-like file is forbidden: ${name}`);

  const inspectable = tracked.filter((name) =>
    /\.(?:ts|cjs|json|md|yml|yaml|html)$/i.test(name),
  );
  for (const name of inspectable) {
    const content = readFileSync(join(ROOT, name), 'utf8');
    if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(content)) {
      problems.push(`Private key marker found in tracked file: ${name}`);
    }
  }
  return problems;
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

module.exports = { isSensitivePath };
