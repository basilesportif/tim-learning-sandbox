// Keeps the quiz answer history in sync with the server file
// apps/soccer-teams/data/stats.json, with localStorage as an offline cache.
//
//   - Every answer becomes an event with a unique id (lib/history.js) and is
//     appended to the local cache and to a pending queue, both in localStorage,
//     so an answer is never lost to a failed request, a closed tab or a reload.
//   - Pending events are POSTed in batches to /soccer-teams/api/stats/events,
//     a little after the last answer (debounced). The server unions them into
//     the file by id and answers with the merged file, which is how answers
//     from other devices arrive. Failures retry with backoff; the quiz keeps
//     working from local data meanwhile.
//   - On pagehide / tab hidden, pending events are sent once more with
//     fetch(keepalive). Re-sending is harmless: merging is by id.
//   - First run after the server sync shipped: the old v1 per-browser stats
//     become one "baseline" event per team (ids derived from the device id and
//     slug, so they can never be counted twice) and are uploaded like answers.
//
// All I/O is injectable (storage, fetch, timers, clock, event target) for tests.

import { MAX_EVENTS_PER_REQUEST, deriveStats, eventsFromFile, mergeEvents } from './history.js';
import { loadLegacyStats } from './deck.js';

export const EVENTS_KEY = 'soccer-teams:events:v2';
export const PENDING_KEY = 'soccer-teams:pending:v2';
export const DEVICE_KEY = 'soccer-teams:device';
export const FLUSH_DELAY_MS = 2000;
export const RETRY_DELAYS_MS = [5000, 15000, 60000];

function readList(storage, key) {
  if (!storage) return null;
  try {
    const text = storage.getItem(key);
    if (text === null) return null;
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeItem(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    // Quota or blocked storage: the in-memory copy still syncs to the server.
  }
}

function makeDeviceId(random) {
  return `d${Math.floor(random() * 2 ** 48).toString(36)}`;
}

export function legacyBaselines(legacy, deviceId, nowMs) {
  return Object.entries(legacy).map(([slug, stat]) => ({
    id: `baseline-${deviceId}-${slug}`,
    kind: 'baseline',
    slug,
    at: new Date(stat.lastSeen ?? nowMs).toISOString(),
    attempts: stat.attempts,
    misses: stat.misses,
    gots: stat.gots,
    recent: stat.recent,
  }));
}

export function createStatsSync({
  storage = null,
  fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = '/soccer-teams/',
  now = () => Date.now(),
  random = Math.random,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  eventTarget = globalThis,
  onChange = () => {},
} = {}) {
  let deviceId = null;
  try {
    deviceId = storage?.getItem(DEVICE_KEY) ?? null;
  } catch {
    deviceId = null;
  }
  if (!deviceId) {
    deviceId = makeDeviceId(random);
    writeItem(storage, DEVICE_KEY, deviceId);
  }

  const cached = readList(storage, EVENTS_KEY);
  let events = mergeEvents(cached ?? []);
  let pending = mergeEvents(readList(storage, PENDING_KEY) ?? []);

  // One-time migration of the v1 stats (only when no v2 cache exists yet).
  if (cached === null) {
    const baselines = legacyBaselines(loadLegacyStats(storage), deviceId, now());
    events = mergeEvents(events, baselines);
    pending = mergeEvents(pending, baselines);
  }

  let stats = deriveStats(events);
  let seq = 0;
  let flushTimer = null;
  let inFlight = null;
  let failures = 0;
  let stopped = false;
  const listeners = new Set();

  const persist = () => {
    writeItem(storage, EVENTS_KEY, events);
    writeItem(storage, PENDING_KEY, pending);
  };
  persist();

  const url = (path) => `${baseUrl}${path}`;

  function applyRemote(remoteEvents) {
    const merged = mergeEvents(events, remoteEvents);
    if (merged.length === events.length) return false;
    events = merged;
    stats = deriveStats(events);
    persist();
    onChange(stats);
    for (const listener of listeners) listener(stats);
    return true;
  }

  function schedule(ms) {
    if (stopped) return;
    if (flushTimer !== null) clearTimer(flushTimer);
    flushTimer = setTimer(() => {
      flushTimer = null;
      return flush();
    }, ms);
  }

  async function sendBatch(batch, { keepalive = false } = {}) {
    const response = await fetchImpl(url('api/stats/events'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function flushLoop() {
    while (pending.length > 0) {
      const batch = pending.slice(0, MAX_EVENTS_PER_REQUEST);
      const file = await sendBatch(batch);
      const sent = new Set(batch.map((event) => event.id));
      pending = pending.filter((event) => !sent.has(event.id));
      persist();
      applyRemote(eventsFromFile(file));
    }
  }

  // Sends every pending event. Resolves true when the queue is empty, false
  // after a failure (a retry is scheduled). Never rejects.
  function flush() {
    if (inFlight) return inFlight;
    if (!fetchImpl) return Promise.resolve(pending.length === 0);
    if (flushTimer !== null) {
      clearTimer(flushTimer);
      flushTimer = null;
    }
    inFlight = flushLoop()
      .then(() => {
        failures = 0;
        return true;
      })
      .catch(() => {
        schedule(RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)]);
        failures += 1;
        return false;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  // Fetches the server file and merges it in. Resolves true on success.
  async function pull() {
    if (!fetchImpl) return false;
    try {
      const response = await fetchImpl(url('api/data/stats'), { cache: 'no-store' });
      if (!response.ok) return false;
      applyRemote(eventsFromFile(await response.json()));
      return true;
    } catch {
      return false;
    }
  }

  // Best effort while the page goes away. Pending stays queued until a normal
  // flush confirms it, so nothing is lost if this request dies too.
  function flushOnExit() {
    if (!fetchImpl || pending.length === 0) return;
    try {
      sendBatch(pending.slice(0, MAX_EVENTS_PER_REQUEST), { keepalive: true }).catch(() => {});
    } catch {
      // ignore
    }
  }

  function record(slug, got) {
    const nowMs = now();
    seq += 1;
    const event = { id: `${deviceId}-${nowMs.toString(36)}-${seq}`, slug, at: new Date(nowMs).toISOString(), got };
    events = mergeEvents(events, [event]);
    pending = mergeEvents(pending, [event]);
    stats = deriveStats(events);
    persist();
    schedule(FLUSH_DELAY_MS);
    return stats;
  }

  const onPageHide = () => flushOnExit();
  const onVisibility = () => {
    if (globalThis.document?.visibilityState === 'hidden') flushOnExit();
  };
  const onOnline = () => flush();

  function start() {
    stopped = false;
    eventTarget?.addEventListener?.('pagehide', onPageHide);
    eventTarget?.addEventListener?.('visibilitychange', onVisibility);
    eventTarget?.addEventListener?.('online', onOnline);
    return pull().then(() => flush());
  }

  function stop() {
    stopped = true;
    if (flushTimer !== null) clearTimer(flushTimer);
    flushTimer = null;
    eventTarget?.removeEventListener?.('pagehide', onPageHide);
    eventTarget?.removeEventListener?.('visibilitychange', onVisibility);
    eventTarget?.removeEventListener?.('online', onOnline);
  }

  return {
    deviceId,
    getStats: () => stats,
    getEvents: () => events,
    getPending: () => pending,
    record,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush,
    pull,
    start,
    stop,
  };
}
