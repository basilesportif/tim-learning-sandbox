import './TargetPanel.css';

const TargetPanel = ({
  promptText,
  constraints,
  currentPrompt,
  totalPrompts,
  levelName,
}) => {
  return (
    <div className="target-panel">
      <div className="target-header">
        <div className="target-level">
          <span className="level-badge">{levelName}</span>
        </div>
        <div className="target-progress">
          <span className="progress-text">
            {currentPrompt} / {totalPrompts}
          </span>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(currentPrompt / totalPrompts) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="target-content">
        <div className="clipboard-top">
          <div className="clipboard-clip" />
        </div>
        <div className="prompt-area">
          <p className="prompt-text">{promptText}</p>
          {constraints && (
            <p className="constraints-text">{constraints}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TargetPanel;
