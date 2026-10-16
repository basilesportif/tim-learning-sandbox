// Polite HTTP helper for dev-time data scripts (Node built-in fetch, no deps).
// Sequential requests, ~1s spacing, honours 429 / Retry-After.

export const USER_AGENT = 'tim-learning-sandbox/1.0 (accounts@galebach.com)'

const MIN_GAP_MS = 1000
let lastRequestAt = 0

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function politeFetch(url, { retries = 4 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000 * (attempt + 1)
      console.warn(`  ${res.status} for ${url}; retrying in ${delay}ms`)
      await sleep(delay)
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return res
  }
}

export async function fetchJson(url) {
  return (await politeFetch(url)).json()
}

export async function fetchBuffer(url) {
  const res = await politeFetch(url)
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || '' }
}
