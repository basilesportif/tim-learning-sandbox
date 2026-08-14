import './AngleReadout.css';

const DIRECTION_TEXT = {
  cw: '↻ clockwise',
  ccw: '↺ counterclockwise',
};

const AngleReadout = ({ displayAngle, lastDirection }) => {
  const directionClass = lastDirection ? `direction-${lastDirection}` : 'direction-none';

  return (
    <div className="angle-readout">
      <p className="angle-label">Turned</p>
      <p className="angle-value">{displayAngle}°</p>
      <p className={`angle-direction ${directionClass}`}>
        {lastDirection ? `Last turn: ${DIRECTION_TEXT[lastDirection]}` : 'Tap a button to turn the shape'}
      </p>
    </div>
  );
};

export default AngleReadout;
