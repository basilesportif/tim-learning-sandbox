// Card picking for the "What city is this team in?" flashcards.
//
// There are no rounds: every card is drawn from the teams in the current
// country filter. Each team has a due time computed from its stats (see
// reviewState() and DATA.md):
//
//   - never answered:                     due now
//   - never missed, got it right N times: due 30 / 60 / 90 days after the last answer
//   - missed at least once:               ladder by "Got it" streak since the last
//                                         miss: 10 min, 1, 3, 7, 21, 30, 60, 90 days
//
// If any team is due, the card is a weighted random draw from the due teams
// only (missed and overdue teams weigh more). If nothing is due, the team
// that is due soonest comes up. The card just shown is never repeated while
// another team is available. Per-team stats come from the answer history in
// lib/history.js, synced to the server by lib/sync.js.
//
// Everything here is pure except getStorage / loadLegacyStats; the random
// source and the clock are injectable so tests can pin them.

export const COUNTRY_FILTERS = ['All', 'Spain', 'Italy'];

// The pre-server localStorage stats (v1). Only read now, as a one-time
// migration source (see lib/sync.js).
export const STATS_KEY = 'soccer-teams:stats:v1';
export const LEGACY_RECENT_WINDOW = 5;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Never missed: interval by number of correct answers (1 -> 30 days,
// 2 -> 60 days, 3+ -> 90 days).
export const NEVER_MISSED_INTERVALS_MS = [30 * DAY, 60 * DAY, 90 * DAY];

// Missed at least once: interval by streak (consecutive "Got it" since the
// last miss). 0 (just missed) 10 min, then 1, 3, 7, 21 days, then graduated
// to 30, 60 and 90 days (cap).
export const MISSED_INTERVALS_MS = [
  10 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY, 30 * DAY, 60 * DAY, 90 * DAY,
];

// Weights among due teams, see teamWeight() and DATA.md.
export const UNSEEN_WEIGHT = 2;
export const NEVER_MISSED_WEIGHT = 1;
export const MISSED_WEIGHT = 2;
export const OVERDUE_CAP = 2; // in intervals
export const RECENT_MISS_BOOST = 4;
export const RECENT_MISS_HALF_LIFE_HOURS = 12;

export function filterTeams(teams, country = 'All') {
  if (!country || country === 'All') return [...teams];

  return teams.filter((team) => team.country === country);
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

const toMs = (iso) => (iso ? Date.parse(iso) : NaN);
const pickInterval = (list, index) => list[Math.max(0, Math.min(index, list.length - 1))];

const trailingGots = (recent) => {
  let n = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i] === 'g'; i -= 1) n += 1;
  return n;
};

// The "Got it" streak since the last miss. lib/history.js derives it from the
// events; if it is missing (hand-edited data), fall back to the trailing
// "Got it"s in `recent`.
function streakOf(stat) {
  if (Number.isInteger(stat.streak) && stat.streak >= 0) return stat.streak;
  return Array.isArray(stat.recent) ? trailingGots(stat.recent) : 0;
}

// When a team is next due, from its stats alone (nothing is stored):
//   { kind: 'unseen' | 'never-missed' | 'missed', intervalMs, dueAt, overdue, due }
// dueAt is ms (-Infinity for unseen teams or a team without a usable time);
// overdue = (now - dueAt) / interval, negative = not due yet.
export function reviewState(stat, now = Date.now()) {
  if (!stat || !(stat.attempts > 0)) {
    return { kind: 'unseen', intervalMs: 0, dueAt: -Infinity, overdue: 0, due: true };
  }

  let kind;
  let intervalMs;
  let last;
  if (!(stat.misses > 0)) {
    kind = 'never-missed';
    intervalMs = pickInterval(NEVER_MISSED_INTERVALS_MS, (stat.gots || 1) - 1);
    last = toMs(stat.lastGotAt);
    if (!Number.isFinite(last)) last = toMs(stat.lastSeenAt);
  } else {
    kind = 'missed';
    intervalMs = pickInterval(MISSED_INTERVALS_MS, streakOf(stat));
    last = toMs(stat.lastSeenAt);
  }

  if (!Number.isFinite(last)) return { kind, intervalMs, dueAt: -Infinity, overdue: 0, due: true };
  const dueAt = last + intervalMs;
  return { kind, intervalMs, dueAt, overdue: (now - dueAt) / intervalMs, due: dueAt <= now };
}

// Relative weight of a team that is due (only due teams are drawn at random):
//
//   unseen:        2
//   never missed:  1 + min(overdue, 2)
//   missed:        2 + min(overdue, 2) + 4 * 0.5 ^ (hours since last miss / 12)
//
// overdue is in intervals (1 = one whole interval past the due time).
export function teamWeight(stat, now = Date.now()) {
  const state = reviewState(stat, now);
  if (state.kind === 'unseen') return UNSEEN_WEIGHT;

  const overdue = Math.min(Math.max(0, state.overdue), OVERDUE_CAP);
  if (state.kind === 'never-missed') return NEVER_MISSED_WEIGHT + overdue;

  const lastWrong = toMs(stat.lastWrongAt);
  const hoursSinceMiss = Number.isFinite(lastWrong) ? Math.max(0, now - lastWrong) / HOUR : Infinity;
  const recentMiss = RECENT_MISS_BOOST * 0.5 ** (hoursSinceMiss / RECENT_MISS_HALF_LIFE_HOURS);
  return MISSED_WEIGHT + overdue + recentMiss;
}

// The teams that may be drawn: all of `teams` except `excludeSlug` (the card
// just shown), unless that would leave nothing.
function candidatesOf(teams, excludeSlug) {
  if (!excludeSlug || teams.length < 2) return teams;
  const pool = teams.filter((team) => team.slug !== excludeSlug);
  return pool.length > 0 ? pool : teams;
}

// Pick the next card from `teams`:
//   - some candidate due: weighted random draw (teamWeight) among the due ones only
//   - nothing due: the candidate due soonest (ties: random)
// `excludeSlug` (the card just shown) is skipped unless it is the only team.
export function drawTeam(teams, stats = {}, { excludeSlug = null, random = Math.random, now = Date.now() } = {}) {
  if (teams.length === 0) return null;

  const pool = candidatesOf(teams, excludeSlug).map((team) => ({ team, state: reviewState(stats[team.slug], now) }));
  const due = pool.filter((entry) => entry.state.due);

  if (due.length === 0) {
    const soonest = Math.min(...pool.map((entry) => entry.state.dueAt));
    const tied = pool.filter((entry) => entry.state.dueAt === soonest);
    return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))].team;
  }

  const weights = due.map((entry) => teamWeight(stats[entry.team.slug], now));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;

  for (let i = 0; i < due.length; i += 1) {
    target -= weights[i];
    if (target < 0) return due[i].team;
  }

  return due[due.length - 1].team;
}

// null if some team in `teams` is due now, otherwise the earliest due time
// (ms). The UI uses it for the "All caught up" note.
export function nextDueAt(teams, stats = {}, now = Date.now()) {
  if (teams.length === 0) return null;
  let soonest = Infinity;
  for (const team of teams) {
    const state = reviewState(stats[team.slug], now);
    if (state.due) return null;
    soonest = Math.min(soonest, state.dueAt);
  }
  return soonest;
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
