import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MIN_WEIGHT,
  REVIEW_INTERVALS_MS,
  STATS_KEY,
  UNSEEN_WEIGHT,
  drawTeam,
  filterTeams,
  getStorage,
  loadLegacyStats,
  reviewState,
  sanitizeStats,
  teamWeight,
} from './deck.js'
import { deriveStats } from './history.js'
import { formatPopulation, initials, sourceLabel } from './format.js'

const TEAMS = [
  { slug: 'a', country: 'Spain' },
  { slug: 'b', country: 'Spain' },
  { slug: 'c', country: 'Spain' },
  { slug: 'd', country: 'Italy' },
  { slug: 'e', country: 'Italy' },
  { slug: 'f', country: 'Italy' },
  { slug: 'g', country: 'Italy' },
]

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const T0 = Date.parse('2026-10-01T12:00:00Z')

const slugs = (list) => list.map((team) => team.slug)

// A small seeded generator so draws are repeatable in tests.
function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

// Answer events for one team ('g' / 'm'), one minute apart from `start`.
function answers(slug, results, start = T0, step = MIN) {
  return [...results].map((r, i) => ({
    id: `t-${slug}-${start + i * step}-${i}`,
    slug,
    at: new Date(start + i * step).toISOString(),
    got: r === 'g',
  }))
}

const statOf = (slug, results, start, step) => deriveStats(answers(slug, results, start, step))[slug]

// In-memory stand-in for window.localStorage.
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
    removeItem: (key) => { data.delete(key) },
    data,
  }
}

test('filter by country', () => {
  assert.deepEqual(slugs(filterTeams(TEAMS, 'Spain')), ['a', 'b', 'c'])
  assert.deepEqual(slugs(filterTeams(TEAMS, 'Italy')), ['d', 'e', 'f', 'g'])
  assert.equal(filterTeams(TEAMS, 'All').length, TEAMS.length)
})

test('unseen teams get a healthy nonzero default weight', () => {
  assert.equal(teamWeight(undefined, T0), UNSEEN_WEIGHT)
  assert.equal(teamWeight({ attempts: 0, misses: 0, gots: 0, recent: [] }, T0), UNSEEN_WEIGHT)
  assert.ok(UNSEEN_WEIGHT > 1)
})

test('weight grows with miss rate (same timing) and stays above zero', () => {
  const later = T0 + 30 * DAY // everything long overdue, old misses faded
  const rates = ['ggggg', 'mgggg', 'gmgmg', 'mmmgg', 'mmmmg', 'mmmmm']
  const weights = rates.map((r) => teamWeight(statOf('x', r), later))
  for (let i = 1; i < weights.length; i += 1) {
    assert.ok(weights[i] >= weights[i - 1], `weights not monotonic: ${weights}`)
  }
  assert.ok(weights.at(-1) > 3 * weights[0])
  assert.ok(weights.every((w) => w >= MIN_WEIGHT))
})

test('just missed > due > not yet due, all above zero', () => {
  const now = T0 + 10 * DAY
  const justMissed = statOf('a', 'm', now - MIN)
  const due = statOf('b', 'g', now - 2 * DAY) // got once, 1-day interval, 1 day overdue
  const notDue = statOf('c', 'g', now - HOUR) // got once an hour ago
  const [wm, wd, wn] = [justMissed, due, notDue].map((s) => teamWeight(s, now))
  assert.ok(wm > wd && wd > wn && wn > 0, `${wm} ${wd} ${wn}`)
  assert.ok(wn < UNSEEN_WEIGHT && wd < UNSEEN_WEIGHT * 2)
})

test('a recent miss boost decays over hours and days', () => {
  const stat = statOf('a', 'gm', T0)
  const w = [1, 12, 24, 72, 240].map((h) => teamWeight(stat, T0 + h * HOUR))
  for (let i = 1; i < w.length; i += 1) assert.ok(w[i] < w[i - 1], `not decaying: ${w}`)
  assert.ok(w[0] - w.at(-1) > 3, `boost too small: ${w}`)
})

test('overdue weight grows with how overdue, up to a cap', () => {
  const stat = statOf('a', 'mggg', T0) // streak 3 -> 7-day interval
  const { dueAt, intervalMs } = reviewState(stat, T0)
  assert.equal(intervalMs, 7 * DAY)
  const before = teamWeight(stat, dueAt - HOUR)
  const at = teamWeight(stat, dueAt + 1)
  const week = teamWeight(stat, dueAt + 7 * DAY)
  const month = teamWeight(stat, dueAt + 21 * DAY)
  assert.ok(before < at && at < week && week < month, `${before} ${at} ${week} ${month}`)
  assert.equal(teamWeight(stat, dueAt + 100 * DAY), teamWeight(stat, dueAt + 200 * DAY))
})

test('review interval grows with the Got it streak and resets on a miss', () => {
  const intervals = ['m', 'mg', 'mgg', 'mggg', 'mgggg', 'mggggg'].map((r) => reviewState(statOf('a', r), T0).intervalMs)
  assert.deepEqual(intervals, [10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY, 21 * DAY])
  assert.deepEqual(REVIEW_INTERVALS_MS, [10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY])
  const reset = statOf('a', 'mggggm')
  assert.equal(reset.streak, 0)
  assert.equal(reviewState(reset, T0).intervalMs, 10 * MIN)
  // Due date counts from the last answer.
  const last = T0 + 5 * MIN
  assert.equal(reviewState(reset, T0).dueAt, last + 10 * MIN)
})

