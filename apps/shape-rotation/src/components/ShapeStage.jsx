import TriangleGlyph, { TRIANGLE_POINTS } from './TriangleGlyph';
import './ShapeStage.css';

// Reference tick every 30 degrees - matches the rotation step.
const TICKS = Array.from({ length: 12 }, (_, index) => index * 30);

const ShapeStage = ({ angle, displayAngle }) => {
  return (
    <div className="shape-stage">
      {/* Static reference layer: it never rotates, so it shows where "up" was. */}
      <svg className="stage-guides" viewBox="0 0 200 200" aria-hidden="true">
        <circle className="guide-ring" cx="100" cy="100" r="90" />
        {TICKS.map((tick) => (
          <line
            key={tick}
            className={tick % 90 === 0 ? 'guide-tick guide-tick-major' : 'guide-tick'}
            x1="100"
            y1="10"
            x2="100"
            y2="20"
            transform={`rotate(${tick} 100 100)`}
          />
        ))}
        <polygon className="guide-shape" points={TRIANGLE_POINTS} />
        <circle className="guide-pivot" cx="100" cy="100" r="3" />
      </svg>

      {/* Rotating layer. The angle is cumulative and unbounded, so the CSS
          transition always travels in the direction the child chose. */}
      <div className="shape-rotor" style={{ transform: `rotate(${angle}deg)` }}>
        <TriangleGlyph className="stage-shape" />
      </div>

      <p className="visually-hidden" aria-live="polite">
        Triangle turned {displayAngle} degrees from the start.
      </p>
    </div>
  );
};

export default ShapeStage;
