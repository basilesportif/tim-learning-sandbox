import crypto from 'crypto';
import fs from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import sharp from 'sharp';

process.loadEnvFile?.();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const dataPath = join(repoRoot, 'apps', 'vocab', 'data');
const booksPath = join(dataPath, 'books.json');
const DEFAULT_MODEL = process.env.VOCAB_ARTIFACT_MODEL || 'gpt-5.4';

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallbackValue;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseArgs(argv) {
  const options = {
    bookId: null,
    limit: null,
    force: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--book-id=')) {
      options.bookId = arg.slice('--book-id='.length);
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const parsed = Number(arg.slice('--limit='.length));
      options.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
    }
  }

  return options;
}

function extensionToMimeType(extension) {
  switch (String(extension || '').toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

function fileToDataUrl(filePath) {
  const extension = filePath.split('.').pop() || 'png';
  const mimeType = extensionToMimeType(extension);
  const base64 = fs.readFileSync(filePath).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

function extractFirstJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function detectIllustrationRegions(client, book, page) {
  const prompt = [
    'You are looking at a scanned children’s book page.',
    'Return JSON with exactly one key called illustrations.',
    'illustrations must be an array.',
    'Each item must have: label, description, bbox.',
    'bbox must have x, y, width, height as integers from 0 to 1000 describing the illustration region.',
    'Only include actual illustration or picture regions, not plain text blocks, page numbers, or margins.',
    'If the page has no illustration, return {"illustrations":[]}.',
    `Book title: ${book.title}`,
    `Page index: ${page.page_index}`,
  ].join('\n');

  const response = await client.responses.create({
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: fileToDataUrl(page.image_path) },
        ],
      },
    ],
  });

  const parsed = extractFirstJsonObject(response.output_text);
  return Array.isArray(parsed?.illustrations) ? parsed.illustrations : [];
}

function normalizeCrop(box, imageWidth, imageHeight) {
  const x = clamp(Number(box?.x) || 0, 0, 1000);
  const y = clamp(Number(box?.y) || 0, 0, 1000);
  const width = clamp(Number(box?.width) || 0, 0, 1000);
  const height = clamp(Number(box?.height) || 0, 0, 1000);

  if (width <= 0 || height <= 0) {
    return null;
  }

  const left = clamp(Math.round((x / 1000) * imageWidth) - 12, 0, imageWidth - 1);
  const top = clamp(Math.round((y / 1000) * imageHeight) - 12, 0, imageHeight - 1);
  const cropWidth = clamp(Math.round((width / 1000) * imageWidth) + 24, 1, imageWidth - left);
  const cropHeight = clamp(Math.round((height / 1000) * imageHeight) + 24, 1, imageHeight - top);

  if (cropWidth < 64 || cropHeight < 64) {
    return null;
  }

  return {
    left,
    top,
    width: cropWidth,
    height: cropHeight,
  };
}

async function extractArtifactsForPage(book, page, artifactsDir, force) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const metadata = await sharp(page.image_path).metadata();
  const regions = await detectIllustrationRegions(client, book, page);

  if (!Number(metadata.width) || !Number(metadata.height)) {
    return {
      artifacts: [],
      processedAt: nowIso(),
      regionCount: 0,
    };
  }

  const existingPageArtifacts = Array.isArray(book.artifacts)
    ? book.artifacts.filter((artifact) => artifact.source_page_image_id === page.id)
    : [];

  if (force) {
    for (const artifact of existingPageArtifacts) {
      if (artifact.image_path && fs.existsSync(artifact.image_path)) {
        fs.rmSync(artifact.image_path, { force: true });
      }
    }
  }

  const freshArtifacts = [];
  let artifactIndex = 0;

  for (const region of regions) {
    const crop = normalizeCrop(region.bbox, metadata.width, metadata.height);
    if (!crop) {
      continue;
    }

    artifactIndex += 1;
    const artifactId = `artifact_${page.id}_${String(artifactIndex).padStart(2, '0')}_${crypto.randomUUID().slice(0, 6)}`;
    const outputPath = join(artifactsDir, `${artifactId}.png`);

    await sharp(page.image_path)
      .extract(crop)
      .png()
      .toFile(outputPath);

    freshArtifacts.push({
      id: artifactId,
      book_id: book.id,
      source_page_image_id: page.id,
      kind: 'illustration',
      label: String(region.label || `Illustration ${artifactIndex}`).trim(),
      description: String(region.description || '').trim(),
      image_path: outputPath,
      bbox: crop,
      created_at: nowIso(),
    });
  }

  return {
    artifacts: freshArtifacts,
    processedAt: nowIso(),
    regionCount: freshArtifacts.length,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required.');
  }

  const options = parseArgs(process.argv.slice(2));
  const books = readJson(booksPath, []);
  const selectedBooks = books
    .filter((book) => !options.bookId || book.id === options.bookId)
    .filter((book) => Array.isArray(book.page_images) && book.page_images.length > 0)
    .slice(0, options.limit || books.length);

  if (selectedBooks.length === 0) {
    console.log('No vocab books with stored page images matched the request.');
    return;
  }

  let processedBooks = 0;
  let processedPages = 0;
  let createdArtifacts = 0;

  for (const book of selectedBooks) {
    const bookDir = join(dataPath, 'books', book.id);
    const artifactsDir = join(bookDir, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    book.artifacts = Array.isArray(book.artifacts) ? book.artifacts : [];

    for (const page of book.page_images) {
      const alreadyProcessed = Boolean(page.artifact_scan?.processed_at);
      if (alreadyProcessed && !options.force) {
        continue;
      }

      book.artifacts = book.artifacts.filter((artifact) => artifact.source_page_image_id !== page.id);
      const result = await extractArtifactsForPage(book, page, artifactsDir, options.force);
      book.artifacts.push(...result.artifacts);
      page.artifact_scan = {
        processed_at: result.processedAt,
        artifact_count: result.regionCount,
        model: DEFAULT_MODEL,
      };
      book.updated_at = nowIso();

      processedPages += 1;
      createdArtifacts += result.artifacts.length;
    }

    processedBooks += 1;
  }

  writeJson(booksPath, books);
  console.log(JSON.stringify({
    processed_books: processedBooks,
    processed_pages: processedPages,
    created_artifacts: createdArtifacts,
    forced: options.force,
    book_id: options.bookId || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
