#!/usr/bin/env node
'use strict';

// Issue #18: release preflight and archive verification. Never provide keys
// through build flags or renderer assets. @electron/asar is locked via
// electron-builder in package-lock.json and available in the build toolchain.
const { createHash } = require('node:crypto');
const { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } = require('node:fs');
const { join, relative } = require('node:path');
const asar = require('@electron/asar');

const ROOT = join(__dirname, '..');
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const RELEASE_DIR = join(ROOT, 'release');
const PRIVATE_KEY_MARKER = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/;

function isForbiddenPath(filename) {
  const normalized = filename.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  const basename = segments[segments.length - 1].toLowerCase();
  return segments.some((part) => part.toLowerCase() === 'secrets') ||
    basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example') ||
    basename === '.envrc' || /\.(?:pem|p12|pfx|key|map)$/i.test(basename) ||
    /^(?:id_rsa|id_ed25519|id_ecdsa)$/i.test(basename);
}

function inspectFiles(base) {
  if (!existsSync(base)) throw new Error('Missing compiled dist/ tree; run npm run build first.');
  const problems = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        const name = relative(ROOT, full);
        if (isForbiddenPath(name)) problems.push(name + ': forbidden file');
        if (/\.(?:js|json|html|css|svg|txt)$/i.test(name)) {
          const contents = readFileSync(full, 'utf8');
          if (PRIVATE_KEY_MARKER.test(contents)) problems.push(name + ': private key marker');
        }
      }
    }
  }
  visit(base);
  return problems;
}

function preflight(env = process.env, dist = join(ROOT, 'dist')) {
  // Runtime-only developer credential: never build while it is set.
  if (typeof env.SMARTSPECTRA_API_KEY === 'string' && env.SMARTSPECTRA_API_KEY.trim()) {
    throw new Error('Unset SMARTSPECTRA_API_KEY before packaging; no shared key may be distributed.');
  }
  const issues = inspectFiles(dist);
  if (issues.length) throw new Error('Packaging rejected: ' + issues.join('; '));
}

function validateArchiveEntries(entries) {
  const normalized = entries.map((entry) => entry.replace(/\\/g, '/').replace(/^\/+/, ''));
  const required = ['package.json', 'dist/electron/main.js',
    'dist/electron/preload.js', 'dist/renderer/index.html'];
  const problems = required.filter((name) => !normalized.includes(name))
    .map((name) => 'Missing packaged entry: ' + name);
  for (const path of normalized) {
    if (isForbiddenPath(path)) problems.push('Forbidden packaged entry: ' + path);
    if (path.startsWith('node_modules/@smartspectra/')) {
      problems.push('Unreviewed native SDK bundled: ' + path);
    }
  }
  return problems;
}

function expectedArtifacts(version, target, names) {
  if (!['linux', 'win'].includes(target)) throw new Error('Target must be linux or win.');
  const prefix = 'SignalScape-' + version + '-' + target + '-';
  const extensions = target === 'linux' ? ['AppImage', 'deb'] : ['exe'];
  const found = new Map();
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const suffix = name.slice(prefix.length);
    const dot = suffix.lastIndexOf('.');
    if (dot < 1) continue;
    const arch = suffix.slice(0, dot);
    const extension = suffix.slice(dot + 1);
    if (!['x64', 'amd64', 'x86_64'].includes(arch)) continue;
    if (extensions.includes(extension)) found.set(extension, name);
  }
  const missing = extensions.filter((ext) => !found.has(ext));
  if (missing.length) throw new Error('Missing versioned ' + target + ' artifacts: ' + missing.join(', '));
  return extensions.map((extension) => found.get(extension));
}

function verifyArchive(target, dir = RELEASE_DIR) {
  const unpacked = target === 'linux' ? 'linux-unpacked' : 'win-unpacked';
  const archive = join(dir, unpacked, 'resources', 'app.asar');
  if (!existsSync(archive)) throw new Error('Missing packaged archive: ' + archive);
  const entries = asar.listPackage(archive);
  const problems = validateArchiveEntries(entries);
  if (problems.length) throw new Error(problems.join('; '));
  const bundled = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
  if (bundled.version !== PACKAGE.version || bundled.main !== PACKAGE.main) {
    throw new Error('Packaged version or main entry does not match package.json.');
  }
  // Check all shipped first-party compiled text; do not print its contents.
  for (const item of entries) {
    const name = item.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!name.startsWith('dist/') || !/\.(?:js|html|css|json|svg|txt)$/i.test(name)) continue;
    const contents = asar.extractFile(archive, name).toString('utf8');
    if (PRIVATE_KEY_MARKER.test(contents)) throw new Error('Private key marker in packaged ' + name);
  }
  return archive;
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const source = createReadStream(file);
    source.on('data', (part) => hash.update(part));
    source.on('error', reject);
    source.on('end', () => resolve(hash.digest('hex')));
  });
}

async function verify(target, dir = RELEASE_DIR) {
  verifyArchive(target, dir);
  const names = expectedArtifacts(PACKAGE.version, target, readdirSync(dir));
  const entries = [];
  for (const name of names) {
    const file = join(dir, name);
    if (!statSync(file).isFile()) throw new Error('Artifact is not a file: ' + name);
    entries.push((await sha256(file)) + '  ' + name);
  }
  const manifest = 'SHA256SUMS-' + target + '.txt';
  writeFileSync(join(dir, manifest), entries.join('\n') + '\n', 'utf8');
  console.log('Verified packaged archive, version, secret-file exclusions and ' +
    names.length + ' artifact(s). SHA-256: ' + manifest);
}

async function main() {
  const [operation, target] = process.argv.slice(2);
  if (operation === 'preflight') {
    preflight();
    console.log('Packaging preflight passed: no SDK key or forbidden dist files.');
  } else if (operation === 'verify' && ['linux', 'win'].includes(target)) {
    await verify(target);
  } else {
    throw new Error('Usage: node scripts/packaging.cjs <preflight|verify linux|verify win>');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { isForbiddenPath, preflight, validateArchiveEntries,
  expectedArtifacts, verifyArchive, verify };
