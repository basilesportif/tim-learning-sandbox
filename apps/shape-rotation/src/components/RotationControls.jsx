import './RotationControls.css';

const RotationControls = ({
  stepDegrees,
  onCounterClockwise,
  onClockwise,
  onReset,
  canTurn = true,
  canReset = true,
}) => {
  return (
    <div className="rotation-controls">
      <div className="turn-buttons">
        <button
          type="button"
          className="turn-button turn-ccw"
          onClick={onCounterClockwise}
          disabled={!canTurn}
          aria-label={`Turn counterclockwise ${stepDegrees} degrees`}
        >
          <span className="turn-arrow" aria-hidden="true">↺</span>
          <span className="turn-text">
            <span className="turn-label">Counterclockwise</span>
            <span className="turn-step">{stepDegrees}°</span>
          </span>
        </button>

        <button
          type="button"
          className="turn-button turn-cw"
          onClick={onClockwise}
          disabled={!canTurn}
          aria-label={`Turn clockwise ${stepDegrees} degrees`}
        >
          <span className="turn-arrow" aria-hidden="true">↻</span>
          <span className="turn-text">
            <span className="turn-label">Clockwise</span>
            <span className="turn-step">{stepDegrees}°</span>
          </span>
        </button>
      </div>

      <button
        type="button"
        className="reset-button"
        onClick={onReset}
        disabled={!canReset}
      >
        Start over
      </button>
    </div>
  );
};

export default RotationControls;
