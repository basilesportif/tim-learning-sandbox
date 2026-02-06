import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appsDir = join(__dirname, '..', 'apps');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());

const UKRAINE_APP_NAME = 'ukraine';
const UKRAINE_COOKIE_NAME = 'ukraine_unlock';
const UKRAINE_PASSWORD = process.env.UKRAINE_APP_PASSWORD || 'tim-learning';
const UKRAINE_MAX_ATTEMPTS = 5;
const UKRAINE_BLOCK_MS = 10 * 60 * 1000;
const UKRAINE_UNLOCK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DIAGNOSTIC_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const DIAGNOSTIC_DEFAULT_MAX_USES = 1;
const DIAGNOSTIC_RATE_WINDOW_MS = 15 * 60 * 1000;
const DIAGNOSTIC_RATE_LIMIT = 30;
const DIAGNOSTIC_PASSAGES_PER_LANGUAGE = 3;
const DIAGNOSTIC_QUESTIONS_PER_PASSAGE = 2;

const unlockSessions = new Map();
const unlockAttempts = new Map();
const diagnosticRateLimits = new Map();

if (!process.env.UKRAINE_APP_PASSWORD) {
  console.warn('[ukraine] UKRAINE_APP_PASSWORD is not set. Using development fallback password.');
}

setInterval(() => {
  const now = Date.now();

  for (const [token, expiresAt] of unlockSessions.entries()) {
    if (expiresAt <= now) {
      unlockSessions.delete(token);
    }
  }

  for (const [ip, state] of unlockAttempts.entries()) {
    if ((state.blockedUntil || 0) <= now && (state.lastFailureAt || 0) + UKRAINE_BLOCK_MS <= now) {
      unlockAttempts.delete(ip);
    }
  }

  for (const [ip, state] of diagnosticRateLimits.entries()) {
    if ((state.resetAt || 0) <= now) {
      diagnosticRateLimits.delete(ip);
    }
  }
}, 60 * 1000).unref();

function ensureJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallbackValue, null, 2));
  }
}

function readJson(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallbackValue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.trim()) {
      return fallbackValue;
    }

    return JSON.parse(content);
  } catch (error) {
    console.error(`[server] Failed reading JSON ${filePath}:`, error);
    return fallbackValue;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function createOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function applyRateLimit(map, key, limit, windowMs) {
  const now = Date.now();
  const state = map.get(key);

  if (!state || (state.resetAt || 0) <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSec: 0 };
  }

  if (state.count >= limit) {
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
    };
  }

  state.count += 1;
  map.set(key, state);
  return { limited: false, retryAfterSec: 0 };
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};

  if (!header) {
    return cookies;
  }

  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ewma(previous, next, alpha = 0.25) {
  return previous * (1 - alpha) + next * alpha;
}

function computeBands(skillLevel) {
  const skill = clamp(skillLevel, 0, 100);
  return {
    comfort_band: [clamp(skill - 6, 0, 100), clamp(skill + 4, 0, 100)],
    instructional_band: [clamp(skill + 4, 0, 100), clamp(skill + 12, 0, 100)],
    frustration_band: [clamp(skill + 12, 0, 100), 100],
  };
}

function getDefaultProfile(language) {
  const skillLevel = 25;
  const bands = computeBands(skillLevel);

  return {
    child_id: 'single-child',
    language,
    skill_level: skillLevel,
    ...bands,
    confidence: 0.2,
    trend_7d: 0,
    trend_30d: 0,
    bottleneck: 'balanced',
    signals: {
      help_taps_per_100_words: 0,
      quiz_accuracy: 0,
      abandon_rate: 0,
      pace_wpm_proxy: 70,
    },
    recommended: {
      text_types: ['short dialogue-heavy stories', 'gentle everyday stories'],
      activities: ['read passage (3 min)', '2 quick comprehension questions'],
      daily_plan: {
        challenges_per_day: 4,
        mix: {
          comfort: 0.7,
          instructional: 0.3,
          challenge: 0,
        },
      },
    },
    history: [],
    updated_ts: new Date().toISOString(),
  };
}

function ensureProfileShape(profile, language) {
  const defaults = getDefaultProfile(language);
  const merged = {
    ...defaults,
    ...(profile || {}),
    signals: {
      ...defaults.signals,
      ...(profile?.signals || {}),
    },
    recommended: {
      ...defaults.recommended,
      ...(profile?.recommended || {}),
      daily_plan: {
        ...defaults.recommended.daily_plan,
        ...(profile?.recommended?.daily_plan || {}),
        mix: {
          ...defaults.recommended.daily_plan.mix,
          ...(profile?.recommended?.daily_plan?.mix || {}),
        },
      },
    },
    history: Array.isArray(profile?.history) ? profile.history : [],
  };

  const bands = computeBands(Number(merged.skill_level) || 25);
  merged.skill_level = clamp(Number(merged.skill_level) || 25, 0, 100);
  merged.comfort_band = bands.comfort_band;
  merged.instructional_band = bands.instructional_band;
  merged.frustration_band = bands.frustration_band;
  merged.confidence = clamp(Number(merged.confidence) || 0.2, 0, 1);
  merged.language = language;

  return merged;
}

function scoreBehavior(summary) {
  const help = clamp((Number(summary.help_taps_per_100_words) || 0) / 12, 0, 1);
  const repeat = clamp(Number(summary.repeat_rate) || 0, 0, 1);
  const pause = clamp(Number(summary.pause_density) || 0, 0, 1);
  const abandon = clamp(Number(summary.abandon_rate) || 0, 0, 1);
  const pace = clamp((Number(summary.pace_wpm_proxy) || 60) / 120, 0, 1);

  const strugglePenalty = (help * 0.35) + (repeat * 0.2) + (pause * 0.2) + (abandon * 0.25);
  const paceContribution = pace * 0.2;

  return clamp(1 - strugglePenalty + paceContribution, 0, 1);
}

