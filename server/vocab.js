import crypto from 'crypto';
import fs from 'fs';
import { join } from 'path';
import { clerkMiddleware, createClerkClient, getAuth } from '@clerk/express';
import multer from 'multer';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';

const APP_NAME = 'vocab';
const DEFAULT_MAX_NEW_WORDS = 8;
const DEFAULT_MAX_REVIEW_WORDS = 12;
const DEFAULT_SESSION_MINUTES = 7;
const DEFAULT_BOOK_WORD_POOL_SIZE = 240;
const MIN_BOOK_WORD_POOL_SIZE = 24;
const MAX_BOOK_WORD_POOL_SIZE = 600;
const WORD_METADATA_BATCH_SIZE = 20;
const MAX_GENERATED_WORD_IMAGES_PER_BOOK = 24;
const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 28];
const WRONG_RETRY_MINUTES = 15;
const ASSISTED_REVIEW_HOURS = 12;
const ROLLING_BAND_WINDOW = 8;
const BAND_ADJUSTMENT_MIN_ANSWERS = 3;
const BAND_ADJUSTMENT_STEP = 2;
const COMMON_WORDS = new Set([
  'about', 'after', 'again', 'along', 'always', 'another', 'around', 'asked', 'because',
  'before', 'being', 'below', 'between', 'called', 'could', 'every', 'first', 'found',
  'friend', 'great', 'house', 'little', 'mother', 'never', 'other', 'people', 'right',
  'should', 'small', 'their', 'there', 'these', 'thing', 'think', 'through', 'under',
  'where', 'which', 'would', 'young', 'animal', 'carry', 'garden', 'gentle', 'library',
  'market', 'notice', 'school', 'window', 'wonder', 'yellow', 'build', 'bright', 'quiet',
  'person', 'inside', 'outside', 'answer', 'return', 'travel', 'secret', 'winter',
]);
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'did', 'do', 'for',
  'from', 'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his', 'i', 'if', 'in',
  'into', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'ours', 'she', 'so',
  'than', 'that', 'the', 'them', 'then', 'they', 'this', 'to', 'too', 'up', 'us', 'was',
  'we', 'were', 'what', 'when', 'who', 'with', 'you', 'your',
]);

const activeSessions = new Map();

