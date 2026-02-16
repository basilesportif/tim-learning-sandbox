import crypto from 'crypto';

const GDL_API_ROOT = 'https://content.digitallibrary.io/wp-json/content-api/v1';

export const SOURCE_SYNC_DEFAULTS = {
  source: 'gdl',
  languages: ['ru', 'uk'],
  per_language_limit: 8,
  min_words: 18,
  max_words: 180,
  include_categories: [],
};

const COMMON_ENTITY_MAP = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

function nowIso() {
  return new Date().toISOString();
}

export function normalizeSourceLanguage(language) {
  return language === 'uk' ? 'uk' : 'ru';
}

function decodeHtmlEntities(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let output = input;
  for (const [key, value] of Object.entries(COMMON_ENTITY_MAP)) {
    output = output.split(key).join(value);
  }

  output = output.replace(/&#(\d+);/g, (_m, code) => {
    const parsed = Number(code);
    return Number.isFinite(parsed) ? String.fromCharCode(parsed) : '';
  });

  output = output.replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => {
    const parsed = Number.parseInt(code, 16);
    return Number.isFinite(parsed) ? String.fromCharCode(parsed) : '';
  });

  return output;
}

function stripHtml(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const withoutHtml = input.replace(/<[^>]+>/g, ' ');
  const decoded = decodeHtmlEntities(withoutHtml);
  return decoded.replace(/\s+/g, ' ').trim();
}

function countWords(paragraphs) {
  if (!Array.isArray(paragraphs)) {
    return 0;
  }

  const text = paragraphs.join(' ');
  const words = text.match(/[\p{L}\p{M}'’-]+/gu);
  return words ? words.length : 0;
}

function pullStrings(node, output) {
  if (typeof node === 'string') {
    const cleaned = stripHtml(node);
    if (cleaned.length >= 28 && /\p{L}/u.test(cleaned)) {
      output.push(cleaned);
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      pullStrings(item, output);
    }
    return;
  }

  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) {
      pullStrings(value, output);
    }
  }
}

function dedupeParagraphs(paragraphs) {
  const unique = [];
  const seen = new Set();

  for (const paragraph of paragraphs) {
    const normalized = paragraph.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(paragraph);
  }

  return unique;
}

function pickParagraphs(rawParagraphs, minWords, maxWords) {
  const deduped = dedupeParagraphs(rawParagraphs);
  const filtered = deduped
    .filter((paragraph) => {
      const words = countWords([paragraph]);
      return words >= 5 && words <= maxWords;
    })
    .slice(0, 4);

  if (filtered.length === 0) {
    return [];
  }

  const totalWords = countWords(filtered);
  if (totalWords < minWords) {
    if (filtered.length >= 2) {
      return filtered;
    }
    return [];
  }

  return filtered;
}

function categoryText(book) {
  const category = book?.mainCategory;
  if (!category || typeof category !== 'object') {
    return '';
  }

  const values = [category.ru, category.uk, category.en]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.toLowerCase());

  return values.join(' ');
}

function scoreForEarlyReaders(book) {
  const bucket = categoryText(book);
  let score = 0;

  if (/decod|phonics|beginner|early|classroom/.test(bucket)) {
    score += 4;
  }
  if (/story|reader|practice|reading/.test(bucket)) {
    score += 2;
  }
  if (/advanced|science|reference/.test(bucket)) {
    score -= 2;
  }

  const title = typeof book?.title === 'string' ? book.title : '';
  if (title.length > 0 && title.length <= 64) {
    score += 1;
  }

  return score;
}

function estimateDifficulty(wordCount, book) {
  const category = categoryText(book);
  const base = Math.min(75, Math.max(18, Math.round(wordCount * 1.15)));

  if (/decod|phonics|beginner|early/.test(category)) {
    return Math.max(14, base - 8);
  }
  if (/advanced/.test(category)) {
    return Math.min(88, base + 8);
  }

  return base;
}

export function createQuizTemplate(language, title) {
  if (language === 'uk') {
    return [
      {
        id: `auto-q1-${crypto.randomBytes(3).toString('hex')}`,
        type: 'choice',
        prompt: 'Яка назва цієї історії?',
        choices: [
          title,
          'Пригода в лісі',
          'Шкільний день',
          'Подорож додому',
        ],
        answer_index: 0,
      },
      {
        id: `auto-q2-${crypto.randomBytes(3).toString('hex')}`,
        type: 'choice',
        prompt: 'Що корисно зробити після читання?',
        choices: [
          'Коротко переказати історію',
          'Пропустити запитання',
          'Не згадувати прочитане',
          'Закрити текст одразу',
        ],
        answer_index: 0,
      },
    ];
  }

  return [
    {
      id: `auto-q1-${crypto.randomBytes(3).toString('hex')}`,
      type: 'choice',
      prompt: 'Как называется эта история?',
      choices: [
        title,
        'Приключение в лесу',
        'День в школе',
        'Путешествие домой',
      ],
      answer_index: 0,
    },
    {
      id: `auto-q2-${crypto.randomBytes(3).toString('hex')}`,
      type: 'choice',
      prompt: 'Что полезно сделать после чтения?',
      choices: [
        'Коротко пересказать историю',
        'Пропустить вопросы',
        'Не вспоминать прочитанное',
        'Сразу закрыть текст',
      ],
      answer_index: 0,
    },
  ];
}

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Fetch failed (${res.status}) for ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBooksResponse(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.books)) {
    return response.books;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  return [];
}

