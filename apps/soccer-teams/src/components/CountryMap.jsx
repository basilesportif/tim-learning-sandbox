import maps from '../data/maps.json';
import { project } from '../lib/projection';
import './CountryMap.css';

// The team's country outline (Natural Earth, pre-projected in maps.json) with
// one dot where the stadium is. `project()` uses the same projection that
// built the outlines, so the dot lines up exactly. Insets (the Canary Islands
// for Spain) get a border box, as on a printed map.
function CountryMap({ team }) {
  const map = maps[team.country];
  if (!map) return null;

  const { x, y } = project(team.country, team.lat, team.lon);
  // Marker sizes are in map units; both maps are about 550-650 units across.
  const unit = Math.max(map.width, map.height) / 640;

  return (
    <svg
      className="country-map"
      viewBox={map.viewBox}
      role="img"
      aria-label={`Map of ${team.country} with a dot on ${team.city}`}
    >
      {map.insets.map((inset) => (
        <rect
          key={inset.id}
          className="country-map-inset"
          x={inset.x}
          y={inset.y}
          width={inset.width}
          height={inset.height}
          rx={6}
        />
      ))}
      {map.paths.map((path) => (
        <path key={path.id} className="country-map-land" d={path.d} />
      ))}
      <circle className="country-map-halo" cx={x} cy={y} r={26 * unit} />
      <circle className="country-map-ring" cx={x} cy={y} r={15 * unit} strokeWidth={5 * unit} />
      <circle className="country-map-dot" cx={x} cy={y} r={9 * unit} strokeWidth={3 * unit} />
    </svg>
  );
}

export default CountryMap;
