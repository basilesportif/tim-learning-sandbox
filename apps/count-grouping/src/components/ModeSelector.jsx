import './ModeSelector.css';

const modes = [
  { id: 'free', label: 'Free Play', emoji: '🎮' },
  { id: 'challenge', label: 'Coach Challenges', emoji: '🏆' },
  { id: 'build', label: 'Build Numbers', emoji: '🎯' },
];

const ModeSelector = ({ mode, onModeChange }) => {
  return (
    <div className="mode-selector">
      {modes.map((m) => (
        <button
          key={m.id}
          className={`mode-tab ${mode === m.id ? 'active' : ''}`}
          onClick={() => onModeChange(m.id)}
          aria-pressed={mode === m.id}
        >
          <span className="mode-tab-emoji">{m.emoji}</span>
          <span className="mode-tab-label">{m.label}</span>
        </button>
      ))}
    </div>
  );
};

export default ModeSelector;
