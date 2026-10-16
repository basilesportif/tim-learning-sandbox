import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STATS_KEY } from './deck.js'
import { buildStatsFile, deriveStats, eventsFromFile, mergeEvents, sanitizeEvent } from './history.js'
import { EVENTS_KEY, PENDING_KEY, RETRY_DELAYS_MS, createStatsSync } from './sync.js'

const T0 = Date.parse('2026-10-01T12:00:00Z')

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
    removeItem: (key) => { data.delete(key) },
    data,
  }
}

// In-memory stand-in for the server: GET api/data/stats and the merging
// POST api/stats/events. `mode` switches it to offline / HTTP 500.
function fakeServer() {
  const server = { file: {}, mode: 'up', posts: [] }
  server.fetch = async (url, options = {}) => {
    if (server.mode === 'offline') throw new TypeError('Failed to fetch')
    if (server.mode === 'error') return { ok: false, status: 500, json: async () => ({}) }
    if (url.endsWith('api/data/stats')) return { ok: true, status: 200, json: async () => structuredClone(server.file) }
    if (url.endsWith('api/stats/events') && options.method === 'POST') {
      const body = JSON.parse(options.body)
      server.posts.push({ body, keepalive: options.keepalive })
      server.file = buildStatsFile([...eventsFromFile(server.file), ...body.events])
      return { ok: true, status: 200, json: async () => structuredClone(server.file) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  return server
}

// Manual timers so retries and debounce are deterministic.
function fakeTimers() {
  const timers = new Map()
  let next = 1
  return {
    setTimer: (fn, ms) => { timers.set(next, { fn, ms }); return next++ },
    clearTimer: (id) => { timers.delete(id) },
    pending: () => [...timers.values()],
    async runAll() {
      const list = [...timers.entries()]
      timers.clear()
      for (const [, { fn }] of list) await fn()
    },
  }
}

function device(server, { storage = memoryStorage(), clock = { t: T0 }, seed = 1, eventTarget = null } = {}) {
  const timers = fakeTimers()
  let s = seed
  const sync = createStatsSync({
    storage,
    fetch: server ? server.fetch : null,
    now: () => clock.t,
    random: () => { s = (s * 16807) % 2147483647; return s / 2147483647 },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    eventTarget,
  })
  return { sync, storage, timers, clock }
}

test('history: merge is a union by id, idempotent and order independent', () => {
  const a = [{ id: 'x-1', slug: 'roma', at: '2026-10-01T12:00:00.000Z', got: false }]
  const b = [{ id: 'y-1', slug: 'roma', at: '2026-10-01T12:01:00.000Z', got: true }]
  assert.deepEqual(mergeEvents(a, b), mergeEvents(b, a))
  assert.deepEqual(mergeEvents(a, b, a, b), mergeEvents(a, b))
  const stats = deriveStats(mergeEvents(a, b)).roma
  assert.deepEqual(stats, {
    slug: 'roma', attempts: 2, misses: 1, gots: 1,
    lastSeenAt: '2026-10-01T12:01:00.000Z', lastWrongAt: '2026-10-01T12:00:00.000Z', lastGotAt: '2026-10-01T12:01:00.000Z',
    recent: ['m', 'g'], streak: 1,
  })
  assert.equal(sanitizeEvent({ id: '../x', slug: 'roma', at: 'now', got: true }), null)
  assert.equal(sanitizeEvent({ id: 'ok', slug: 'roma', at: '2026-10-01T12:00:00Z' }), null)
})

test('answers sync to the server, debounced', async () => {
  const server = fakeServer()
  const { sync, timers, clock } = device(server)
  await sync.start()
  sync.record('roma', false)
  clock.t += 1000
  sync.record('roma', true)
  assert.equal(server.posts.length, 0, 'nothing sent before the debounce fires')
  assert.equal(timers.pending().length, 1)
  await timers.runAll()
  assert.equal(server.posts.length, 1, 'both answers go in one request')
  assert.equal(server.file.teams.roma.attempts, 2)
  assert.equal(server.file.teams.roma.streak, 1)
  assert.deepEqual(sync.getPending(), [])
})

test('two devices: union of answers, nothing lost, same stats on both', async () => {
  const server = fakeServer()
  const a = device(server, { seed: 1 })
  const b = device(server, { seed: 2 })
  assert.notEqual(a.sync.deviceId, b.sync.deviceId)
  await Promise.all([a.sync.start(), b.sync.start()])

  a.sync.record('roma', false)
  b.sync.record('roma', true)
  b.sync.record('lazio', false)
  a.clock.t += 5000
  a.sync.record('roma', true)
  // Both flush "at once"; the server merges instead of overwriting.
  await Promise.all([a.sync.flush(), b.sync.flush()])
  await a.sync.pull()

  assert.equal(server.file.events.length, 4)
  assert.deepEqual(a.sync.getStats(), b.sync.getStats())
  assert.equal(a.sync.getStats().roma.attempts, 3)
  assert.equal(a.sync.getStats().lazio.misses, 1)
  // Re-sending is harmless.
  await server.fetch('/soccer-teams/api/stats/events', { method: 'POST', body: JSON.stringify({ events: a.sync.getEvents() }) })
  assert.equal(server.file.events.length, 4)
})

test('remote answers notify subscribers', async () => {
  const server = fakeServer()
  const a = device(server, { seed: 1 })
  const b = device(server, { seed: 2 })
  const seen = []
  b.sync.subscribe((stats) => seen.push(stats))
  a.sync.record('napoli', false)
  await a.sync.flush()
  await b.sync.start()
  assert.equal(seen.length, 1)
  assert.equal(seen[0].napoli.misses, 1)
})

test('migrates v1 localStorage stats once, without double counting', async () => {
  const server = fakeServer()
  const storage = memoryStorage({
    [STATS_KEY]: JSON.stringify({
      roma: { attempts: 3, misses: 2, gots: 1, lastSeen: T0 - 1000, recent: ['m', 'm', 'g'] },
      milan: { attempts: 1, misses: 0, gots: 1, lastSeen: T0 - 2000, recent: ['g'] },
    }),
  })
  const first = device(server, { storage })
  assert.equal(first.sync.getStats().roma.attempts, 3, 'available before the server answers')
  await first.sync.start()
  assert.equal(server.file.teams.roma.attempts, 3)
  assert.equal(server.file.teams.roma.misses, 2)
  assert.equal(server.file.teams.roma.streak, 1)
  assert.equal(server.file.teams.milan.gots, 1)

  // Reload: the v2 cache exists now, so nothing is migrated again.
  const again = device(server, { storage })
  assert.deepEqual(again.sync.getPending(), [])
  await again.sync.start()
  assert.equal(server.file.teams.roma.attempts, 3)
  assert.equal(server.file.events.length, 2)
})

test('offline / server errors: quiz keeps working, answers queue and retry', async () => {
  const server = fakeServer()
  server.mode = 'offline'
  const storage = memoryStorage()
  const { sync, timers } = device(server, { storage })
  assert.equal(await sync.pull(), false)
  await sync.start()

  const stats = sync.record('torino', false)
  assert.equal(stats.torino.misses, 1, 'stats update locally while offline')
  await timers.runAll() // debounce fires -> flush fails
  assert.equal(sync.getPending().length, 1)
  assert.equal(JSON.parse(storage.data.get(PENDING_KEY)).length, 1, 'queue is in localStorage')
  assert.equal(timers.pending()[0].ms, RETRY_DELAYS_MS[0])

  server.mode = 'error'
  await timers.runAll()
  assert.equal(timers.pending()[0].ms, RETRY_DELAYS_MS[1], 'backs off')
  assert.equal(server.file.events, undefined)

  // Reload while still failing: the answer survives.
  const reloaded = device(server, { storage })
  assert.equal(reloaded.sync.getStats().torino.misses, 1)
  assert.equal(reloaded.sync.getPending().length, 1)
  assert.ok(storage.data.has(EVENTS_KEY))

  server.mode = 'up'
  assert.equal(await reloaded.sync.flush(), true)
  assert.equal(server.file.teams.torino.misses, 1)
  assert.deepEqual(reloaded.sync.getPending(), [])
})

test('pagehide sends pending answers with keepalive', async () => {
  const server = fakeServer()
  const target = new EventTarget()
  const { sync } = device(server, { eventTarget: target })
  await sync.start()
  sync.record('genoa', true)
  target.dispatchEvent(new Event('pagehide'))
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(server.posts.length, 1)
  assert.equal(server.posts[0].keepalive, true)
  assert.equal(server.file.teams.genoa.gots, 1)
  sync.stop()
  sync.record('genoa', true)
  target.dispatchEvent(new Event('pagehide'))
  assert.equal(server.posts.length, 1, 'listeners removed on stop')
})

test('works with no fetch and no storage at all', async () => {
  const { sync } = device(null, { storage: null })
  await sync.start()
  assert.equal(sync.record('roma', true).roma.gots, 1)
  assert.equal(await sync.flush(), false)
})