function classifyBottleneck(signals) {
  if ((signals.help_taps_per_100_words || 0) > 7 || (signals.pace_wpm_proxy || 0) < 55) {
    return 'decoding_limited';
  }

  if ((signals.quiz_accuracy || 0) < 0.55) {
    return 'comprehension_limited';
  }

  if ((signals.abandon_rate || 0) > 0.2) {
    return 'stamina_limited';
  }

  return 'balanced';
}

function buildRecommendations(profile, bottleneck) {
  const recommendations = {
    text_types: [],
    activities: [],
    daily_plan: {
      challenges_per_day: 4,
      mix: {
        comfort: 0.7,
        instructional: 0.3,
        challenge: 0,
      },
    },
  };

  if (bottleneck === 'decoding_limited') {
    recommendations.text_types = [
      'short dialogue-heavy stories',
      'repetitive folktale-style passages',
      'low rare-word passages',
    ];
    recommendations.activities = [
      'tap and replay hard words',
      'slow sentence replay',
      'short read + 2 comprehension checks',
    ];
  } else if (bottleneck === 'comprehension_limited') {
    recommendations.text_types = [
      'clear sequence stories',
      'slightly easier vocabulary with richer plot',
      'short cause-and-effect passages',
    ];
    recommendations.activities = [
      'extra picture-backed questions',
      'brief retell prompt after reading',
      'fewer difficult words per passage',
    ];
  } else if (bottleneck === 'stamina_limited') {
    recommendations.text_types = [
      'very short complete stories',
      'high-interest short scenes',
      'split passages with fast wins',
    ];
    recommendations.activities = [
      '2-minute reading blocks',
      'one challenge per sitting',
      'quick celebration after each completion',
    ];
    recommendations.daily_plan.challenges_per_day = 3;
    recommendations.daily_plan.mix = {
      comfort: 0.8,
      instructional: 0.2,
      challenge: 0,
    };
  } else {
    recommendations.text_types = [
      'mixed narrative passages',
      'dialogue + descriptive balance',
      'slightly varied sentence lengths',
    ];
    recommendations.activities = [
      'read passage + comprehension',
      'occasional sentence replay',
      'steady daily routine',
    ];
  }

  if (profile.confidence > 0.75 && profile.bottleneck === 'balanced') {
    recommendations.daily_plan.mix.challenge = 0.1;
    recommendations.daily_plan.mix.comfort = 0.6;
    recommendations.daily_plan.mix.instructional = 0.3;
  }

  return recommendations;
}

function computeTrend(history, days) {
  if (!Array.isArray(history) || history.length < 2) {
    return 0;
  }

  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const filtered = history.filter((entry) => {
    const ts = new Date(entry.ts).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });

  if (filtered.length < 2) {
    return 0;
  }

  const startSkill = Number(filtered[0].skill_level) || 0;
  const endSkill = Number(filtered[filtered.length - 1].skill_level) || 0;
  return Number((endSkill - startSkill).toFixed(2));
}

function normalizeSummary(summary) {
  const safe = summary || {};
  return {
    duration_sec: Number(safe.duration_sec) || 0,
    word_count: Number(safe.word_count) || 0,
    quiz_accuracy: clamp(Number(safe.quiz_accuracy) || 0, 0, 1),
    quiz_count: Number(safe.quiz_count) || 0,
    help_taps_per_100_words: Number(safe.help_taps_per_100_words) || 0,
    repeat_rate: clamp(Number(safe.repeat_rate) || 0, 0, 1),
    pause_density: clamp(Number(safe.pause_density) || 0, 0, 1),
    abandon_rate: clamp(Number(safe.abandon_rate) || 0, 0, 1),
    pace_wpm_proxy: Number(safe.pace_wpm_proxy) || 0,
    tts_only_ratio: clamp(Number(safe.tts_only_ratio) || 0, 0, 1),
    text_difficulty: Number(safe.text_difficulty) || 25,
    performance: safe.performance !== undefined ? clamp(Number(safe.performance) || 0, 0, 1) : null,
  };
}

