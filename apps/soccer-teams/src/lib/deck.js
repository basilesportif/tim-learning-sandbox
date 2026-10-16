// Card picking for the "What city is this team in?" flashcards.
//
// There are no rounds: every card is a fresh weighted random draw from the
// teams in the current country filter, so a page refresh is a new random
// start. Teams Tim has missed (especially recently) and teams due for review
// come up more often. Per-team stats come from the answer history in
// lib/history.js, synced to the server by lib/sync.js.
//
// Everything here is pure except getStorage / loadLegacyStats; the random
// source and the clock are injectable so tests can pin them.

export const COUNTRY_FILTERS = ['All', 'Spain', 'Italy'];

// The pre-server localStorage stats (v1). Only read now, as a one-time
// migration source (see lib/sync.js).
export const STATS_KEY = 'soccer-teams:stats:v1';
export const LEGACY_RECENT_WINDOW = 5;

// Weight tuning, see teamWeight() and DATA.md.
export const UNSEEN_WEIGHT = 2;
export const BASE_WEIGHT = 1;
export const MISS_K = 3;
export const MISS_RATE_WINDOW = 5;
export const CONFIDENCE_ATTEMPTS = 3;
export const RECENT_MISS_BOOST = 4;
export const RECENT_MISS_HALF_LIFE_HOURS = 12;
export const NOT_DUE_FACTOR = 0.5;
export const DUE_FACTOR = 1.5;
export const OVERDUE_SLOPE = 0.5;
export const OVERDUE_CAP = 4;
export const MIN_WEIGHT = 0.25;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Review interval by streak (consecutive "Got it" since the last miss):
// 0 (just missed) 10 min, 1 -> 1 day, 2 -> 3 days, 3 -> 7 days, 4+ -> 21 days.
export const REVIEW_INTERVALS_MS = [10 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY];

export function filterTeams(teams, country = 'All') {
  if (!country || country === 'All') return [...teams];

  return teams.filter((team) => team.country === country);
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const toMs = (iso) => (iso ? Date.parse(iso) : NaN);

// When a seen team is next due for review, and how overdue it is
// (overdue = (now - dueAt) / interval; negative = not yet due).
export function reviewState(stat, now = Date.now()) {
  const streak = Math.max(0, stat?.streak ?? 0);
  const intervalMs = REVIEW_INTERVALS_MS[Math.min(streak, REVIEW_INTERVALS_MS.length - 1)];
  const lastSeen = toMs(stat?.lastSeenAt);
  if (!Number.isFinite(lastSeen)) return { intervalMs, dueAt: null, overdue: 0 };
  const dueAt = lastSeen + intervalMs;
  return { intervalMs, dueAt, overdue: (now - dueAt) / intervalMs };
}

// How likely a team is to be drawn, relative to the others in the filter:
//
//   never seen: UNSEEN_WEIGHT (2)
//   seen:       max(0.25, base * schedule + recentMiss)
//
//   base       = 1 + 3 * missRate * confidence
//                missRate over the last 5 answers, confidence = min(1, attempts / 3)
//   schedule   = 0.5 if not yet due, else 1.5 + 0.5 * min(overdue, 4)
//                (due date = last answer + interval for the current streak)
//   recentMiss = 4 * 0.5 ^ (hours since last miss / 12)
//
// See DATA.md for worked numbers.
export function teamWeight(stat, now = Date.now()) {
  if (!stat || !(stat.attempts > 0)) return UNSEEN_WEIGHT;

  const recent = Array.isArray(stat.recent) ? stat.recent.slice(-MISS_RATE_WINDOW) : [];
  const missRate = recent.length > 0
    ? recent.filter((result) => result === 'm').length / recent.length
    : stat.misses / stat.attempts;
  const confidence = Math.min(1, stat.attempts / CONFIDENCE_ATTEMPTS);
  const base = BASE_WEIGHT + MISS_K * missRate * confidence;

  const { overdue } = reviewState(stat, now);
  const schedule = overdue < 0 ? NOT_DUE_FACTOR : DUE_FACTOR + OVERDUE_SLOPE * Math.min(overdue, OVERDUE_CAP);

  const lastWrong = toMs(stat.lastWrongAt);
  const hoursSinceMiss = Number.isFinite(lastWrong) ? Math.max(0, now - lastWrong) / HOUR : Infinity;
  const recentMiss = RECENT_MISS_BOOST * 0.5 ** (hoursSinceMiss / RECENT_MISS_HALF_LIFE_HOURS);

  return Math.max(MIN_WEIGHT, base * schedule + recentMiss);
}

// Pick one team from `teams`, weighted by teamWeight(). `excludeSlug` (the card
// just shown) is skipped unless it is the only team, so the same crest never
// shows twice in a row.
export function drawTeam(teams, stats = {}, { excludeSlug = null, random = Math.random, now = Date.now() } = {}) {
  if (teams.length === 0) return null;

  const pool = teams.length > 1 && excludeSlug
    ? teams.filter((team) => team.slug !== excludeSlug)
    : teams;
  if (pool.length === 0) return teams[0];

  const weights = pool.map((team) => teamWeight(stats[team.slug], now));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;

  for (let i = 0; i < pool.length; i += 1) {
    target -= weights[i];
    if (target < 0) return pool[i];
  }

  return pool[pool.length - 1];
}

// ---------------------------------------------------------------------------
// Legacy (v1) localStorage stats, read once for migration
// ---------------------------------------------------------------------------

const isCount = (value) => Number.isInteger(value) && value >= 0;

// v1 shape: { slug: { attempts, misses, gots, lastSeen (ms), recent: ['g'|'m'] (last 5) } }.
// Keeps only well-formed entries.
export function sanitizeStats(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const clean = {};

  for (const [slug, stat] of Object.entries(raw)) {
    if (!stat || typeof stat !== 'object') continue;
    const { attempts, misses, gots } = stat;
    if (!isCount(attempts) || !isCount(misses) || !isCount(gots) || misses + gots !== attempts) continue;

    clean[slug] = {
      attempts,
      misses,
      gots,
      lastSeen: Number.isFinite(stat.lastSeen) ? stat.lastSeen : null,
      recent: Array.isArray(stat.recent)
        ? stat.recent.filter((result) => result === 'g' || result === 'm').slice(-LEGACY_RECENT_WINDOW)
        : [],
    };
  }

  return clean;
}

// window.localStorage, or null when it is missing or blocked (private mode,
// disabled cookies, Node tests). Without storage the app still works; stats
// just live in memory (and on the server) for the visit.
export function getStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = `${STATS_KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function loadLegacyStats(storage) {
  if (!storage) return {};

  try {
    const text = storage.getItem(STATS_KEY);
    return text ? sanitizeStats(JSON.parse(text)) : {};
  } catch {
    return {};
  }
}
