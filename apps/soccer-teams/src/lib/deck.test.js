import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MISSED_GAP,
  currentCard,
  filterTeams,
  isRoundComplete,
  markGot,
  markMissed,
  shuffle,
  startRound,
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

// A small seeded generator so shuffles are repeatable in tests.
function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

test('shuffle keeps every item and does not mutate the input', () => {
  const input = [...TEAMS]
  const out = shuffle(input, seeded(1))
  assert.deepEqual(slugs(input), slugs(TEAMS))
  assert.deepEqual(slugs(out).sort(), slugs(TEAMS).sort())
})

test('startRound builds a shuffled deck with every team once', () => {
  const round = startRound(TEAMS, 'All', { random: seeded(7) })
  assert.equal(round.total, TEAMS.length)
  assert.equal(round.queue.length, TEAMS.length)
  assert.deepEqual(slugs(round.queue).sort(), slugs(TEAMS).sort())
  assert.deepEqual(round.missed, [])
  assert.equal(isRoundComplete(round), false)
  // Different seeds give different orders (the deck really is shuffled).
  const orders = new Set([1, 2, 3, 4, 5].map((seed) => slugs(startRound(TEAMS, 'All', { random: seeded(seed) }).queue).join()))
  assert.ok(orders.size > 1)
})

test('startRound avoids repeating the previous last card first', () => {
  for (let seed = 1; seed < 30; seed += 1) {
    const round = startRound(TEAMS, 'All', { avoidFirstSlug: 'a', random: seeded(seed) })
    assert.notEqual(currentCard(round).slug, 'a')
  }
})

test('filter by country', () => {
  assert.deepEqual(slugs(filterTeams(TEAMS, 'Spain')), ['a', 'b', 'c'])
  assert.deepEqual(slugs(filterTeams(TEAMS, 'Italy')), ['d', 'e', 'f', 'g'])
  assert.equal(filterTeams(TEAMS, 'All').length, TEAMS.length)
  const round = startRound(TEAMS, 'Italy', { random: seeded(3) })
  assert.equal(round.total, 4)
  assert.ok(round.queue.every((team) => team.country === 'Italy'))
})

test('got it removes the current card', () => {
  const round = startRound(TEAMS, 'All', { random: seeded(2) })
  const first = currentCard(round)
  const next = markGot(round)
  assert.equal(next.queue.length, TEAMS.length - 1)
  assert.ok(!next.queue.includes(first))
  assert.equal(currentCard(next), round.queue[1])
  assert.equal(round.queue.length, TEAMS.length, 'input round is not mutated')
})

test('missed it re-queues the card a few places later', () => {
  const round = startRound(TEAMS, 'All', { random: seeded(4) })
  const first = currentCard(round)
  const next = markMissed(round)
  assert.equal(next.queue.length, TEAMS.length)
  assert.equal(next.queue.indexOf(first), MISSED_GAP)
  assert.deepEqual(slugs(next.queue.slice(0, MISSED_GAP)), slugs(round.queue.slice(1, MISSED_GAP + 1)))
})

test('missed card near the end goes to the back; a lone card comes straight back', () => {
  let round = startRound(TEAMS.slice(0, 2), 'All', { random: seeded(5) })
  const first = currentCard(round)
  round = markMissed(round)
  assert.equal(round.queue.at(-1), first)
  round = markGot(round)
  assert.equal(currentCard(round), first)
  round = markMissed(round)
  assert.equal(currentCard(round), first)
  assert.equal(isRoundComplete(round), false)
})

test('round completes only after every card is got once', () => {
  let round = startRound(TEAMS, 'Spain', { random: seeded(6) })
  round = markMissed(round)
  round = markMissed(round)
  let steps = 0
  while (!isRoundComplete(round)) {
    round = markGot(round)
    steps += 1
  }
  assert.equal(steps, 3)
  assert.equal(currentCard(round), null)
  assert.equal(markGot(round), round)
  assert.equal(markMissed(round), round)
})

test('missed list accumulates once per team, in order', () => {
  let round = startRound(TEAMS, 'All', { random: seeded(8) })
  const a = currentCard(round)
  round = markMissed(round)
  const b = currentCard(round)
  round = markMissed(round)
  // Walk to the first missed card again and miss it a second time.
  while (currentCard(round) !== a) round = markGot(round)
  round = markMissed(round)
  assert.deepEqual(slugs(round.missed), [a.slug, b.slug])
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
