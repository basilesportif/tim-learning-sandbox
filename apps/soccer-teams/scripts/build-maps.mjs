#!/usr/bin/env node
// Builds src/data/maps.json: simplified, pre-projected SVG outlines of Spain and
// Italy from Natural Earth (public domain).
//
//   node scripts/build-maps.mjs [--input path/to/ne_10m_admin_0_countries.geojson]
//
// Without --input the GeoJSON is downloaded from the natural-earth-vector repo
// (pinned tag). Projection math lives in src/lib/projection.js and is shared
// with the UI so dots placed with project() land on these outlines.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchBuffer } from './http.mjs'
import { PROJECTIONS, frameFor, projectInFrame } from '../src/lib/projection.js'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(APP_DIR, 'src/data/maps.json')

const NE_TAG = 'v5.1.2'
const NE_FILE = 'ne_10m_admin_0_countries.geojson'
const NE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/geojson/${NE_FILE}`

const TOLERANCE = 0.3 // Douglas-Peucker tolerance in SVG units (~0.5 km)
const MIN_AREA = 1 // drop islets smaller than this many square SVG units (~2.5 km²)
const COUNTRIES = { Spain: 'ESP', Italy: 'ITA' }

function argValue(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}

async function loadGeojson() {
  const input = argValue('--input')
  if (input) return JSON.parse(fs.readFileSync(input, 'utf8'))
  console.log(`Downloading ${NE_URL}`)
  const { buffer } = await fetchBuffer(NE_URL)
  return JSON.parse(buffer.toString('utf8'))
}

function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// Iterative Douglas-Peucker on an open polyline.
function simplify(points, tolerance) {
  if (points.length < 3) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()
    let maxDist = 0
    let index = -1
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end])
      if (d > maxDist) { maxDist = d; index = i }
    }
    if (index >= 0 && maxDist > tolerance) {
      keep[index] = 1
      stack.push([start, index], [index, end])
    }
  }
  return points.filter((_, i) => keep[i])
}

function ringArea(points) {
  let a = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) a += points[j].x * points[i].y - points[i].x * points[j].y
  return Math.abs(a / 2)
}

const round1 = (n) => Math.round(n * 10) / 10

function ringToPath(points) {
  // Drop the closing duplicate; 'Z' closes the ring. Implicit lineto after M.
  const pts = points.slice(0, -1)
  return 'M' + pts.map((p) => `${round1(p.x)},${round1(p.y)}`).join(' ') + 'Z'
}

const geojson = await loadGeojson()
const maps = {
  meta: {
    source: `Natural Earth 1:10m Cultural Vectors, Admin 0 - Countries (${NE_FILE}, natural-earth-vector ${NE_TAG}). Public domain.`,
    sourceUrl: NE_URL,
    generatedBy: 'scripts/build-maps.mjs',
    projection: 'src/lib/projection.js (equirectangular with cos(lat0) scaling; Canary Islands inset)',
    simplification: `Douglas-Peucker tolerance ${TOLERANCE} units; islets under ${MIN_AREA} square units dropped; holes (San Marino, Vatican City) dropped`,
  },
}

for (const [country, a3] of Object.entries(COUNTRIES)) {
  const feature = geojson.features.find((f) => f.properties.ADM0_A3 === a3)
  if (!feature) throw new Error(`No ${a3} feature in Natural Earth data`)
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
  const proj = PROJECTIONS[country]
  const groups = new Map([[proj.main, []], ...proj.insets.map((inset) => [inset, []])])
  let dropped = 0
  for (const polygon of polygons) {
    const outer = polygon[0] // outer ring only; holes are dropped
    const lats = outer.map((c) => c[1])
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    // Spain's North African territories (Ceuta, Melilla, plazas de soberanía)
    // sit between the Canaries and the peninsula; they are not drawn.
    if (country === 'Spain' && minLat > 30 && maxLat < 36) { dropped++; continue }
    const f = frameFor(country, (minLat + maxLat) / 2)
    const projected = outer.map(([lon, lat]) => projectInFrame(f, lat, lon))
    if (ringArea(projected) < MIN_AREA) { dropped++; continue }
    const simplified = simplify(projected, TOLERANCE)
    if (simplified.length < 4) { dropped++; continue }
    groups.get(f).push(simplified)
  }
  const paths = []
  for (const [f, rings] of groups) {
    if (!rings.length) continue
    for (const ring of rings) {
      for (const p of ring) {
        if (p.x < f.x - 0.5 || p.x > f.x + f.width + 0.5 || p.y < f.y - 0.5 || p.y > f.y + f.height + 0.5) {
          throw new Error(`${country}: point outside its frame (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) - widen the frame in projection.js`)
        }
      }
    }
    paths.push({ id: f === proj.main ? 'main' : f.id, d: rings.map(ringToPath).join('') })
  }
  maps[country] = {
    viewBox: `0 0 ${proj.width} ${proj.height}`,
    width: proj.width,
    height: proj.height,
    paths,
    insets: proj.insets.map(({ id, name, x, y, width, height }) => ({ id, name, x, y, width, height })),
  }
  const kept = [...groups.values()].reduce((n, r) => n + r.length, 0)
  console.log(`${country}: ${kept} rings kept, ${dropped} dropped, ${paths.reduce((n, p) => n + p.d.length, 0)} path chars`)
}

fs.writeFileSync(OUT, JSON.stringify(maps, null, 2) + '\n')
console.log(`Wrote ${path.relative(APP_DIR, OUT)} (${fs.statSync(OUT).size} bytes)`)
