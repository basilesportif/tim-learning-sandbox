import CountryMap from './CountryMap';
import Crest from './Crest';
import { formatPopulation } from '../lib/format';
import './FlashCard.css';

// One card. Front: the big crest and the club name - tap anywhere to flip.
// Back: a small crest so it is clear which club this is, then the city, its
// approximate population and a map of the country with the stadium dot.
function FlashCard({ team, revealed, onReveal }) {
  if (!revealed) {
    return (
      <button type="button" className="flash-card flash-card--front" onClick={onReveal}>
        <span className="flash-crest">
          <Crest key={team.slug} team={team} size="large" />
        </span>
        <span className="flash-name">{team.name}</span>
        <span className="flash-league">
          {team.league} · {team.country}
        </span>
        <span className="flash-question">What city is this team in?</span>
      </button>
    );
  }

  return (
    <section className="flash-card flash-card--back" aria-live="polite">
      <div className="flash-back-team">
        <Crest key={team.slug} team={team} size="small" />
        <div className="flash-back-team-text">
          <p className="flash-back-name">{team.name}</p>
          <p className="flash-league">
            {team.league} · {team.country}
          </p>
        </div>
      </div>

      <h2 className={`flash-city${team.city.length > 14 ? ' flash-city--long' : ''}`}>{team.city}</h2>
      <p className="flash-population">≈ {formatPopulation(team.cityPopulation)} people</p>

      <div className="flash-map">
        <CountryMap team={team} />
      </div>
    </section>
  );
}

export default FlashCard;
