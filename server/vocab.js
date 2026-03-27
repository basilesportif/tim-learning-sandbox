import crypto from 'crypto';
import fs from 'fs';
import { join } from 'path';
import { clerkMiddleware, createClerkClient, getAuth } from '@clerk/express';
import multer from 'multer';
import OpenAI from 'openai';

const APP_NAME = 'vocab';
const DEFAULT_MAX_NEW_WORDS = 8;
const DEFAULT_MAX_REVIEW_WORDS = 12;
const DEFAULT_SESSION_MINUTES = 7;
const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 28];
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

function extractCandidateWords(text, limit = 24) {
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

function fallbackWordMetadata(candidate) {
  const difficultyBand = heuristicDifficultyBand(candidate.lemma, candidate.count);
  const shortSnippet = candidate.snippets[0] || '';

  return {
    difficultyBand,
    definition: `A word worth reviewing before reading the book. Use the sentence context to confirm its meaning.`,
    hint: shortSnippet ? `Look at the sentence: "${shortSnippet}"` : 'Think about how the word might be used in the story.',
    distractors: [
      'A random object with no connection to the story',
      'A feeling that does not fit the sentence',
      'An action that is clearly unrelated',
    ],
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

function getUploadedFiles(req, fieldName) {
  if (!req.files || typeof req.files !== 'object') {
    return [];
  }
  return Array.isArray(req.files[fieldName]) ? req.files[fieldName] : [];
}

async function enrichWordMetadataWithAI(candidate, bookTitle) {
  const client = getOpenAIClient();
  if (!client) {
    return fallbackWordMetadata(candidate);
  }

  const prompt = [
    'You are preparing vocabulary practice for children.',
    'Return JSON with keys: difficultyBand, definition, hint, distractors, imagePrompt, needsReview.',
    'difficultyBand must be an integer from 1 to 6.',
    'definition must be short, concrete, and child-friendly.',
    'hint must guide the child without giving away the answer.',
    'distractors must be an array of exactly 3 plausible but wrong meanings.',
    'needsReview must be true if the meaning is ambiguous or the word is hard to teach with one definition.',
    `Book title: ${bookTitle}`,
    `Word: ${candidate.lemma}`,
    `Context snippets: ${candidate.snippets.join(' | ')}`,
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
    if (!parsed) {
      return fallbackWordMetadata(candidate);
    }

    return {
      difficultyBand: clamp(Number(parsed.difficultyBand) || heuristicDifficultyBand(candidate.lemma, candidate.count), 1, 6),
      definition: String(parsed.definition || '').trim() || fallbackWordMetadata(candidate).definition,
      hint: String(parsed.hint || '').trim() || fallbackWordMetadata(candidate).hint,
      distractors: normalizeChoiceSet(parsed.definition, Array.isArray(parsed.distractors) ? parsed.distractors : []).slice(1, 4),
      imagePrompt: String(parsed.imagePrompt || '').trim() || fallbackWordMetadata(candidate).imagePrompt,
      needsReview: Boolean(parsed.needsReview),
    };
  } catch {
    return fallbackWordMetadata(candidate);
  }
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

  return {
    id: `word_${slugify(candidate.lemma)}`,
    lemma: candidate.lemma,
    language: 'en',
    source_books: [bookId],
    count_in_book: candidate.count,
    snippets: candidate.snippets,
    difficulty_band: clamp(Number(metadata.difficultyBand) || heuristicDifficultyBand(candidate.lemma, candidate.count), 1, 6),
    definition: metadata.definition,
    hint: metadata.hint,
    distractors: definitionChoices.filter((choice) => choice !== metadata.definition).slice(0, 3),
    image_prompt: metadata.imagePrompt,
    image_path: generatedImageFile ? join(imagesDir, generatedImageFile) : null,
    needs_review: Boolean(metadata.needsReview),
    created_at: createdAt,
    updated_at: createdAt,
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

function defaultProfile(user) {
  const createdAt = nowIso();
  return {
    user_id: user.user_id,
    email: user.email,
    display_name: user.display_name,
    target_band: 2,
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
    updated_at: nowIso(),
  };
  profiles[user.user_id] = nextProfile;
  return nextProfile;
}

function summarizeChildProgress(profile, assignment) {
  const progressEntries = assignment.target_word_ids.map((wordId) => profile.word_progress?.[wordId]).filter(Boolean);
  const mastered = progressEntries.filter((entry) => entry.state === 'mastered').length;
  const due = progressEntries.filter((entry) => entry.due_at && new Date(entry.due_at).getTime() <= Date.now()).length;
  const learning = progressEntries.filter((entry) => entry.state !== 'mastered').length;

  return {
    mastered_count: mastered,
    due_count: due,
    learning_count: learning,
    total_target_words: assignment.target_word_ids.length,
  };
}

function pickReviewWords(profile, wordCatalogById, candidateWordIds, limit) {
  return candidateWordIds
    .map((wordId) => ({
      word: wordCatalogById[wordId],
      progress: profile.word_progress?.[wordId],
    }))
    .filter((entry) => entry.word && entry.progress?.due_at && new Date(entry.progress.due_at).getTime() <= Date.now())
    .sort((a, b) => new Date(a.progress.due_at).getTime() - new Date(b.progress.due_at).getTime())
    .slice(0, limit)
    .map((entry) => entry.word);
}

function pickNewWords(profile, wordCatalogById, candidateWordIds, limit) {
  const targetBand = Number(profile.target_band) || 2;

  const candidates = candidateWordIds
    .map((wordId) => wordCatalogById[wordId])
    .filter(Boolean)
    .filter((word) => {
      const progress = profile.word_progress?.[word.id];
      return !progress || progress.state !== 'mastered';
    })
    .filter((word) => {
      const progress = profile.word_progress?.[word.id];
      return !progress || !progress.due_at;
    })
    .sort((a, b) => {
      const distanceA = Math.abs((a.difficulty_band || 1) - targetBand);
      const distanceB = Math.abs((b.difficulty_band || 1) - targetBand);
      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }
      return (a.lemma || '').localeCompare(b.lemma || '');
    });

  return candidates.slice(0, limit);
}

function buildCard(word, assignment, imageUrl) {
  const choices = [word.definition, ...(word.distractors || [])].slice(0, 4);
  const shuffled = [...choices].sort(() => Math.random() - 0.5);
  const correctIndex = shuffled.findIndex((choice) => choice === word.definition);

  return {
    card_id: crypto.randomUUID(),
    word_id: word.id,
    lemma: word.lemma,
    hint: assignment.settings.hints_enabled ? word.hint : '',
    image_url: assignment.settings.images_enabled && imageUrl ? imageUrl : null,
    choices: shuffled,
    correct_index: correctIndex,
  };
}

function summarizeResponses(answerEvents, cardsByWordId) {
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
    card: cardsByWordId[entry.word_id],
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
    next.due_at = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();
  } else {
    next.state = 'learning';
    next.stage_index = Math.max((current.stage_index ?? 0) - 1, 0);
    next.due_at = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();
  }

  return next;
}

function updateRollingBand(profile, answerEvents) {
  const nextAnswers = [...(profile.rolling_answers || []), ...answerEvents.map((event) => ({
    correct: Boolean(event.correct),
    hint_used: Boolean(event.hint_used),
    response_ms: Number(event.response_ms) || 0,
    ts: nowIso(),
  }))].slice(-20);

  const accuracy = average(nextAnswers.map((entry) => entry.correct ? 1 : 0));
  const hintRate = average(nextAnswers.map((entry) => entry.hint_used ? 1 : 0));
  const avgResponseMs = average(nextAnswers.map((entry) => entry.response_ms || 0));
  let targetBand = Number(profile.target_band) || 2;

  if (nextAnswers.length >= 20) {
    if (accuracy >= 0.85 && avgResponseMs > 0 && avgResponseMs < 4000) {
      targetBand += 1;
    } else if (accuracy < 0.6 || hintRate > 0.4) {
      targetBand -= 1;
    }
  }

  return {
    rolling_answers: nextAnswers,
    target_band: clamp(targetBand, 1, 6),
    stats: {
      total_sessions: Number(profile.stats?.total_sessions || 0),
      total_answers: Number(profile.stats?.total_answers || 0) + answerEvents.length,
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

export function setupVocabApiRoutes(app, appName, dataPath) {
  if (appName !== APP_NAME) {
    return;
  }

  const booksDir = join(dataPath, 'books');
  const imagesDir = join(dataPath, 'images');
  const booksPath = join(dataPath, 'books.json');
  const wordCatalogPath = join(dataPath, 'word_catalog.json');
  const profilesPath = join(dataPath, 'profiles.json');
  const assignmentsPath = join(dataPath, 'assignments.json');
  const sessionsPath = join(dataPath, 'sessions.json');
  const paths = {
    booksPath,
    wordCatalogPath,
    profilesPath,
    assignmentsPath,
    sessionsPath,
  };

  fs.mkdirSync(booksDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });
  ensureJsonFile(booksPath, []);
  ensureJsonFile(wordCatalogPath, []);
  ensureJsonFile(profilesPath, {});
  ensureJsonFile(assignmentsPath, []);
  ensureJsonFile(sessionsPath, []);

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
      writeJson(profilesPath, store.profiles);
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
        page_images: book.page_images || [],
        artifacts: (book.artifacts || []).map((artifact) => ({
          ...artifact,
          asset_url: createArtifactAssetUrl(appName, book.id, artifact.id),
        })),
        words: book.word_ids.map((wordId) => wordCatalogById[wordId]).filter(Boolean),
      })),
      word_catalog: store.wordCatalog,
    });
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
        const legacyOcrImages = Array.isArray(req.body?.ocr_images)
          ? req.body.ocr_images.filter(Boolean)
          : (typeof req.body?.ocr_images === 'string' && req.body.ocr_images ? [req.body.ocr_images] : []);
        const ocrImageEntries = ocrFiles.length > 0
          ? ocrFiles
              .map((file) => {
                const dataUrl = fileBufferToDataUrl(file);
                return dataUrl
                  ? { dataUrl, originalName: file.originalname || '' }
                  : null;
              })
              .filter(Boolean)
          : legacyOcrImages.map((dataUrl) => ({ dataUrl, originalName: '' }));
        const textFileText = textFile ? sanitizeText(textFile.buffer?.toString('utf-8') || '') : '';
        const importedText = manualText || textFileText;
        const generateImages = parseBooleanField(req.body?.generate_images);
        const maxWordCount = clamp(Number(req.body?.max_word_count) || 24, 8, 60);

        if (!title) {
          res.status(400).json({ error: 'title_required', message: 'Title is required.' });
          return;
        }

        let ocrText = '';
        if (!importedText && ocrImageEntries.length === 0) {
          res.status(400).json({
            error: 'text_or_images_required',
            message: 'Add pasted text, a text file, or page images.',
          });
          return;
        }

        if (ocrImageEntries.length > 0) {
          const transcribed = [];
          console.log(`[vocab] Starting OCR import for "${title}" with ${ocrImageEntries.length} page images.`);
          for (const image of ocrImageEntries) {
            transcribed.push(await transcribeImage(image.dataUrl));
          }
          ocrText = transcribed.join('\n\n');
        }

        const combinedText = sanitizeText([importedText, ocrText].filter(Boolean).join('\n\n'));
        if (!combinedText) {
          res.status(400).json({
            error: 'empty_book_text',
            message: 'OCR completed but no usable text was extracted.',
          });
          return;
        }

        const store = readStore(paths);
        const createdAt = nowIso();
        const bookId = `book_${slugify(title)}_${crypto.randomUUID().slice(0, 8)}`;
        ensureBookAssetDirectories(booksDir, bookId);
        const pageImages = saveOcrPageImages(bookId, ocrImageEntries, booksDir);
        const sourceFileName = `${bookId}.txt`;
        fs.writeFileSync(join(booksDir, sourceFileName), combinedText, 'utf-8');

        const candidates = extractCandidateWords(combinedText, maxWordCount);
        const wordCatalogById = makeWordCatalogIndex(store.wordCatalog);
        const wordIds = [];

        for (const candidate of candidates) {
          const existing = wordCatalogById[`word_${slugify(candidate.lemma)}`];
          let generatedImageFile = null;
          let wordRecord = existing;

          if (!wordRecord) {
            const metadata = await enrichWordMetadataWithAI(candidate, title);
            if (generateImages) {
              generatedImageFile = await maybeGenerateWordImage(metadata.imagePrompt, `word_${slugify(candidate.lemma)}`, imagesDir);
            }
            wordRecord = shapeWordRecord(candidate, metadata, bookId, imagesDir, generatedImageFile);
            store.wordCatalog.push(wordRecord);
          } else {
            wordRecord.source_books = unique([...(wordRecord.source_books || []), bookId]);
            wordRecord.count_in_book = Math.max(Number(wordRecord.count_in_book) || 0, candidate.count);
            wordRecord.snippets = unique([...(wordRecord.snippets || []), ...candidate.snippets]).slice(0, 4);
            wordRecord.updated_at = createdAt;
          }

          wordIds.push(wordRecord.id);
        }

        const book = {
          id: bookId,
          title,
          author,
          language,
          status: 'draft',
          text_path: join(booksDir, sourceFileName),
          word_ids: wordIds,
          word_count: combinedText.split(/\s+/).filter(Boolean).length,
          page_images: pageImages,
          artifacts: [],
          created_by: req.vocabUser.user_id,
          created_at: createdAt,
          updated_at: createdAt,
          settings: {
            generate_images: generateImages,
          },
        };

        store.books.unshift(book);
        writeStore(paths, store);

        console.log(
          `[vocab] Imported "${title}" with ${pageImages.length} page images and ${wordIds.length} target words.`
        );

        res.json({
          book,
          words: wordIds.map((wordId) => makeWordCatalogIndex(store.wordCatalog)[wordId]).filter(Boolean),
          imported_word_count: wordIds.length,
          imported_page_image_count: pageImages.length,
        });
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
    writeJson(booksPath, store.books);
    res.json({ book });
  });

  app.get(`/${appName}/api/admin/children`, requireAdmin, async (_req, res) => {
    const store = readStore(paths);
    const children = await listChildUsers(adminEmails, childEmails);

    for (const child of children) {
      ensureChildProfile(store.profiles, child);
    }
    writeJson(profilesPath, store.profiles);

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
          assignments: activeAssignments.map((assignment) => ({
            ...assignment,
            progress: summarizeChildProgress(profile, assignment),
          })),
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
      target_word_ids: [...book.word_ids],
      status: 'active',
      settings: normalizeAssignmentSettings(req.body?.settings),
      created_by: req.vocabUser.user_id,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    store.assignments.unshift(assignment);
    writeJson(assignmentsPath, store.assignments);
    res.json({ assignment });
  });

  app.get(`/${appName}/api/assignments/current`, requireChild, (req, res) => {
    const store = readStore(paths);
    const profile = ensureChildProfile(store.profiles, req.vocabUser);
    writeJson(profilesPath, store.profiles);

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
          progress: summarizeChildProgress(profile, assignment),
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
    writeJson(profilesPath, store.profiles);

    const wordCatalogById = makeWordCatalogIndex(store.wordCatalog);
    const reviewWords = pickReviewWords(profile, wordCatalogById, assignment.target_word_ids, assignment.settings.max_review_words);
    const newWords = pickNewWords(profile, wordCatalogById, assignment.target_word_ids, assignment.settings.max_new_words);
    const selectedWords = unique([...reviewWords, ...newWords].map((word) => word.id))
      .map((wordId) => wordCatalogById[wordId])
      .filter(Boolean)
      .slice(0, assignment.settings.max_new_words + assignment.settings.max_review_words);

    if (selectedWords.length === 0) {
      res.status(409).json({ error: 'no_words_ready' });
      return;
    }

    const cards = selectedWords.map((word) => buildCard(
      word,
      assignment,
      word.image_path ? `/${appName}/api/word-images/${encodeURIComponent(word.id)}` : null
    ));

    const sessionId = `session_${crypto.randomUUID()}`;
    activeSessions.set(sessionId, {
      id: sessionId,
      assignment_id: assignment.id,
      child_user_id: req.vocabUser.user_id,
      book_id: assignment.book_id,
      started_at: nowIso(),
      cards,
      answers: [],
    });

    res.json({
      session: {
        id: sessionId,
        assignment_id: assignment.id,
        started_at: nowIso(),
        cards,
        limits: assignment.settings,
      },
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

    const event = {
      word_id: wordId,
      selected_index: selectedIndex,
      correct: selectedIndex === card.correct_index,
      hint_used: hintUsed,
      response_ms: responseMs,
      ts: nowIso(),
    };

    session.answers.push(event);
    res.json({ answer: event });
  });

  app.post(`/${appName}/api/sessions/:sessionId/complete`, requireChild, (req, res) => {
    const session = activeSessions.get(req.params.sessionId);
    if (!session || session.child_user_id !== req.vocabUser.user_id) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    const store = readStore(paths);
    const profile = ensureChildProfile(store.profiles, req.vocabUser);
    const cardsByWordId = Object.fromEntries(session.cards.map((card) => [card.word_id, card]));
    const wordSummaries = summarizeResponses(session.answers, cardsByWordId);

    for (const summary of wordSummaries) {
      profile.word_progress[summary.word_id] = updateWordProgress(profile.word_progress[summary.word_id], summary);
    }

    const rollingUpdate = updateRollingBand(profile, session.answers);
    profile.rolling_answers = rollingUpdate.rolling_answers;
    profile.target_band = rollingUpdate.target_band;
    profile.stats = {
      ...rollingUpdate.stats,
      total_sessions: Number(profile.stats?.total_sessions || 0) + 1,
    };
    profile.updated_at = nowIso();

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
        lemma: summary.card?.lemma || '',
        final_correct: summary.final_correct,
        attempts: summary.attempts,
        hint_used: summary.hint_used,
        average_response_ms: summary.average_response_ms,
      })),
      accuracy: Number(average(session.answers.map((item) => item.correct ? 1 : 0)).toFixed(2)),
    };

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
    const wordCatalog = readJson(wordCatalogPath, []);
    const word = wordCatalog.find((item) => item.id === req.params.wordId);
    if (!word?.image_path || !fs.existsSync(word.image_path)) {
      res.status(404).json({ error: 'image_not_found' });
      return;
    }

    res.sendFile(word.image_path);
  });

  app.get(`/${appName}/api/admin/books/:bookId/artifacts/:artifactId`, requireAdmin, (req, res) => {
    const books = readJson(booksPath, []);
    const book = books.find((item) => item.id === req.params.bookId);
    const artifact = book?.artifacts?.find((item) => item.id === req.params.artifactId);

    if (!artifact?.image_path || !fs.existsSync(artifact.image_path)) {
      res.status(404).json({ error: 'artifact_not_found' });
      return;
    }

    res.sendFile(artifact.image_path);
  });
}
