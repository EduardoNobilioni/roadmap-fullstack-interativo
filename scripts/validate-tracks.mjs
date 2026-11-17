import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTrack } from '../js/model.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'tracks');
const manifest = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
let failed = false;

const files = new Set(readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'index.json'));
for (const entry of manifest.tracks) {
  if (!files.has(entry.file)) {
    console.error(`index.json aponta para ${entry.file}, que não existe.`);
    failed = true;
    continue;
  }
  files.delete(entry.file);
  const data = JSON.parse(readFileSync(join(dir, entry.file), 'utf8'));
  if (data.id !== entry.id) {
    console.error(`${entry.file}: id "${data.id}" não bate com "${entry.id}" no index.json.`);
    failed = true;
  }
  const errors = validateTrack(data);
  if (errors.length) {
    failed = true;
    console.error(`\n${entry.file}`);
    for (const error of errors) console.error(`  - ${error}`);
  } else {
    const topics = data.phases.reduce((sum, phase) => sum + phase.topics.length, 0);
    console.log(`${entry.file}: ok (${data.phases.length} etapas, ${topics} tópicos)`);
  }
}

if (files.size) {
  failed = true;
  console.error(`Arquivos fora do index.json: ${[...files].join(', ')}`);
}

if (failed) process.exit(1);
console.log('Trilhas válidas.');
