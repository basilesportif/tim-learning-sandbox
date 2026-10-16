import { sourceLabel } from '../lib/format';
import './About.css';

// Credits and sources, folded away so they never compete with the card.
// Population sources come straight from the data (one per country).
function About({ teams }) {
  const sources = [];

  for (const team of teams) {
    const label = sourceLabel(team.populationSource);
    if (!sources.some((source) => source.country === team.country)) {
      sources.push({ country: team.country, label });
    }
  }

  return (
    <details className="about">
      <summary className="about-summary">About · 2026–27 season</summary>
      <ul className="about-list">
        <li>Teams: 2026–27 La Liga and Serie A.</li>
        <li>
          City = where the stadium is. Population is the city itself (not the metro area):{' '}
          {sources.map((source, i) => (
            <span key={source.country}>
              {i > 0 ? '; ' : ''}
              {source.country}: {source.label}
            </span>
          ))}
          .
        </li>
        <li>Map: Natural Earth (public domain).</li>
        <li>Crests: Wikimedia/Wikipedia, see LOGOS.md; trademarks of their owners.</li>
      </ul>
    </details>
  );
}

export default About;
