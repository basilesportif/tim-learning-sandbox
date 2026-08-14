import './ModeTabs.css';

// Two ways to play with the same triangle.
const MODES = [
  { id: 'free', label: 'Free Rotate' },
  { id: 'pattern', label: 'Pattern Builder' },
];

const ModeTabs = ({ mode, onModeChange }) => {
  return (
    <div className="mode-tabs" role="tablist" aria-label="Choose a mode">
      {MODES.map((entry) => {
        const isActive = entry.id === mode;

        return (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`mode-tab ${isActive ? 'mode-tab-active' : ''}`}
            onClick={() => onModeChange(entry.id)}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
};

export default ModeTabs;
