import './ControlBar.css';

const ControlBar = ({
  onHint,
  onUndo,
  onCheck,
  hintDisabled = false,
  undoDisabled = false,
  checkDisabled = false,
}) => {
  return (
    <div className="control-bar">
      <button
        className={`control-button hint-button ${hintDisabled ? 'disabled' : ''}`}
        onClick={onHint}
        disabled={hintDisabled}
        aria-label="Get a hint"
      >
        <span className="control-icon">💡</span>
        <span className="control-label">Hint</span>
      </button>

      <button
        className={`control-button undo-button ${undoDisabled ? 'disabled' : ''}`}
        onClick={onUndo}
        disabled={undoDisabled}
        aria-label="Undo last action"
      >
        <span className="control-icon">↩️</span>
        <span className="control-label">Undo</span>
      </button>

      <button
        className={`control-button check-button ${checkDisabled ? 'disabled' : ''}`}
        onClick={onCheck}
        disabled={checkDisabled}
        aria-label="Check answer"
      >
        <span className="control-icon">✓</span>
        <span className="control-label">Check</span>
      </button>
    </div>
  );
};

export default ControlBar;
