import { useCallback, useEffect, useRef, useState } from 'react';
import About from './components/About';
import CountryFilter from './components/CountryFilter';
import FlashCard from './components/FlashCard';
import teams from './data/teams.json';
import { drawTeam, filterTeams, getStorage, nextDueAt } from './lib/deck';
import { formatWait } from './lib/format';
import { createStatsSync } from './lib/sync';
import './App.css';

// A fast double-tap on Got it / Missed it would otherwise land on the Reveal
// button that replaces them. Ignore those for a moment after a grade.
const GRADE_GUARD_MS = 400;

// The next card for a country filter, plus the "All caught up" wait (ms) when
// nothing in the filter is due (then the card is the one due soonest).
function nextCard(country, stats, excludeSlug = null) {
  const now = Date.now();
  const pool = filterTeams(teams, country);
  const dueAt = nextDueAt(pool, stats, now);
  return {
    team: drawTeam(pool, stats, { excludeSlug, now }),
    caughtUpFor: dueAt === null ? null : dueAt - now,
  };
}

// An endless stream of cards: due teams first (see lib/deck.js), so missed
// teams come back soon and teams Tim knows wait 30+ days. The answer history
// is synced to the server (data/stats.json) with localStorage as the offline cache.
function initialState() {
  // No network or listeners until sync.start() in an effect.
  const sync = createStatsSync({ storage: getStorage(), baseUrl: import.meta.env.BASE_URL });
  const stats = sync.getStats();

  return {
    sync,
    stats,
    country: 'All',
    ...nextCard('All', stats),
    seen: 0,
  };
}

function App() {
  const [state, setState] = useState(initialState);
  const [revealed, setRevealed] = useState(false);
  const gradedAt = useRef(-Infinity);

  const { country, team, seen, sync, caughtUpFor } = state;
  const stage = revealed ? 'grade' : 'reveal';

  const handleCountry = useCallback((next) => {
    setState((current) => {
      if (next === current.country) return current;
      return {
        ...current,
        country: next,
        ...nextCard(next, current.stats, current.team?.slug),
      };
    });
    setRevealed(false);
  }, []);

  // Recorded outside the state updater so StrictMode's double-invoke can't
  // record an answer twice.
  const handleGrade = (got) => {
    gradedAt.current = performance.now();
    const stats = sync.record(team.slug, got);
    setState((current) => {
      return {
        ...current,
        stats,
        ...nextCard(current.country, stats, current.team.slug),
        seen: current.seen + 1,
      };
    });
    setRevealed(false);
  };

  // Pull the server history, upload anything pending, and keep flushing on
  // pagehide / reconnect. Answers from other devices update the weights.
  useEffect(() => {
    const unsubscribe = sync.subscribe((stats) => setState((current) => ({ ...current, stats })));
    sync.start();
    return () => {
      unsubscribe();
      sync.stop();
    };
  }, [sync]);

  const handleReveal = () => {
    if (performance.now() - gradedAt.current >= GRADE_GUARD_MS) setRevealed(true);
  };

  // Space / Enter flips the card, for anyone on a keyboard. Keys handled by a
  // focused button are left alone.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (event.repeat) return;
      if (event.target instanceof Element && event.target.closest('button, summary')) return;

      if (stage === 'reveal') {
        event.preventDefault();
        setRevealed(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage]);

  return (
    <div className="app no-select">
      <header className="app-header">
        <CountryFilter value={country} onChange={handleCountry} />
        <p className="app-progress" aria-live="polite" title="Cards answered this session">
          <span className="app-progress-count">{seen}</span> {seen === 1 ? 'card' : 'cards'}
        </p>
      </header>

      {caughtUpFor !== null ? (
        <p className="app-caught-up">All caught up — next review in {formatWait(caughtUpFor)}</p>
      ) : null}

      <main className="app-main">
        {team ? <FlashCard team={team} revealed={revealed} onReveal={handleReveal} /> : null}
      </main>

      <div className="app-actions">
        {stage === 'reveal' ? (
          <button type="button" className="primary-button primary-button--reveal" onClick={handleReveal}>
            Reveal
          </button>
        ) : null}

        {stage === 'grade' ? (
          <div className="grade-buttons">
            <button type="button" className="primary-button primary-button--missed" onClick={() => handleGrade(false)}>
              Missed it
            </button>
            <button type="button" className="primary-button primary-button--got" onClick={() => handleGrade(true)}>
              Got it
            </button>
          </div>
        ) : null}
      </div>

      <About teams={teams} />
    </div>
  );
}

export default App;
