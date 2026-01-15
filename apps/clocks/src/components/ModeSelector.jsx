import './ModeSelector.css';

const modes = [
  { id: 'read', label: 'Read Time', emoji: '👀' },
  { id: 'set', label: 'Set Time', emoji: '✋' },
  { id: 'hour-only', label: 'Hour Only', emoji: '🔴' },
  { id: 'minute-only', label: 'Minute Only', emoji: '🔵' },
];

const ModeSelector = ({ selectedMode, onModeChange }) => {
  return (
    <div className="mode-selector">
      <div className="mode-buttons">
        {modes.map((mode) => (
          <button
            key={mode.id}
            className={`mode-button ${selectedMode === mode.id ? 'active' : ''}`}
            onClick={() => onModeChange(mode.id)}
          >
            <span className="mode-emoji">{mode.emoji}</span>
            <span className="mode-label">{mode.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ModeSelector;
