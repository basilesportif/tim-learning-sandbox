import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MISSED_INTERVALS_MS,
  MISSED_WEIGHT,
  NEVER_MISSED_INTERVALS_MS,
  NEVER_MISSED_WEIGHT,
  OVERDUE_CAP,
  RECENT_MISS_BOOST,
  STATS_KEY,
  UNSEEN_WEIGHT,
  drawTeam,
  filterTeams,
  getStorage,
  loadLegacyStats,
  nextDueAt,
  reviewState,
  sanitizeStats,
  teamWeight,
} from './deck.js'
import { deriveStats } from './history.js'
import { formatPopulation, formatWait, initials, sourceLabel } from './format.js'

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

// Never missed, got it right `n` times; the last answer at `last`.
const knownStats = (slugList, last, results = 'g') =>
  deriveStats(slugList.flatMap((slug) => answers(slug, results, last - (results.length - 1) * MIN)))

function countDraws(teams, stats, { now, draws = 5000, seed = 2024, excludeSlug = null } = {}) {
  const counts = Object.fromEntries(teams.map((team) => [team.slug, 0]))
  const random = seeded(seed)
  for (let i = 0; i < draws; i += 1) counts[drawTeam(teams, stats, { random, now, excludeSlug }).slug] += 1
  return counts
}

test('interval tables', () => {
  assert.deepEqual(NEVER_MISSED_INTERVALS_MS, [30 * DAY, 60 * DAY, 90 * DAY])
  assert.deepEqual(MISSED_INTERVALS_MS, [10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY, 30 * DAY, 60 * DAY, 90 * DAY])
})

test('unseen teams are due now with a nonzero weight', () => {
  for (const stat of [undefined, { attempts: 0, misses: 0, gots: 0, recent: [] }]) {
    const state = reviewState(stat, T0)
    assert.equal(state.kind, 'unseen')
    assert.equal(state.due, true)
    assert.equal(teamWeight(stat, T0), UNSEEN_WEIGHT)
  }
  assert.equal(nextDueAt(TEAMS, {}, T0), null)
})

test('first-try correct: due in 30 days, never drawn while others are due', () => {
  const stat = statOf('a', 'g', T0)
  const state = reviewState(stat, T0)
  assert.equal(state.kind, 'never-missed')
  assert.equal(state.dueAt, T0 + 30 * DAY)
  assert.equal(reviewState(stat, T0 + 30 * DAY - 1).due, false)
  assert.equal(reviewState(stat, T0 + 30 * DAY).due, true)

  // b..g unseen (due); a is never drawn, even 29 days later.
  for (const now of [T0 + MIN, T0 + 29 * DAY]) {
    const counts = countDraws(TEAMS, { a: stat }, { now, draws: 2000 })
    assert.equal(counts.a, 0)
  }
})

test('never missed: second correct -> 60 days, third and later -> 90 days', () => {
  const last = T0 + 40 * DAY
  const two = deriveStats([...answers('a', 'g', T0), ...answers('a', 'g', last)]).a
  assert.equal(reviewState(two, last).intervalMs, 60 * DAY)
  assert.equal(reviewState(two, last).dueAt, last + 60 * DAY)
  assert.equal(reviewState(statOf('a', 'ggg', T0), T0).intervalMs, 90 * DAY)
  assert.equal(reviewState(statOf('a', 'gggggg', T0), T0).intervalMs, 90 * DAY)
})

test('existing stats are scheduled retroactively: never missed = due lastGotAt + 30 days, not unseen', () => {
  // A stats.json "teams" entry as written before this change (no new fields).
  const old = {
    slug: 'a', attempts: 1, misses: 0, gots: 1,
    lastSeenAt: '2026-10-16T19:00:00.000Z', lastWrongAt: null, lastGotAt: '2026-10-16T19:00:00.000Z',
    recent: ['g'], streak: 1,
  }
  const state = reviewState(old, Date.parse('2026-10-16T20:00:00Z'))
  assert.equal(state.kind, 'never-missed')
  assert.equal(state.due, false)
  assert.equal(state.dueAt, Date.parse('2026-10-16T19:00:00Z') + 30 * DAY)

  // A v1 baseline import (3 gots, never missed) counts too: 3 correct -> 90 days.
  const baseline = deriveStats([{
    id: 'baseline-dev-a', kind: 'baseline', slug: 'a', at: new Date(T0).toISOString(),
    attempts: 3, misses: 0, gots: 3, recent: ['g', 'g', 'g'],
  }]).a
  assert.equal(reviewState(baseline, T0).dueAt, T0 + 90 * DAY)
  // A missed team without a streak field falls back to the trailing "Got it"s in recent.
  const noStreak = { attempts: 3, misses: 1, gots: 2, lastSeenAt: new Date(T0).toISOString(), recent: ['m', 'g', 'g'] }
  assert.equal(reviewState(noStreak, T0).intervalMs, 3 * DAY)
})

