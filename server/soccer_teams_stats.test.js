// node --test server/*.test.js (npm test at the repo root)
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { writeJsonAtomic } from './json_file.js';
import { STATS_FILE_NAME, mergeStatsEvents } from './soccer_teams_stats.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = () => fs.mkdtempSync(join(os.tmpdir(), 'soccer-teams-stats-'));
const answer = (id, slug, got, at = '2026-10-01T12:00:00.000Z') => ({ id, slug, at, got });

test('writeJsonAtomic writes a temp file in the same directory, then renames it', () => {
  const calls = [];
  const spyFs = {
    writeFileSync: (path, text) => calls.push(['write', path, text]),
    renameSync: (from, to) => calls.push(['rename', from, to]),
    rmSync: () => calls.push(['rm']),
  };
  writeJsonAtomic('/data/stats.json', { a: 1 }, spyFs);
  assert.equal(calls.length, 2);
  const [[op1, tmp], [op2, from, to]] = calls;
  assert.equal(op1, 'write');
  assert.notEqual(tmp, '/data/stats.json');
  assert.equal(dirname(tmp), '/data');
  assert.deepEqual([op2, from, to], ['rename', tmp, '/data/stats.json']);

  // A failed write leaves the old file alone and cleans up the temp file.
  const dir = tmpDir();
  const target = join(dir, 'x.json');
  fs.writeFileSync(target, '{"old":true}');
  const failing = { ...fs, writeFileSync: () => { throw new Error('disk full'); }, renameSync: fs.renameSync, rmSync: fs.rmSync };
  assert.throws(() => writeJsonAtomic(target, { new: true }, failing), /disk full/);
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf-8')), { old: true });
  assert.deepEqual(fs.readdirSync(dir), ['x.json']);
});

test('stats endpoint merges events into stats.json atomically', (t) => {
  const dir = tmpDir();
  const renames = [];
  const realRename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => { renames.push([from, to]); return realRename(from, to); });

  const first = mergeStatsEvents(dir, { events: [answer('a-1', 'roma', false), answer('a-2', 'roma', true, '2026-10-01T12:01:00.000Z')] });
  assert.equal(first.status, 200);
  const filePath = join(dir, STATS_FILE_NAME);
  assert.equal(renames.length, 1);
  assert.equal(renames[0][1], filePath);
  assert.notEqual(renames[0][0], filePath);

  // A second device's events are unioned in; duplicates and junk are ignored.
  const second = mergeStatsEvents(dir, { events: [answer('b-1', 'roma', false, '2026-10-01T13:00:00.000Z'), answer('a-1', 'roma', false), { id: '../../etc', slug: 'x' }] });
  assert.equal(second.body.accepted, 2);
  assert.equal(second.body.rejected, 1);
  const file = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  assert.equal(file.events.length, 3);
  assert.deepEqual(
    { attempts: file.teams.roma.attempts, misses: file.teams.roma.misses, streak: file.teams.roma.streak, lastWrongAt: file.teams.roma.lastWrongAt },
    { attempts: 3, misses: 2, streak: 0, lastWrongAt: '2026-10-01T13:00:00.000Z' },
  );
  assert.deepEqual(fs.readdirSync(dir), [STATS_FILE_NAME], 'no temp files left behind');

  // Nothing new: no rewrite.
  mergeStatsEvents(dir, { events: [answer('a-1', 'roma', false)] });
  assert.equal(renames.length, 2);

  assert.equal(mergeStatsEvents(dir, {}).status, 400);
  assert.equal(mergeStatsEvents(dir, { events: Array.from({ length: 501 }, (_, i) => answer(`x-${i}`, 'roma', true)) }).status, 413);
});

test('deploy and git pull leave apps/soccer-teams/data/ alone', () => {
  const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' });
  // The stats file (and its temp files) are ignored and untracked, so
  // `git pull --ff-only` never touches them and they can't block a pull.
  git('check-ignore', '-q', 'apps/soccer-teams/data/stats.json');
  git('check-ignore', '-q', 'apps/soccer-teams/data/.stats.json.123.456.tmp');
  assert.deepEqual(git('ls-files', 'apps/soccer-teams/data').trim().split('\n'), ['apps/soccer-teams/data/.gitkeep']);

  // deploy.sh only cleans build output: no rsync --delete, no git clean outside
  // apps/*/dist, and never -x (which would delete ignored files such as stats.json).
  const deploy = fs.readFileSync(join(repoRoot, 'scripts/deploy.sh'), 'utf-8');
  assert.doesNotMatch(deploy, /rsync[^\n]*--delete/);
  assert.doesNotMatch(deploy, /git clean[^\n]*-[a-z]*x/);
  assert.doesNotMatch(deploy, /git (reset --hard|checkout -- \.|stash)/);
  for (const line of deploy.split('\n').filter((l) => l.includes('git clean'))) {
    assert.match(line, /dist_dirs/, `unexpected git clean: ${line}`);
  }
  for (const line of deploy.split('\n').filter((l) => /rm -rf/.test(l))) {
    assert.doesNotMatch(line, /data/, `deploy deletes data: ${line}`);
  }
});
