import { COUNTRY_FILTERS } from '../lib/deck';
import './CountryFilter.css';

const LABELS = {
  All: 'All',
  Spain: 'Spain',
  Italy: 'Italy',
};

// Segmented control: All / Spain / Italy. Picking a different one draws a new
// card from that country (handled by the parent).
function CountryFilter({ value, onChange }) {
  return (
    <div className="country-filter" role="radiogroup" aria-label="Which country">
      {COUNTRY_FILTERS.map((country) => {
        const selected = country === value;

        return (
          <button
            key={country}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`country-filter-option${selected ? ' country-filter-option--on' : ''}`}
            onClick={(event) => {
              // Drop focus so Space / Enter go back to flipping the card.
              event.currentTarget.blur();
              onChange(country);
            }}
          >
            {LABELS[country]}
          </button>
        );
      })}
    </div>
  );
}

export default CountryFilter;
