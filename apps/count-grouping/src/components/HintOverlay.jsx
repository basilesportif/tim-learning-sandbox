import './HintOverlay.css';

const HintOverlay = ({
  message,
  visible,
  onDismiss,
}) => {
  if (!visible) return null;

  return (
    <div className="hint-overlay">
      <div className="hint-bubble">
        <div className="hint-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="hint-message">{message}</p>
        <button
          className="hint-dismiss-button"
          onClick={onDismiss}
          aria-label="Dismiss hint"
        >
          Got it!
        </button>
      </div>
    </div>
  );
};

export default HintOverlay;
