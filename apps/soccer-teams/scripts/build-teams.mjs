#!/usr/bin/env node
// Builds src/data/teams.json from the curated list in clubs.mjs.
//
//   node scripts/build-teams.mjs
//
// - Resolves en.wikipedia titles to Wikidata items.
// - lat/lon: stadium coordinates (Wikidata P625 of the venue).
// - Spain population: Wikidata P1082 for 1 Jan 2025 (sourced to INE Padrón 2025).
// - Italy population: ISTAT POSAS "popolazione residente al 1° gennaio 2025",
//   looked up by the city's ISTAT code (Wikidata P635). Wikidata's Italian
//   P1082 values are a mix of 2023 and 2025, so ISTAT is read directly.
// - logo: logos/<slug>.svg|png if fetch-logos.mjs saved one, else null.
//   Run fetch-logos.mjs first.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchJson, fetchBuffer } from './http.mjs'
import { readZipEntries } from './unzip.mjs'
import { CLUBS, COUNTRY_BY_LEAGUE } from './clubs.mjs'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(APP_DIR, 'src/data/teams.json')
const LOGO_DIR = path.join(APP_DIR, 'public/logos')

const POPULATION_YEAR = 2025
const INE_2025_ITEM = 'Q137426716' // Wikidata item used as P248 "stated in" for INE Padrón 1 Jan 2025
const ISTAT_URL = `https://demo.istat.it/data/posas/POSAS_${POPULATION_YEAR}_it_Comuni.zip`

async function resolveQids(titles) {
  const out = {}
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)
    const d = await fetchJson('https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=' + encodeURIComponent(batch.join('|')))
    const norm = Object.fromEntries((d.query.normalized || []).map((n) => [n.from, n.to]))
    const redir = Object.fromEntries((d.query.redirects || []).map((r) => [r.from, r.to]))
    const byTitle = Object.fromEntries(d.query.pages.map((p) => [p.title, p.pageprops?.wikibase_item]))
    for (const t of batch) {
      const resolved = redir[norm[t] || t] || norm[t] || t
      if (!byTitle[resolved]) throw new Error(`No Wikidata item for en.wikipedia "${t}"`)
      out[t] = byTitle[resolved]
    }
  }
  return out
}

async function getEntities(ids) {
  const out = {}
  for (let i = 0; i < ids.length; i += 50) {
    const d = await fetchJson('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|labels&languages=en&ids=' + ids.slice(i, i + 50).join('|'))
    Object.assign(out, d.entities)
  }
  return out
}

function venueCoords(entity) {
  const claims = (entity.claims.P625 || []).filter((s) => s.rank !== 'deprecated')
  const best = claims.find((s) => s.rank === 'preferred') || claims[0]
  const v = best?.mainsnak.datavalue?.value
  if (!v) throw new Error(`No P625 on ${entity.id}`)
  return { lat: Number(v.latitude.toFixed(5)), lon: Number(v.longitude.toFixed(5)) }
}

function spanishPopulation(entity) {
  const matches = (entity.claims.P1082 || []).filter((s) => {
    const time = s.qualifiers?.P585?.[0]?.datavalue?.value?.time || ''
    const statedIn = (s.references || []).flatMap((r) => (r.snaks.P248 || []).map((x) => x.datavalue?.value?.id))
    return s.rank !== 'deprecated' && time.startsWith(`+${POPULATION_YEAR}-`) && statedIn.includes(INE_2025_ITEM)
  })
  if (matches.length !== 1) throw new Error(`Expected one INE ${POPULATION_YEAR} P1082 on ${entity.id}, got ${matches.length}`)
  return Number(matches[0].mainsnak.datavalue.value.amount)
}

async function loadIstatTotals() {
  console.log(`Downloading ${ISTAT_URL}`)
  const { buffer } = await fetchBuffer(ISTAT_URL)
  const csv = readZipEntries(buffer).find((e) => e.name.endsWith('.csv')).read().toString('utf8')
  const totals = {}
  for (const line of csv.split(/\r?\n/)) {
    const cols = line.split(';').map((c) => c.replace(/^"|"$/g, ''))
    if (cols[2] === '999') totals[cols[0]] = Number(cols[cols.length - 1]) // age 999 = all ages
  }
  return totals
}

function logoFor(slug) {
  for (const ext of ['svg', 'png']) {
    if (fs.existsSync(path.join(LOGO_DIR, `${slug}.${ext}`))) return `logos/${slug}.${ext}`
  }
  return null
}

const titles = [...new Set(CLUBS.flatMap((c) => [c.venue, c.cityPage]))]
const qids = await resolveQids(titles)
const entities = await getEntities([...new Set(Object.values(qids))])
const istat = await loadIstatTotals()

const teams = CLUBS.map((c) => {
  const country = COUNTRY_BY_LEAGUE[c.league]
  const cityEntity = entities[qids[c.cityPage]]
  let cityPopulation, populationSource
  if (country === 'Spain') {
    cityPopulation = spanishPopulation(cityEntity)
    populationSource = `INE Padrón municipal, 1 Jan ${POPULATION_YEAR} (via Wikidata ${cityEntity.id} P1082)`
  } else {
    const code = cityEntity.claims.P635?.[0]?.mainsnak.datavalue?.value
    cityPopulation = istat[code]
    if (!cityPopulation) throw new Error(`No ISTAT total for ${c.city} (code ${code})`)
    populationSource = `ISTAT resident population, 1 Jan ${POPULATION_YEAR} (POSAS, comune ${code})`
  }
  return {
    slug: c.slug,
    name: c.name,
    shortName: c.shortName,
    country,
    league: c.league,
    city: c.city,
    cityPopulation,
    populationYear: POPULATION_YEAR,
    populationSource,
    ...venueCoords(entities[qids[c.venue]]),
    logo: logoFor(c.slug),
  }
})

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(teams, null, 2) + '\n')
console.log(`Wrote ${teams.length} teams to ${path.relative(APP_DIR, OUT)}`)
for (const t of teams) console.log(`  ${t.name.padEnd(24)} ${t.city.padEnd(22)} ${String(t.cityPopulation).padStart(8)}  ${t.logo ?? '(no logo)'}`)