function sourceNameForProvider(provider) {
  if (provider === 'gdl') {
    return 'global_digital_library';
  }

  return provider;
}

function createRunSummary(base = {}) {
  return {
    run_id: `sync_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    source: 'gdl',
    started_ts: nowIso(),
    completed_ts: null,
    status: 'running',
    scanned: 0,
    added: 0,
    skipped_duplicates: 0,
    skipped_empty: 0,
    skipped_bounds: 0,
    errors: [],
    ...base,
  };
}

export async function syncGdlCandidates(options = {}) {
  const merged = {
    ...SOURCE_SYNC_DEFAULTS,
    ...(options || {}),
  };

  const source = merged.source === 'gdl' ? 'gdl' : 'gdl';
  const languages = Array.isArray(merged.languages)
    ? merged.languages.map((language) => normalizeSourceLanguage(language))
    : SOURCE_SYNC_DEFAULTS.languages;
  const uniqueLanguages = [...new Set(languages)].slice(0, 2);
  const minWords = Math.max(8, Number(merged.min_words) || SOURCE_SYNC_DEFAULTS.min_words);
  const maxWords = Math.max(minWords, Number(merged.max_words) || SOURCE_SYNC_DEFAULTS.max_words);
  const perLanguageLimit = Math.max(1, Number(merged.per_language_limit) || SOURCE_SYNC_DEFAULTS.per_language_limit);
  const existingSourceKeys = merged.existing_source_keys instanceof Set ? merged.existing_source_keys : new Set();

  const run = createRunSummary({
    source,
    params: {
      languages: uniqueLanguages,
      min_words: minWords,
      max_words: maxWords,
      per_language_limit: perLanguageLimit,
      dry_run: Boolean(merged.dry_run),
    },
  });

  const candidates = [];

  for (const language of uniqueLanguages) {
    let books = [];
    try {
      const response = await fetchJson(`${GDL_API_ROOT}/books/${language}`);
      books = normalizeBooksResponse(response)
        .filter((book) => book && typeof book === 'object')
        .sort((a, b) => scoreForEarlyReaders(b) - scoreForEarlyReaders(a));
    } catch (error) {
      run.errors.push({ language, stage: 'books', message: error.message });
      continue;
    }

    let addedForLanguage = 0;

    for (const book of books) {
      if (addedForLanguage >= perLanguageLimit) {
        break;
      }

      const sourceId = String(book.postId || book.id || '').trim();
      const h5pId = String(book.h5pId || '').trim();
      if (!sourceId || !h5pId) {
        continue;
      }

      run.scanned += 1;

      const sourceKey = `${source}:${language}:${sourceId}`;
      if (existingSourceKeys.has(sourceKey)) {
        run.skipped_duplicates += 1;
        continue;
      }

      let h5pContent;
      try {
        h5pContent = await fetchJson(`${GDL_API_ROOT}/h5p/${encodeURIComponent(h5pId)}`);
      } catch (error) {
        run.errors.push({ language, stage: 'h5p', source_id: sourceId, message: error.message });
        continue;
      }

      const strings = [];
      pullStrings(h5pContent, strings);
      const fallbackText = stripHtml(String(book.description || ''));
      if (fallbackText) {
        strings.push(fallbackText);
      }

      const paragraphs = pickParagraphs(strings, minWords, maxWords);
      if (paragraphs.length === 0) {
        run.skipped_empty += 1;
        continue;
      }

      const wordCount = countWords(paragraphs);
      if (wordCount < minWords || wordCount > maxWords * 2) {
        run.skipped_bounds += 1;
        continue;
      }

      const title = stripHtml(String(book.title || '')) || `Story ${sourceId}`;
      const difficultyScore = estimateDifficulty(wordCount, book);

      const candidate = {
        review_id: `review_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        source_name: sourceNameForProvider(source),
        source_key: sourceKey,
        source_id: sourceId,
        language,
        id: `${source}-${language}-${sourceId}`,
        title,
        difficulty_score: Number(difficultyScore.toFixed(1)),
        tags: ['child', 'story', 'open-license', `source:${source}`],
        paragraphs,
        quiz: createQuizTemplate(language, title),
        source: sourceNameForProvider(source),
        license: 'CC BY 4.0',
        attribution: {
          label: `Global Digital Library: ${title}`,
          source_url: typeof book.postLink === 'string' ? book.postLink : null,
          h5p_id: h5pId,
          source_id: sourceId,
        },
        source_url: typeof book.postLink === 'string' ? book.postLink : null,
        word_count: wordCount,
        estimated_level: scoreForEarlyReaders(book) >= 3 ? 'emergent' : 'early',
        status: 'pending',
        created_ts: nowIso(),
        updated_ts: nowIso(),
      };

      candidates.push(candidate);
      existingSourceKeys.add(sourceKey);
      addedForLanguage += 1;
      run.added += 1;
    }
  }

  run.completed_ts = nowIso();
  run.status = run.errors.length > 0 && run.added === 0 ? 'failed' : 'completed';

  return {
    run,
    candidates,
  };
}
