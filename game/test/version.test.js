import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextVersion } from '../scripts/bump.js';
import { VERSION } from '../server.js';

test('version bumps', () => {
  assert.equal(nextVersion('0.0.01', 'minor'), '0.0.02');
  assert.equal(nextVersion('0.0.09', 'minor'), '0.0.10');
  assert.equal(nextVersion('0.0.07', 'big'), '0.1.00');
  assert.equal(nextVersion('0.3.12', 'major'), '1.0.00');
});

test('notes.md matches the version the game shows', () => {
  const notes = fs.readFileSync(new URL('../../notes.md', import.meta.url), 'utf8');
  assert.ok(notes.includes(`Current version: **${VERSION}**`), 'notes.md header is out of date');
  assert.ok(notes.includes(`### ${VERSION} (`), 'notes.md has no changelog entry for ' + VERSION);
});
