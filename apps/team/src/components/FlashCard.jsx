import PlayerAvatar from './PlayerAvatar';
import { needsLastName } from '../players';
import './FlashCard.css';

// One card: the photo tile plus either the "Who is this?" prompt or the
// revealed name. The prompt and the answer share one fixed-height slot so the
// big button underneath never jumps when the name appears.
function FlashCard({ player, revealed, position, total }) {
  return (
    <section className="flash-card">
      <p className="flash-counter">
        {position} of {total}
      </p>

      <PlayerAvatar key={player.slug} player={player} />

      <div className="flash-slot" aria-live="polite">
        {revealed ? (
          <p className="flash-answer">
            <span className="flash-first">{player.first}</span>
            {needsLastName(player) ? (
              <span className="flash-last">{player.last}</span>
            ) : null}
          </p>
        ) : (
          <p className="flash-prompt">Who is this?</p>
        )}
      </div>
    </section>
  );
}

export default FlashCard;
