#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SOURCE_SYNC_DEFAULTS, syncGdlCandidates } from '../server/ukraine_sources.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');
const dataDir = path.join(repoRoot, 'apps', 'ukraine', 'data');

const paths = {
  ruTexts: path.join(dataDir, 'texts.ru.json'),
  ukTexts: path.join(dataDir, 'texts.uk.json'),
  queue: path.join(dataDir, 'source_review_queue.json'),
  log: path.join(dataDir, 'source_sync_log.json'),
};

function ensureJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
  }
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) {
      return fallback;
    }

    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseArgs(argv) {
  const args = {
    source: 'gdl',
    languages: SOURCE_SYNC_DEFAULTS.languages,
    per_language_limit: SOURCE_SYNC_DEFAULTS.per_language_limit,
    min_words: SOURCE_SYNC_DEFAULTS.min_words,
    max_words: SOURCE_SYNC_DEFAULTS.max_words,
    dry_run: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;

    if (key === 'dry-run') {
      args.dry_run = true;
      continue;
    }

    if (!value) {
      continue;
    }

    if (key === 'source') {
      args.source = value;
    } else if (key === 'languages') {
      args.languages = value.split(',').map((item) => item.trim()).filter(Boolean);
    } else if (key === 'per-language-limit') {
      args.per_language_limit = Number(value);
    } else if (key === 'min-words') {
      args.min_words = Number(value);
    } else if (key === 'max-words') {
      args.max_words = Number(value);
    }
  }

  return args;
}

async function main() {
  ensureJsonFile(paths.ruTexts, []);
  ensureJsonFile(paths.ukTexts, []);
  ensureJsonFile(paths.queue, []);
  ensureJsonFile(paths.log, []);

  const args = parseArgs(process.argv.slice(2));

  const ruTexts = asArray(readJson(paths.ruTexts, []));
  const ukTexts = asArray(readJson(paths.ukTexts, []));
  const queue = asArray(readJson(paths.queue, []));
  const log = asArray(readJson(paths.log, []));

  const existingSourceKeys = new Set();
  for (const item of queue) {
    if (typeof item.source_key === 'string' && item.source_key) {
      existingSourceKeys.add(item.source_key);
    }
  }
  for (const text of [...ruTexts, ...ukTexts]) {
    if (typeof text.source_key === 'string' && text.source_key) {
      existingSourceKeys.add(text.source_key);
    }
  }

  const result = await syncGdlCandidates({
    ...args,
    existing_source_keys: existingSourceKeys,
  });

  log.push(result.run);
  writeJson(paths.log, log.slice(-200));

  if (!args.dry_run && result.candidates.length > 0) {
    writeJson(paths.queue, [...queue, ...result.candidates]);
  }

  const lines = [
    `Source sync status: ${result.run.status}`,
    `Scanned: ${result.run.scanned}`,
    `Added: ${result.run.added}`,
    `Duplicates skipped: ${result.run.skipped_duplicates}`,
    `Empty skipped: ${result.run.skipped_empty}`,
    `Bounds skipped: ${result.run.skipped_bounds}`,
    `Errors: ${result.run.errors.length}`,
    `Dry run: ${args.dry_run ? 'yes' : 'no'}`,
  ];

  console.log(lines.join('\n'));

  if (result.run.errors.length > 0) {
    console.log('\nError samples:');
    for (const error of result.run.errors.slice(0, 8)) {
      console.log(`- [${error.language || 'n/a'}|${error.stage || 'n/a'}] ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error('Source sync failed:', error.message);
  process.exit(1);
});
