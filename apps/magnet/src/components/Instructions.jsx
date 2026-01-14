import React from 'react';
import './Instructions.css';

const Instructions = ({ targetDistance, onDistanceChange }) => {
  return (
    <div className="instructions">
      <h1 className="title">Soccer Spacing Trainer</h1>
      <p className="description">
        Drag the <span className="blue-text">blue player</span> to see how the <span className="red-text">red player</span> reacts!
      </p>
      <div className="tip-container">
        <div className="tip">
          When you move closer, they move away
        </div>
        <div className="tip">
          When you move away, they follow you
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
  );
};

export default Instructions;
