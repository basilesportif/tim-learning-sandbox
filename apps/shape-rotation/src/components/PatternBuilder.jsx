import RotationControls from './RotationControls';
import TriangleGlyph, { TRIANGLE_POINTS } from './TriangleGlyph';
import './PatternBuilder.css';

const DIRECTION_ARROW = {
  cw: '↻',
  ccw: '↺',
};

// Display only: fold a cumulative angle into 0-359.
const foldAngle = (angle) => ((angle % 360) + 360) % 360;

// A strip of frozen triangles: every tap adds the next snapshot instead of
// turning one shape, so the whole pattern stays on screen at once.
const PatternBuilder = ({
  stepDegrees,
  snapshots,
  maxSnapshots,
  onClockwise,
  onCounterClockwise,
  onReset,
}) => {
  const isFull = snapshots.length >= maxSnapshots;
  const isEmpty = snapshots.length === 0;

  return (
    <div className="pattern-builder">
      <div className="pattern-strip-area">
        <div className="pattern-strip">
          {/* Faint "this is where we started" reference, always at 0 degrees. */}
          <div className="snapshot-card snapshot-card-ghost">
            <div className="snapshot-figure">
              <svg className="snapshot-shape" viewBox="0 0 200 200" aria-hidden="true">
                <polygon className="snapshot-ghost-shape" points={TRIANGLE_POINTS} />
              </svg>
            </div>
            <p className="snapshot-caption snapshot-caption-ghost">Start</p>
          </div>

          {snapshots.map((snapshot, index) => (
            <div
              key={snapshot.id}
              className={`snapshot-card snapshot-card-${snapshot.direction}`}
            >
              <div className="snapshot-figure">
                <div
                  className="snapshot-rotor"
                  style={{ transform: `rotate(${snapshot.angle}deg)` }}
                >
                  <TriangleGlyph className="snapshot-shape" />
                </div>
              </div>
              <p className={`snapshot-caption snapshot-caption-${snapshot.direction}`}>
                <span className="snapshot-arrow" aria-hidden="true">
                  {DIRECTION_ARROW[snapshot.direction]}
                </span>
                <span className="snapshot-angle">{foldAngle(snapshot.angle)}°</span>
              </p>
              <span className="visually-hidden">
                Step {index + 1}: turned {foldAngle(snapshot.angle)} degrees from the start.
              </span>
            </div>
          ))}
        </div>

        {isEmpty && (
          <p className="pattern-hint">
            Tap ↺ or ↻ to add your first triangle.
          </p>
        )}
      </div>

      <div className="pattern-controls-area">
        <p className={`pattern-status ${isFull ? 'pattern-status-full' : ''}`} aria-live="polite">
          {isFull
            ? 'Strip is full — press Start over!'
            : `${snapshots.length} of ${maxSnapshots} triangles`}
        </p>

        <RotationControls
          stepDegrees={stepDegrees}
          onCounterClockwise={onCounterClockwise}
          onClockwise={onClockwise}
          onReset={onReset}
          canTurn={!isFull}
          canReset={!isEmpty}
        />
      </div>
    </div>
  );
};

export default PatternBuilder;
