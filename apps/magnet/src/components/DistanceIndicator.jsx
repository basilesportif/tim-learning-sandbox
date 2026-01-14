import React from 'react';
import './DistanceIndicator.css';

const DistanceIndicator = ({
  x1,
  y1,
  x2,
  y2,
  targetDistance,
  currentDistance
}) => {
  // Calculate actual pixel distance for display
  const displayDistance = Math.round(currentDistance);

  // Determine if we're at target distance (within tolerance)
  const tolerance = 2;
  const isAtTarget = Math.abs(currentDistance - targetDistance) < tolerance;

  return (
    <svg className="distance-indicator" viewBox="0 0 100 100" preserveAspectRatio="none">
      {/* Dashed line between players */}
      <line
        x1={`${x1}%`}
        y1={`${y1}%`}
        x2={`${x2}%`}
        y2={`${y2}%`}
        stroke={isAtTarget ? '#4ade80' : '#fbbf24'}
        strokeWidth="0.3"
        strokeDasharray="1 0.5"
        strokeOpacity="0.8"
      />

      {/* Distance label at midpoint */}
      <text
        x={`${(x1 + x2) / 2}%`}
        y={`${(y1 + y2) / 2}%`}
        fill="white"
        fontSize="2.5"
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          textShadow: '0 0 3px rgba(0,0,0,0.8)',
          paintOrder: 'stroke',
          stroke: 'rgba(0,0,0,0.5)',
          strokeWidth: '0.3px'
        }}
      >
        {displayDistance}px
      </text>
    </svg>
  );
};

export default DistanceIndicator;
