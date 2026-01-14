import React, { useState } from 'react';
import './Instructions.css';

const Instructions = ({ targetDistance, onDistanceChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`instructions ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button
        className="instructions-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <h1 className="title">Soccer Spacing</h1>
        <svg
          className={`chevron ${isExpanded ? 'up' : 'down'}`}
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isExpanded && (
        <div className="instructions-content">
          <p className="description">
            Drag the <span className="blue-text">ball carrier</span> to see how your <span className="red-text">teammate</span> should move!
          </p>
          <div className="tip-container">
            <div className="tip">
              When you dribble closer, they create space
            </div>
            <div className="tip">
              When you move away, they stay connected
            </div>
          </div>
          <div className="distance-control">
            <label htmlFor="distance-slider">
              Spacing Distance: <strong>{targetDistance}px</strong>
            </label>
            <input
              id="distance-slider"
              type="range"
              min="80"
              max="250"
              value={targetDistance}
              onChange={(e) => onDistanceChange(Number(e.target.value))}
              className="slider"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Instructions;