test('missed ladder: 10 min, 1, 3, 7, 21 days, then graduates to 30, 60, 90 days', () => {
  const ladders = ['m', 'mg', 'mgg', 'mggg', 'mgggg', 'mggggg', 'mgggggg', 'mggggggg', 'mggggggggg']
    .map((r) => reviewState(statOf('a', r), T0).intervalMs)
  assert.deepEqual(ladders, [10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY, 30 * DAY, 60 * DAY, 90 * DAY, 90 * DAY])
  // A miss later on, even after graduating, also counts (a missed team never goes
  // back to the never-missed table).
  assert.equal(reviewState(statOf('a', 'gggm'), T0).kind, 'missed')
})

test('a miss resets the ladder to 10 minutes after the last answer', () => {
  const reset = statOf('a', 'mggggggm') // last answer at T0 + 7 min
  assert.equal(reset.streak, 0)
  const state = reviewState(reset, T0)
  assert.equal(state.intervalMs, 10 * MIN)
  assert.equal(state.dueAt, T0 + 7 * MIN + 10 * MIN)
  // Never missed until now: the first miss also starts at 10 minutes.
  assert.equal(reviewState(statOf('a', 'gggm'), T0).dueAt, T0 + 3 * MIN + 10 * MIN)
})

test('weights: missed teams outweigh unseen and never-missed ones, overdue adds up to a cap', () => {
  const now = T0 + 200 * DAY
  const known = statOf('a', 'g', now - 31 * DAY) // just past due
  const knownLate = statOf('a', 'g', now - 150 * DAY) // far overdue
  const missedLongAgo = statOf('b', 'm', now - 100 * DAY)
  const missedRecently = statOf('b', 'm', now - HOUR)
  const w = (s) => teamWeight(s, now)
  assert.ok(w(known) >= NEVER_MISSED_WEIGHT && w(known) < UNSEEN_WEIGHT, `${w(known)}`)
  assert.equal(w(knownLate), NEVER_MISSED_WEIGHT + OVERDUE_CAP)
  assert.ok(w(missedLongAgo) > w(knownLate) - 1e-9 && w(missedLongAgo) >= MISSED_WEIGHT + OVERDUE_CAP - 1e-9)
  assert.ok(w(missedRecently) > w(missedLongAgo) + 3)
  assert.ok(w(missedRecently) > UNSEEN_WEIGHT * 3)
  // The recent-miss boost decays: 4 just after, 2 at 12 h, 1 at 1 day.
  const s = statOf('c', 'm', T0)
  const boost = (h) => teamWeight(s, T0 + h * HOUR) - MISSED_WEIGHT - OVERDUE_CAP
  assert.ok(Math.abs(boost(12) - RECENT_MISS_BOOST / 2) < 1e-9)
  assert.ok(Math.abs(boost(24) - RECENT_MISS_BOOST / 4) < 1e-9)
})

test('missed teams dominate draws', () => {
  const now = T0 + 2 * HOUR
  const stats = deriveStats([
    ...answers('a', 'mm', now - 90 * MIN), // missed, due (10 min after 89 min ago), boosted
    ...answers('b', 'gm', now - 3 * HOUR), // missed earlier, due
    ...['c', 'd', 'e', 'f', 'g'].flatMap((slug) => answers(slug, 'g', now - 40 * DAY)), // known, due again
  ])
  const counts = countDraws(TEAMS, stats, { now, draws: 10000 })
  assert.ok(counts.a + counts.b > 10000 * 0.6, JSON.stringify(counts))
  for (const slug of ['c', 'd', 'e', 'f', 'g']) assert.ok(counts[slug] > 0, `${slug} never drawn`)
})

test('only due teams are drawn while any team is due', () => {
  const now = T0 + HOUR
  const stats = deriveStats([
    ...answers('a', 'm', now - 30 * MIN), // due
    ...answers('b', 'mg', now - 2 * MIN), // missed, streak 1: due tomorrow
    ...['c', 'd', 'e', 'f', 'g'].flatMap((slug) => answers(slug, 'g', now - MIN)), // known, due in 30 days
  ])
  const counts = countDraws(TEAMS, stats, { now, draws: 500, excludeSlug: 'z' })
  assert.equal(counts.a, 500)
})