let clerkClientInstance = null;
let openAiClient = null;

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmailList(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    base64: match[2],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function mimeTypeToExtension(mimeType) {
  switch (String(mimeType || '').toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'png';
  }
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

function ensureJsonFile(filePath, fallbackValue) {
  if (fs.existsSync(filePath)) {
    return;
  }
  fs.writeFileSync(filePath, JSON.stringify(fallbackValue, null, 2));
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

function sanitizeText(input) {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toTimestamp(value) {
  const ts = new Date(value || '').getTime();
  return Number.isFinite(ts) ? ts : null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || crypto.randomUUID();
}

function unique(values) {
  return [...new Set(values)];
}

function sortFilesByName(files, nameKey = 'name') {
  return [...files].sort((left, right) => (
    String(left?.[nameKey] || '').localeCompare(String(right?.[nameKey] || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  ));
}

function ensureBookAssetDirectories(booksDir, bookId) {
  const bookDir = join(booksDir, bookId);
  const pagesDir = join(bookDir, 'pages');
  const artifactsDir = join(bookDir, 'artifacts');
  fs.mkdirSync(bookDir, { recursive: true });
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(artifactsDir, { recursive: true });
  return {
    bookDir,
    pagesDir,
    artifactsDir,
  };
}

function saveOcrPageImages(bookId, ocrImages, booksDir) {
  if (!Array.isArray(ocrImages) || ocrImages.length === 0) {
    return [];
  }

  const { pagesDir } = ensureBookAssetDirectories(booksDir, bookId);

  return ocrImages
    .map((entry, index) => {
      const normalizedEntry = typeof entry === 'string'
        ? { dataUrl: entry, originalName: '' }
        : {
            dataUrl: entry?.dataUrl || '',
            originalName: entry?.originalName || '',
          };
      const parsed = parseDataUrl(normalizedEntry.dataUrl);
      if (!parsed) {
        return null;
      }

      const pageId = `page_${String(index + 1).padStart(3, '0')}`;
      const extension = mimeTypeToExtension(parsed.mimeType);
      const filePath = join(pagesDir, `${pageId}.${extension}`);
      fs.writeFileSync(filePath, parsed.buffer);

      return {
        id: pageId,
        page_index: index + 1,
        original_filename: normalizedEntry.originalName || null,
        mime_type: parsed.mimeType,
        image_path: filePath,
        created_at: nowIso(),
      };
    })
    .filter(Boolean);
}

function inferDisplayName(user) {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  if (fullName) {
    return fullName;
  }
  if (user?.username) {
    return user.username;
  }
  return user?.primaryEmailAddress?.emailAddress || 'Reader';
}

function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return null;
  }

  if (!clerkClientInstance) {
    clerkClientInstance = createClerkClient({ secretKey });
  }

  return clerkClientInstance;
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openAiClient) {
    openAiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openAiClient;
}

async function safeGetUser(userId) {
  const clerk = getClerkClient();
  if (!clerk || !userId) {
    return null;
  }

  try {
    return await clerk.users.getUser(userId);
  } catch {
    return null;
  }
}

async function listChildUsers(adminEmails, childEmails) {
  const clerk = getClerkClient();
  if (!clerk) {
    return [];
  }

  const response = await clerk.users.getUserList({ limit: 100 });
  const users = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];

  return users
    .map((user) => {
      const email = user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress || '';
      return {
        user_id: user.id,
        email,
        display_name: inferDisplayName(user),
      };
    })
    .filter((user) => {
      const normalized = user.email.toLowerCase();
      if (!user.email || adminEmails.includes(normalized)) {
        return false;
      }
      if (childEmails.length > 0) {
        return childEmails.includes(normalized);
      }
      return true;
    });
}

async function resolveRequester(req, adminEmails, childEmails) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return null;
  }

  const user = await safeGetUser(auth.userId);
  const email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || '';
  const normalizedEmail = String(email).toLowerCase();
  let role = 'blocked';

  if (adminEmails.includes(normalizedEmail)) {
    role = 'admin';
  } else if (childEmails.length === 0 || childEmails.includes(normalizedEmail)) {
    role = 'child';
  }

  return {
    user_id: auth.userId,
    email,
    display_name: inferDisplayName(user),
    role,
  };
}

function sendAuthConfigError(res) {
  res.status(503).json({
    error: 'clerk_not_configured',
    message: 'Set Clerk environment variables before using the vocab app.',
  });
}

function extractCandidateWords(text, limit = DEFAULT_BOOK_WORD_POOL_SIZE) {
  const words = new Map();
  const sentences = sanitizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const matches = sentence.match(/[A-Za-z][A-Za-z'-]{2,}/g) || [];
    for (const rawWord of matches) {
      const lemma = rawWord
        .toLowerCase()
        .replace(/^'+|'+$/g, '')
        .replace(/'s$/g, '')
        .replace(/[^a-z'-]/g, '');

      if (!lemma || lemma.length < 4 || STOPWORDS.has(lemma)) {
        continue;
      }

      const existing = words.get(lemma) || {
        lemma,
        count: 0,
        snippets: [],
      };
      existing.count += 1;
      if (existing.snippets.length < 3) {
        existing.snippets.push(sentence);
      }
      words.set(lemma, existing);
    }
  }

  return [...words.values()]
    .map((entry) => ({
      ...entry,
      heuristic_score: scoreLemmaDifficulty(entry.lemma, entry.count),
    }))
    .sort((a, b) => {
      if (b.heuristic_score !== a.heuristic_score) {
        return b.heuristic_score - a.heuristic_score;
      }
      return b.count - a.count;
    })
    .slice(0, limit);
}

function scoreLemmaDifficulty(lemma, count) {
  const base = lemma.length * 0.7 + unique(lemma.split('')).length * 0.4;
  const frequencyPenalty = Math.min(count, 4) * 0.5;
  const familiarityDiscount = COMMON_WORDS.has(lemma) ? 2.2 : 0;
  return Number((base - frequencyPenalty - familiarityDiscount).toFixed(2));
}

function heuristicDifficultyBand(lemma, count) {
  const score = scoreLemmaDifficulty(lemma, count);
  return clamp(Math.round(score / 2.4), 1, 6);
}

function heuristicDifficultyScore(lemma, count) {
  const score = scoreLemmaDifficulty(lemma, count);
  return clamp(Math.round(((score + 1.5) / 8.5) * 100), 1, 100);
}

function normalizeDifficultyScore(rawValue, candidate) {
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed)) {
    return clamp(Math.round(parsed), 1, 100);
  }
  return heuristicDifficultyScore(candidate.lemma, candidate.count);
}

function normalizeChoiceSet(correctAnswer, distractors) {
  const choices = unique([
    String(correctAnswer || '').trim(),
    ...distractors.map((item) => String(item || '').trim()),
  ].filter(Boolean)).slice(0, 4);

  while (choices.length < 4) {
    choices.push(`Not ${choices.length + 1}`);
  }

  return choices;
}

function normalizeUsageExamples(rawExamples, fallbackExamples = []) {
  return unique([
    ...(Array.isArray(rawExamples) ? rawExamples : []),
    ...(Array.isArray(fallbackExamples) ? fallbackExamples : []),
  ].map((item) => sanitizeText(String(item || '')).replace(/^["']+|["']+$/g, ''))
    .filter(Boolean))
    .slice(0, 2);
}

function buildFallbackUsageExamples(candidate) {
  const snippetExamples = normalizeUsageExamples(candidate?.snippets || []);
  if (snippetExamples.length >= 2) {
    return snippetExamples;
  }

  const examples = [...snippetExamples];
  if (examples.length === 0) {
    examples.push(`The story uses "${candidate.lemma}" in a sentence that helps explain what is happening.`);
  }
  if (examples.length === 1) {
    examples.push(`While you read, notice how "${candidate.lemma}" fits the action in the story.`);
  }

  return examples.slice(0, 2);
}

function fallbackWordMetadata(candidate) {
  const difficultyBand = heuristicDifficultyBand(candidate.lemma, candidate.count);
  const shortSnippet = candidate.snippets[0] || '';

  return {
    difficultyBand,
    difficultyScore: heuristicDifficultyScore(candidate.lemma, candidate.count),
    definition: `A word worth reviewing before reading the book. Use the sentence context to confirm its meaning.`,
    hint: shortSnippet ? `Look at the sentence: "${shortSnippet}"` : 'Think about how the word might be used in the story.',
    distractors: [
      'A random object with no connection to the story',
      'A feeling that does not fit the sentence',
      'An action that is clearly unrelated',
    ],
    usageExamples: buildFallbackUsageExamples(candidate),
    imagePrompt: `A simple children’s book illustration representing the word "${candidate.lemma}" with no text.`,
    needsReview: true,
  };
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

function createArtifactAssetUrl(appName, bookId, artifactId) {
  return `/${appName}/api/admin/books/${encodeURIComponent(bookId)}/artifacts/${encodeURIComponent(artifactId)}`;
}

function parseBooleanField(value) {
  return String(value || '').toLowerCase() === 'true';
}

function fileBufferToDataUrl(file) {
  const mimeType = file?.mimetype || 'image/png';
  const buffer = Buffer.isBuffer(file?.buffer) ? file.buffer : null;
  if (!buffer) {
    return null;
  }
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function isPdfFile(file) {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  const originalName = String(file?.originalname || file?.name || '').toLowerCase();
  return mimeType === 'application/pdf' || originalName.endsWith('.pdf');
}

function hasSubstantialImportedText(text) {
  const alphaCharacters = String(text || '').replace(/[^A-Za-z]/g, '').length;
  return alphaCharacters >= 250;
}

async function extractTextFromPdfBuffer(file) {
  const buffer = Buffer.isBuffer(file?.buffer) ? file.buffer : null;
  if (!buffer) {
    return {
      text: '',
      ocrImageEntries: [],
    };
  }

  const parser = new PDFParse({ data: buffer });

  try {
    const textResult = await parser.getText();
    const extractedText = sanitizeText(textResult?.text || '');

    if (hasSubstantialImportedText(extractedText)) {
      return {
        text: extractedText,
        ocrImageEntries: [],
      };
    }

    const screenshotResult = await parser.getScreenshot({
      imageDataUrl: true,
      imageBuffer: false,
      scale: 1.4,
    });

    return {
      text: extractedText,
      ocrImageEntries: (screenshotResult?.pages || [])
        .map((page, index) => ({
          dataUrl: page?.dataUrl || '',
          originalName: `${slugify(file?.originalname || 'pdf')}-page-${String(index + 1).padStart(3, '0')}.png`,
        }))
        .filter((entry) => entry.dataUrl),
    };
  } finally {
    await parser.destroy();
  }
}

async function extractUploadedSourceText(file) {
  if (!file) {
    return {
      text: '',
      ocrImageEntries: [],
    };
  }

  if (isPdfFile(file)) {
    return extractTextFromPdfBuffer(file);
  }

  return {
    text: sanitizeText(file.buffer?.toString('utf-8') || ''),
    ocrImageEntries: [],
  };
}

function getUploadedFiles(req, fieldName) {
  if (!req.files || typeof req.files !== 'object') {
    return [];
  }
  return Array.isArray(req.files[fieldName]) ? req.files[fieldName] : [];
}

function getBookWordPool(book) {
  const pool = Array.isArray(book?.word_pool) && book.word_pool.length > 0
    ? book.word_pool
    : (Array.isArray(book?.word_pool_ids) && book.word_pool_ids.length > 0
        ? book.word_pool_ids.map((wordId, index) => ({ word_id: wordId, rank: index + 1 }))
        : (Array.isArray(book?.word_ids) ? book.word_ids : []).map((wordId, index) => ({ word_id: wordId, rank: index + 1 })));

  return pool
    .filter((entry) => entry?.word_id)
    .sort((left, right) => (
      (Number(left?.rank) || Number.MAX_SAFE_INTEGER) - (Number(right?.rank) || Number.MAX_SAFE_INTEGER)
    ));
}

function getBookWordIds(book) {
  return unique(getBookWordPool(book).map((entry) => entry.word_id));
}

function getAssignmentWordIds(assignment, book) {
  return unique([
    ...(Array.isArray(assignment?.target_word_ids) ? assignment.target_word_ids : []),
    ...getBookWordIds(book),
  ]);
}

function getWordReadyAt(progress) {
  if (!progress) {
    return null;
  }
  return toTimestamp(progress.due_at);
}

function isWordDue(progress, now = Date.now()) {
  const readyAt = getWordReadyAt(progress);
  return readyAt !== null && readyAt <= now;
}

function getMatchingActiveSessions(childUserId, assignmentId) {
  return [...activeSessions.values()]
    .filter((session) => session.child_user_id === childUserId && session.assignment_id === assignmentId)
    .sort((left, right) => (
      (toTimestamp(right.updated_at || right.started_at) || 0)
      - (toTimestamp(left.updated_at || left.started_at) || 0)
    ));
}

function getRemainingSessionCards(session) {
  return (session?.cards || []).filter((card) => !session.completed_word_ids?.has(card.word_id));
}

function getWordEntriesForIds(wordIds, book, wordCatalogById) {
  const bookPoolByWordId = new Map(getBookWordPool(book).map((entry, index) => [
    entry.word_id,
    {
      ...entry,
      rank: Number(entry.rank) || index + 1,
    },
  ]));

  return unique(Array.isArray(wordIds) ? wordIds : [])
    .map((wordId, index) => {
      const poolEntry = bookPoolByWordId.get(wordId) || {
        word_id: wordId,
        rank: index + 1,
        count: 0,
        heuristic_score: 0,
      };
      return {
        ...poolEntry,
        word: wordCatalogById[wordId],
      };
    })
    .filter((entry) => entry.word)
    .sort((left, right) => {
      if ((left.rank || Number.MAX_SAFE_INTEGER) !== (right.rank || Number.MAX_SAFE_INTEGER)) {
        return (left.rank || Number.MAX_SAFE_INTEGER) - (right.rank || Number.MAX_SAFE_INTEGER);
      }
      return (left.word?.lemma || '').localeCompare(right.word?.lemma || '');
    });
}

function getAssignmentWordEntries(assignment, book, wordCatalogById) {
  return getWordEntriesForIds(getAssignmentWordIds(assignment, book), book, wordCatalogById);
}

function buildBookWordPoolEntry(candidate, wordRecord, rank) {
  return {
    word_id: wordRecord.id,
    lemma: candidate.lemma,
    rank,
    difficulty_rank: rank,
    count: candidate.count,
    heuristic_score: candidate.heuristic_score,
    snippets: candidate.snippets.slice(0, 3),
    difficulty_band: wordRecord.difficulty_band,
    difficulty_score: normalizeDifficultyScore(wordRecord.difficulty_score, candidate),
  };
}

function compareWordPoolEntries(left, right) {
  if ((left.difficulty_band || 1) !== (right.difficulty_band || 1)) {
    return (left.difficulty_band || 1) - (right.difficulty_band || 1);
  }
  if ((left.difficulty_score || 50) !== (right.difficulty_score || 50)) {
    return (left.difficulty_score || 50) - (right.difficulty_score || 50);
  }
  if ((left.heuristic_score || 0) !== (right.heuristic_score || 0)) {
    return (left.heuristic_score || 0) - (right.heuristic_score || 0);
  }
  if ((right.count || 0) !== (left.count || 0)) {
    return (right.count || 0) - (left.count || 0);
  }
  return (left.lemma || '').localeCompare(right.lemma || '');
}

function sortImportJobs(importJobs) {
  return [...(Array.isArray(importJobs) ? importJobs : [])].sort((left, right) => (
    new Date(right?.updated_at || right?.created_at || 0).getTime()
    - new Date(left?.updated_at || left?.created_at || 0).getTime()
  ));
}

function upsertImportJob(importJobsPath, nextJob) {
  const currentJobs = readJson(importJobsPath, []);
  const remainingJobs = currentJobs.filter((job) => job.id !== nextJob.id);
  const updatedJobs = sortImportJobs([{
    ...nextJob,
    updated_at: nowIso(),
  }, ...remainingJobs]).slice(0, 60);
  writeJson(importJobsPath, updatedJobs);
  return updatedJobs[0];
}

function updateImportJob(importJobsPath, jobId, updater) {
  const currentJobs = readJson(importJobsPath, []);
  const jobIndex = currentJobs.findIndex((job) => job.id === jobId);
  if (jobIndex < 0) {
    return null;
  }

  const currentJob = currentJobs[jobIndex];
  const nextJob = typeof updater === 'function'
    ? updater(currentJob)
    : {
        ...currentJob,
        ...updater,
      };

  currentJobs[jobIndex] = {
    ...nextJob,
    updated_at: nowIso(),
  };

  const updatedJobs = sortImportJobs(currentJobs).slice(0, 60);
  writeJson(importJobsPath, updatedJobs);
  return updatedJobs.find((job) => job.id === jobId) || null;
}

function normalizeWordMetadataResult(candidate, parsed) {
  const fallback = fallbackWordMetadata(candidate);

  return {
    difficultyBand: clamp(Number(parsed?.difficultyBand) || heuristicDifficultyBand(candidate.lemma, candidate.count), 1, 6),
    difficultyScore: normalizeDifficultyScore(parsed?.difficultyScore, candidate),
    definition: String(parsed?.definition || '').trim() || fallback.definition,
    hint: String(parsed?.hint || '').trim() || fallback.hint,
    distractors: normalizeChoiceSet(parsed?.definition, Array.isArray(parsed?.distractors) ? parsed.distractors : []).slice(1, 4),
    usageExamples: normalizeUsageExamples(parsed?.usageExamples, fallback.usageExamples),
    imagePrompt: String(parsed?.imagePrompt || '').trim() || fallback.imagePrompt,
    needsReview: Boolean(parsed?.needsReview),
  };
}

async function enrichWordMetadataBatchWithAI(candidates, bookTitle) {
  const entries = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (entries.length === 0) {
    return {};
  }

  const client = getOpenAIClient();
  if (!client) {
    return Object.fromEntries(entries.map((candidate) => [candidate.lemma, fallbackWordMetadata(candidate)]));
  }

  const prompt = [
    'You are preparing vocabulary practice for children.',
    'Return one JSON object with a single key called words.',
    'words must be an array with one item for each requested lemma.',
    'Each item must have keys: lemma, difficultyBand, difficultyScore, definition, hint, distractors, usageExamples, imagePrompt, needsReview.',
    'difficultyBand must be an integer from 1 to 6.',
    'difficultyScore must be an integer from 1 to 100 where 1 is easiest and 100 is hardest for a child reader.',
    'definition must be short, concrete, and child-friendly.',
    'hint must guide the child without giving away the answer.',
    'distractors must be an array of exactly 3 plausible but wrong meanings.',
    'usageExamples must be an array of exactly 2 short, child-safe sentences that use the word naturally.',
    'needsReview must be true if the meaning is ambiguous or the word is hard to teach with one definition.',
    'Use each lemma exactly as given.',
    `Book title: ${bookTitle}`,
    'Words to define:',
    ...entries.map((candidate) => (
      `- lemma: ${candidate.lemma}; snippets: ${candidate.snippets.join(' | ')}`
    )),
  ].join('\n');

  try {
    const response = await client.responses.create({
      model: process.env.VOCAB_WORD_MODEL || 'gpt-5.4',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
          ],
        },
      ],
    });

    const parsed = extractFirstJsonObject(response.output_text);
    const items = Array.isArray(parsed?.words) ? parsed.words : [];
    const metadataByLemma = new Map();

    for (const item of items) {
      const lemma = String(item?.lemma || '').trim().toLowerCase();
      const candidate = entries.find((entry) => entry.lemma === lemma);
      if (!candidate) {
        continue;
      }
      metadataByLemma.set(candidate.lemma, normalizeWordMetadataResult(candidate, item));
    }

    return Object.fromEntries(entries.map((candidate) => [
      candidate.lemma,
      metadataByLemma.get(candidate.lemma) || fallbackWordMetadata(candidate),
    ]));
  } catch {
    return Object.fromEntries(entries.map((candidate) => [candidate.lemma, fallbackWordMetadata(candidate)]));
  }
}

async function enrichWordMetadataWithAI(candidate, bookTitle) {
  const metadataByLemma = await enrichWordMetadataBatchWithAI([candidate], bookTitle);
  return metadataByLemma[candidate.lemma] || fallbackWordMetadata(candidate);
}

async function transcribeImage(dataUrl) {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OPENAI_API_KEY is required for OCR imports.');
  }

  const response = await client.responses.create({
    model: process.env.VOCAB_OCR_MODEL || 'gpt-5.4',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Transcribe the visible book page into plain text. Keep paragraph breaks. Return only the text.' },
          { type: 'input_image', image_url: dataUrl },
        ],
      },
    ],
  });

  return sanitizeText(response.output_text);
}

async function maybeGenerateWordImage(imagePrompt, wordId, imagesDir) {
  const client = getOpenAIClient();
  if (!client || !imagePrompt) {
    return null;
  }

  try {
    const result = await client.images.generate({
      model: process.env.VOCAB_IMAGE_MODEL || 'gpt-image-1',
      prompt: imagePrompt,
      size: '512x512',
    });

    const imageBase64 = result?.data?.[0]?.b64_json;
    if (!imageBase64) {
      return null;
    }

    const fileName = `${wordId}.png`;
    fs.writeFileSync(join(imagesDir, fileName), Buffer.from(imageBase64, 'base64'));
    return fileName;
  } catch {
    return null;
  }
}

function shapeWordRecord(candidate, metadata, bookId, imagesDir, generatedImageFile) {
  const createdAt = nowIso();
  const definitionChoices = normalizeChoiceSet(metadata.definition, metadata.distractors || []);
  const usageExamples = normalizeUsageExamples(metadata.usageExamples, buildFallbackUsageExamples(candidate));
  const difficultyScore = normalizeDifficultyScore(metadata.difficultyScore, candidate);

  return {
    id: `word_${slugify(candidate.lemma)}`,
    lemma: candidate.lemma,
    language: 'en',
    source_books: [bookId],
    count_in_book: candidate.count,
    snippets: candidate.snippets,
    difficulty_band: clamp(Number(metadata.difficultyBand) || heuristicDifficultyBand(candidate.lemma, candidate.count), 1, 6),
    difficulty_score: difficultyScore,
    definition: metadata.definition,
    hint: metadata.hint,
    distractors: definitionChoices.filter((choice) => choice !== metadata.definition).slice(0, 3),
    usage_examples: usageExamples,
    image_prompt: metadata.imagePrompt,
    image_path: generatedImageFile ? join(imagesDir, generatedImageFile) : null,
    needs_review: Boolean(metadata.needsReview),
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function removeBookFromWordCatalog(wordCatalog, bookId) {
  for (const word of wordCatalog) {
    word.source_books = (word.source_books || []).filter((sourceBookId) => sourceBookId !== bookId);
  }
}

async function buildWordPoolForText({
  store,
  bookId,
  bookTitle,
  combinedText,
  maxWordCount = DEFAULT_BOOK_WORD_POOL_SIZE,
  generateImages = false,
  imagesDir,
  onProgress = null,
}) {
  const candidates = extractCandidateWords(combinedText, maxWordCount);
  const wordCatalogById = makeWordCatalogIndex(store.wordCatalog);
  const unsortedWordPool = [];
  let generatedImageCount = 0;

  if (typeof onProgress === 'function') {
    onProgress({
      step: 'vocabulary',
      wordTotal: candidates.length,
      wordCompleted: 0,
      message: `Preparing ${candidates.length} pool words.`,
    });
  }

  for (let batchStart = 0; batchStart < candidates.length; batchStart += WORD_METADATA_BATCH_SIZE) {
    const batch = candidates.slice(batchStart, batchStart + WORD_METADATA_BATCH_SIZE);
    const candidatesNeedingMetadata = batch.filter((candidate) => {
      const existing = wordCatalogById[`word_${slugify(candidate.lemma)}`];
      return !existing
        || !existing.definition
        || !existing.hint
        || !Number.isFinite(Number(existing.difficulty_score))
        || !Array.isArray(existing.usage_examples)
        || existing.usage_examples.length < 2
        || !Array.isArray(existing.distractors)
        || existing.distractors.length < 3;
    });
    const metadataByLemma = await enrichWordMetadataBatchWithAI(candidatesNeedingMetadata, bookTitle);

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      const candidate = batch[batchIndex];
      const overallIndex = batchStart + batchIndex;
      const wordId = `word_${slugify(candidate.lemma)}`;
      let wordRecord = wordCatalogById[wordId];
      let generatedImageFile = null;
      const refreshedMetadata = metadataByLemma[candidate.lemma] || null;

      if (typeof onProgress === 'function') {
        onProgress({
          step: 'vocabulary',
          wordTotal: candidates.length,
          wordCompleted: overallIndex,
          message: `Preparing word ${overallIndex + 1} of ${candidates.length}: ${candidate.lemma}.`,
        });
      }

      if (!wordRecord) {
        const metadata = refreshedMetadata || fallbackWordMetadata(candidate);
        if (generateImages && generatedImageCount < MAX_GENERATED_WORD_IMAGES_PER_BOOK) {
          generatedImageFile = await maybeGenerateWordImage(metadata.imagePrompt, wordId, imagesDir);
          if (generatedImageFile) {
            generatedImageCount += 1;
          }
        }
        wordRecord = shapeWordRecord(candidate, metadata, bookId, imagesDir, generatedImageFile);
        store.wordCatalog.push(wordRecord);
        wordCatalogById[wordId] = wordRecord;
      } else {
        wordRecord.source_books = unique([...(wordRecord.source_books || []), bookId]);
        wordRecord.count_in_book = Math.max(Number(wordRecord.count_in_book) || 0, candidate.count);
        wordRecord.snippets = unique([...(wordRecord.snippets || []), ...candidate.snippets]).slice(0, 4);
        if (refreshedMetadata) {
          const definitionChoices = normalizeChoiceSet(refreshedMetadata.definition, refreshedMetadata.distractors || []);
          const usageExamples = normalizeUsageExamples(refreshedMetadata.usageExamples, buildFallbackUsageExamples(candidate));
          const difficultyScore = normalizeDifficultyScore(refreshedMetadata.difficultyScore, candidate);
          wordRecord.difficulty_band = clamp(
            Number(wordRecord.difficulty_band) || Number(refreshedMetadata.difficultyBand) || heuristicDifficultyBand(candidate.lemma, candidate.count),
            1,
            6
          );
          if (!Number.isFinite(Number(wordRecord.difficulty_score))) {
            wordRecord.difficulty_score = difficultyScore;
          }
          wordRecord.definition = String(wordRecord.definition || '').trim() || refreshedMetadata.definition;
          wordRecord.hint = String(wordRecord.hint || '').trim() || refreshedMetadata.hint;
          if (!Array.isArray(wordRecord.usage_examples) || wordRecord.usage_examples.length < 2) {
            wordRecord.usage_examples = usageExamples;
          }
          if (!Array.isArray(wordRecord.distractors) || wordRecord.distractors.length < 3) {
            wordRecord.distractors = definitionChoices.filter((choice) => choice !== refreshedMetadata.definition).slice(0, 3);
          }
          wordRecord.image_prompt = String(wordRecord.image_prompt || '').trim() || refreshedMetadata.imagePrompt;
          wordRecord.needs_review = Boolean(wordRecord.needs_review || refreshedMetadata.needsReview);
          if (!wordRecord.image_path && generateImages && generatedImageCount < MAX_GENERATED_WORD_IMAGES_PER_BOOK) {
            generatedImageFile = await maybeGenerateWordImage(refreshedMetadata.imagePrompt, wordId, imagesDir);
            if (generatedImageFile) {
              generatedImageCount += 1;
              wordRecord.image_path = join(imagesDir, generatedImageFile);
            }
          }
        }
        wordRecord.updated_at = nowIso();
      }

      unsortedWordPool.push(buildBookWordPoolEntry(candidate, wordRecord, overallIndex + 1));

      if (typeof onProgress === 'function') {
        onProgress({
          step: 'vocabulary',
          wordTotal: candidates.length,
          wordCompleted: overallIndex + 1,
          message: `Prepared word ${overallIndex + 1} of ${candidates.length}: ${candidate.lemma}.`,
        });
      }
    }
  }

  const wordPool = [...unsortedWordPool]
    .sort(compareWordPoolEntries)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      difficulty_rank: index + 1,
    }));
  const wordIds = wordPool.map((entry) => entry.word_id);

  return {
    candidates,
    wordIds,
    wordPool,
  };
}