test('drawTeam never repeats the card just shown', () => {
  const random = seeded(11)
  let previous = null
  for (let i = 0; i < 500; i += 1) {
    const team = drawTeam(TEAMS, {}, { excludeSlug: previous, random, now: T0 })
    assert.notEqual(team.slug, previous)
    previous = team.slug
  }
  // Even when the previous card is heavily weighted (just missed).
  const stats = deriveStats(answers('a', 'mmmmm', T0))
  for (let seed = 1; seed < 200; seed += 1) {
    assert.notEqual(drawTeam(TEAMS, stats, { excludeSlug: 'a', random: seeded(seed), now: T0 + 10 * MIN }).slug, 'a')
  }
})

test('a one-team filter keeps showing that team', () => {
  const only = [TEAMS[0]]
  assert.equal(drawTeam(only, {}, { excludeSlug: 'a', random: seeded(1) }).slug, 'a')
  assert.equal(drawTeam([], {}), null)
})

test('drawTeam respects the country filter', () => {
  const random = seeded(5)
  const italy = filterTeams(TEAMS, 'Italy')
  const stats = deriveStats(answers('a', 'mmmmm', T0)) // a Spanish team with a huge weight
  for (let i = 0; i < 300; i += 1) {
    assert.equal(drawTeam(italy, stats, { random, now: T0 + HOUR }).country, 'Italy')
  }
})

test('a just-missed team is drawn clearly more often, but every team is drawn', () => {
  const now = T0 + 2 * HOUR
  const events = [
    ...answers('a', 'mm', now - 90 * MIN), // missed twice, last 89 min ago: due and boosted
    ...['b', 'c', 'd', 'e', 'f', 'g'].flatMap((slug) => answers(slug, 'g', now - HOUR)), // got, not due
  ]
  const stats = deriveStats(events)
  const counts = Object.fromEntries(TEAMS.map((team) => [team.slug, 0]))
  const random = seeded(2024)
  const draws = 10000
  for (let i = 0; i < draws; i += 1) counts[drawTeam(TEAMS, stats, { random, now }).slug] += 1
  assert.ok(counts.a > draws * 0.6, `a=${counts.a}`)
  for (const slug of ['b', 'c', 'd', 'e', 'f', 'g']) {
    assert.ok(counts[slug] > draws * 0.02, `${slug} drawn only ${counts[slug]} times`)
  }
})

test('different seeds give different first cards (fresh draw per page load)', () => {
  const firsts = new Set()
  for (let seed = 1; seed <= 20; seed += 1) firsts.add(drawTeam(TEAMS, {}, { random: seeded(seed) }).slug)
  assert.ok(firsts.size > 3)
})

test('legacy v1 stats: corrupt or malformed values fall back safely', () => {
  assert.deepEqual(loadLegacyStats(memoryStorage({ [STATS_KEY]: '{not json' })), {})
  assert.deepEqual(loadLegacyStats(memoryStorage({ [STATS_KEY]: '[1,2]' })), {})
  assert.deepEqual(loadLegacyStats(memoryStorage({ [STATS_KEY]: 'null' })), {})
  assert.deepEqual(loadLegacyStats(memoryStorage()), {})
  assert.deepEqual(loadLegacyStats(null), {})
  const mixed = JSON.stringify({
    good: { attempts: 2, misses: 1, gots: 1, lastSeen: 5, recent: ['m', 'g', 'x'] },
    negative: { attempts: -1, misses: 0, gots: -1, recent: [] },
    mismatched: { attempts: 3, misses: 1, gots: 1, recent: [] },
    text: 'hello',
    noRecent: { attempts: 1, misses: 1, gots: 0 },
  })
  const loaded = loadLegacyStats(memoryStorage({ [STATS_KEY]: mixed }))
  assert.deepEqual(Object.keys(loaded).sort(), ['good', 'noRecent'])
  assert.deepEqual(loaded.good.recent, ['m', 'g'])
  assert.deepEqual(loaded.noRecent, { attempts: 1, misses: 1, gots: 0, lastSeen: null, recent: [] })
  assert.deepEqual(sanitizeStats(undefined), {})
})

test('blocked or missing storage is detected', () => {
  const blocked = {
    getItem() { throw new Error('SecurityError') },
    setItem() { throw new Error('QuotaExceededError') },
    removeItem() { throw new Error('SecurityError') },
  }
  assert.deepEqual(loadLegacyStats(blocked), {})

  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
    assert.equal(getStorage(), null)
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: blocked })
    assert.equal(getStorage(), null)
    const ok = memoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: ok })
    assert.equal(getStorage(), ok)
    assert.equal(ok.data.size, 0, 'probe key is cleaned up')
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
  assert.ok(drawTeam(TEAMS, {}, { random: seeded(3) }))
})

test('formatPopulation rounds sensibly', () => {
  assert.equal(formatPopulation(3506730), '3.5 million')
  assert.equal(formatPopulation(1731649), '1.7 million')
  assert.equal(formatPopulation(1999999), '2 million')
  assert.equal(formatPopulation(999600), '1 million')
  assert.equal(formatPopulation(845700), '846,000')
  assert.equal(formatPopulation(92237), '92,000')
  assert.equal(formatPopulation(8_449), '8,400')
  assert.equal(formatPopulation(0), '')
})

test('initials and source labels', () => {
  assert.equal(initials('Real Sociedad'), 'RS')
  assert.equal(initials('Atalanta'), 'A')
  assert.equal(initials('Deportivo de La Coruña'), 'DL')
  assert.equal(sourceLabel('INE Padrón municipal, 1 Jan 2025 (via Wikidata Q2807 P1082)'), 'INE Padrón municipal, 1 Jan 2025')
  assert.equal(sourceLabel('ISTAT resident population, 1 Jan 2025 (POSAS, comune 016024)'), 'ISTAT resident population, 1 Jan 2025')
})
