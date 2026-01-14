import React from 'react';
import './DistanceIndicator.css';

// Standard soccer field: 105m x 68m, SVG viewBox: 1050 x 680
// So 10 SVG units = 1 meter
const PIXELS_PER_METER = 10;

const DistanceIndicator = ({
  x1,
  y1,
  x2,
  y2,
  targetDistance,
  currentDistance
}) => {
  // Convert pixels to meters (10 SVG units = 1 meter on a real field)
  const displayMeters = (currentDistance / PIXELS_PER_METER).toFixed(1);

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
        {displayMeters}m
      </text>
    </svg>
  );
};

export default DistanceIndicator;