function updateProfileFromSummary(profile, summary, endTs) {
  const normalized = normalizeSummary(summary);
  const oldSkill = Number(profile.skill_level) || 25;
  const textDifficulty = normalized.text_difficulty;

  const behaviorScore = scoreBehavior(normalized);
  let performance = normalized.performance;

  if (performance === null) {
    if (normalized.quiz_count > 0) {
      performance = clamp((normalized.quiz_accuracy * 0.6) + (behaviorScore * 0.4), 0, 1);
    } else {
      performance = clamp(behaviorScore * 0.85, 0, 1);
    }

    if (normalized.duration_sec > 0 && normalized.duration_sec < 60) {
      performance = performance * 0.35;
    }
  }

  const informativeness = Math.exp(-Math.abs(textDifficulty - oldSkill) / 18);
  const candidateSkill = oldSkill + (8 * (performance - 0.75) * informativeness);
  const smoothedSkill = clamp((0.7 * oldSkill) + (0.3 * candidateSkill), 0, 100);

  const confidenceBoost = clamp(normalized.word_count / 500, 0, 1) * 0.08 + (normalized.quiz_count > 0 ? 0.04 : 0);
  const confidencePenalty = (normalized.duration_sec < 60 ? 0.06 : 0) + (normalized.tts_only_ratio * 0.04);
  const newConfidence = clamp((Number(profile.confidence) || 0.2) + confidenceBoost - confidencePenalty, 0.1, 0.99);

  const signals = {
    help_taps_per_100_words: Number(ewma(Number(profile.signals?.help_taps_per_100_words) || 0, normalized.help_taps_per_100_words, 0.3).toFixed(2)),
    quiz_accuracy: Number(ewma(Number(profile.signals?.quiz_accuracy) || 0, normalized.quiz_accuracy, 0.35).toFixed(3)),
    abandon_rate: Number(ewma(Number(profile.signals?.abandon_rate) || 0, normalized.abandon_rate, 0.3).toFixed(3)),
    pace_wpm_proxy: Number(ewma(Number(profile.signals?.pace_wpm_proxy) || 70, normalized.pace_wpm_proxy || 70, 0.25).toFixed(1)),
  };

  const history = Array.isArray(profile.history) ? [...profile.history] : [];
  history.push({
    ts: endTs,
    skill_level: Number(smoothedSkill.toFixed(2)),
    performance: Number(performance.toFixed(3)),
    difficulty: textDifficulty,
  });

  const historyCutoff = Date.now() - (45 * 24 * 60 * 60 * 1000);
  const boundedHistory = history.filter((entry) => {
    const ts = new Date(entry.ts).getTime();
    return Number.isFinite(ts) && ts >= historyCutoff;
  });

  const trend7d = computeTrend(boundedHistory, 7);
  const trend30d = computeTrend(boundedHistory, 30);

  const bottleneck = classifyBottleneck(signals);

  const nextProfile = {
    ...profile,
    skill_level: Number(smoothedSkill.toFixed(2)),
    confidence: Number(newConfidence.toFixed(3)),
    trend_7d: trend7d,
    trend_30d: trend30d,
    bottleneck,
    signals,
    history: boundedHistory,
    updated_ts: endTs,
  };

  const bands = computeBands(nextProfile.skill_level);
  nextProfile.comfort_band = bands.comfort_band;
  nextProfile.instructional_band = bands.instructional_band;
  nextProfile.frustration_band = bands.frustration_band;
  nextProfile.recommended = buildRecommendations(nextProfile, bottleneck);

  return nextProfile;
}

function sanitizeProfile(profile) {
  const { history, ...publicProfile } = profile;
  return publicProfile;
}

function normalizeLanguage(value) {
  return value === 'uk' ? 'uk' : 'ru';
}

