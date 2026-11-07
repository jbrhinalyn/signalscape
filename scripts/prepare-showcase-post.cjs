#!/usr/bin/env node
'use strict';

const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'docs', 'technical-showcase-article.md');
const OUTPUT = join(ROOT, 'docs', 'dev-community-draft.md');
const TITLE = 'SignalScape: Turning Camera-Derived Signals into a Living Forest';

/**
 * Build an independent DEV-style post from the reviewed repository article.
 * Never adds a contest tag or changes the source; public publishing is manual.
 */
function preparePost(source) {
  // Reproducible output on Unix and Windows (including core.autocrlf=true).
  source = source.replace(/\r\n?/g, '\n');
  const coverStart = '<!-- PUBLICATION-COVER-START -->';
  const coverEnd = '<!-- PUBLICATION-COVER-END -->';
  if (!source.startsWith('# ' + TITLE + '\n\n')) {
    throw new Error('Technical showcase title changed: review the publication metadata.');
  }
  if (!source.includes(coverStart) || !source.includes(coverEnd)) {
    throw new Error('Expected exactly one annotated local cover block.');
  }
  const before = source.indexOf(coverStart);
  const after = source.indexOf(coverEnd) + coverEnd.length;
  const stripped = source.slice(0, before) + source.slice(after).replace(/^\n+/, '\n\n');
  const body = stripped.replace(/^# [^\n]+\n\n/, '');
  if (/^\s*(?:## Prize Categories|\*This is a submission)/m.test(body)) {
    throw new Error('Standalone article must not be converted to a challenge entry.');
  }
  const header = [
    '---',
    'title: "' + TITLE + '"',
    'published: false',
    'description: "Building a responsive Three.js forest with explicit camera consent, quality-gated SmartSpectra pulse and breathing, and a privacy-conscious Electron architecture."',
    'tags: angular, electron, typescript, threejs',
    '---',
    '',
  ].join('\n');
  // Cover is selected separately in the DEV editor using the PNG export.
  return header + body.replace(/^\n+/, '').replace(/\n*$/, '\n');
}

if (require.main === module) {
  const result = preparePost(readFileSync(SOURCE, 'utf8'));
  if (process.argv.includes('--write')) {
    writeFileSync(OUTPUT, result, 'utf8');
    process.stdout.write('Updated docs/dev-community-draft.md (unpublished).\n');
  } else {
    process.stdout.write(result);
  }
}

module.exports = { preparePost };
