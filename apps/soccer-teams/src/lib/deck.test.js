import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RECENT_WINDOW,
  STATS_KEY,
  UNSEEN_WEIGHT,
  drawTeam,
  filterTeams,
  getStorage,
  loadStats,
  recordResult,
  sanitizeStats,
  saveStats,
  teamWeight,
} from './deck.js'
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

const slugs = (list) => list.map((team) => team.slug)

// A small seeded generator so draws are repeatable in tests.
function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

// Record a sequence of answers ('g' / 'm') for one team.
function play(stats, slug, answers) {
  return [...answers].reduce((acc, answer, i) => recordResult(acc, slug, answer === 'g', 1000 + i), stats)
}

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

test('unseen teams get a nonzero default weight', () => {
  assert.equal(teamWeight(undefined), UNSEEN_WEIGHT)
  assert.equal(teamWeight({ attempts: 0, misses: 0, gots: 0, recent: [] }), UNSEEN_WEIGHT)
  assert.ok(UNSEEN_WEIGHT > 0)
})

test('weight grows with miss rate and never drops below 1', () => {
  const rates = ['ggggg', 'mgggg', 'gmgmg', 'mmmgg', 'mmmmg', 'mmmmm']
  const weights = rates.map((answers) => teamWeight(play({}, 'x', answers).x))
  for (let i = 1; i < weights.length; i += 1) {
    assert.ok(weights[i] >= weights[i - 1], `weights not monotonic: ${weights}`)
  }
  assert.equal(weights[0], 1)
  assert.ok(weights.every((w) => w >= 1))
  // Always missed is about 5x as likely as always got.
  assert.equal(weights.at(-1) / weights[0], 5)
})

test('a run of Got it decays an old miss back to the base weight', () => {
  let stats = play({}, 'x', 'mmm')
  const high = teamWeight(stats.x)
  stats = play(stats, 'x', 'gg')
  const lower = teamWeight(stats.x)
  stats = play(stats, 'x', 'ggg')
  assert.ok(high > lower && lower > 1)
  assert.equal(teamWeight(stats.x), 1)
  assert.equal(stats.x.attempts, 8)
  assert.equal(stats.x.recent.length, RECENT_WINDOW)
})

test('recordResult counts answers without mutating its input', () => {
  const before = {}
  const after = recordResult(before, 'a', false, 42)
  assert.deepEqual(before, {})
  assert.deepEqual(after.a, { attempts: 1, misses: 1, gots: 0, lastSeen: 42, recent: ['m'] })
  const again = recordResult(after, 'a', true, 43)
  assert.deepEqual(again.a, { attempts: 2, misses: 1, gots: 1, lastSeen: 43, recent: ['m', 'g'] })
})

test('drawTeam never repeats the card just shown', () => {
  const random = seeded(11)
  let previous = null
  for (let i = 0; i < 500; i += 1) {
    const team = drawTeam(TEAMS, {}, { excludeSlug: previous, random })
    assert.notEqual(team.slug, previous)
    previous = team.slug
  }
  // Even when the previous card is heavily weighted.
  const stats = play({}, 'a', 'mmmmm')
  for (let seed = 1; seed < 200; seed += 1) {
    assert.notEqual(drawTeam(TEAMS, stats, { excludeSlug: 'a', random: seeded(seed) }).slug, 'a')
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
  const stats = play({}, 'a', 'mmmmm') // a Spanish team with a huge weight
  for (let i = 0; i < 300; i += 1) {
    assert.equal(drawTeam(italy, stats, { random }).country, 'Italy')
  }
})

test('high-miss teams are drawn clearly more often, but every team is drawn', () => {
  let stats = {}
  stats = play(stats, 'a', 'mmmmm') // always missed
  for (const slug of ['b', 'c', 'd', 'e', 'f', 'g']) stats = play(stats, slug, 'ggggg') // always got
  const counts = Object.fromEntries(TEAMS.map((team) => [team.slug, 0]))
  const random = seeded(2024)
  const draws = 11000
  for (let i = 0; i < draws; i += 1) counts[drawTeam(TEAMS, stats, { random }).slug] += 1
  // Expected: a = 5/11 of draws, each other team 1/11.
  assert.ok(counts.a > 4 * counts.b, `a=${counts.a} b=${counts.b}`)
  assert.ok(counts.a > draws * 0.4 && counts.a < draws * 0.5, `a=${counts.a}`)
  for (const slug of ['b', 'c', 'd', 'e', 'f', 'g']) {
    assert.ok(counts[slug] > draws * 0.07, `${slug} drawn only ${counts[slug]} times`)
  }
})

test('different seeds give different first cards (fresh draw per page load)', () => {
  const firsts = new Set()
  for (let seed = 1; seed <= 20; seed += 1) firsts.add(drawTeam(TEAMS, {}, { random: seeded(seed) }).slug)
  assert.ok(firsts.size > 3)
})

test('stats round-trip through storage', () => {
  const storage = memoryStorage()
  const stats = play(play({}, 'a', 'mg'), 'd', 'm')
  assert.equal(saveStats(storage, stats), true)
  assert.ok(storage.data.has(STATS_KEY))
  assert.deepEqual(loadStats(storage), stats)
})

test('corrupt or malformed stored stats fall back safely', () => {
  assert.deepEqual(loadStats(memoryStorage({ [STATS_KEY]: '{not json' })), {})
  assert.deepEqual(loadStats(memoryStorage({ [STATS_KEY]: '[1,2]' })), {})
  assert.deepEqual(loadStats(memoryStorage({ [STATS_KEY]: 'null' })), {})
  assert.deepEqual(loadStats(memoryStorage()), {})
  const mixed = JSON.stringify({
    good: { attempts: 2, misses: 1, gots: 1, lastSeen: 5, recent: ['m', 'g', 'x'] },
    negative: { attempts: -1, misses: 0, gots: -1, recent: [] },
    mismatched: { attempts: 3, misses: 1, gots: 1, recent: [] },
    text: 'hello',
    noRecent: { attempts: 1, misses: 1, gots: 0 },
  })
  const loaded = loadStats(memoryStorage({ [STATS_KEY]: mixed }))
  assert.deepEqual(Object.keys(loaded).sort(), ['good', 'noRecent'])
  assert.deepEqual(loaded.good.recent, ['m', 'g'])
  assert.deepEqual(loaded.noRecent, { attempts: 1, misses: 1, gots: 0, lastSeen: null, recent: [] })
  // A team with counts but no recent window still gets weighted by its totals.
  assert.ok(teamWeight(loaded.noRecent) > 1)
  assert.deepEqual(sanitizeStats(undefined), {})
})

test('blocked or missing storage falls back to in-memory', () => {
  const blocked = {
    getItem() { throw new Error('SecurityError') },
    setItem() { throw new Error('QuotaExceededError') },
    removeItem() { throw new Error('SecurityError') },
  }
  assert.deepEqual(loadStats(blocked), {})
  assert.equal(saveStats(blocked, { a: { attempts: 1 } }), false)
  assert.deepEqual(loadStats(null), {})
  assert.equal(saveStats(null, {}), false)

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
  // Drawing still works with no stats at all.
  assert.ok(drawTeam(TEAMS, loadStats(null), { random: seeded(3) }))
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
