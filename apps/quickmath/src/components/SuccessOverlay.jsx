import './SuccessOverlay.css';

function getSuccessMessage(seconds) {
  if (seconds < 10) {
    return 'Super Fast!';
  }

  if (seconds < 25) {
    return 'Really Quick!';
  }

  return 'Great Job!';
}

function SuccessOverlay({ visible, seconds }) {
  if (!visible) {
    return null;
  }

  const successMessage = getSuccessMessage(seconds);

  return (
    <div className="success-overlay" role="status" aria-live="assertive">
      <div className="success-content">
        <div className="success-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="success-title">{successMessage}</h3>
        <p className="success-time-label">Time taken</p>
        <p className="success-time-value">{seconds}s</p>
      </div>
    </div>
  );
}

export default SuccessOverlay;
