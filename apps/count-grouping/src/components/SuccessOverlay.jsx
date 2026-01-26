import './SuccessOverlay.css';

const SuccessOverlay = ({
  isSuccess,
  message,
  onNext,
  onRetry,
  visible,
}) => {
  if (!visible) return null;

  return (
    <div className={`success-overlay ${isSuccess ? 'success' : 'incorrect'}`}>
      <div className="success-content">
        {isSuccess && <div className="confetti-container" aria-hidden="true">
          {[...Array(12)].map((_, i) => (
            <div key={i} className={`confetti confetti-${i + 1}`} />
          ))}
        </div>}

        <div className="success-icon">
          {isSuccess ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path d="M8 15s1.5-2 4-2 4 2 4 2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="9" y1="9" x2="9.01" y2="9" strokeLinecap="round" />
              <line x1="15" y1="9" x2="15.01" y2="9" strokeLinecap="round" />
            </svg>
          )}
        </div>

        <h2 className="success-title">
          {isSuccess ? 'Great job!' : 'Almost!'}
        </h2>

        {message && (
          <p className="success-message">{message}</p>
        )}

        <div className="success-buttons">
          {isSuccess ? (
            <button
              className="success-button next-button"
              onClick={onNext}
            >
              Next Challenge
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <button
              className="success-button retry-button"
              onClick={onRetry}
            >
              Try Again
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuccessOverlay;
