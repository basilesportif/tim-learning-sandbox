#!/usr/bin/env node
// Downloads club crests into public/logos/<slug>.svg|png and writes LOGOS.md.
//
//   node scripts/fetch-logos.mjs
//
// For each club the crest is the image in the en.wikipedia infobox
// ({{Infobox football club | image = ...}}). Many are non-free (fair use) files
// hosted on en.wikipedia; others live on Wikimedia Commons. File metadata
// (description page, licence) comes from the en.wikipedia imageinfo API, which
// covers both. SVG originals are preferred; otherwise a PNG at >= 500px wide
// (thumbnail URL) or the original if it is smaller than that.
// Requests are sequential, ~1s apart, with a contact User-Agent (see http.mjs).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchJson, fetchBuffer } from './http.mjs'
import { CLUBS } from './clubs.mjs'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOGO_DIR = path.join(APP_DIR, 'public/logos')
const LOGOS_MD = path.join(APP_DIR, 'LOGOS.md')
const API = 'https://en.wikipedia.org/w/api.php'
const PNG_WIDTH = 600
const MAX_SVG_BYTES = 400 * 1024 // larger SVGs are swapped for a PNG render

// Optional per-club file overrides when the infobox image is unsuitable.
const FILE_OVERRIDES = {}

async function infoboxImage(clubTitle) {
  const d = await fetchJson(`${API}?action=parse&format=json&formatversion=2&redirects=1&prop=wikitext&section=0&page=${encodeURIComponent(clubTitle)}`)
  const text = d.parse.wikitext
  const m = text.match(/\|\s*(?:image|logo|crest)\s*=\s*([^|\n}]+)/i)
  if (!m) return null
  let name = m[1].trim()
  name = name.split('{{')[0].replace(/^\[\[/, '').replace(/^(File|Image):/i, '').trim()
  return name || null
}

async function imageInfo(fileName) {
  const d = await fetchJson(`${API}?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${PNG_WIDTH}&titles=${encodeURIComponent('File:' + fileName)}`)
  const page = d.query.pages[0]
  const info = page.imageinfo?.[0]
  if (!info) return null
  const meta = info.extmetadata || {}
  return {
    title: page.title,
    repository: page.imagerepository, // 'local' (en.wikipedia) or 'shared' (Commons)
    descriptionUrl: info.descriptionurl,
    url: info.url,
    thumbUrl: info.thumburl,
    width: info.width,
    height: info.height,
    thumbWidth: info.thumbwidth,
    mime: info.mime,
    license: meta.LicenseShortName?.value || meta.License?.value || 'unknown',
    nonFree: meta.NonFree?.value === 'true' || meta.NonFree?.value === true,
  }
}

function checkSvg(buf) {
  const head = buf.subarray(0, 2048).toString('utf8').toLowerCase()
  if (head.includes('<html') || head.includes('<!doctype html')) return 'looks like HTML'
  if (!buf.toString('utf8').toLowerCase().includes('<svg')) return 'no <svg> element'
  return null
}

function pngSize(buf) {
  const sig = '89504e470d0a1a0a'
  if (buf.subarray(0, 8).toString('hex') !== sig) return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

fs.mkdirSync(LOGO_DIR, { recursive: true })
for (const f of fs.readdirSync(LOGO_DIR)) fs.rmSync(path.join(LOGO_DIR, f))

const rows = []
for (const club of CLUBS) {
  const row = { slug: club.slug, name: club.name, file: null, info: null, saved: null, note: '' }
  rows.push(row)
  try {
    row.file = FILE_OVERRIDES[club.slug] || (await infoboxImage(club.club))
    if (!row.file) { row.note = 'no infobox image'; continue }
    row.info = await imageInfo(row.file)
    if (!row.info) { row.note = `file not found: ${row.file}`; continue }
    const { info } = row
    let buffer, ext
    if (info.mime === 'image/svg+xml') {
      ;({ buffer } = await fetchBuffer(info.url))
      const problem = checkSvg(buffer)
      if (problem) throw new Error(`SVG check failed: ${problem}`)
      ext = 'svg'
      if (buffer.length > MAX_SVG_BYTES) {
        row.note = `SVG is ${Math.round(buffer.length / 1024)} KB; using a PNG render instead`
        ;({ buffer } = await fetchBuffer(info.thumbUrl))
        ext = 'png'
      }
    } else {
      // Raster: the thumb URL is a >= PNG_WIDTH render when the original is
      // larger; MediaWiki never upscales, so small originals come back as-is.
      const url = info.width > PNG_WIDTH ? info.thumbUrl : info.url
      ;({ buffer } = await fetchBuffer(url))
      ext = 'png'
      if (info.width < 500) row.note = `original is only ${info.width}px wide`
    }
    if (ext === 'png') {
      const size = pngSize(buffer)
      if (!size) throw new Error('downloaded raster is not a PNG')
      row.pixels = `${size.width}x${size.height}`
    }
    // The Juventus 'J' crest is a legitimately tiny (~400 byte) SVG, so the floor is per-format.
    const minBytes = ext === 'svg' ? 200 : 1000
    if (buffer.length < minBytes) throw new Error(`suspiciously small file (${buffer.length} bytes)`)
    if (ext === 'svg' && !/<(path|polygon|rect|circle|ellipse|g)\b/i.test(buffer.toString('utf8'))) throw new Error('SVG has no drawable elements')
    const out = path.join(LOGO_DIR, `${club.slug}.${ext}`)
    fs.writeFileSync(out, buffer)
    row.saved = `logos/${club.slug}.${ext}`
    row.bytes = buffer.length
    console.log(`ok   ${club.slug.padEnd(22)} ${row.saved} (${Math.round(buffer.length / 1024)} KB) ${row.note}`)
  } catch (err) {
    row.note = `error: ${err.message}`
    console.log(`FAIL ${club.slug.padEnd(22)} ${row.note}`)
  }
}

const fallbacks = rows.filter((r) => !r.saved)
const md = [
  '# Club crests',
  '',
  'Generated by `node scripts/fetch-logos.mjs` (re-run to refresh). Each crest is the',
  'image used in the club\'s en.wikipedia infobox. Files marked **non-free** are',
  'copyrighted club crests hosted on en.wikipedia under its non-free content',
  '(fair use) policy; they are used here only for this personal, non-commercial',
  'learning app. Free files are hosted on Wikimedia Commons under the licence shown.',
  '',
  'Teams with `logo: null` in `src/data/teams.json` fall back to an initials badge in the UI.',
  '',
  '| Team | Saved as | Source file page | Licence | Notes |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map((r) => {
    const src = r.info ? `[${r.info.title}](${r.info.descriptionUrl})` : (r.file ? `File:${r.file}` : '-')
    const lic = r.info ? (r.info.nonFree ? '**non-free** (fair use)' : r.info.license) : '-'
    const host = r.info ? (r.info.repository === 'shared' ? 'Commons' : 'en.wikipedia') : ''
    const notes = [host, r.info && r.info.mime !== 'image/svg+xml' ? `original ${r.info.width}x${r.info.height}` : '', r.pixels ? `saved ${r.pixels}` : '', r.note].filter(Boolean).join('; ')
    return `| ${r.name} | ${r.saved ? '`' + r.saved + '`' : '**null (fallback)**'} | ${src} | ${lic} | ${notes} |`
  }),
  '',
  '## Fallbacks',
  '',
  fallbacks.length ? fallbacks.map((r) => `- ${r.name}: ${r.note}`).join('\n') : 'None - every club has a crest file.',
  '',
]
fs.writeFileSync(LOGOS_MD, md.join('\n'))
console.log(`\n${rows.length - fallbacks.length} crests saved, ${fallbacks.length} fallbacks. Wrote LOGOS.md`)
