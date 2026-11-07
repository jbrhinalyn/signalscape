'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { preparePost } = require('../scripts/prepare-showcase-post.cjs');

const root = join(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('cover image is original illustrative art with no invented SDK readings', () => {
  const cover = read('docs/assets/signalscape-showcase-cover.svg');
  assert.match(cover, /<svg [^>]*width="1000" height="420"/);
  assert.match(cover, /NOT MEASUREMENT OUTPUT/);
  assert.match(cover, /SignalScape/);
  assert.doesNotMatch(cover, /\d+\s*bpm|Metric packets:|healthy reading|Live SDK verified/);
  assert.match(read('docs/technical-showcase-article.md'), /assets\/signalscape-showcase-cover\.svg/);
});

test('independent DEV draft is generated from the approved article without a contest entry', () => {
  const article = read('docs/technical-showcase-article.md');
  const savedDraft = read('docs/dev-community-draft.md');
  const normalizedSavedDraft = savedDraft.replace(/\r\n?/g, '\n');
  assert.equal(normalizedSavedDraft, preparePost(article));
  assert.equal(preparePost(article.replace(/\n/g, '\r\n')), normalizedSavedDraft);
  assert.match(savedDraft, /^---\ntitle: /);
  assert.match(savedDraft, /published: false/);
  assert.match(savedDraft, /tags: angular, electron, typescript, threejs/);
  assert.doesNotMatch(savedDraft, /PUBLICATION-COVER-START|PUBLICATION-COVER-END|\*This is a submission/);
  assert.doesNotMatch(savedDraft, /^## Prize Categories$/m);
  assert.match(savedDraft, /Consent and Data Handling/);
  assert.match(savedDraft, /SDK authentication\/session authorization may still contact/);
  assert.ok(savedDraft.includes('https://share.zight.com/01a1b6e3-7a47-7080-8098-3c279ee75aba'));
});

test('publication kit keeps draft, artwork, video and distribution gates distinct', () => {
  const guide = read('docs/independent-publication.md');
  const readme = read('README.md');
  assert.match(guide, /not a Presage SmartSpectra\s+SDK Challenge entry/i);
  assert.match(guide, /publish it yourself/i);
  assert.match(guide, /1000×420/);
  assert.match(guide, /NO-GO/);
  assert.match(readme, /independent-publication\.md/);
  assert.match(readme, /docs\/assets\/signalscape-showcase-cover\.svg/);
  const publishedUrl = 'https://dev.to/jose_bernard/signalscape-turning-camera-derived-signals-into-a-living-forest-33bb';
  assert.ok(readme.includes(publishedUrl));
  assert.ok(guide.includes(publishedUrl));
  assert.match(guide, /Author-confirmed submission label:/);
  assert.match(readme, /intentionally labeled \*\*Presage SmartSpectra SDK Challenge Submission\*\*/);
  assert.match(guide, /does \*\*not\*\* independently establish contest eligibility/);
  assert.equal(JSON.parse(read('package.json')).scripts['showcase:draft'],
    'node scripts/prepare-showcase-post.cjs --write');
});
