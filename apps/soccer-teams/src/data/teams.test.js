import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { project, frameFor, PROJECTIONS } from '../lib/projection.js'

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'))
const teams = readJson('./teams.json')
const maps = readJson('./maps.json')
const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url))

const COUNTRY_BBOX = {
  Spain: { latMin: 27.5, latMax: 44.0, lonMin: -18.5, lonMax: 4.5 },
  Italy: { latMin: 35.4, latMax: 47.1, lonMin: 6.5, lonMax: 18.6 },
}

// Parse the generated "Mx,y x,y ...Z" path strings back into rings.
function pathToRings(d) {
  return d.split('Z').filter(Boolean).map((ring) =>
    ring.replace(/^M/, '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number)),
  )
}

function insideRings(rings, x, y) {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

function distanceToRings(rings, x, y) {
  let best = Infinity
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j]
      const [bx, by] = ring[i]
      const dx = bx - ax
      const dy = by - ay
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy))
    }
  }
  return best
}

function outlineRings(country, lat) {
  const frame = frameFor(country, lat)
  const pathId = frame === PROJECTIONS[country].main ? 'main' : frame.id
  const path = maps[country].paths.find((p) => p.id === pathId)
  return path ? pathToRings(path.d) : []
}

function insideCountry(country, lat, lon) {
  const { x, y } = project(country, lat, lon)
  return insideRings(outlineRings(country, lat), x, y)
}

// Stadiums that sit on water the Natural Earth 1:10m coastline does not resolve.
// Value = max allowed distance (SVG units; 1 unit is about 1.8 km) from the outline.
// Venezia's Stadio Penzo is on Sant'Elena at the eastern tip of Venice, about
// 0.7 km beyond the 1:10m Venice island (about 0.56 units from the simplified outline).
const COASTAL_ALLOWANCE = { venezia: 0.75 }

test('there are 40 teams, 20 per league', () => {
  assert.equal(teams.length, 40)
  assert.equal(teams.filter((t) => t.league === 'La Liga' && t.country === 'Spain').length, 20)
  assert.equal(teams.filter((t) => t.league === 'Serie A' && t.country === 'Italy').length, 20)
})

test('slugs are unique', () => {
  assert.equal(new Set(teams.map((t) => t.slug)).size, teams.length)
})

test('every team has a name, city and population', () => {
  for (const t of teams) {
    assert.ok(t.name && t.shortName, `${t.slug}: name`)
    assert.ok(typeof t.city === 'string' && t.city.trim(), `${t.slug}: city`)
    assert.ok(Number.isInteger(t.cityPopulation) && t.cityPopulation > 0, `${t.slug}: cityPopulation`)
    assert.ok(Number.isInteger(t.populationYear), `${t.slug}: populationYear`)
    assert.ok(t.populationSource, `${t.slug}: populationSource`)
  }
})

test('stadium coordinates are inside the country bounding box', () => {
  for (const t of teams) {
    const b = COUNTRY_BBOX[t.country]
    assert.ok(t.lat >= b.latMin && t.lat <= b.latMax && t.lon >= b.lonMin && t.lon <= b.lonMax, `${t.slug}: ${t.lat},${t.lon}`)
  }
})

test('every projected team point lies inside its country outline', () => {
  for (const t of teams) {
    const { x, y } = project(t.country, t.lat, t.lon)
    if (insideCountry(t.country, t.lat, t.lon)) continue
    const allowance = COASTAL_ALLOWANCE[t.slug]
    const distance = distanceToRings(outlineRings(t.country, t.lat), x, y)
    assert.ok(allowance !== undefined && distance <= allowance,
      `${t.slug} (${t.city}) at ${x.toFixed(1)},${y.toFixed(1)} is outside the outline (${distance.toFixed(2)} units away)`)
  }
})

test('Canary Islands points are routed into the inset', () => {
  const lat = 28.1003 // Estadio de Gran Canaria, Las Palmas
  const lon = -15.4567
  const inset = maps.Spain.insets.find((i) => i.id === 'canary-islands')
  const { x, y } = project('Spain', lat, lon)
  assert.ok(x >= inset.x && x <= inset.x + inset.width && y >= inset.y && y <= inset.y + inset.height)
  assert.ok(insideCountry('Spain', lat, lon), 'Las Palmas should land on Gran Canaria')
})

test('logo files exist (or logo is null)', () => {
  for (const t of teams) {
    if (t.logo === null) continue
    assert.match(t.logo, /^logos\/[a-z0-9-]+\.(svg|png)$/)
    assert.ok(fs.existsSync(PUBLIC_DIR + t.logo), `${t.slug}: missing ${t.logo}`)
  }
})
