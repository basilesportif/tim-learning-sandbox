import Crest from './Crest';
import './RoundComplete.css';

// Shown once every team in the round has been "Got it". The "Play Again"
// button lives in App, next to the other primary actions.
function RoundComplete({ total, missed }) {
  const firstTry = total - missed.length;

  return (
    <section className="round-complete">
      <p className="round-complete-emoji" aria-hidden="true">
        ⚽️
      </p>
      <h2 className="round-complete-title">Great job!</h2>
      <p className="round-complete-note">
        You placed all {total} teams. {firstTry} first try
        {missed.length > 0 ? `, ${missed.length} missed.` : '!'}
      </p>

      {missed.length > 0 ? (
        <div className="round-complete-missed">
          <h3 className="round-complete-missed-title">Practice these</h3>
          <ul className="round-complete-list">
            {missed.map((team) => (
              <li key={team.slug} className="round-complete-item">
                <Crest team={team} size="tiny" />
                <span className="round-complete-team">{team.shortName}</span>
                <span className="round-complete-city">{team.city}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default RoundComplete;
