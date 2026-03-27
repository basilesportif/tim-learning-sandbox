import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { reprocessVocabBookPools } from '../server/vocab.js';

process.loadEnvFile?.();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const dataPath = join(repoRoot, 'apps', 'vocab', 'data');

function parseArgs(argv) {
  const options = {
    bookId: null,
    limit: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--book-id=')) {
      options.bookId = arg.slice('--book-id='.length);
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const parsed = Number(arg.slice('--limit='.length));
      options.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));
const results = await reprocessVocabBookPools({
  dataPath,
  bookId: options.bookId,
  limit: options.limit,
});

if (results.length === 0) {
  console.log('No vocab books matched the request.');
  process.exit(0);
}

for (const result of results) {
  console.log(`Reprocessed ${result.title} (${result.book_id}) with ${result.word_pool_count} pool words.`);
}
