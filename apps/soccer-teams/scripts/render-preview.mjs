#!/usr/bin/env node
// Writes standalone preview SVGs (outline + every team dot + inset boxes) for
// eyeballing that dots land where they should. Not used by the app.
//
//   node scripts/render-preview.mjs [outDir]   (default: the OS temp dir)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { project } from '../src/lib/projection.js'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(APP_DIR, rel), 'utf8'))
const teams = readJson('src/data/teams.json')
const maps = readJson('src/data/maps.json')
const outDir = process.argv[2] || os.tmpdir()

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

for (const country of ['Spain', 'Italy']) {
  const map = maps[country]
  const dots = teams.filter((t) => t.country === country).map((t) => {
    const { x, y } = project(country, t.lat, t.lon)
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#d62828" stroke="#fff" stroke-width="1"/>` +
      `<text x="${(x + 5).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="9" font-family="sans-serif">${escape(t.shortName)} (${escape(t.city)})</text>`
  })
  const insets = map.insets.map((i) => `<rect x="${i.x}" y="${i.y}" width="${i.width}" height="${i.height}" fill="none" stroke="#555" stroke-dasharray="4 3"/>`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${map.viewBox}" width="${map.width * 2}" height="${map.height * 2}">
<rect width="100%" height="100%" fill="#cfe8ff"/>
${map.paths.map((p) => `<path d="${p.d}" fill="#f4f1de" stroke="#333" stroke-width="0.6"/>`).join('\n')}
${insets.join('\n')}
${dots.join('\n')}
</svg>
`
  const file = path.join(outDir, `soccer-teams-preview-${country.toLowerCase()}.svg`)
  fs.writeFileSync(file, svg)
  console.log(`Wrote ${file}`)
}
