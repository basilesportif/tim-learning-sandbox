import React from 'react';
import './Player.css';

const Player = ({
  x,
  y,
  color,
  direction = 0,
  isDraggable = false,
  isReactive = false,
  hasBall = false,
  label,
  onMouseDown,
  onTouchStart,
}) => {
  const playerSize = 40;
  const halfSize = playerSize / 2;

  // Calculate direction indicator position
  const directionLength = 15;
  const dirX = Math.cos(direction) * directionLength;
  const dirY = Math.sin(direction) * directionLength;

  return (
    <div
      className={`player ${isDraggable ? 'draggable' : ''} ${isReactive ? 'reactive' : ''}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        backgroundColor: color,
        width: playerSize,
        height: playerSize,
        transform: 'translate(-50%, -50%)',
      }}
      onMouseDown={isDraggable ? onMouseDown : undefined}
      onTouchStart={isDraggable ? onTouchStart : undefined}
    >
      {/* Direction indicator */}
      <svg
        className="direction-indicator"
        width={playerSize}
        height={playerSize}
        viewBox={`${-halfSize} ${-halfSize} ${playerSize} ${playerSize}`}
      >
        <line
          x1="0"
          y1="0"
          x2={dirX}
          y2={dirY}
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Arrow head */}
        <polygon
          points={`${dirX},${dirY} ${dirX - 6 * Math.cos(direction - 0.5)},${dirY - 6 * Math.sin(direction - 0.5)} ${dirX - 6 * Math.cos(direction + 0.5)},${dirY - 6 * Math.sin(direction + 0.5)}`}
          fill="white"
        />
      </svg>

      {/* Soccer ball at feet */}
      {hasBall && (
        <div className="soccer-ball">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="7" fill="white" stroke="#333" strokeWidth="1"/>
            <path d="M8 1 L6 4 L2 5 L3 9 L1 12 L5 14 L8 15 L11 14 L15 12 L13 9 L14 5 L10 4 Z"
                  fill="none" stroke="#333" strokeWidth="0.5"/>
            <circle cx="8" cy="8" r="2.5" fill="none" stroke="#333" strokeWidth="0.5"/>
          </svg>
        </div>
      )}

      {/* Player label */}
      {label && (
        <span className="player-label">{label}</span>
      )}
    </div>
  );
};

export default Player;
