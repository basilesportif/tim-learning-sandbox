import { useState, useEffect, useRef, useCallback } from 'react';
import SoccerField from './components/SoccerField';
import Player from './components/Player';
import DistanceIndicator from './components/DistanceIndicator';
import Instructions from './components/Instructions';
import './App.css';

// Constants for field dimensions (based on SVG viewBox)
const FIELD_WIDTH = 1050;
const FIELD_HEIGHT = 680;
const FIELD_PADDING = 25; // Padding inside the field

function App() {
  // Target distance between players (configurable)
  const [targetDistance, setTargetDistance] = useState(150);

  // Player positions as percentages of field
  const [bluePlayer, setBluePlayer] = useState({ x: 35, y: 50 });
  const [redPlayer, setRedPlayer] = useState({ x: 65, y: 50 });

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const fieldRef = useRef(null);

  // Calculate direction from red player to blue player (for direction indicator)
  const calculateDirection = useCallback((from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.atan2(dy, dx);
  }, []);

  // Calculate distance between two points (in percentage units)
  const calculateDistance = useCallback((p1, p2) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Convert percentage to "pixels" for display (relative to field size)
  const percentToPixels = useCallback((percent) => {
    return (percent / 100) * Math.min(FIELD_WIDTH, FIELD_HEIGHT);
  }, []);

  // Convert pixel distance to percentage
  const pixelsToPercent = useCallback((pixels) => {
    return (pixels / Math.min(FIELD_WIDTH, FIELD_HEIGHT)) * 100;
  }, []);

  // Keep position within field bounds
  const clampPosition = useCallback((pos) => {
    const minX = (FIELD_PADDING / FIELD_WIDTH) * 100 + 3;
    const maxX = ((FIELD_WIDTH - FIELD_PADDING) / FIELD_WIDTH) * 100 - 3;
    const minY = (FIELD_PADDING / FIELD_HEIGHT) * 100 + 3;
    const maxY = ((FIELD_HEIGHT - FIELD_PADDING) / FIELD_HEIGHT) * 100 - 3;

    return {
      x: Math.max(minX, Math.min(maxX, pos.x)),
      y: Math.max(minY, Math.min(maxY, pos.y)),
    };
  }, []);

  // Update red player position to maintain constant distance
  const updateRedPlayer = useCallback(
    (newBluePos) => {
      const targetDistPercent = pixelsToPercent(targetDistance);

      // Calculate current direction from blue to red
      const dx = redPlayer.x - newBluePos.x;
      const dy = redPlayer.y - newBluePos.y;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);

      // If players are too close, we need to use a default direction
      let dirX, dirY;
      if (currentDistance < 0.1) {
        // Default direction (to the right)
        dirX = 1;
        dirY = 0;
      } else {
        // Normalize direction
        dirX = dx / currentDistance;
        dirY = dy / currentDistance;
      }

      // Calculate new position at target distance
      const newRedPos = {
        x: newBluePos.x + dirX * targetDistPercent,
        y: newBluePos.y + dirY * targetDistPercent,
      };

      // Clamp to field bounds
      const clampedPos = clampPosition(newRedPos);

      // If clamped, we might need to adjust to maintain distance
      // by moving along the boundary
      setRedPlayer(clampedPos);
    },
    [redPlayer, targetDistance, pixelsToPercent, clampPosition]
  );

  // Get position from mouse or touch event
  const getEventPosition = useCallback((e, element) => {
    const rect = element.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Convert to percentage of field
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    return { x, y };
  }, []);

  // Handle drag start
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // Handle drag move
  const handleDragMove = useCallback(
    (e) => {
      if (!isDragging || !fieldRef.current) return;

      e.preventDefault();
      const newPos = getEventPosition(e, fieldRef.current);
      const clampedPos = clampPosition(newPos);

      setBluePlayer(clampedPos);
      updateRedPlayer(clampedPos);
    },
    [isDragging, getEventPosition, clampPosition, updateRedPlayer]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add global event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      const handleMove = (e) => handleDragMove(e);
      const handleEnd = () => handleDragEnd();

      // Mouse events
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);

      // Touch events
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
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Calculate current distance for display
  const currentDistancePercent = calculateDistance(bluePlayer, redPlayer);
  const currentDistancePixels = percentToPixels(currentDistancePercent);

  // Calculate directions for indicators
  const blueDirection = calculateDirection(bluePlayer, redPlayer);
  const redDirection = calculateDirection(redPlayer, bluePlayer);

  return (
    <div className="app">
      <Instructions
        targetDistance={targetDistance}
        onDistanceChange={setTargetDistance}
      />

      <div className="field-wrapper" ref={fieldRef}>
        <SoccerField>
          <DistanceIndicator
            x1={bluePlayer.x}
            y1={bluePlayer.y}
            x2={redPlayer.x}
            y2={redPlayer.y}
            targetDistance={targetDistance}
            currentDistance={currentDistancePixels}
          />

          <Player
            x={bluePlayer.x}
            y={bluePlayer.y}
            color="#3b82f6"
            direction={blueDirection}
            isDraggable={true}
            label="You (Defender)"
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          />

          <Player
            x={redPlayer.x}
            y={redPlayer.y}
            color="#ef4444"
            direction={redDirection}
            isReactive={true}
            label="Opponent"
          />
        </SoccerField>
      </div>
    </div>
  );
}

export default App;
