// POST /soccer-teams/api/stats/events: server-side merge of quiz answer events
// into apps/soccer-teams/data/stats.json (see apps/soccer-teams/DATA.md).
//
// The client sends only its not-yet-confirmed events; the server unions them
// with the file by event id and writes the result atomically. Node handles
// requests on one thread and this handler is synchronous, so two devices
// posting at once cannot overwrite each other's answers.
import fs from 'fs';
import { join } from 'path';
import { writeJsonAtomic } from './json_file.js';
import {
  MAX_EVENTS_PER_REQUEST,
  buildStatsFile,
  eventsFromFile,
  sanitizeEvents,
} from '../apps/soccer-teams/src/lib/history.js';

export const SOCCER_TEAMS_APP_NAME = 'soccer-teams';
export const STATS_FILE_NAME = 'stats.json';

function readStatsFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, 'utf-8');
  return text.trim() ? JSON.parse(text) : {};
}

// Returns { status, body }.
export function mergeStatsEvents(dataPath, body, now = new Date()) {
  const incoming = body && Array.isArray(body.events) ? body.events : null;
  if (!incoming) return { status: 400, body: { error: 'events_required' } };
  if (incoming.length > MAX_EVENTS_PER_REQUEST) return { status: 413, body: { error: 'too_many_events' } };

  const filePath = join(dataPath, STATS_FILE_NAME);
  // A corrupt file throws here (500) rather than being silently replaced.
  const existing = eventsFromFile(readStatsFile(filePath));
  const valid = sanitizeEvents(incoming);
  const file = buildStatsFile([...existing, ...valid], now);

  if (file.events.length !== existing.length || !fs.existsSync(filePath)) {
    writeJsonAtomic(filePath, file);
  }
  return { status: 200, body: { ...file, accepted: valid.length, rejected: incoming.length - valid.length } };
}

export function setupSoccerTeamsStatsRoutes(app, appName, dataPath) {
  app.post(`/${appName}/api/stats/events`, (req, res) => {
    const { status, body } = mergeStatsEvents(dataPath, req.body);
    res.status(status).json(body);
  });
}
