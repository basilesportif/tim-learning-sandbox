import { useCallback, useEffect, useMemo, useState } from 'react';
import FlashCard from './components/FlashCard';
import ModeToggle from './components/ModeToggle';
import RoundComplete from './components/RoundComplete';
import { DECK } from './players';
import { buildChoices, buildRound } from './lib/deck';
import './App.css';

const BUTTON_LABELS = {
  reveal: 'Show Name',
  next: 'Next',
  again: 'Go Again',
};

// Daniel picks a mode once and it sticks across sessions. Private browsing and
// locked-down storage throw on access, so every read and write is guarded and
// the app simply falls back to the flip-card default.
const MODE_KEY = 'team:multiple-choice';

function readStoredChoiceMode() {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'on';
  } catch {
    return false;
  }
}

function App() {
  // Every in-deck player once, shuffled. Rebuilt at the end of each round.
  const [round, setRound] = useState(() => buildRound(DECK));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  // Flip cards are the default; multiple choice is the opt-in mode.
  const [choiceMode, setChoiceMode] = useState(readStoredChoiceMode);
  // Slugs the kid has already ruled out on this card. Wrong picks only go
  // quiet, they never end the card, so guessing again costs nothing.
  const [wrongSlugs, setWrongSlugs] = useState([]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MODE_KEY, choiceMode ? 'on' : 'off');
    } catch {
      // Storage is optional: the mode still works for this session.
    }
  }, [choiceMode]);

  const player = round[index];

  // Fresh options whenever the card changes. Keyed on the round array and the
  // index rather than the player object, because a player object is shared
  // across rounds - this way the same face gets new distractors next time
  // around instead of the memo handing back the old four.
  const choices = useMemo(() => {
    const current = round[index];
    if (!choiceMode || !current) return [];

    return buildChoices(DECK, current);
  }, [choiceMode, round, index]);

  // One button at a time, so the primary action is never ambiguous:
  // reveal the name, then move on, then start a fresh round.
  const stage = finished ? 'again' : revealed ? 'next' : 'reveal';

  const handlePrimary = useCallback(() => {
    if (finished) {
      // The last card just seen must not lead the new round.
      setRound((current) => buildRound(DECK, current[current.length - 1]?.slug));
      setIndex(0);
      setRevealed(false);
      setWrongSlugs([]);
      setFinished(false);
      return;
    }

    if (!revealed) {
      // In multiple choice this doubles as "just tell me": the right button
      // lights up green exactly as if it had been tapped.
      setRevealed(true);
      return;
    }

    if (index + 1 >= round.length) {
      setFinished(true);
      return;
    }

    setIndex(index + 1);
    setRevealed(false);
    setWrongSlugs([]);
  }, [finished, revealed, index, round.length]);

  const handleChoice = useCallback(
    (choice) => {
      if (revealed || !player) return;

      if (choice.slug === player.slug) {
        setRevealed(true);
        return;
      }

      setWrongSlugs((current) =>
        current.includes(choice.slug) ? current : [...current, choice.slug],
      );
    },
    [revealed, player],
  );

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

  // Switching modes mid-card restarts the question rather than carrying a
  // half-answered state across two very different screens.
  const handleModeChange = useCallback((next) => {
    setChoiceMode(next);
    setRevealed(false);
    setWrongSlugs([]);
  }, []);

  return (
    <div className={`app no-select app--${choiceMode ? 'choice' : 'flip'}`}>
      <ModeToggle checked={choiceMode} onChange={handleModeChange} />

      <main className="app-main">
        {finished || !player ? (
          <RoundComplete total={round.length} />
        ) : (
          <FlashCard
            player={player}
            revealed={revealed}
            choiceMode={choiceMode}
            choices={choices}
            wrongSlugs={wrongSlugs}
            onChoose={handleChoice}
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
