// Card picking for the "What city is this team in?" flashcards.
//
// There are no rounds: every card is a fresh weighted random draw from the
// teams in the current country filter, so a page refresh is a new random
// start. Teams Tim has missed more come up more often. Per-team results are
// kept in localStorage (see loadStats / saveStats) so the weighting carries
// over between visits.
//
// Everything here is pure except loadStats / saveStats / getStorage, and the
// random source is injectable so tests can seed it.

export const COUNTRY_FILTERS = ['All', 'Spain', 'Italy'];

export const STATS_KEY = 'soccer-teams:stats:v1';

// How many of the most recent results per team are kept for the weighting.
export const RECENT_WINDOW = 5;

// Weight tuning, see teamWeight().
export const UNSEEN_WEIGHT = 2;
export const BASE_WEIGHT = 1;
export const MISS_K = 3;
export const RECENT_MISS_BONUS = 1;
export const CONFIDENCE_ATTEMPTS = 3;

export function filterTeams(teams, country = 'All') {
  if (!country || country === 'All') return [...teams];

  return teams.filter((team) => team.country === country);
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

// How likely a team is to be drawn, relative to the others in the filter:
//
//   never seen:  UNSEEN_WEIGHT (2)
//   seen:        1 + K * missRate * confidence + recentMissBonus
//
//   missRate        = misses / results in the recent window (last 5 answers),
//                     so a run of "Got it" pushes an old miss out of the
//                     window and the team decays back to the base weight 1
//   confidence      = min(1, attempts / 3): one early miss is not yet trusted
//                     as much as three
//   recentMissBonus = 1 if the latest answer was "Missed it", else 0
//   K               = 3
//
// So a team that is always got right weighs 1 and one that is always missed
// weighs 1 + 3 + 1 = 5: about 5x as likely. Weights never drop below 1, so
// every team stays reachable.
export function teamWeight(stat) {
  if (!stat || !(stat.attempts > 0)) return UNSEEN_WEIGHT;

  const recent = Array.isArray(stat.recent) ? stat.recent : [];
  const missRate = recent.length > 0
    ? recent.filter((result) => result === 'm').length / recent.length
    : stat.misses / stat.attempts;
  const confidence = Math.min(1, stat.attempts / CONFIDENCE_ATTEMPTS);
  const recentMissBonus = recent.at(-1) === 'm' ? RECENT_MISS_BONUS : 0;

  return BASE_WEIGHT + MISS_K * missRate * confidence + recentMissBonus;
}

// Pick one team from `teams`, weighted by teamWeight(). `excludeSlug` (the card
// just shown) is skipped unless it is the only team, so the same crest never
// shows twice in a row.
export function drawTeam(teams, stats = {}, { excludeSlug = null, random = Math.random } = {}) {
  if (teams.length === 0) return null;

  const pool = teams.length > 1 && excludeSlug
    ? teams.filter((team) => team.slug !== excludeSlug)
    : teams;
  if (pool.length === 0) return teams[0];

  const weights = pool.map((team) => teamWeight(stats[team.slug]));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;

  for (let i = 0; i < pool.length; i += 1) {
    target -= weights[i];
    if (target < 0) return pool[i];
  }

  return pool[pool.length - 1];
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

// Returns a new stats object with one answer recorded. Per team:
//   { attempts, misses, gots, lastSeen, recent: ['g' | 'm', ...] (last 5) }
// `lastSeen` is a timestamp (ms) kept for reference; it does not affect weights.
export function recordResult(stats, slug, got, now = Date.now()) {
  const previous = stats[slug] ?? { attempts: 0, misses: 0, gots: 0, lastSeen: null, recent: [] };

  return {
    ...stats,
    [slug]: {
      attempts: previous.attempts + 1,
      misses: previous.misses + (got ? 0 : 1),
      gots: previous.gots + (got ? 1 : 0),
      lastSeen: now,
      recent: [...previous.recent, got ? 'g' : 'm'].slice(-RECENT_WINDOW),
    },
  };
}

const isCount = (value) => Number.isInteger(value) && value >= 0;

// Keeps only well-formed entries, so a hand-edited or half-written value can
// never break the weighting.
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
        ? stat.recent.filter((result) => result === 'g' || result === 'm').slice(-RECENT_WINDOW)
        : [],
    };
  }

  return clean;
}

// window.localStorage, or null when it is missing or blocked (private mode,
// disabled cookies, Node tests). Without storage the app still works; stats
// just live in memory for the visit.
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

export function loadStats(storage) {
  if (!storage) return {};

  try {
    const text = storage.getItem(STATS_KEY);
    return text ? sanitizeStats(JSON.parse(text)) : {};
  } catch {
    return {};
  }
}

// Returns true when the stats were written.
export function saveStats(storage, stats) {
  if (!storage) return false;

  try {
    storage.setItem(STATS_KEY, JSON.stringify(stats));
    return true;
  } catch {
    return false;
  }
}
