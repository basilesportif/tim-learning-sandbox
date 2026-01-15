import { useEffect } from 'react';
import './FeedbackOverlay.css';

const FeedbackOverlay = ({
  state, // 'correct' | 'incorrect' | null
  correctAnswer,
  mode, // 'read' | 'set' | 'hour-only' | 'minute-only'
  onDismiss,
}) => {
  // Auto-dismiss after delay
  useEffect(() => {
    if (state) {
      const timer = setTimeout(() => {
        onDismiss();
      }, state === 'correct' ? 1500 : 2000);
      return () => clearTimeout(timer);
    }
  }, [state, onDismiss]);

  if (!state) return null;

  const isCorrect = state === 'correct';

  // Format the correct answer based on mode
  const formatAnswer = () => {
    if (!correctAnswer) return '';
    if (mode === 'hour-only') {
      return correctAnswer.hour.toString();
    }
    if (mode === 'minute-only') {
      return correctAnswer.minute.toString().padStart(2, '0');
    }
    return `${correctAnswer.hour}:${correctAnswer.minute.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`feedback-overlay ${state}`} onClick={onDismiss}>
      <div className="feedback-content">
        <div className="feedback-icon">
          {isCorrect ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <h3 className="feedback-text">
          {isCorrect ? 'Great job!' : 'Try again!'}
        </h3>
        {!isCorrect && correctAnswer && (
          <p className="correct-answer">
            The answer was {formatAnswer()}
          </p>
        )}
        <p className="feedback-hint">
          {isCorrect ? 'Keep it up!' : 'Tap to continue'}
        </p>
      </div>
    </div>
  );
};

export default FeedbackOverlay;