test('nothing due: the team due soonest comes up, and the caught-up time is reported', () => {
  const now = T0 + HOUR
  const stats = deriveStats([
    ...answers('a', 'g', now - 2 * DAY), // due in 28 days
    ...answers('b', 'mg', now - 5 * HOUR), // due in ~19 hours: the soonest
    ...answers('c', 'g', now - DAY), // due in 29 days
  ])
  const three = TEAMS.slice(0, 3)
  for (let seed = 1; seed < 50; seed += 1) {
    assert.equal(drawTeam(three, stats, { random: seeded(seed), now }).slug, 'b')
  }
  assert.equal(nextDueAt(three, stats, now), Date.parse(stats.b.lastSeenAt) + DAY)
  // No immediate repeat in the fallback either: next soonest is a.
  for (let seed = 1; seed < 50; seed += 1) {
    assert.equal(drawTeam(three, stats, { excludeSlug: 'b', random: seeded(seed), now }).slug, 'a')
  }
  // Ties are broken at random.
  const tied = knownStats(['a', 'b', 'c'], now - DAY)
  const firsts = new Set()
  for (let seed = 1; seed < 50; seed += 1) firsts.add(drawTeam(three, tied, { random: seeded(seed), now }).slug)
  assert.deepEqual([...firsts].sort(), ['a', 'b', 'c'])
})

test('drawTeam never repeats the card just shown', () => {
  const random = seeded(11)
  let previous = null
  for (let i = 0; i < 500; i += 1) {
    const team = drawTeam(TEAMS, {}, { excludeSlug: previous, random, now: T0 })
    assert.notEqual(team.slug, previous)
    previous = team.slug
  }
  // Even when the previous card is the only one due (just missed, others known).
  const stats = { ...knownStats(['b', 'c', 'd', 'e', 'f', 'g'], T0), ...deriveStats(answers('a', 'mmmmm', T0)) }
  for (let seed = 1; seed < 200; seed += 1) {
    assert.notEqual(drawTeam(TEAMS, stats, { excludeSlug: 'a', random: seeded(seed), now: T0 + 20 * MIN }).slug, 'a')
  }
})

test('a one-team filter keeps showing that team', () => {
  const only = [TEAMS[0]]
  assert.equal(drawTeam(only, {}, { excludeSlug: 'a', random: seeded(1) }).slug, 'a')
  const known = knownStats(['a'], T0)
  assert.equal(drawTeam(only, known, { excludeSlug: 'a', random: seeded(1), now: T0 + MIN }).slug, 'a')
  assert.equal(drawTeam([], {}), null)
  assert.equal(nextDueAt([], {}), null)
})

test('drawTeam respects the country filter', () => {
  const random = seeded(5)
  const italy = filterTeams(TEAMS, 'Italy')
  const stats = { ...deriveStats(answers('a', 'mmmmm', T0)), ...knownStats(['d', 'e', 'f', 'g'], T0) }
  // a (Spain) is due and heavily weighted; Italy has nothing due.
  for (let i = 0; i < 300; i += 1) {
    assert.equal(drawTeam(italy, stats, { random, now: T0 + HOUR }).country, 'Italy')
  }
})

test('every team stays reachable when answered in a loop', () => {
  // Simulate a session: always answer, misses on two teams, all others right.
  // Every team must come up within a long run of cards over months.
  const events = []
  let now = T0
  let previous = null
  const seen = new Set()
  const random = seeded(77)
  for (let i = 0; i < 400; i += 1) {
    const stats = deriveStats(events)
    const team = drawTeam(TEAMS, stats, { excludeSlug: previous, random, now })
    seen.add(team.slug)
    // A not-due card only when no other candidate is due.
    if (!reviewState(stats[team.slug], now).due) {
      for (const other of TEAMS) {
        if (other.slug === previous) continue
        assert.equal(reviewState(stats[other.slug], now).due, false, `${team.slug} drawn early while ${other.slug} was due`)
      }
    }
    const got = !(team.slug === 'a' || team.slug === 'b') || random() < 0.5
    events.push({ id: `s-${i}`, slug: team.slug, at: new Date(now).toISOString(), got })
    previous = team.slug
    now += 6 * HOUR
  }
  assert.deepEqual([...seen].sort(), slugs(TEAMS))
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

test('formatWait', () => {
  assert.equal(formatWait(30 * 1000), '1 min')
  assert.equal(formatWait(9 * MIN), '9 min')
  assert.equal(formatWait(5 * HOUR), '5 hours')
  assert.equal(formatWait(HOUR), '1 hour')
  assert.equal(formatWait(19 * DAY + HOUR), '19 days')
})

test('initials and source labels', () => {
  assert.equal(initials('Real Sociedad'), 'RS')
  assert.equal(initials('Atalanta'), 'A')
  assert.equal(initials('Deportivo de La Coruña'), 'DL')
  assert.equal(sourceLabel('INE Padrón municipal, 1 Jan 2025 (via Wikidata Q2807 P1082)'), 'INE Padrón municipal, 1 Jan 2025')
  assert.equal(sourceLabel('ISTAT resident population, 1 Jan 2025 (POSAS, comune 016024)'), 'ISTAT resident population, 1 Jan 2025')
})
