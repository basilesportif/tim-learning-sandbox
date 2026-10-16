import { useCallback, useEffect, useRef, useState } from 'react';
import About from './components/About';
import CountryFilter from './components/CountryFilter';
import FlashCard from './components/FlashCard';
import teams from './data/teams.json';
import { drawTeam, filterTeams, getStorage } from './lib/deck';
import { createStatsSync } from './lib/sync';
import './App.css';

// A fast double-tap on Got it / Missed it would otherwise land on the Reveal
// button that replaces them. Ignore those for a moment after a grade.
const GRADE_GUARD_MS = 400;

// An endless stream of cards: each one is a weighted random draw (see
// lib/deck.js), so teams that were missed more come up more often. Reloading
// the page starts with a fresh random card; the answer history is synced to
// the server (data/stats.json) with localStorage as the offline cache.
function initialState() {
  // No network or listeners until sync.start() in an effect.
  const sync = createStatsSync({ storage: getStorage(), baseUrl: import.meta.env.BASE_URL });
  const stats = sync.getStats();

  return {
    sync,
    stats,
    country: 'All',
    team: drawTeam(filterTeams(teams, 'All'), stats),
    seen: 0,
  };
}

function App() {
  const [state, setState] = useState(initialState);
  const [revealed, setRevealed] = useState(false);
  const gradedAt = useRef(-Infinity);

  const { country, team, seen, sync } = state;
  const stage = revealed ? 'grade' : 'reveal';

  const handleCountry = useCallback((next) => {
    setState((current) => {
      if (next === current.country) return current;
      return {
        ...current,
        country: next,
        team: drawTeam(filterTeams(teams, next), current.stats, { excludeSlug: current.team?.slug }),
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
        team: drawTeam(filterTeams(teams, current.country), stats, { excludeSlug: current.team.slug }),
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
