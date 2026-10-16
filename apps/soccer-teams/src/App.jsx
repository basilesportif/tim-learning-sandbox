import { useCallback, useEffect, useRef, useState } from 'react';
import About from './components/About';
import CountryFilter from './components/CountryFilter';
import FlashCard from './components/FlashCard';
import RoundComplete from './components/RoundComplete';
import teams from './data/teams.json';
import { currentCard, isRoundComplete, markGot, markMissed, startRound } from './lib/deck';
import './App.css';

// A fast double-tap on Got it / Missed it would otherwise land on the Reveal or
// Play Again button that replaces them. Ignore those for a moment after a grade.
const GRADE_GUARD_MS = 400;

function App() {
  const [round, setRound] = useState(() => startRound(teams, 'All'));
  const [revealed, setRevealed] = useState(false);
  const gradedAt = useRef(-Infinity);

  const team = currentCard(round);
  const finished = isRoundComplete(round);
  const stage = finished ? 'again' : revealed ? 'grade' : 'reveal';

  const restart = useCallback((country) => {
    setRound((current) => startRound(teams, country, { avoidFirstSlug: currentCard(current)?.slug ?? current.lastSlug }));
    setRevealed(false);
  }, []);

  const handleCountry = useCallback(
    (country) => {
      if (country !== round.country) restart(country);
    },
    [round.country, restart],
  );

  const handleGrade = useCallback((got) => {
    gradedAt.current = performance.now();
    setRound((current) => (got ? markGot(current) : markMissed(current)));
    setRevealed(false);
  }, []);

  const justGraded = () => performance.now() - gradedAt.current < GRADE_GUARD_MS;

  const handleReveal = () => {
    if (!justGraded()) setRevealed(true);
  };

  const handlePlayAgain = () => {
    if (!justGraded()) restart(round.country);
  };

  // Space / Enter flips the card or starts a new round, for anyone on a
  // keyboard. Keys handled by a focused button are left alone.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (event.repeat) return;
      if (event.target instanceof Element && event.target.closest('button, summary')) return;

      if (stage === 'reveal') {
        event.preventDefault();
        setRevealed(true);
      } else if (stage === 'again') {
        event.preventDefault();
        restart(round.country);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage, restart, round.country]);

  return (
    <div className="app no-select">
      <header className="app-header">
        <CountryFilter value={round.country} onChange={handleCountry} />
        <p className="app-progress" aria-live="polite">
          <span className="app-progress-count">{round.queue.length}</span> left
        </p>
      </header>

      <main className="app-main">
        {finished ? (
          <RoundComplete total={round.total} missed={round.missed} />
        ) : (
          <FlashCard team={team} revealed={revealed} onReveal={handleReveal} />
        )}
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

        {stage === 'again' ? (
          <button type="button" className="primary-button primary-button--again" onClick={handlePlayAgain}>
            Play Again
          </button>
        ) : null}
      </div>

      <About teams={teams} />
    </div>
  );
}

export default App;
