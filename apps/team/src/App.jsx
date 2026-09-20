import { useCallback, useEffect, useState } from 'react';
import FlashCard from './components/FlashCard';
import RoundComplete from './components/RoundComplete';
import { DECK } from './players';
import { buildRound } from './lib/deck';
import './App.css';

const BUTTON_LABELS = {
  reveal: 'Show Name',
  next: 'Next',
  again: 'Go Again',
};

function App() {
  // Every in-deck player once, shuffled. Rebuilt at the end of each round.
  const [round, setRound] = useState(() => buildRound(DECK));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);

  // One button at a time, so the primary action is never ambiguous:
  // reveal the name, then move on, then start a fresh round.
  const stage = finished ? 'again' : revealed ? 'next' : 'reveal';

  const handlePrimary = useCallback(() => {
    if (finished) {
      // The last card just seen must not lead the new round.
      setRound((current) => buildRound(DECK, current[current.length - 1]?.slug));
      setIndex(0);
      setRevealed(false);
      setFinished(false);
      return;
    }

    if (!revealed) {
      setRevealed(true);
      return;
    }

    if (index + 1 >= round.length) {
      setFinished(true);
      return;
    }

    setIndex(index + 1);
    setRevealed(false);
  }, [finished, revealed, index, round.length]);

  // Space / Enter drives the same primary action, for anyone on a keyboard.
  // Keys handled by a focused button are left alone so they do not fire twice.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (event.repeat) return;
      if (event.target instanceof Element && event.target.closest('button')) return;

      event.preventDefault();
      handlePrimary();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePrimary]);

  const player = round[index];

  return (
    <div className="app no-select">
      <header className="app-header">
        <h1 className="app-title">Name My Teammate</h1>
        <p className="app-subtitle">Manhattan SC Independiente &middot; Male U9</p>
      </header>

      <main className="app-main">
        {finished || !player ? (
          <RoundComplete total={round.length} />
        ) : (
          <FlashCard
            player={player}
            revealed={revealed}
            position={index + 1}
            total={round.length}
          />
        )}
      </main>

      <div className="app-actions">
        <button
          type="button"
          className={`primary-button primary-button--${stage}`}
          onClick={handlePrimary}
        >
          {BUTTON_LABELS[stage]}
        </button>
      </div>
    </div>
  );
}

export default App;
