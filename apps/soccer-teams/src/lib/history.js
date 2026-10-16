// Answer history for the soccer-teams quiz, shared by the browser and the
// server (server/index.js imports this file for POST /soccer-teams/api/stats/events).
//
// The source of truth is an append-only list of answer events, each with a
// globally unique id (device id + time + counter). Merging two histories is a
// union by id, so it never loses an answer, is idempotent (re-sending is
// harmless) and order-independent (two devices can sync in any order). The
// per-team stats used for weighting are always derived from the events.
//
// Pure: no I/O, no clock reads. Times are ISO strings in events/stats.

export const STATS_FILE_VERSION = 2;

// How many of the most recent results per team are kept in derived stats.
export const RECENT_HISTORY = 10;

// Upper bound on events accepted per POST (the client sends at most this many).
export const MAX_EVENTS_PER_REQUEST = 500;

const ID_PATTERN = /^[A-Za-z0-9:._-]{1,120}$/;
const SLUG_PATTERN = /^[a-z0-9-]{1,60}$/;
const MAX_COUNT = 1_000_000;

const isCount = (value) => Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Returns a clean copy of one event, or null if it is malformed.
//   answer:   { id, slug, at, got: boolean }
//   baseline: { id, slug, at, kind: 'baseline', attempts, misses, gots, recent }
//             (one-time import of the old per-browser localStorage stats)
export function sanitizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { id, slug } = raw;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) return null;
  const at = isoOrNull(raw.at);
  if (!at) return null;

  if (raw.kind === 'baseline') {
    const { attempts, misses, gots } = raw;
    if (!isCount(attempts) || !isCount(misses) || !isCount(gots) || misses + gots !== attempts) return null;
    const recent = Array.isArray(raw.recent)
      ? raw.recent.filter((r) => r === 'g' || r === 'm').slice(-RECENT_HISTORY)
      : [];
    return { id, slug, at, kind: 'baseline', attempts, misses, gots, recent };
  }

  if (typeof raw.got !== 'boolean') return null;
  return { id, slug, at, got: raw.got };
}

export function sanitizeEvents(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const event = sanitizeEvent(raw);
    if (event) out.push(event);
  }
  return out;
}

const byTimeThenId = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Union by id (first copy wins; events are immutable so copies are equal),
// sorted by time then id so every device derives the same stats.
export function mergeEvents(...lists) {
  const seen = new Map();
  for (const list of lists) {
    for (const event of sanitizeEvents(list)) {
      if (!seen.has(event.id)) seen.set(event.id, event);
    }
  }
  return [...seen.values()].sort(byTimeThenId);
}

function emptyStat(slug) {
  return {
    slug,
    attempts: 0,
    misses: 0,
    gots: 0,
    lastSeenAt: null,
    lastWrongAt: null,
    lastGotAt: null,
    recent: [],
    streak: 0,
  };
}

const trailingGots = (recent) => {
  let n = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i] === 'g'; i -= 1) n += 1;
  return n;
};

// Per-team stats from the events:
//   { slug, attempts, misses, gots, lastSeenAt, lastWrongAt, lastGotAt,
//     recent: ['g'|'m', ...] (last 10), streak (consecutive "Got it" since the last miss) }
export function deriveStats(events) {
  const stats = {};
  for (const event of mergeEvents(events)) {
    const stat = stats[event.slug] ?? emptyStat(event.slug);
    stats[event.slug] = stat;

    if (event.kind === 'baseline') {
      stat.attempts += event.attempts;
      stat.misses += event.misses;
      stat.gots += event.gots;
      stat.recent = [...stat.recent, ...event.recent].slice(-RECENT_HISTORY);
      if (event.attempts > 0) stat.lastSeenAt = event.at;
      const last = event.recent.at(-1);
      if (last === 'm') stat.lastWrongAt = event.at;
      if (last === 'g') stat.lastGotAt = event.at;
      // Old stats only kept the last 5 answers; a streak can't be longer than that.
      stat.streak = event.recent.length > 0 ? trailingGots(event.recent) : stat.streak;
      continue;
    }

    stat.attempts += 1;
    stat.lastSeenAt = event.at;
    stat.recent = [...stat.recent, event.got ? 'g' : 'm'].slice(-RECENT_HISTORY);
    if (event.got) {
      stat.gots += 1;
      stat.lastGotAt = event.at;
      stat.streak += 1;
    } else {
      stat.misses += 1;
      stat.lastWrongAt = event.at;
      stat.streak = 0;
    }
  }
  return stats;
}

// The on-disk / over-the-wire file: events are the truth, `teams` is a
// derived, human-readable copy.
export function buildStatsFile(events, now = new Date()) {
  const merged = mergeEvents(events);
  return {
    version: STATS_FILE_VERSION,
    updatedAt: new Date(now).toISOString(),
    teams: deriveStats(merged),
    events: merged,
  };
}

// Events from whatever the server returned ({} for a missing file).
export function eventsFromFile(file) {
  return file && typeof file === 'object' ? sanitizeEvents(file.events) : [];
}
