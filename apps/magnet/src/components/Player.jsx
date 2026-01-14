import React from 'react';
import './Player.css';

const Player = ({
  x,
  y,
  color,
  direction = 0,
  isDraggable = false,
  isReactive = false,
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

      {/* Player label */}
      {label && (
        <span className="player-label">{label}</span>
      )}
    </div>
  );
};

export default Player;
