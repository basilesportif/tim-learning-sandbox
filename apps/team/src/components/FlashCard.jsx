import PlayerAvatar from './PlayerAvatar';
import { displayName, needsLastName } from '../players';
import './FlashCard.css';

// One card. The photo tile always takes whatever height is left over, and
// underneath (or beside, in landscape multiple choice) sits either the reveal
// slot or the four choice buttons. Both of those are fixed-size, so the big
// button below the card never moves when the answer appears.
function FlashCard({ player, revealed, choiceMode, choices, wrongSlugs, onChoose }) {
  return (
    <section className={`flash-card flash-card--${choiceMode ? 'choice' : 'flip'}`}>
      <div className="flash-photo">
        <PlayerAvatar key={player.slug} player={player} />
      </div>

      {choiceMode ? (
        <div className="choice-list">
          {choices.map((choice) => {
            const isAnswer = choice.slug === player.slug;
            const isWrong = wrongSlugs.includes(choice.slug);
            // Once the answer is out, the other three recede so the green one
            // is the only thing left to look at.
            const state = revealed
              ? isAnswer
                ? 'correct'
                : 'faded'
              : isWrong
                ? 'wrong'
                : 'open';

            return (
              <button
                key={choice.slug}
                type="button"
                className={`choice-button choice-button--${state}`}
                onClick={() => onChoose(choice)}
                disabled={revealed || isWrong}
              >
                <span className="choice-name">{displayName(choice)}</span>
                {state === 'correct' ? (
                  <span className="choice-mark" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flash-slot" aria-live="polite">
          {revealed ? (
            // Two tiers: the first name is the answer, the last name is only
            // there to tell the two Ethans apart. Everyone else gets one line
            // and no second tier at all - the slot is already reserved at the
            // taller of the two shapes, so nothing shifts either way.
            <p className="flash-answer">
              <span className="flash-first">{player.first}</span>
              {needsLastName(player) ? (
                <span className="flash-last">{player.last}</span>
              ) : null}
            </p>
          ) : null}
        </div>
      )}

      {/* Colour alone carries the result on screen, so the same news goes out
          to a screen reader here. Off-screen, never part of the layout. */}
      {choiceMode ? (
        <p className="flash-status" role="status" aria-live="polite">
          {revealed
            ? `Correct. ${displayName(player)}.`
            : wrongSlugs.length > 0
              ? 'Not that one - try again.'
              : ''}
        </p>
      ) : null}
    </section>
  );
}

export default FlashCard;
