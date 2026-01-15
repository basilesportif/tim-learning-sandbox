import './NumberPad.css';

const NumberPad = ({
  mode, // 'read' | 'hour-only' | 'minute-only'
  selectedHour,
  selectedMinute,
  onHourSelect,
  onMinuteSelect,
  onSubmit,
  disabled = false,
}) => {
  const showHours = mode === 'read' || mode === 'hour-only';
  const showMinutes = mode === 'read' || mode === 'minute-only';

  // Hours 1-12
  const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // Minutes 0-55 by 5s
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const canSubmit = (showHours ? selectedHour !== null : true) &&
                    (showMinutes ? selectedMinute !== null : true);

  return (
    <div className={`number-pad ${disabled ? 'disabled' : ''}`}>
      {showHours && (
        <div className="pad-section">
          <h3 className="pad-label">Hour</h3>
          <div className="button-grid hours-grid">
            {hours.map((h) => (
              <button
                key={h}
                className={`number-button ${selectedHour === h ? 'selected' : ''}`}
                onClick={() => !disabled && onHourSelect(h)}
                disabled={disabled}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      )}

      {showMinutes && (
        <div className="pad-section">
          <h3 className="pad-label">Minute</h3>
          <div className="button-grid minutes-grid">
            {minutes.map((m) => (
              <button
                key={m}
                className={`number-button ${selectedMinute === m ? 'selected' : ''}`}
                onClick={() => !disabled && onMinuteSelect(m)}
                disabled={disabled}
              >
                {m.toString().padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        className={`submit-button ${canSubmit ? 'ready' : ''}`}
        onClick={onSubmit}
        disabled={disabled || !canSubmit}
      >
        Check Answer
      </button>
    </div>
  );
};

export default NumberPad;
