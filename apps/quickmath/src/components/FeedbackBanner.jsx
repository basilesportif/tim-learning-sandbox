import './FeedbackBanner.css';

function FeedbackBanner({ message, seconds, tone }) {
  return (
    <div className={`feedback-banner ${tone}`} role="status" aria-live="polite">
      <p className="feedback-message">{message}</p>
      <p className="feedback-time">Time: {seconds}s</p>
    </div>
  );
}

export default FeedbackBanner;
