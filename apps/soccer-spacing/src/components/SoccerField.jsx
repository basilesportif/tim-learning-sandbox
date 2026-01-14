import React from 'react';
import './SoccerField.css';

// Zone boundaries (as percentages of the playable field HEIGHT)
// Field playable area: y=25 to y=655 (height 630)
// Left wing = TOP of field, Right wing = BOTTOM of field
const ZONE_CONFIG = {
  left: { start: 25, end: 214 },    // Top 30% (0-30%)
  middle: { start: 214, end: 466 }, // Middle 40% (30-70%)
  right: { start: 466, end: 655 },  // Bottom 30% (70-100%)
};

const SoccerField = ({ children, selectedZone }) => {
  return (
    <div className="soccer-field-container">
      <svg
        className="soccer-field"
        viewBox="0 0 1050 680"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Field background */}
        <rect
          x="0"
          y="0"
          width="1050"
          height="680"
          fill="#2d8a3e"
          className="field-grass"
        />

        {/* Grass stripes for visual effect */}
        {[...Array(14)].map((_, i) => (
          <rect
            key={i}
            x={i * 75}
            y="0"
            width="75"
            height="680"
            fill={i % 2 === 0 ? '#2d8a3e' : '#34a047'}
          />
        ))}

        {/* Zone corridor overlays - HORIZONTAL bands */}
        <g className="zone-corridors">
          {/* Left Wing Zone (TOP of field) */}
          <rect
            x="25"
            y={ZONE_CONFIG.left.start}
            width="1000"
            height={ZONE_CONFIG.left.end - ZONE_CONFIG.left.start}
            fill="rgba(147, 197, 253, 0.15)"
            className={`zone-corridor zone-left ${selectedZone === 'left' ? 'active' : ''}`}
          />
          {/* Middle Zone */}
          <rect
            x="25"
            y={ZONE_CONFIG.middle.start}
            width="1000"
            height={ZONE_CONFIG.middle.end - ZONE_CONFIG.middle.start}
            fill="rgba(253, 224, 71, 0.1)"
            className={`zone-corridor zone-middle ${selectedZone === 'middle' ? 'active' : ''}`}
          />
          {/* Right Wing Zone (BOTTOM of field) */}
          <rect
            x="25"
            y={ZONE_CONFIG.right.start}
            width="1000"
            height={ZONE_CONFIG.right.end - ZONE_CONFIG.right.start}
            fill="rgba(252, 165, 165, 0.15)"
            className={`zone-corridor zone-right ${selectedZone === 'right' ? 'active' : ''}`}
          />

          {/* Zone divider lines - HORIZONTAL */}
          <line
            x1="25"
            y1={ZONE_CONFIG.left.end}
            x2="1025"
            y2={ZONE_CONFIG.left.end}
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="2"
            strokeDasharray="10,5"
          />
          <line
            x1="25"
            y1={ZONE_CONFIG.middle.end}
            x2="1025"
            y2={ZONE_CONFIG.middle.end}
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="2"
            strokeDasharray="10,5"
          />
        </g>

        {/* Field outline */}
        <rect
          x="25"
          y="25"
          width="1000"
          height="630"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Halfway line */}
        <line
          x1="525"
          y1="25"
          x2="525"
          y2="655"
          stroke="white"
          strokeWidth="3"
        />

        {/* Center circle */}
        <circle
          cx="525"
          cy="340"
          r="91.5"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Center spot */}
        <circle
          cx="525"
          cy="340"
          r="5"
          fill="white"
        />

        {/* Left penalty area */}
        <rect
          x="25"
          y="138.5"
          width="165"
          height="403"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Left goal area (6-yard box) */}
        <rect
          x="25"
          y="248.5"
          width="55"
          height="183"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Left penalty spot */}
        <circle
          cx="135"
          cy="340"
          r="5"
          fill="white"
        />

        {/* Left penalty arc */}
        <path
          d="M 190 278.5 A 91.5 91.5 0 0 1 190 401.5"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Left goal */}
        <rect
          x="5"
          y="290"
          width="20"
          height="100"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Right penalty area */}
        <rect
          x="860"
          y="138.5"
          width="165"
          height="403"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Right goal area (6-yard box) */}
        <rect
          x="970"
          y="248.5"
          width="55"
          height="183"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Right penalty spot */}
        <circle
          cx="915"
          cy="340"
          r="5"
          fill="white"
        />

        {/* Right penalty arc */}
        <path
          d="M 860 278.5 A 91.5 91.5 0 0 0 860 401.5"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Right goal */}
        <rect
          x="1025"
          y="290"
          width="20"
          height="100"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Corner arcs */}
        {/* Top-left */}
        <path
          d="M 25 35 A 10 10 0 0 0 35 25"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Top-right */}
        <path
          d="M 1015 25 A 10 10 0 0 0 1025 35"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Bottom-left */}
        <path
          d="M 35 655 A 10 10 0 0 0 25 645"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />

        {/* Bottom-right */}
        <path
          d="M 1025 645 A 10 10 0 0 0 1015 655"
          fill="none"
          stroke="white"
          strokeWidth="3"
        />
      </svg>
      {children}
    </div>
  );
};

export default SoccerField;
