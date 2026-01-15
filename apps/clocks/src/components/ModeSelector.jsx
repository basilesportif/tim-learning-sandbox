import { useState } from 'react';
import './ModeSelector.css';

const modes = [
  { id: 'read', label: 'Read Time', emoji: '👀' },
  { id: 'set', label: 'Set Time', emoji: '✋' },
  { id: 'hour-only', label: 'Hour Only', emoji: '🔴' },
  { id: 'minute-only', label: 'Minute Only', emoji: '🔵' },
];

const ModeSelector = ({ selectedMode, onModeChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleModeSelect = (modeId) => {
    onModeChange(modeId);
    setIsOpen(false);
  };

  return (
    <>
      {/* Hamburger button - only visible on mobile */}
      <button
        className="hamburger-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
      >
        <span className="hamburger-icon">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`mode-sidebar ${isOpen ? 'open' : ''}`}>
        <nav className="mode-nav">
          {modes.map((mode) => (
            <button
              key={mode.id}
              className={`mode-button ${selectedMode === mode.id ? 'active' : ''}`}
              onClick={() => handleModeSelect(mode.id)}
            >
              <span className="mode-emoji">{mode.emoji}</span>
              <span className="mode-label">{mode.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
};

export default ModeSelector;
