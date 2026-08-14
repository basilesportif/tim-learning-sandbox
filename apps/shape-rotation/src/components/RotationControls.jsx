import './RotationControls.css';

const RotationControls = ({
  stepDegrees,
  onCounterClockwise,
  onClockwise,
  onReset,
  canTurn = true,
  canReset = true,
}) => {
  // When the pattern strip is full the turn buttons go quiet, but they stay
  // focusable: using the `disabled` attribute here would throw focus back to
  // <body> at the very moment the last button was pressed. aria-disabled tells
  // assistive tech the same thing while keeping the button in the tab order.
  const guard = (handler) => () => {
    if (!canTurn) return;
    handler();
  };

  return (
    <div className="rotation-controls">
      <div className="turn-buttons">
        <button
          type="button"
          className="turn-button turn-ccw"
          onClick={guard(onCounterClockwise)}
          aria-disabled={!canTurn}
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
          onClick={guard(onClockwise)}
          aria-disabled={!canTurn}
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