function normalizeAssignmentSettings(input = {}) {
  return {
    hints_enabled: input.hints_enabled !== false,
    images_enabled: Boolean(input.images_enabled),
    max_new_words: clamp(Number(input.max_new_words) || DEFAULT_MAX_NEW_WORDS, 3, 12),
    max_review_words: clamp(Number(input.max_review_words) || DEFAULT_MAX_REVIEW_WORDS, 4, 16),
    session_minutes: clamp(Number(input.session_minutes) || DEFAULT_SESSION_MINUTES, 3, 12),
  };
}

function normalizeAdaptiveSettings(input = {}) {
  const rollingBandWindow = clamp(
    Number(input.rolling_band_window) || ROLLING_BAND_WINDOW,
    3,
    20
  );
  const bandAdjustmentMinAnswers = clamp(
    Number(input.band_adjustment_min_answers) || BAND_ADJUSTMENT_MIN_ANSWERS,
    2,
    rollingBandWindow
  );
  const bandAdjustmentStep = clamp(
    Number(input.band_adjustment_step) || BAND_ADJUSTMENT_STEP,
    1,
    10
  );

  return {
    rolling_band_window: rollingBandWindow,
    band_adjustment_min_answers: bandAdjustmentMinAnswers,
    band_adjustment_step: bandAdjustmentStep,
  };
}

