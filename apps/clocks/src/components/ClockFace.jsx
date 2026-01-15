import { useRef, useCallback, useEffect } from 'react';
import { hourToAngle, minuteToAngle, angleToHour, angleToMinute } from '../lib/timeUtils';
import './ClockFace.css';

const ClockFace = ({
  hour,
  minute,
  interactive = false,
  onTimeChange,
  feedbackState = null, // 'correct' | 'incorrect' | null
}) => {
  const svgRef = useRef(null);
  const draggingRef = useRef(null); // 'hour' | 'minute' | null

  // Calculate hand angles
  const hourAngle = hourToAngle(hour, minute);
  const minuteAngle = minuteToAngle(minute);

  // Get center of SVG in screen coordinates
  const getSvgCenter = useCallback(() => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, []);

  // Calculate angle from center to cursor
  const getAngleFromEvent = useCallback((e) => {
    const center = getSvgCenter();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    const dx = clientX - center.x;
    const dy = clientY - center.y;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }, [getSvgCenter]);

  // Handle drag start on a hand
  const handleDragStart = useCallback((hand) => (e) => {
    if (!interactive) return;
    e.preventDefault();
    draggingRef.current = hand;
  }, [interactive]);

  // Handle drag move
  const handleDragMove = useCallback((e) => {
    if (!draggingRef.current || !onTimeChange) return;
    e.preventDefault();

    const angle = getAngleFromEvent(e);

    if (draggingRef.current === 'hour') {
      const newHour = angleToHour(angle);
      onTimeChange({ hour: newHour, minute });
    } else if (draggingRef.current === 'minute') {
      const newMinute = angleToMinute(angle);
      // When minute changes, update hour hand position proportionally
      onTimeChange({ hour, minute: newMinute });
    }
  }, [getAngleFromEvent, onTimeChange, hour, minute]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // Add global event listeners for dragging
  useEffect(() => {
    if (!interactive) return;

    const handleMove = (e) => {
      if (draggingRef.current) {
        handleDragMove(e);
      }
    };
    const handleEnd = () => handleDragEnd();

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [interactive, handleDragMove, handleDragEnd]);

  // Generate hour numbers positioned around the clock
  const hourNumbers = [];
  for (let i = 1; i <= 12; i++) {
    const angle = (i * 30 - 90) * (Math.PI / 180);
    const radius = 72;
    const x = 100 + Math.cos(angle) * radius;
    const y = 100 + Math.sin(angle) * radius;
    hourNumbers.push(
      <text
        key={i}
        x={x}
        y={y}
        className="clock-number"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {i}
      </text>
    );
  }

  // Generate tick marks
  const ticks = [];
  for (let i = 0; i < 60; i++) {
    const angle = (i * 6 - 90) * (Math.PI / 180);
    const isHour = i % 5 === 0;
    const innerRadius = isHour ? 82 : 86;
    const outerRadius = 90;
    const x1 = 100 + Math.cos(angle) * innerRadius;
    const y1 = 100 + Math.sin(angle) * innerRadius;
    const x2 = 100 + Math.cos(angle) * outerRadius;
    const y2 = 100 + Math.sin(angle) * outerRadius;
    ticks.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        className={isHour ? 'tick-major' : 'tick-minor'}
      />
    );
  }

  const feedbackClass = feedbackState ? `feedback-${feedbackState}` : '';

  return (
    <div className={`clock-container ${feedbackClass}`}>
      <svg
        ref={svgRef}
        className="clock-face"
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Clock face background */}
        <circle cx="100" cy="100" r="95" className="clock-bg" />
        <circle cx="100" cy="100" r="92" className="clock-inner" />

        {/* Tick marks */}
        {ticks}

        {/* Hour numbers */}
        {hourNumbers}

        {/* Hour hand */}
        <g
          className={`hand hour-hand ${interactive ? 'interactive' : ''}`}
          style={{ transform: `rotate(${hourAngle}deg)`, transformOrigin: '100px 100px' }}
          onMouseDown={handleDragStart('hour')}
          onTouchStart={handleDragStart('hour')}
        >
          <line x1="100" y1="100" x2="100" y2="55" />
          {interactive && <circle cx="100" cy="55" r="12" className="hand-grab" />}
        </g>

        {/* Minute hand */}
        <g
          className={`hand minute-hand ${interactive ? 'interactive' : ''}`}
          style={{ transform: `rotate(${minuteAngle}deg)`, transformOrigin: '100px 100px' }}
          onMouseDown={handleDragStart('minute')}
          onTouchStart={handleDragStart('minute')}
        >
          <line x1="100" y1="100" x2="100" y2="30" />
          {interactive && <circle cx="100" cy="30" r="12" className="hand-grab" />}
        </g>

        {/* Center dot */}
        <circle cx="100" cy="100" r="6" className="clock-center" />
      </svg>
    </div>
  );
};

export default ClockFace;
