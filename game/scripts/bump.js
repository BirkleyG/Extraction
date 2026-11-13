// Bumps the game version and records the change in notes.md.
// Usage: npm run bump -- minor|big|major "what changed"
//   minor: +0.0.01   big: +0.1 (resets last part)   major: +1 (resets the rest)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const versionFile = path.join(here, '..', 'version.json');
const notesFile = path.join(here, '..', '..', 'notes.md');

export function nextVersion(v, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error('Bad version: ' + v);
  let [maj, min, patch] = m.slice(1).map(Number);
  if (kind === 'minor') patch += 1;
  else if (kind === 'big') { min += 1; patch = 0; }
  else if (kind === 'major') { maj += 1; min = 0; patch = 0; }
  else throw new Error('Kind must be minor, big or major');
  return `${maj}.${min}.${String(patch).padStart(2, '0')}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind, ...words] = process.argv.slice(2);
  const message = words.join(' ').trim();
  if (!message) { console.error('Usage: npm run bump -- minor|big|major "what changed"'); process.exit(1); }
  const old = JSON.parse(fs.readFileSync(versionFile, 'utf8')).version;
  const v = nextVersion(old, kind);
  fs.writeFileSync(versionFile, JSON.stringify({ version: v }) + '\n');
  const date = new Date().toISOString().slice(0, 10);
  let notes = fs.readFileSync(notesFile, 'utf8');
  notes = notes.replace(/Current version: \*\*[^*]+\*\*/, `Current version: **${v}**`);
  notes = notes.replace('## Changelog\n', `## Changelog\n\n### ${v} (${date})\n- ${message}\n`);
  fs.writeFileSync(notesFile, notes);
  console.log(`${old} -> ${v}`);
}