function defaultProfile(user) {
  const createdAt = nowIso();
  return {
    user_id: user.user_id,
    email: user.email,
    display_name: user.display_name,
    target_band: 2,
    adaptive_settings: normalizeAdaptiveSettings(),
    band_checkpoint_total_answers: 0,
    word_progress: {},
    rolling_answers: [],
    stats: {
      total_sessions: 0,
      total_answers: 0,
      average_accuracy: 0,
      hint_rate: 0,
    },
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function computeProfileBuckets(profile) {
  const entries = Object.entries(profile.word_progress || {});
  const known = [];
  const learning = [];
  const struggling = [];

  for (const [wordId, progress] of entries) {
    if (progress.state === 'mastered') {
      known.push(wordId);
    } else if ((progress.wrong_attempts || 0) >= (progress.correct_attempts || 0) + 2) {
      struggling.push(wordId);
    } else {
      learning.push(wordId);
    }
  }

  return {
    known_word_ids: known,
    learning_word_ids: learning,
    struggling_word_ids: struggling,
  };
}

function ensureChildProfile(profiles, user) {
  const current = profiles[user.user_id] || defaultProfile(user);
  const nextProfile = {
    ...current,
    email: user.email,
    display_name: user.display_name,
    adaptive_settings: normalizeAdaptiveSettings(current.adaptive_settings),
    updated_at: nowIso(),
  };
  profiles[user.user_id] = nextProfile;
  return nextProfile;
}

function summarizeChildProgress(profile, assignment, book) {
  const progressEntries = getAssignmentWordIds(assignment, book).map((wordId) => profile.word_progress?.[wordId]).filter(Boolean);
  const mastered = progressEntries.filter((entry) => entry.state === 'mastered').length;
  const due = progressEntries.filter((entry) => isWordDue(entry)).length;
  const learning = progressEntries.filter((entry) => entry.state !== 'mastered').length;

  return {
    mastered_count: mastered,
    due_count: due,
    learning_count: learning,
    total_target_words: getAssignmentWordIds(assignment, book).length,
  };
}

function pickReviewWords(profile, candidateEntries, limit) {
  const now = Date.now();

  return candidateEntries
    .map((entry) => ({
      ...entry,
      progress: profile.word_progress?.[entry.word.id],
    }))
    .filter((entry) => entry.word && isWordDue(entry.progress, now))
    .sort((a, b) => {
      const dueDelta = (getWordReadyAt(a.progress) || 0) - (getWordReadyAt(b.progress) || 0);
      if (dueDelta !== 0) {
        return dueDelta;
      }
      return (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER);
    })
    .slice(0, limit)
    .map((entry) => entry.word);
}

function pickNewWords(profile, candidateEntries, limit) {
  const targetBand = Number(profile.target_band) || 2;

  const candidates = candidateEntries
    .filter((entry) => entry.word)
    .filter((entry) => {
      const progress = profile.word_progress?.[entry.word.id];
      return !progress || progress.state !== 'mastered';
    })
    .filter((entry) => {
      const progress = profile.word_progress?.[entry.word.id];
      return !progress || getWordReadyAt(progress) === null;
    })
    .sort((a, b) => {
      const distanceA = Math.abs((a.word.difficulty_band || 1) - targetBand);
      const distanceB = Math.abs((b.word.difficulty_band || 1) - targetBand);
      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }
      if ((a.rank || Number.MAX_SAFE_INTEGER) !== (b.rank || Number.MAX_SAFE_INTEGER)) {
        return (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER);
      }
      if ((b.count || 0) !== (a.count || 0)) {
        return (b.count || 0) - (a.count || 0);
      }
      return (a.word.lemma || '').localeCompare(b.word.lemma || '');
    });

  return candidates.slice(0, limit).map((entry) => entry.word);
}

function buildCard(word, assignment, imageUrl) {
  const choices = [word.definition, ...(word.distractors || [])].slice(0, 4);
  const shuffled = [...choices].sort(() => Math.random() - 0.5);
  const correctIndex = shuffled.findIndex((choice) => choice === word.definition);

  return {
    card_id: crypto.randomUUID(),
    word_id: word.id,
    lemma: word.lemma,
    definition: word.definition,
    usage_examples: Array.isArray(word.usage_examples) ? word.usage_examples.slice(0, 2) : [],
    hint: assignment.settings.hints_enabled ? word.hint : '',
    image_url: assignment.settings.images_enabled && imageUrl ? imageUrl : null,
    choices: shuffled,
    correct_index: correctIndex,
  };
}

function rebuildSessionCards(session, assignment, book, profile, wordCatalogById) {
  session.completed_word_ids = session.completed_word_ids instanceof Set
    ? session.completed_word_ids
    : new Set(Array.isArray(session.completed_word_ids) ? session.completed_word_ids : []);
  session.candidate_word_ids = unique(
    Array.isArray(session.candidate_word_ids) && session.candidate_word_ids.length > 0
      ? session.candidate_word_ids
      : getAssignmentWordIds(assignment, book)
  );

  const remainingEntries = getWordEntriesForIds(
    session.candidate_word_ids.filter((wordId) => !session.completed_word_ids.has(wordId)),
    book,
    wordCatalogById
  );
  const reviewWords = pickReviewWords(profile, remainingEntries, remainingEntries.length);
  const reviewWordIds = new Set(reviewWords.map((word) => word.id));
  const newWords = pickNewWords(
    profile,
    remainingEntries.filter((entry) => !reviewWordIds.has(entry.word?.id)),
    remainingEntries.length
  );
  const selectedWords = unique([...reviewWords, ...newWords].map((word) => word.id))
    .map((wordId) => wordCatalogById[wordId])
    .filter(Boolean);

  session.cards = selectedWords.map((word) => buildCard(
    word,
    assignment,
    word.image_path ? `/${APP_NAME}/api/word-images/${encodeURIComponent(word.id)}` : null
  ));
  session.updated_at = nowIso();
  return session.cards;
}

function buildSessionPayload(session, assignment) {
  return {
    id: session.id,
    assignment_id: session.assignment_id,
    started_at: session.started_at,
    cards: session.cards,
    answered_count: session.completed_word_ids.size,
    total_cards: session.completed_word_ids.size + session.cards.length,
    limits: assignment.settings,
    resumed: session.completed_word_ids.size > 0,
  };
}

function buildImmediateWordSummary(answerEvent) {
  return {
    word_id: answerEvent.word_id,
    attempts: 1,
    wrong_attempts: answerEvent.correct ? 0 : 1,
    hint_used: Boolean(answerEvent.hint_used),
    response_ms_values: [Number(answerEvent.response_ms) || 0],
    final_correct: Boolean(answerEvent.correct),
    average_response_ms: Number(answerEvent.response_ms) || 0,
    assisted: Boolean(answerEvent.hint_used),
  };
}

function summarizeResponses(answerEvents, wordCatalogById) {
  const perWord = new Map();

  for (const event of answerEvents) {
    const existing = perWord.get(event.word_id) || {
      word_id: event.word_id,
      attempts: 0,
      wrong_attempts: 0,
      hint_used: false,
      response_ms_values: [],
      final_correct: false,
    };

    existing.attempts += 1;
    existing.hint_used = existing.hint_used || Boolean(event.hint_used);
    existing.response_ms_values.push(Number(event.response_ms) || 0);
    if (event.correct) {
      existing.final_correct = true;
    } else {
      existing.wrong_attempts += 1;
    }
    perWord.set(event.word_id, existing);
  }

  return [...perWord.values()].map((entry) => ({
    ...entry,
    average_response_ms: Math.round(average(entry.response_ms_values)),
    assisted: entry.hint_used,
    word: wordCatalogById[entry.word_id],
  }));
}

function updateWordProgress(existing, wordSummary) {
  const current = existing || {
    state: 'new',
    stage_index: -1,
    due_at: null,
    total_attempts: 0,
    correct_attempts: 0,
    wrong_attempts: 0,
    hint_uses: 0,
    last_seen_at: null,
  };

  const next = {
    ...current,
    total_attempts: current.total_attempts + wordSummary.attempts,
    correct_attempts: current.correct_attempts + (wordSummary.final_correct ? 1 : 0),
    wrong_attempts: current.wrong_attempts + wordSummary.wrong_attempts,
    hint_uses: current.hint_uses + (wordSummary.assisted ? 1 : 0),
    last_seen_at: nowIso(),
  };

  if (wordSummary.final_correct && !wordSummary.assisted) {
    const nextStage = clamp((current.stage_index ?? -1) + 1, 0, REVIEW_INTERVAL_DAYS.length);
    next.stage_index = nextStage;

    if (nextStage >= REVIEW_INTERVAL_DAYS.length) {
      next.state = 'mastered';
      next.due_at = null;
    } else {
      next.state = nextStage === 0 ? 'learning' : 'review';
      const days = REVIEW_INTERVAL_DAYS[nextStage];
      next.due_at = new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
    }
  } else if (wordSummary.final_correct && wordSummary.assisted) {
    next.state = 'learning';
    next.stage_index = Math.max(current.stage_index ?? -1, 0);
    next.due_at = new Date(Date.now() + (ASSISTED_REVIEW_HOURS * 60 * 60 * 1000)).toISOString();
  } else {
    next.state = 'learning';
    next.stage_index = Math.max((current.stage_index ?? 0) - 1, 0);
    next.due_at = new Date(Date.now() + (WRONG_RETRY_MINUTES * 60 * 1000)).toISOString();
  }

  return next;
}

function updateRollingBand(profile, answerEvents) {
  const adaptiveSettings = normalizeAdaptiveSettings(profile.adaptive_settings);
  const nextAnswers = [...(profile.rolling_answers || []), ...answerEvents.map((event) => ({
    correct: Boolean(event.correct),
    hint_used: Boolean(event.hint_used),
    response_ms: Number(event.response_ms) || 0,
    ts: nowIso(),
  }))].slice(-adaptiveSettings.rolling_band_window);

  const accuracy = average(nextAnswers.map((entry) => entry.correct ? 1 : 0));
  const hintRate = average(nextAnswers.map((entry) => entry.hint_used ? 1 : 0));
  const avgResponseMs = average(nextAnswers.map((entry) => entry.response_ms || 0));
  let targetBand = Number(profile.target_band) || 2;
  const totalAnswers = Number(profile.stats?.total_answers || 0) + answerEvents.length;
  const lastCheckpoint = Number(profile.band_checkpoint_total_answers || 0);
  let bandCheckpointTotalAnswers = lastCheckpoint;

  if (
    nextAnswers.length >= adaptiveSettings.band_adjustment_min_answers
    && (totalAnswers - lastCheckpoint) >= adaptiveSettings.band_adjustment_step
  ) {
    if (accuracy >= 0.85 && hintRate <= 0.2 && avgResponseMs > 0 && avgResponseMs < 4000) {
      targetBand += 1;
    } else if (accuracy < 0.6 || hintRate > 0.4) {
      targetBand -= 1;
    }
    bandCheckpointTotalAnswers = totalAnswers;
  }

  return {
    rolling_answers: nextAnswers,
    target_band: clamp(targetBand, 1, 6),
    band_checkpoint_total_answers: bandCheckpointTotalAnswers,
    stats: {
      total_sessions: Number(profile.stats?.total_sessions || 0),
      total_answers: totalAnswers,
      average_accuracy: Number(accuracy.toFixed(2)),
      hint_rate: Number(hintRate.toFixed(2)),
    },
  };
}

function readStore(paths) {
  return {
    books: readJson(paths.booksPath, []),
    wordCatalog: readJson(paths.wordCatalogPath, []),
    profiles: readJson(paths.profilesPath, {}),
    assignments: readJson(paths.assignmentsPath, []),
    sessions: readJson(paths.sessionsPath, []),
  };
}

function writeStore(paths, store) {
  writeJson(paths.booksPath, store.books);
  writeJson(paths.wordCatalogPath, store.wordCatalog);
  writeJson(paths.profilesPath, store.profiles);
  writeJson(paths.assignmentsPath, store.assignments);
  writeJson(paths.sessionsPath, store.sessions);
}

function makeWordCatalogIndex(wordCatalog) {
  return Object.fromEntries(wordCatalog.map((word) => [word.id, word]));
}

function resolveVocabStorage(dataPath) {
  const booksDir = join(dataPath, 'books');
  const imagesDir = join(dataPath, 'images');
  const booksPath = join(dataPath, 'books.json');
  const wordCatalogPath = join(dataPath, 'word_catalog.json');
  const profilesPath = join(dataPath, 'profiles.json');
  const assignmentsPath = join(dataPath, 'assignments.json');
  const sessionsPath = join(dataPath, 'sessions.json');
  const importJobsPath = join(dataPath, 'import_jobs.json');

  return {
    booksDir,
    imagesDir,
    importJobsPath,
    paths: {
      booksPath,
      wordCatalogPath,
      profilesPath,
      assignmentsPath,
      sessionsPath,
    },
  };
}

function ensureVocabStorage(storage) {
  fs.mkdirSync(storage.booksDir, { recursive: true });
  fs.mkdirSync(storage.imagesDir, { recursive: true });
  ensureJsonFile(storage.paths.booksPath, []);
  ensureJsonFile(storage.paths.wordCatalogPath, []);
  ensureJsonFile(storage.paths.profilesPath, {});
  ensureJsonFile(storage.paths.assignmentsPath, []);
  ensureJsonFile(storage.paths.sessionsPath, []);
  ensureJsonFile(storage.importJobsPath, []);
}

export async function reprocessVocabBookPools({
  dataPath,
  bookId = null,
  limit = null,
}) {
  const storage = resolveVocabStorage(dataPath);
  ensureVocabStorage(storage);

  const store = readStore(storage.paths);
  const targetBooks = store.books
    .filter((book) => !bookId || book.id === bookId)
    .filter((book) => book.text_path && fs.existsSync(book.text_path))
    .slice(0, limit || store.books.length);
  const results = [];

  for (const book of targetBooks) {
    const sourceText = sanitizeText(fs.readFileSync(book.text_path, 'utf-8'));
    const maxWordCount = clamp(
      Number(book.settings?.max_word_count) || DEFAULT_BOOK_WORD_POOL_SIZE,
      MIN_BOOK_WORD_POOL_SIZE,
      MAX_BOOK_WORD_POOL_SIZE
    );

    removeBookFromWordCatalog(store.wordCatalog, book.id);
    const { wordIds, wordPool } = await buildWordPoolForText({
      store,
      bookId: book.id,
      bookTitle: book.title,
      combinedText: sourceText,
      maxWordCount,
      generateImages: Boolean(book.settings?.generate_images),
      imagesDir: storage.imagesDir,
    });

    book.word_ids = wordIds;
    book.word_pool_ids = wordIds;
    book.word_pool = wordPool;
    book.settings = {
      ...(book.settings || {}),
      max_word_count: maxWordCount,
    };
    book.updated_at = nowIso();

    results.push({
      book_id: book.id,
      title: book.title,
      word_pool_count: wordIds.length,
    });
  }

  writeStore(storage.paths, store);
  return results;
}

export function setupVocabApiRoutes(app, appName, dataPath) {
  if (appName !== APP_NAME) {
    return;
  }

  const storage = resolveVocabStorage(dataPath);
  ensureVocabStorage(storage);
  const {
    booksDir,
    imagesDir,
    importJobsPath,
    paths,
  } = storage;

  const clerkEnabled = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);
  const adminEmails = normalizeEmailList(process.env.VOCAB_ADMIN_EMAILS);
  const childEmails = normalizeEmailList(process.env.VOCAB_CHILD_EMAILS);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: 80,
      fileSize: 25 * 1024 * 1024,
    },
  });

  if (clerkEnabled) {
    app.use(`/${appName}/api`, clerkMiddleware({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    }));
  }

  let importQueue = Promise.resolve();

  function enqueueImportJob(task) {
    importQueue = importQueue
      .catch(() => {})
      .then(task);
    return importQueue;
  }

  async function runImportJob(jobId, payload) {
    const {
      title,
      author,
      language,
      importedText,
      ocrImageEntries,
      generateImages,
      maxWordCount,
      createdBy,
    } = payload;

    const startedAt = Date.now();

    try {
      updateImportJob(importJobsPath, jobId, (job) => ({
        ...job,
        status: 'processing',
        step: ocrImageEntries.length > 0 ? 'ocr' : 'vocabulary',
        message: ocrImageEntries.length > 0
          ? `Transcribing ${ocrImageEntries.length} page images.`
          : 'Preparing target vocabulary.',
        started_at: job.started_at || nowIso(),
      }));

      let ocrText = '';
      if (ocrImageEntries.length > 0) {
        const transcribed = [];
        console.log(`[vocab] Starting OCR import for "${title}" with ${ocrImageEntries.length} page images.`);

        for (let index = 0; index < ocrImageEntries.length; index += 1) {
          const image = ocrImageEntries[index];
          const pageNumber = index + 1;

          updateImportJob(importJobsPath, jobId, (job) => ({
            ...job,
            status: 'processing',
            step: 'ocr',
            message: `Transcribing page ${pageNumber} of ${ocrImageEntries.length}.`,
            page_total: ocrImageEntries.length,
            page_completed: index,
          }));

          transcribed.push(await transcribeImage(image.dataUrl));

          updateImportJob(importJobsPath, jobId, (job) => ({
            ...job,
            page_total: ocrImageEntries.length,
            page_completed: pageNumber,
          }));
        }

        ocrText = transcribed.join('\n\n');
      }

      const combinedText = sanitizeText([importedText, ocrText].filter(Boolean).join('\n\n'));
      if (!combinedText) {
        throw new Error('OCR completed but no usable text was extracted.');
      }

      const store = readStore(paths);
      const createdAt = nowIso();
      const bookId = `book_${slugify(title)}_${crypto.randomUUID().slice(0, 8)}`;
      ensureBookAssetDirectories(booksDir, bookId);
      const pageImages = saveOcrPageImages(bookId, ocrImageEntries, booksDir);
      const sourceFileName = `${bookId}.txt`;
      fs.writeFileSync(join(booksDir, sourceFileName), combinedText, 'utf-8');
      const { wordIds, wordPool } = await buildWordPoolForText({
        store,
        bookId,
        bookTitle: title,
        combinedText,
        maxWordCount,
        generateImages,
        imagesDir,
        onProgress: ({ message, wordTotal, wordCompleted }) => {
          updateImportJob(importJobsPath, jobId, (job) => ({
            ...job,
            status: 'processing',
            step: 'vocabulary',
            message,
            word_total: wordTotal,
            word_completed: wordCompleted,
          }));
        },
      });

      const book = {
        id: bookId,
        title,
        author,
        language,
        status: 'draft',
        text_path: join(booksDir, sourceFileName),
        word_ids: wordIds,
        word_pool_ids: wordIds,
        word_pool: wordPool,
        word_count: combinedText.split(/\s+/).filter(Boolean).length,
        page_images: pageImages,
        artifacts: [],
        created_by: createdBy,
        created_at: createdAt,
        updated_at: createdAt,
        settings: {
          generate_images: generateImages,
          max_word_count: maxWordCount,
        },
      };

      store.books.unshift(book);
      writeStore(paths, store);

      console.log(
        `[vocab] Imported "${title}" with ${pageImages.length} page images and ${wordIds.length} pool words.`
      );

      updateImportJob(importJobsPath, jobId, (job) => ({
        ...job,
        status: 'completed',
        step: 'complete',
        message: `Imported "${title}" with ${wordIds.length} pool words.`,
        finished_at: nowIso(),
        duration_ms: Date.now() - startedAt,
        book_id: bookId,
        imported_word_count: wordIds.length,
        imported_page_image_count: pageImages.length,
        page_total: pageImages.length,
        page_completed: pageImages.length,
        word_total: wordIds.length,
        word_completed: wordIds.length,
      }));
    } catch (error) {
      console.error('[vocab] Book import failed', {
        title,
        jobId,
        error: error?.stack || error?.message || error,
      });

      updateImportJob(importJobsPath, jobId, (job) => ({
        ...job,
        status: 'failed',
        step: 'failed',
        message: error?.message || 'Book import failed on the server.',
        error: error?.message || 'Book import failed on the server.',
        finished_at: nowIso(),
        duration_ms: Date.now() - startedAt,
      }));
    }
  }

  async function requireSignedIn(req, res, next) {
    if (!clerkEnabled) {
      sendAuthConfigError(res);
      return;
    }

    const requester = await resolveRequester(req, adminEmails, childEmails);
    if (!requester) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    if (requester.role === 'blocked') {
      res.status(403).json({
        error: 'forbidden',
        message: 'Signed in, but this email is not allowed for vocab access.',
      });
      return;
    }

    req.vocabUser = requester;
    next();
  }

  async function requireAdmin(req, res, next) {
    await requireSignedIn(req, res, () => {
      if (req.vocabUser?.role !== 'admin') {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      next();
    });
  }

  async function requireChild(req, res, next) {
    await requireSignedIn(req, res, () => {
      if (req.vocabUser?.role !== 'child') {
        res.status(403).json({ error: 'child_only' });
        return;
      }
      next();
    });
  }

  app.get(`/${appName}/api/me`, requireSignedIn, (req, res) => {
    const store = readStore(paths);

    if (req.vocabUser.role === 'child') {
      const profile = ensureChildProfile(store.profiles, req.vocabUser);
      writeJson(paths.profilesPath, store.profiles);
      res.json({
        user: req.vocabUser,
        profile: {
          ...profile,
          ...computeProfileBuckets(profile),
        },
      });
      return;
    }

    res.json({ user: req.vocabUser });
  });

  app.get(`/${appName}/api/admin/books`, requireAdmin, (_req, res) => {
    const store = readStore(paths);
    const wordCatalogById = makeWordCatalogIndex(store.wordCatalog);

    res.json({
      books: store.books.map((book) => ({
        ...book,
        word_ids: getBookWordIds(book),
        word_pool_ids: getBookWordIds(book),
        page_images: book.page_images || [],
        artifacts: (book.artifacts || []).map((artifact) => ({
          ...artifact,
          asset_url: createArtifactAssetUrl(appName, book.id, artifact.id),
        })),
        words: getBookWordIds(book).map((wordId) => wordCatalogById[wordId]).filter(Boolean),
      })),
      word_catalog: store.wordCatalog,
      import_jobs: sortImportJobs(readJson(importJobsPath, [])).slice(0, 12),
    });
  });

  app.get(`/${appName}/api/admin/import-jobs/:jobId`, requireAdmin, (req, res) => {
    const importJobs = readJson(importJobsPath, []);
    const job = importJobs.find((item) => item.id === req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'import_job_not_found' });
      return;
    }

    res.json({ job });
  });

  app.post(
    `/${appName}/api/admin/books/import`,
    requireAdmin,
    upload.fields([
      { name: 'ocr_files', maxCount: 60 },
      { name: 'text_file', maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const title = String(req.body?.title || '').trim();
        const author = String(req.body?.author || '').trim();
        const language = String(req.body?.language || 'en').trim().toLowerCase() || 'en';
        const manualText = sanitizeText(req.body?.text || '');
        const textFile = getUploadedFiles(req, 'text_file')[0] || null;
        const ocrFiles = sortFilesByName(getUploadedFiles(req, 'ocr_files'), 'originalname');
        const uploadedSource = await extractUploadedSourceText(textFile);
        const legacyOcrImages = Array.isArray(req.body?.ocr_images)
          ? req.body.ocr_images.filter(Boolean)
          : (typeof req.body?.ocr_images === 'string' && req.body.ocr_images ? [req.body.ocr_images] : []);
        const uploadedOcrEntries = ocrFiles.length > 0
          ? ocrFiles
              .map((file) => {
                const dataUrl = fileBufferToDataUrl(file);
                return dataUrl
                  ? { dataUrl, originalName: file.originalname || '' }
                  : null;
              })
              .filter(Boolean)
          : legacyOcrImages.map((dataUrl) => ({ dataUrl, originalName: '' }));
        const ocrImageEntries = sortFilesByName([
          ...uploadedOcrEntries,
          ...uploadedSource.ocrImageEntries,
        ], 'originalName');
        const importedText = manualText || uploadedSource.text;
        const generateImages = parseBooleanField(req.body?.generate_images);
        const maxWordCount = clamp(
          Number(req.body?.max_word_count) || DEFAULT_BOOK_WORD_POOL_SIZE,
          MIN_BOOK_WORD_POOL_SIZE,
          MAX_BOOK_WORD_POOL_SIZE
        );

        if (!title) {
          res.status(400).json({ error: 'title_required', message: 'Title is required.' });
          return;
        }

        if (!importedText && ocrImageEntries.length === 0) {
          res.status(400).json({
            error: 'text_or_images_required',
            message: 'Add pasted text, a text file, a PDF, or page images.',
          });
          return;
        }

        const createdAt = nowIso();
        const job = upsertImportJob(importJobsPath, {
          id: `import_${slugify(title)}_${crypto.randomUUID().slice(0, 8)}`,
          title,
          author,
          language,
          status: 'queued',
          step: 'queued',
          message: 'Import queued.',
          page_total: ocrImageEntries.length,
          page_completed: 0,
          word_total: 0,
          word_completed: 0,
          generate_images: generateImages,
          max_word_count: maxWordCount,
          created_by: req.vocabUser.user_id,
          created_at: createdAt,
          updated_at: createdAt,
        });

        enqueueImportJob(() => runImportJob(job.id, {
          title,
          author,
          language,
          importedText,
          ocrImageEntries,
          generateImages,
          maxWordCount,
          createdBy: req.vocabUser.user_id,
        }));

        res.status(202).json({ job });
      } catch (error) {
        console.error('[vocab] Book import failed', {
          title: req.body?.title || '',
          error: error?.stack || error?.message || error,
        });
        res.status(500).json({
          error: 'book_import_failed',
          message: error?.message || 'Book import failed on the server.',
        });
      }
    }
  );

  app.post(`/${appName}/api/admin/books/:bookId/publish`, requireAdmin, (req, res) => {
    const store = readStore(paths);
    const book = store.books.find((item) => item.id === req.params.bookId);
    if (!book) {
      res.status(404).json({ error: 'book_not_found' });
      return;
    }

    book.status = 'published';
    book.updated_at = nowIso();
    writeJson(paths.booksPath, store.books);
    res.json({ book });
  });

  app.get(`/${appName}/api/admin/children`, requireAdmin, async (_req, res) => {
    const store = readStore(paths);
    const children = await listChildUsers(adminEmails, childEmails);

    for (const child of children) {
      ensureChildProfile(store.profiles, child);
    }
    writeJson(paths.profilesPath, store.profiles);

    res.json({
      children: children.map((child) => {
        const profile = store.profiles[child.user_id];
        const activeAssignments = store.assignments.filter((assignment) => assignment.child_user_id === child.user_id && assignment.status === 'active');
        return {
          ...child,
          profile: {
            ...profile,
            ...computeProfileBuckets(profile),
          },
          assignments: activeAssignments.map((assignment) => {
            const book = store.books.find((item) => item.id === assignment.book_id);
            return {
              ...assignment,
              book: book ? {
                id: book.id,
                title: book.title,
                author: book.author,
                status: book.status,
              } : null,
              progress: summarizeChildProgress(profile, assignment, book),
            };
          }),
        };
      }),
    });
  });

  app.post(`/${appName}/api/admin/assignments`, requireAdmin, (req, res) => {
    const store = readStore(paths);
    const book = store.books.find((item) => item.id === req.body?.book_id);
    const childUserId = String(req.body?.child_user_id || '');
    if (!book) {
      res.status(404).json({ error: 'book_not_found' });
      return;
    }

    if (!childUserId) {
      res.status(400).json({ error: 'child_user_id_required' });
      return;
    }

    const assignment = {
      id: `assignment_${crypto.randomUUID()}`,
      book_id: book.id,
      child_user_id: childUserId,
      target_word_ids: [...getBookWordIds(book)],
      status: 'active',
      settings: normalizeAssignmentSettings(req.body?.settings),
      created_by: req.vocabUser.user_id,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    store.assignments.unshift(assignment);
    writeJson(paths.assignmentsPath, store.assignments);
    res.json({ assignment });
  });

  app.patch(`/${appName}/api/admin/assignments/:assignmentId`, requireAdmin, (req, res) => {
    const store = readStore(paths);
    const assignment = store.assignments.find((item) => item.id === req.params.assignmentId);
    if (!assignment) {
      res.status(404).json({ error: 'assignment_not_found' });
      return;
    }

    assignment.settings = normalizeAssignmentSettings({
      ...(assignment.settings || {}),
      ...(req.body?.settings || {}),
    });
    assignment.updated_at = nowIso();

    writeJson(paths.assignmentsPath, store.assignments);
    res.json({ assignment });
  });

  app.patch(`/${appName}/api/admin/children/:childUserId/profile`, requireAdmin, (req, res) => {
    const store = readStore(paths);
    const childUserId = String(req.params.childUserId || '');
    const profile = store.profiles[childUserId];
    if (!profile) {
      res.status(404).json({ error: 'child_profile_not_found' });
      return;
    }

    profile.adaptive_settings = normalizeAdaptiveSettings({
      ...(profile.adaptive_settings || {}),
      ...(req.body?.adaptive_settings || {}),
    });
    const requestedBand = req.body?.target_band;
    if (requestedBand !== undefined && requestedBand !== null) {
      const band = Math.round(Number(requestedBand));
      if (band >= 1 && band <= 6) {
        profile.target_band = band;
      }
    }
    profile.updated_at = nowIso();

    store.profiles[childUserId] = profile;
    writeJson(paths.profilesPath, store.profiles);
    res.json({
      profile: {
        ...profile,
        ...computeProfileBuckets(profile),
      },
    });
  });

  app.get(`/${appName}/api/assignments/current`, requireChild, (req, res) => {
    const store = readStore(paths);
    const profile = ensureChildProfile(store.profiles, req.vocabUser);
    writeJson(paths.profilesPath, store.profiles);

    const assignments = store.assignments
      .filter((assignment) => assignment.child_user_id === req.vocabUser.user_id && assignment.status === 'active')
      .map((assignment) => {
        const book = store.books.find((item) => item.id === assignment.book_id);
        return {
          ...assignment,
          book: book ? {
            id: book.id,
            title: book.title,
            author: book.author,
            language: book.language,
            status: book.status,
          } : null,
          progress: summarizeChildProgress(profile, assignment, book),
        };
      })
      .filter((assignment) => assignment.book?.status === 'published');

    res.json({
      assignments,
      profile: {
        ...profile,
        ...computeProfileBuckets(profile),
      },
    });
  });

  app.post(`/${appName}/api/sessions/start`, requireChild, (req, res) => {
    const assignmentId = String(req.body?.assignment_id || '');
    const store = readStore(paths);
    const assignment = store.assignments.find((item) => item.id === assignmentId && item.child_user_id === req.vocabUser.user_id && item.status === 'active');
    if (!assignment) {
      res.status(404).json({ error: 'assignment_not_found' });
      return;
    }

    const book = store.books.find((item) => item.id === assignment.book_id);
    if (!book || book.status !== 'published') {
      res.status(404).json({ error: 'book_not_available' });
      return;
    }

    const profile = ensureChildProfile(store.profiles, req.vocabUser);
    writeJson(paths.profilesPath, store.profiles);
    const wordCatalogById = makeWordCatalogIndex(store.wordCatalog);

    const matchingSessions = getMatchingActiveSessions(req.vocabUser.user_id, assignment.id);
    if (matchingSessions.length > 0) {
      const [activeSession, ...staleSessions] = matchingSessions;
      for (const staleSession of staleSessions) {
        activeSessions.delete(staleSession.id);
      }

      rebuildSessionCards(activeSession, assignment, book, profile, wordCatalogById);
      if (activeSession.cards.length > 0) {
        res.json({
          session: buildSessionPayload(activeSession, assignment),
        });
        return;
      }

      activeSessions.delete(activeSession.id);
    }

    const sessionId = `session_${crypto.randomUUID()}`;
    const session = {
      id: sessionId,
      assignment_id: assignment.id,
      child_user_id: req.vocabUser.user_id,
      book_id: assignment.book_id,
      started_at: nowIso(),
      updated_at: nowIso(),
      candidate_word_ids: getAssignmentWordIds(assignment, book),
      cards: [],
      answers: [],
      completed_word_ids: new Set(),
    };
    rebuildSessionCards(session, assignment, book, profile, wordCatalogById);

    if (session.cards.length === 0) {
      res.status(409).json({ error: 'no_words_ready' });
      return;
    }

    activeSessions.set(sessionId, session);

    res.json({
      session: buildSessionPayload(session, assignment),
    });
  });

  app.post(`/${appName}/api/sessions/:sessionId/answer`, requireChild, (req, res) => {
    const session = activeSessions.get(req.params.sessionId);
    if (!session || session.child_user_id !== req.vocabUser.user_id) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    const wordId = String(req.body?.word_id || '');
    const selectedIndex = Number(req.body?.selected_index);
    const responseMs = clamp(Number(req.body?.response_ms) || 0, 0, 120000);
    const hintUsed = Boolean(req.body?.hint_used);
    const card = session.cards.find((item) => item.word_id === wordId);

    if (!card) {
      res.status(400).json({ error: 'card_not_found' });
      return;
    }

    if (session.completed_word_ids.has(wordId)) {
      res.status(409).json({ error: 'card_already_answered' });
      return;
    }

    const event = {
      word_id: wordId,
      selected_index: selectedIndex,
      correct: selectedIndex === card.correct_index,
      hint_used: hintUsed,
      response_ms: responseMs,
      correct_choice: card.choices[card.correct_index],
      ts: nowIso(),
    };

    session.answers.push(event);
    session.completed_word_ids.add(wordId);
    session.updated_at = nowIso();

    const store = readStore(paths);
    const profile = ensureChildProfile(store.profiles, req.vocabUser);
    const wordSummary = buildImmediateWordSummary(event);
    profile.word_progress[wordId] = updateWordProgress(profile.word_progress[wordId], wordSummary);

    const rollingUpdate = updateRollingBand(profile, [event]);
    profile.rolling_answers = rollingUpdate.rolling_answers;
    profile.target_band = rollingUpdate.target_band;
    profile.band_checkpoint_total_answers = rollingUpdate.band_checkpoint_total_answers;
    profile.stats = {
      ...profile.stats,
      ...rollingUpdate.stats,
      total_sessions: Number(profile.stats?.total_sessions || 0),
    };
    profile.updated_at = nowIso();

    store.profiles[req.vocabUser.user_id] = profile;
    writeJson(paths.profilesPath, store.profiles);

    const assignment = store.assignments.find((item) => item.id === session.assignment_id && item.child_user_id === req.vocabUser.user_id && item.status === 'active');
    const book = store.books.find((item) => item.id === session.book_id);
    const wordCatalogById = makeWordCatalogIndex(store.wordCatalog);

    if (assignment && book) {
      rebuildSessionCards(session, assignment, book, profile, wordCatalogById);
    } else {
      session.cards = getRemainingSessionCards(session);
    }

    res.json({
      answer: event,
      session: assignment ? buildSessionPayload(session, assignment) : null,
      profile: {
        ...profile,
        ...computeProfileBuckets(profile),
      },
    });
  });

  app.post(`/${appName}/api/sessions/:sessionId/complete`, requireChild, (req, res) => {
    const session = activeSessions.get(req.params.sessionId);
    if (!session || session.child_user_id !== req.vocabUser.user_id) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    const store = readStore(paths);
    const profile = ensureChildProfile(store.profiles, req.vocabUser);
    const wordCatalogById = makeWordCatalogIndex(store.wordCatalog);
    const wordSummaries = summarizeResponses(session.answers, wordCatalogById);

    const sessionSummary = {
      id: session.id,
      assignment_id: session.assignment_id,
      child_user_id: session.child_user_id,
      book_id: session.book_id,
      started_at: session.started_at,
      completed_at: nowIso(),
      answers: session.answers,
      words: wordSummaries.map((summary) => ({
        word_id: summary.word_id,
        lemma: summary.word?.lemma || '',
        final_correct: summary.final_correct,
        attempts: summary.attempts,
        hint_used: summary.hint_used,
        average_response_ms: summary.average_response_ms,
      })),
      accuracy: Number(average(session.answers.map((item) => item.correct ? 1 : 0)).toFixed(2)),
      status: 'completed',
    };

    profile.stats = {
      ...profile.stats,
      total_sessions: Number(profile.stats?.total_sessions || 0) + (session.answers.length > 0 ? 1 : 0),
    };
    profile.updated_at = nowIso();

    store.profiles[req.vocabUser.user_id] = profile;
    store.sessions.unshift(sessionSummary);
    writeStore(paths, store);
    activeSessions.delete(session.id);

    res.json({
      session: sessionSummary,
      profile: {
        ...profile,
        ...computeProfileBuckets(profile),
      },
    });
  });

  app.get(`/${appName}/api/word-images/:wordId`, requireSignedIn, (req, res) => {
    const wordCatalog = readJson(paths.wordCatalogPath, []);
    const word = wordCatalog.find((item) => item.id === req.params.wordId);
    if (!word?.image_path || !fs.existsSync(word.image_path)) {
      res.status(404).json({ error: 'image_not_found' });
      return;
    }

    res.sendFile(word.image_path);
  });

  app.get(`/${appName}/api/admin/books/:bookId/artifacts/:artifactId`, requireAdmin, (req, res) => {
    const books = readJson(paths.booksPath, []);
    const book = books.find((item) => item.id === req.params.bookId);
    const artifact = book?.artifacts?.find((item) => item.id === req.params.artifactId);

    if (!artifact?.image_path || !fs.existsSync(artifact.image_path)) {
      res.status(404).json({ error: 'artifact_not_found' });
      return;
    }

    res.sendFile(artifact.image_path);
  });
}
