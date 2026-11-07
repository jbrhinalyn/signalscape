#!/usr/bin/env node
'use strict';

// Issue #18: release preflight and archive verification. Never provide keys
// through build flags or renderer assets. @electron/asar is locked via
// electron-builder in package-lock.json and available in the build toolchain.
const { createHash } = require('node:crypto');
const { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } = require('node:fs');
const { join, relative, sep } = require('node:path');
const asar = require('@electron/asar');

const ROOT = join(__dirname, '..');
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const RELEASE_DIR = join(ROOT, 'release');
const PRIVATE_KEY_MARKER = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/;

// Review-only heuristic: reject inline key values in distributable artifacts.
// Legitimate developer-only process.env reads and apiKey: key remain allowed.
// This is defense in depth, not a substitute for a secret manager or audit.
function hasEmbeddedSdkCredential(content) {
  return /(?:\bapiKey\b|['"]apiKey['"])\s*:\s*['"`][^'"`\r\n]+['"`]/.test(content) ||
    /(?:\bSMARTSPECTRA_API_KEY\b|['"]SMARTSPECTRA_API_KEY['"])\s*[:=]\s*['"`][^'"`\r\n]+['"`]/.test(content) ||
    /\bprocess\.env\[['"]SMARTSPECTRA_API_KEY['"]\]\s*=\s*['"`]/.test(content);
}

function isForbiddenPath(filename) {
  const normalized = filename.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  const basename = segments[segments.length - 1].toLowerCase();
  return segments.some((part) => part.toLowerCase() === 'secrets') ||
    basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example') ||
    basename === '.envrc' || /\.(?:pem|p12|pfx|key|map)$/i.test(basename) ||
    /^(?:id_rsa|id_ed25519|id_ecdsa)$/i.test(basename);
}


// Review artifacts may not contain the SDK in ASAR, an unpacked native
// sidecar, or an Electron extraResources directory.
function isNativeSdkPath(filename) {
  const normalized = filename.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  const segments = normalized.split('/');
  const basename = segments[segments.length - 1];
  return segments.includes('@smartspectra') ||
    /^(?:lib)?smartspectra(?:[_-][a-z0-9.-]+)?\.(?:so(?:\.\d+)*|dylib|dll|node)$/.test(basename);
}

function validateReviewDependencies(manifest = PACKAGE) {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (Object.keys(manifest[field] ?? {}).some((name) => isNativeSdkPath('node_modules/' + name))) {
      throw new Error('Unapproved SmartSpectra dependency in review build manifest.');
    }
  }
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
        if (isNativeSdkPath(name)) problems.push(name + ': unapproved native SDK asset');
        if (/\.(?:js|json|html|css|svg|txt|yml|yaml|xml)$/i.test(name)) {
          const contents = readFileSync(full, 'utf8');
          if (PRIVATE_KEY_MARKER.test(contents)) problems.push(name + ': private key marker');
          if (hasEmbeddedSdkCredential(contents)) {
            problems.push(name + ': embedded SDK credential marker');
          }
        }
      }
    }
  }
  visit(base);
  return problems;
}

function preflight(env = process.env, dist = join(ROOT, 'dist')) {
  validateReviewDependencies();
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
    if (isNativeSdkPath(path)) {
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


function inspectUnpackedFiles(target, dir = RELEASE_DIR) {
  if (!['linux', 'win'].includes(target)) throw new Error('Unsupported package target.');
  const unpacked = join(dir, target === 'linux' ? 'linux-unpacked' : 'win-unpacked');
  if (!existsSync(unpacked)) throw new Error('Missing unpacked review application.');
  const problems = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      const name = relative(unpacked, full);
      if (isForbiddenPath(name)) problems.push('Forbidden unpacked entry: ' + name);
      if (isNativeSdkPath(name)) problems.push('Unapproved native SDK sidecar: ' + name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile() && name.replace(/\\/g, '/') !== 'resources/app.asar' &&
        /\.(?:js|json|html|css|txt|yml|yaml|xml|svg)$/i.test(name) &&
        statSync(full).size <= 1024 * 1024) {
        const contents = readFileSync(full, 'utf8');
        if (PRIVATE_KEY_MARKER.test(contents)) {
          problems.push('Private key marker in unpacked entry: ' + name);
        }
        if (hasEmbeddedSdkCredential(contents)) {
          problems.push('Embedded SDK credential marker in unpacked entry: ' + name);
        }
      }
      // Do not follow symlinks out of the package root.
    }
  }
  visit(unpacked);
  if (problems.length) throw new Error('Review package rejected: ' + problems.join('; '));
}

function verifyArchive(target, dir = RELEASE_DIR) {
  inspectUnpackedFiles(target, dir);
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
    const contents = asar.extractFile(archive, name.split('/').join(sep)).toString('utf8');
    if (PRIVATE_KEY_MARKER.test(contents)) throw new Error('Private key marker in packaged ' + name);
    if (hasEmbeddedSdkCredential(contents)) {
      throw new Error('Embedded SDK credential marker in packaged ' + name);
    }
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

module.exports = { isForbiddenPath, isNativeSdkPath, hasEmbeddedSdkCredential,
  validateReviewDependencies, preflight, validateArchiveEntries,
  inspectUnpackedFiles, expectedArtifacts, verifyArchive, verify };