function average(values, fallback = 0) {
  if (!Array.isArray(values) || values.length === 0) {
    return fallback;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeDiagnosticLanguages(value) {
  const languages = asArray(value)
    .map((language) => normalizeLanguage(language))
    .filter((language, index, arr) => arr.indexOf(language) === index);

  if (languages.length === 0) {
    return ['ru', 'uk'];
  }

  if (!languages.includes('ru')) {
    languages.push('ru');
  }

  if (!languages.includes('uk')) {
    languages.push('uk');
  }

  return languages.slice(0, 2);
}

function computeDiagnosticPassagePerformance(passage) {
  const summary = normalizeSummary(passage?.summary || {});
  const comprehension = summary.quiz_count > 0
    ? summary.quiz_accuracy
    : clamp(Number(passage?.quiz_accuracy) || 0, 0, 1);
  const behavior = scoreBehavior(summary);
  return clamp((comprehension * 0.7) + (behavior * 0.3), 0, 1);
}

function updateProfileFromDiagnostic(profile, language, languageResult, endTs) {
  const normalizedProfile = ensureProfileShape(profile, normalizeLanguage(language));
  const passages = asArray(languageResult?.passages);
  const oldSkill = Number(normalizedProfile.skill_level) || 25;

  if (passages.length === 0) {
    return normalizedProfile;
  }

  const estimatedSkillPoints = passages.map((passage) => {
    const difficulty = clamp(Number(passage?.difficulty_score) || oldSkill, 0, 100);
    const performance = computeDiagnosticPassagePerformance(passage);
    return difficulty + (12 * (performance - 0.75));
  });

  const diagnosticSkill = clamp(average(estimatedSkillPoints, oldSkill), 0, 100);
  const blendedSkill = clamp((0.55 * oldSkill) + (0.45 * diagnosticSkill), 0, 100);

  const summaries = passages.map((passage) => normalizeSummary(passage?.summary || {}));
  const avgHelp = average(summaries.map((summary) => summary.help_taps_per_100_words), normalizedProfile.signals.help_taps_per_100_words || 0);
  const avgQuiz = average(summaries.map((summary) => summary.quiz_accuracy), normalizedProfile.signals.quiz_accuracy || 0);
  const avgAbandon = average(summaries.map((summary) => summary.abandon_rate), normalizedProfile.signals.abandon_rate || 0);
  const avgPace = average(summaries.map((summary) => summary.pace_wpm_proxy || 70), normalizedProfile.signals.pace_wpm_proxy || 70);

  const signalProfile = {
    help_taps_per_100_words: Number(ewma(Number(normalizedProfile.signals?.help_taps_per_100_words) || 0, avgHelp, 0.5).toFixed(2)),
    quiz_accuracy: Number(ewma(Number(normalizedProfile.signals?.quiz_accuracy) || 0, avgQuiz, 0.55).toFixed(3)),
    abandon_rate: Number(ewma(Number(normalizedProfile.signals?.abandon_rate) || 0, avgAbandon, 0.5).toFixed(3)),
    pace_wpm_proxy: Number(ewma(Number(normalizedProfile.signals?.pace_wpm_proxy) || 70, avgPace, 0.45).toFixed(1)),
  };

  const passagePerformances = passages.map((passage) => computeDiagnosticPassagePerformance(passage));
  const qualityFactor = clamp(average(passagePerformances, 0.5), 0, 1);
  const completionFactor = clamp(passages.length / DIAGNOSTIC_PASSAGES_PER_LANGUAGE, 0, 1);
  const confidenceFloor = Math.max(Number(normalizedProfile.confidence) || 0.2, 0.55);
  const confidence = clamp(confidenceFloor + (0.08 * ((qualityFactor + completionFactor) / 2)), 0, 0.99);

  const history = asArray(normalizedProfile.history);
  history.push({
    ts: endTs,
    skill_level: Number(blendedSkill.toFixed(2)),
    performance: Number(qualityFactor.toFixed(3)),
    difficulty: Number(average(passages.map((passage) => Number(passage?.difficulty_score) || oldSkill), oldSkill).toFixed(2)),
    source: 'diagnostic',
  });

  const historyCutoff = Date.now() - (45 * 24 * 60 * 60 * 1000);
  const boundedHistory = history.filter((entry) => {
    const ts = new Date(entry.ts).getTime();
    return Number.isFinite(ts) && ts >= historyCutoff;
  });

  const trend7d = computeTrend(boundedHistory, 7);
  const trend30d = computeTrend(boundedHistory, 30);
  const bottleneck = classifyBottleneck(signalProfile);

  const updatedProfile = {
    ...normalizedProfile,
    skill_level: Number(blendedSkill.toFixed(2)),
    confidence: Number(confidence.toFixed(3)),
    trend_7d: trend7d,
    trend_30d: trend30d,
    bottleneck,
    signals: signalProfile,
    history: boundedHistory,
    updated_ts: endTs,
  };

  const bands = computeBands(updatedProfile.skill_level);
  updatedProfile.comfort_band = bands.comfort_band;
  updatedProfile.instructional_band = bands.instructional_band;
  updatedProfile.frustration_band = bands.frustration_band;
  updatedProfile.recommended = buildRecommendations(updatedProfile, bottleneck);

  return updatedProfile;
}

function isUkraineUnlocked(req) {
  const cookies = parseCookies(req);
  const token = cookies[UKRAINE_COOKIE_NAME];

  if (!token) {
    return false;
  }

  const expiresAt = unlockSessions.get(token);
  if (!expiresAt) {
    return false;
  }

  if (expiresAt <= Date.now()) {
    unlockSessions.delete(token);
    return false;
  }

  return true;
}

function requireUkraineUnlock(req, res, next) {
  if (isUkraineUnlocked(req)) {
    next();
    return;
  }

  res.status(401).json({ error: 'locked' });
}

function setupUkraineApiRoutes(appName, dataPath) {
  const ruTextsPath = join(dataPath, 'texts.ru.json');
  const ukTextsPath = join(dataPath, 'texts.uk.json');
  const sessionsPath = join(dataPath, 'sessions.json');
  const eventsPath = join(dataPath, 'events.json');
  const profilesPath = join(dataPath, 'profiles.json');
  const diagnosticLinksPath = join(dataPath, 'diagnostic_links.json');
  const diagnosticRunsPath = join(dataPath, 'diagnostic_runs.json');

  ensureJsonFile(ruTextsPath, []);
  ensureJsonFile(ukTextsPath, []);
  ensureJsonFile(sessionsPath, []);
  ensureJsonFile(eventsPath, []);
  ensureJsonFile(profilesPath, {
    ru: getDefaultProfile('ru'),
    uk: getDefaultProfile('uk'),
    updated_ts: new Date().toISOString(),
  });
  ensureJsonFile(diagnosticLinksPath, []);
  ensureJsonFile(diagnosticRunsPath, []);

  function readDiagnosticLinks() {
    return asArray(readJson(diagnosticLinksPath, []));
  }

  function writeDiagnosticLinks(links) {
    writeJson(diagnosticLinksPath, asArray(links));
  }

  function readDiagnosticRuns() {
    return asArray(readJson(diagnosticRunsPath, []));
  }

  function writeDiagnosticRuns(runs) {
    writeJson(diagnosticRunsPath, asArray(runs));
  }

  function getDiagnosticLinkByTokenHash(tokenHash) {
    const links = readDiagnosticLinks();
    const index = links.findIndex((link) => link.token_hash === tokenHash);
    if (index < 0) {
      return { ok: false, error: 'invalid_token', links, index: -1, link: null };
    }

    const nowMs = Date.now();
    const link = links[index];
    const expiresMs = new Date(link.expires_ts).getTime();

    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
      links[index] = { ...link, status: 'expired', current_run_id: null };
      writeDiagnosticLinks(links);
      return { ok: false, error: 'expired_token', links, index, link: links[index] };
    }

    if ((link.used_count || 0) >= (link.max_uses || DIAGNOSTIC_DEFAULT_MAX_USES)) {
      links[index] = { ...link, status: 'consumed', current_run_id: null };
      writeDiagnosticLinks(links);
      return { ok: false, error: 'consumed_token', links, index, link: links[index] };
    }

    if (link.status === 'revoked') {
      return { ok: false, error: 'revoked_token', links, index, link };
    }

    if (link.status !== 'active' && link.status !== 'in_progress') {
      return { ok: false, error: 'invalid_token', links, index, link };
    }

    return { ok: true, links, index, link };
  }

  app.get(`/${appName}/api/auth/status`, (req, res) => {
    res.json({ unlocked: isUkraineUnlocked(req) });
  });

  app.post(`/${appName}/api/auth/unlock`, (req, res) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const state = unlockAttempts.get(ip) || { failures: 0, blockedUntil: 0, lastFailureAt: 0 };

    if (state.blockedUntil > now) {
      const retryAfterSec = Math.ceil((state.blockedUntil - now) / 1000);
      res.status(429).json({ error: 'rate_limited', retry_after_sec: retryAfterSec });
      return;
    }

    const submittedPassword = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!submittedPassword || submittedPassword !== UKRAINE_PASSWORD) {
      state.failures += 1;
      state.lastFailureAt = now;

      if (state.failures >= UKRAINE_MAX_ATTEMPTS) {
        state.failures = 0;
        state.blockedUntil = now + UKRAINE_BLOCK_MS;
        unlockAttempts.set(ip, state);
        res.status(429).json({ error: 'rate_limited', retry_after_sec: Math.ceil(UKRAINE_BLOCK_MS / 1000) });
        return;
      }

      unlockAttempts.set(ip, state);
      res.status(401).json({ error: 'invalid_password', attempts_remaining: UKRAINE_MAX_ATTEMPTS - state.failures });
      return;
    }

    unlockAttempts.delete(ip);

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = now + UKRAINE_UNLOCK_TTL_MS;
    unlockSessions.set(token, expiresAt);

    const maxAgeSec = Math.floor(UKRAINE_UNLOCK_TTL_MS / 1000);
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const cookieValue = `${UKRAINE_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/${appName}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secureFlag}`;
    res.setHeader('Set-Cookie', cookieValue);

    res.json({ success: true, unlocked_until: new Date(expiresAt).toISOString() });
  });

  app.post(`/${appName}/api/auth/logout`, (req, res) => {
    const token = parseCookies(req)[UKRAINE_COOKIE_NAME];
    if (token) {
      unlockSessions.delete(token);
    }

    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const cookieValue = `${UKRAINE_COOKIE_NAME}=; Path=/${appName}; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
    res.setHeader('Set-Cookie', cookieValue);
    res.json({ success: true });
  });

  app.post(`/${appName}/api/diagnostics/links`, requireUkraineUnlock, (req, res) => {
    const nowMs = Date.now();
    const token = createOpaqueToken();
    const tokenHash = hashToken(token);
    const expiresHours = clamp(Number(req.body?.expires_hours) || 24, 1, 72);
    const maxUses = Math.max(1, Math.round(Number(req.body?.max_uses) || DIAGNOSTIC_DEFAULT_MAX_USES));
    const languages = normalizeDiagnosticLanguages(req.body?.languages);
    const createdTs = nowIso();
    const expiresTs = new Date(nowMs + (expiresHours * 60 * 60 * 1000)).toISOString();

    const links = readDiagnosticLinks();
    const linkId = `diag_link_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const link = {
      link_id: linkId,
      token_hash: tokenHash,
      status: 'active',
      languages,
      created_ts: createdTs,
      expires_ts: expiresTs,
      max_uses: maxUses,
      used_count: 0,
      current_run_id: null,
      updated_ts: createdTs,
      config: {
        passages_per_language: DIAGNOSTIC_PASSAGES_PER_LANGUAGE,
        questions_per_passage: DIAGNOSTIC_QUESTIONS_PER_PASSAGE,
      },
    };

    links.push(link);
    writeDiagnosticLinks(links);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host');
    const base = `${protocol}://${host}`;
    const url = `${base}/${appName}/diagnostic?token=${encodeURIComponent(token)}`;

    res.json({
      link_id: linkId,
      url,
      expires_ts: expiresTs,
      max_uses: maxUses,
      languages,
    });
  });

  app.get(`/${appName}/api/diagnostics/resolve`, (req, res) => {
    const ip = getClientIp(req);
    const rate = applyRateLimit(diagnosticRateLimits, ip, DIAGNOSTIC_RATE_LIMIT, DIAGNOSTIC_RATE_WINDOW_MS);
    if (rate.limited) {
      res.status(429).json({ error: 'rate_limited', retry_after_sec: rate.retryAfterSec });
      return;
    }

    const token = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
    if (!token) {
      res.status(400).json({ error: 'token_required' });
      return;
    }

    const tokenHash = hashToken(token);
    const resolved = getDiagnosticLinkByTokenHash(tokenHash);
    if (!resolved.ok) {
      res.status(404).json({ error: 'invalid_or_expired_token' });
      return;
    }

    const runId = resolved.link.current_run_id || null;
    let canResume = false;

    if (runId) {
      const runs = readDiagnosticRuns();
      const run = runs.find((item) => item.run_id === runId);
      canResume = Boolean(run && !run.completed);
    }

    res.json({
      link_id: resolved.link.link_id,
      languages: normalizeDiagnosticLanguages(resolved.link.languages),
      config: {
        passages_per_language: DIAGNOSTIC_PASSAGES_PER_LANGUAGE,
        questions_per_passage: DIAGNOSTIC_QUESTIONS_PER_PASSAGE,
      },
      expires_ts: resolved.link.expires_ts,
      can_resume: canResume,
    });
  });

  app.get(`/${appName}/api/diagnostics/texts`, (req, res) => {
    const ip = getClientIp(req);
    const rate = applyRateLimit(diagnosticRateLimits, ip, DIAGNOSTIC_RATE_LIMIT, DIAGNOSTIC_RATE_WINDOW_MS);
    if (rate.limited) {
      res.status(429).json({ error: 'rate_limited', retry_after_sec: rate.retryAfterSec });
      return;
    }

    const token = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
    if (!token) {
      res.status(400).json({ error: 'token_required' });
      return;
    }

    const tokenHash = hashToken(token);
    const resolved = getDiagnosticLinkByTokenHash(tokenHash);
    if (!resolved.ok) {
      res.status(404).json({ error: 'invalid_or_expired_token' });
      return;
    }

    const language = normalizeLanguage(req.query?.language);
    const min = req.query.min !== undefined ? Number(req.query.min) : null;
    const max = req.query.max !== undefined ? Number(req.query.max) : null;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 60;

    const filePath = language === 'uk' ? ukTextsPath : ruTextsPath;
    let texts = asArray(readJson(filePath, []));

    if (Number.isFinite(min)) {
      texts = texts.filter((text) => Number(text.difficulty_score) >= min);
    }
    if (Number.isFinite(max)) {
      texts = texts.filter((text) => Number(text.difficulty_score) <= max);
    }

    texts = texts.slice(0, Number.isFinite(limit) ? limit : 60).map((text) => ({
      ...text,
      quiz: asArray(text.quiz).slice(0, DIAGNOSTIC_QUESTIONS_PER_PASSAGE),
    }));

    res.json({ texts });
  });

  app.post(`/${appName}/api/diagnostics/runs/start`, (req, res) => {
    const ip = getClientIp(req);
    const rate = applyRateLimit(diagnosticRateLimits, ip, DIAGNOSTIC_RATE_LIMIT, DIAGNOSTIC_RATE_WINDOW_MS);
    if (rate.limited) {
      res.status(429).json({ error: 'rate_limited', retry_after_sec: rate.retryAfterSec });
      return;
    }

    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) {
      res.status(400).json({ error: 'token_required' });
      return;
    }

    const tokenHash = hashToken(token);
    const resolved = getDiagnosticLinkByTokenHash(tokenHash);
    if (!resolved.ok) {
      res.status(404).json({ error: 'invalid_or_expired_token' });
      return;
    }

    const links = resolved.links;
    const link = { ...resolved.link };

    let runs = readDiagnosticRuns();

    if (link.status === 'in_progress' && link.current_run_id) {
      const activeRun = runs.find((run) => run.run_id === link.current_run_id && !run.completed);
      if (activeRun) {
        const profiles = readJson(profilesPath, {
          ru: getDefaultProfile('ru'),
          uk: getDefaultProfile('uk'),
          updated_ts: nowIso(),
        });

        res.json({
          run_id: activeRun.run_id,
          link_id: link.link_id,
          languages: normalizeDiagnosticLanguages(activeRun.languages),
          started_ts: activeRun.started_ts,
          resumed: true,
          config: activeRun.config,
          starting_skill_by_language: {
            ru: ensureProfileShape(profiles.ru, 'ru').skill_level,
            uk: ensureProfileShape(profiles.uk, 'uk').skill_level,
          },
        });
        return;
      }
    }

    const runId = `diag_run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const startedTs = nowIso();
    const run = {
      run_id: runId,
      link_id: link.link_id,
      token_hash: tokenHash,
      started_ts: startedTs,
      completed_ts: null,
      completed: false,
      languages: normalizeDiagnosticLanguages(link.languages),
      per_language: {},
      result_summary: null,
      config: {
        passages_per_language: DIAGNOSTIC_PASSAGES_PER_LANGUAGE,
        questions_per_passage: DIAGNOSTIC_QUESTIONS_PER_PASSAGE,
      },
      updated_ts: startedTs,
    };

    runs.push(run);
    writeDiagnosticRuns(runs);

    links[resolved.index] = {
      ...link,
      status: 'in_progress',
      current_run_id: runId,
      updated_ts: nowIso(),
    };
    writeDiagnosticLinks(links);

    const profiles = readJson(profilesPath, {
      ru: getDefaultProfile('ru'),
      uk: getDefaultProfile('uk'),
      updated_ts: nowIso(),
    });

    res.json({
      run_id: runId,
      link_id: link.link_id,
      languages: run.languages,
      started_ts: startedTs,
      resumed: false,
      config: run.config,
      starting_skill_by_language: {
        ru: ensureProfileShape(profiles.ru, 'ru').skill_level,
        uk: ensureProfileShape(profiles.uk, 'uk').skill_level,
      },
    });
  });

  app.post(`/${appName}/api/diagnostics/runs/:runId/complete`, (req, res) => {
    const ip = getClientIp(req);
    const rate = applyRateLimit(diagnosticRateLimits, ip, DIAGNOSTIC_RATE_LIMIT, DIAGNOSTIC_RATE_WINDOW_MS);
    if (rate.limited) {
      res.status(429).json({ error: 'rate_limited', retry_after_sec: rate.retryAfterSec });
      return;
    }

    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) {
      res.status(400).json({ error: 'token_required' });
      return;
    }

    const runId = req.params.runId;
    let runs = readDiagnosticRuns();
    const runIndex = runs.findIndex((run) => run.run_id === runId);
    if (runIndex < 0) {
      res.status(404).json({ error: 'run_not_found' });
      return;
    }

    const run = runs[runIndex];
    const tokenHash = hashToken(token);
    if (run.token_hash !== tokenHash) {
      res.status(403).json({ error: 'invalid_token' });
      return;
    }

    let profiles = readJson(profilesPath, {
      ru: getDefaultProfile('ru'),
      uk: getDefaultProfile('uk'),
      updated_ts: nowIso(),
    });

    profiles = {
      ...profiles,
      ru: ensureProfileShape(profiles.ru, 'ru'),
      uk: ensureProfileShape(profiles.uk, 'uk'),
    };

    if (run.completed) {
      res.json({
        completed_ts: run.completed_ts,
        updated_profiles: {
          ru: sanitizeProfile(profiles.ru),
          uk: sanitizeProfile(profiles.uk),
        },
        diagnostic_summary: run.result_summary || {},
        already_completed: true,
      });
      return;
    }

    const inputPerLanguage = req.body?.per_language_results && typeof req.body.per_language_results === 'object'
      ? req.body.per_language_results
      : {};
    const completedTs = nowIso();
    const summary = {};

    for (const language of normalizeDiagnosticLanguages(run.languages)) {
      const previousProfile = ensureProfileShape(profiles[language], language);
      const languageResult = inputPerLanguage[language] && typeof inputPerLanguage[language] === 'object'
        ? inputPerLanguage[language]
        : { passages: [] };
      const nextProfile = updateProfileFromDiagnostic(previousProfile, language, languageResult, completedTs);

      profiles[language] = nextProfile;
      summary[language] = {
        old_skill: Number(previousProfile.skill_level.toFixed(2)),
        diagnostic_skill: Number(nextProfile.skill_level.toFixed(2)),
        delta_skill: Number((nextProfile.skill_level - previousProfile.skill_level).toFixed(2)),
        confidence: nextProfile.confidence,
        bottleneck: nextProfile.bottleneck,
        passages_count: asArray(languageResult.passages).length,
      };
    }

    profiles.updated_ts = completedTs;
    writeJson(profilesPath, profiles);

    let links = readDiagnosticLinks();
    const linkIndex = links.findIndex((link) => link.link_id === run.link_id);
    if (linkIndex >= 0) {
      const existingLink = links[linkIndex];
      const usedCount = (Number(existingLink.used_count) || 0) + 1;
      const maxUses = Number(existingLink.max_uses) || DIAGNOSTIC_DEFAULT_MAX_USES;
      links[linkIndex] = {
        ...existingLink,
        used_count: usedCount,
        current_run_id: null,
        status: usedCount >= maxUses ? 'consumed' : 'active',
        updated_ts: completedTs,
      };
      writeDiagnosticLinks(links);
    }

    runs[runIndex] = {
      ...run,
      completed: true,
      completed_ts: completedTs,
      per_language: inputPerLanguage,
      result_summary: summary,
      updated_ts: completedTs,
    };
    writeDiagnosticRuns(runs);

    res.json({
      completed_ts: completedTs,
      updated_profiles: {
        ru: sanitizeProfile(ensureProfileShape(profiles.ru, 'ru')),
        uk: sanitizeProfile(ensureProfileShape(profiles.uk, 'uk')),
      },
      diagnostic_summary: summary,
      already_completed: false,
    });
  });

  app.get(`/${appName}/api/texts`, requireUkraineUnlock, (req, res) => {
    const language = req.query.language === 'uk' ? 'uk' : 'ru';
    const min = req.query.min !== undefined ? Number(req.query.min) : null;
    const max = req.query.max !== undefined ? Number(req.query.max) : null;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 50;

    const filePath = language === 'uk' ? ukTextsPath : ruTextsPath;
    let texts = readJson(filePath, []);

    if (Number.isFinite(min)) {
      texts = texts.filter((text) => Number(text.difficulty_score) >= min);
    }
    if (Number.isFinite(max)) {
      texts = texts.filter((text) => Number(text.difficulty_score) <= max);
    }

    texts = texts.slice(0, Number.isFinite(limit) ? limit : 50);

    res.json({ texts });
  });

  app.get(`/${appName}/api/texts/:id`, requireUkraineUnlock, (req, res) => {
    const id = req.params.id;

    const ruTexts = readJson(ruTextsPath, []);
    const ukTexts = readJson(ukTextsPath, []);
    const text = [...ruTexts, ...ukTexts].find((entry) => entry.id === id);

    if (!text) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    res.json(text);
  });

  app.post(`/${appName}/api/sessions/start`, requireUkraineUnlock, (req, res) => {
    const body = req.body || {};
    const clientSessionId = typeof body.client_session_id === 'string' && body.client_session_id.trim()
      ? body.client_session_id.trim()
      : null;

    const sessions = readJson(sessionsPath, []);

    if (clientSessionId) {
      const existing = sessions.find((session) => session.client_session_id === clientSessionId);
      if (existing) {
        res.json({
          session_id: existing.session_id,
          started_at: existing.start_ts,
          reused: true,
        });
        return;
      }
    }

    const sessionId = `sess_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const startTs = typeof body.start_ts === 'string' ? body.start_ts : new Date().toISOString();

    const session = {
      session_id: sessionId,
      client_session_id: clientSessionId || sessionId,
      language: body.language === 'uk' ? 'uk' : 'ru',
      text_id: typeof body.text_id === 'string' ? body.text_id : null,
      challenge_type: typeof body.challenge_type === 'string' ? body.challenge_type : 'read_and_comprehension',
      difficulty_score: Number(body.difficulty_score) || null,
      start_ts: startTs,
      end_ts: null,
      completed: false,
      summary: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    sessions.push(session);
    writeJson(sessionsPath, sessions);

    res.json({ session_id: sessionId, started_at: startTs, reused: false });
  });

  app.post(`/${appName}/api/sessions/:id/events/batch`, requireUkraineUnlock, (req, res) => {
    const sessionId = req.params.id;
    const sessions = readJson(sessionsPath, []);
    const sessionExists = sessions.some((session) => session.session_id === sessionId);

    if (!sessionExists) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    const batch = Array.isArray(req.body?.events) ? req.body.events : [];
    const events = readJson(eventsPath, []);

    const normalizedEvents = batch.map((event, index) => ({
      event_id: typeof event?.event_id === 'string' && event.event_id.trim()
        ? event.event_id
        : `evt_${Date.now()}_${index}_${crypto.randomBytes(2).toString('hex')}`,
      session_id: sessionId,
      type: typeof event?.type === 'string' ? event.type : 'UNKNOWN',
      payload: event?.payload && typeof event.payload === 'object' ? event.payload : {},
      ts: typeof event?.ts === 'string' ? event.ts : new Date().toISOString(),
      ingested_at: new Date().toISOString(),
    }));

    events.push(...normalizedEvents);
    writeJson(eventsPath, events);

    res.json({
      inserted: normalizedEvents.length,
      ack_event_index: normalizedEvents.length > 0 ? normalizedEvents.length - 1 : -1,
    });
  });

  app.post(`/${appName}/api/sessions/:id/end`, requireUkraineUnlock, (req, res) => {
    const sessionId = req.params.id;
    const body = req.body || {};

    const sessions = readJson(sessionsPath, []);
    const sessionIndex = sessions.findIndex((session) => session.session_id === sessionId);

    if (sessionIndex < 0) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    const session = sessions[sessionIndex];

    let profiles = readJson(profilesPath, {
      ru: getDefaultProfile('ru'),
      uk: getDefaultProfile('uk'),
      updated_ts: new Date().toISOString(),
    });

    profiles = {
      ...profiles,
      ru: ensureProfileShape(profiles.ru, 'ru'),
      uk: ensureProfileShape(profiles.uk, 'uk'),
    };

    const language = session.language === 'uk' ? 'uk' : 'ru';

    if (session.completed) {
      res.json({
        profile_updated_at: profiles.updated_ts || session.updated_at,
        profile: sanitizeProfile(profiles[language]),
        already_completed: true,
      });
      return;
    }

    const summary = normalizeSummary(body.summary || {});
    if (!summary.text_difficulty && session.difficulty_score) {
      summary.text_difficulty = Number(session.difficulty_score) || 25;
    }

    const endTs = typeof body.end_ts === 'string' ? body.end_ts : new Date().toISOString();

    session.end_ts = endTs;
    session.completed = Boolean(body.completed ?? true);
    session.summary = summary;
    session.updated_at = new Date().toISOString();

    sessions[sessionIndex] = session;
    writeJson(sessionsPath, sessions);

    const updatedProfile = updateProfileFromSummary(profiles[language], summary, endTs);
    profiles[language] = updatedProfile;
    profiles.updated_ts = new Date().toISOString();
    writeJson(profilesPath, profiles);

    res.json({
      profile_updated_at: profiles.updated_ts,
      profile: sanitizeProfile(updatedProfile),
      already_completed: false,
    });
  });

  app.get(`/${appName}/api/profile`, requireUkraineUnlock, (req, res) => {
    const language = req.query.language === 'uk' ? 'uk' : 'ru';
    const profiles = readJson(profilesPath, {
      ru: getDefaultProfile('ru'),
      uk: getDefaultProfile('uk'),
      updated_ts: new Date().toISOString(),
    });

    const shaped = ensureProfileShape(profiles[language], language);
    res.json(sanitizeProfile(shaped));
  });

  app.get(`/${appName}/api/recommendations`, requireUkraineUnlock, (req, res) => {
    const language = req.query.language === 'uk' ? 'uk' : 'ru';
    const profiles = readJson(profilesPath, {
      ru: getDefaultProfile('ru'),
      uk: getDefaultProfile('uk'),
      updated_ts: new Date().toISOString(),
    });

    const shaped = ensureProfileShape(profiles[language], language);
    res.json({ recommended: shaped.recommended });
  });

  app.get(`/${appName}/api/export/profile.json`, requireUkraineUnlock, (req, res) => {
    const profiles = readJson(profilesPath, {
      ru: getDefaultProfile('ru'),
      uk: getDefaultProfile('uk'),
      updated_ts: new Date().toISOString(),
    });

    const exportPayload = {
      ru: sanitizeProfile(ensureProfileShape(profiles.ru, 'ru')),
      uk: sanitizeProfile(ensureProfileShape(profiles.uk, 'uk')),
      updated_ts: profiles.updated_ts || new Date().toISOString(),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="profile.json"');
    res.send(JSON.stringify(exportPayload, null, 2));
  });
}

