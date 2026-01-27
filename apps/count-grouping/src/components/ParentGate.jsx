import { useState, useEffect, useRef } from 'react';
import './ParentGate.css';

/**
 * Generate a random integer between min and max (inclusive)
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a new multiplication problem with numbers 6-12
 */
function generateProblem() {
  const a = randomInt(6, 12);
  const b = randomInt(6, 12);
  return { a, b, answer: a * b };
}

const ParentGate = ({ visible, onSuccess, onCancel }) => {
  const [problem, setProblem] = useState(generateProblem);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef(null);

  // Generate new problem when modal becomes visible
  useEffect(() => {
    if (visible) {
      setProblem(generateProblem());
      setInput('');
      setError(false);
      // Focus input after a short delay to allow animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [visible]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    setError(false);
  };

  const handleConfirm = () => {
    const userAnswer = parseInt(input, 10);
    if (userAnswer === problem.answer) {
      onSuccess();
    } else {
      setError(true);
      setProblem(generateProblem());
      setInput('');
      // Focus input for retry
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  if (!visible) return null;

  return (
    <div className="parent-gate-overlay" onClick={onCancel}>
      <div className="parent-gate-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="parent-gate-title">Parent Verification</h2>
        <p className="parent-gate-question">
          What is {problem.a} × {problem.b}?
        </p>
        <input
          ref={inputRef}
          type="number"
          className={`parent-gate-input ${error ? 'error' : ''}`}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter answer"
          inputMode="numeric"
        />
        {error && (
          <p className="parent-gate-error">Incorrect, try again</p>
        )}
        <div className="parent-gate-buttons">
          <button
            className="parent-gate-btn cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="parent-gate-btn confirm"
            onClick={handleConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParentGate;