// List available apps at root
app.get('/', (req, res) => {
  const apps = fs.readdirSync(appsDir).filter((f) => {
    const appPath = join(appsDir, f);
    return fs.statSync(appPath).isDirectory() && fs.existsSync(join(appPath, 'dist'));
  });

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tim's Learning Apps</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
        ul { list-style: none; padding: 0; }
        li { margin: 10px 0; }
        a { color: #0066cc; text-decoration: none; font-size: 1.2em; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>🎓 Tim's Learning Apps</h1>
      <ul>
        ${apps.map((item) => `<li><a href="/${item}/">${item}</a></li>`).join('\n        ')}
      </ul>
    </body>
    </html>
  `);
});

// Serve each app's static files and handle their API routes
fs.readdirSync(appsDir).forEach((appName) => {
  const appPath = join(appsDir, appName);
  if (!fs.statSync(appPath).isDirectory()) return;

  const distPath = join(appPath, 'dist');
  const dataPath = join(appPath, 'data');

  // Ensure data directory exists
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }

  if (appName === UKRAINE_APP_NAME) {
    setupUkraineApiRoutes(appName, dataPath);
  } else {
    // Generic API routes for simple app data persistence
    app.get(`/${appName}/api/data/:file`, (req, res) => {
      const filePath = join(dataPath, `${req.params.file}.json`);
      if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
      } else {
        res.json({});
      }
    });

    app.post(`/${appName}/api/data/:file`, (req, res) => {
      const filePath = join(dataPath, `${req.params.file}.json`);
      fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    });
  }

  // Serve static files
  if (fs.existsSync(distPath)) {
    app.use(`/${appName}`, express.static(distPath));

    // SPA fallback
    app.get(`/${appName}/*`, (req, res) => {
      res.sendFile(join(distPath, 'index.html'));
    });
  }
});

app.listen(PORT, () => {
  const baseUrl = `http://localhost:${PORT}`;

  console.log(`🎓 Tim Learning Server running on port ${PORT}`);
  console.log(`📚 Apps directory: ${appsDir}`);
  console.log(`🌐 Home: ${baseUrl}/`);
  console.log(`📖 Ukraine: ${baseUrl}/ukraine/`);
});
