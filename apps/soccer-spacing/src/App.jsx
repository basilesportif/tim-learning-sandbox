import { useState, useEffect, useRef, useCallback } from 'react';
import SoccerField from './components/SoccerField';
import Player from './components/Player';
import DistanceIndicator from './components/DistanceIndicator';
import Instructions from './components/Instructions';
import ZoneSelector from './components/ZoneSelector';
import './App.css';

// Constants for field dimensions (based on SVG viewBox)
const FIELD_WIDTH = 1050;
const FIELD_HEIGHT = 680;

// Animation constants
const MOVEMENT_DELAY_MS = 1000; // 1 second delay before red player starts moving
const LERP_FACTOR = 0.12; // How fast the red player moves toward target (0-1, lower = slower)
const POSITION_THRESHOLD = 0.1; // Stop animating when within this distance of target

// Field boundaries as percentages (playable area with buffer for player size)
// SVG grass area: x=25-1025, y=25-655
// Adding buffer so player circles don't overlap the lines
const FIELD_BOUNDS = {
  minX: 5,   // ~5% from left edge
  maxX: 95,  // ~95% from left edge
  minY: 6,   // ~6% from top edge
  maxY: 94,  // ~94% from top edge
};

// Zone boundaries as percentages of field HEIGHT
// Based on playable area: y=25 to y=655 (630px height)
// Left wing = TOP, Right wing = BOTTOM
const ZONE_BOUNDS = {
  left: { minY: 6, maxY: 28 },      // Top ~30%
  middle: { minY: 34, maxY: 66 },   // Middle ~40%
  right: { minY: 72, maxY: 94 },    // Bottom ~30%
};

function App() {
  // Target distance between players (configurable)
  const [targetDistance, setTargetDistance] = useState(150);

  // Zone selection for red player constraint
  const [selectedZone, setSelectedZone] = useState('middle');

  // Player positions as percentages of field
  const [bluePlayer, setBluePlayer] = useState({ x: 35, y: 50 });
  const [redPlayer, setRedPlayer] = useState({ x: 65, y: 50 });

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const fieldRef = useRef(null);

  // Refs for delayed red player movement
  const redPlayerTargetRef = useRef({ x: 65, y: 50 }); // Target position red player should move toward
  const movementDelayTimerRef = useRef(null); // Timer for 1 second delay
  const animationFrameRef = useRef(null); // requestAnimationFrame ID
  const isAnimatingRef = useRef(false); // Whether animation is currently running
  const selectedZoneRef = useRef('middle'); // Track zone for animation clamping

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
    return {
      x: Math.max(FIELD_BOUNDS.minX, Math.min(FIELD_BOUNDS.maxX, pos.x)),
      y: Math.max(FIELD_BOUNDS.minY, Math.min(FIELD_BOUNDS.maxY, pos.y)),
    };
  }, []);

  // Keep position within field bounds AND the selected zone (for red player)
  // Zone constrains Y (top/bottom), X is free within field bounds
  const clampToZone = useCallback((pos, zone) => {
    const zoneBounds = ZONE_BOUNDS[zone];
    return {
      x: Math.max(FIELD_BOUNDS.minX, Math.min(FIELD_BOUNDS.maxX, pos.x)),
      y: Math.max(zoneBounds.minY, Math.min(zoneBounds.maxY, pos.y)),
    };
  }, []);

  // Calculate the ideal target position for red player (maintains distance from blue, constrained to zone)
  const calculateRedPlayerTarget = useCallback(
    (newBluePos, currentRedPos, zone) => {
      const targetDistPercent = pixelsToPercent(targetDistance);
      const zoneBounds = ZONE_BOUNDS[zone];

      // Calculate current direction from blue to red
      const dx = currentRedPos.x - newBluePos.x;
      const dy = currentRedPos.y - newBluePos.y;
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
      let newRedPos = {
        x: newBluePos.x + dirX * targetDistPercent,
        y: newBluePos.y + dirY * targetDistPercent,
      };

      // Clamp to zone bounds first
      newRedPos = clampToZone(newRedPos, zone);

      // If clamping significantly changed the position, try to maintain distance
      // by adjusting along the zone boundary
      const clampedDx = newRedPos.x - newBluePos.x;
      const clampedDy = newRedPos.y - newBluePos.y;
      const clampedDistance = Math.sqrt(clampedDx * clampedDx + clampedDy * clampedDy);

      // If we're too close after clamping, try to move horizontally to maintain distance
      if (clampedDistance < targetDistPercent * 0.7) {
        // Determine which edge we're constrained to (top or bottom of zone)
        const atTopEdge = newRedPos.y <= zoneBounds.minY + 1;
        const atBottomEdge = newRedPos.y >= zoneBounds.maxY - 1;

        if (atTopEdge || atBottomEdge) {
          // Calculate how much horizontal distance we need
          const verticalDist = Math.abs(newRedPos.y - newBluePos.y);
          const horizontalDistNeeded = Math.sqrt(
            Math.max(0, targetDistPercent * targetDistPercent - verticalDist * verticalDist)
          );

          // Move horizontally in the direction we were heading
          const horizontalDir = dx >= 0 ? 1 : -1;
          newRedPos.x = newBluePos.x + horizontalDir * horizontalDistNeeded;
        }
      }

      // Final clamp to zone bounds
      return clampToZone(newRedPos, zone);
    },
    [targetDistance, pixelsToPercent, clampToZone]
  );

  // Animate red player toward target position using lerp
  const animateRedPlayer = useCallback(() => {
    const target = redPlayerTargetRef.current;
    const zone = selectedZoneRef.current;
    const zoneBounds = ZONE_BOUNDS[zone];

    setRedPlayer((currentPos) => {
      const dx = target.x - currentPos.x;
      const dy = target.y - currentPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // If close enough to target, snap to it and stop animating
      if (distance < POSITION_THRESHOLD) {
        isAnimatingRef.current = false;
        // Clamp final position to be safe
        return {
          x: Math.max(FIELD_BOUNDS.minX, Math.min(FIELD_BOUNDS.maxX, target.x)),
          y: Math.max(zoneBounds.minY, Math.min(zoneBounds.maxY, target.y)),
        };
      }

      // Lerp toward target position
      const newPos = {
        x: currentPos.x + dx * LERP_FACTOR,
        y: currentPos.y + dy * LERP_FACTOR,
      };

      // Always clamp to field bounds and zone - safety net
      return {
        x: Math.max(FIELD_BOUNDS.minX, Math.min(FIELD_BOUNDS.maxX, newPos.x)),
        y: Math.max(zoneBounds.minY, Math.min(zoneBounds.maxY, newPos.y)),
      };
    });

    // Continue animation if still needed
    if (isAnimatingRef.current) {
      animationFrameRef.current = requestAnimationFrame(animateRedPlayer);
    }
  }, []);

  // Start the delayed movement animation
  const startDelayedMovement = useCallback(() => {
    // Clear any existing delay timer (reset the delay when blue player keeps moving)
    if (movementDelayTimerRef.current) {
      clearTimeout(movementDelayTimerRef.current);
    }

    // If already animating, just let it continue toward the new target
    // (the target ref is already updated)
    if (isAnimatingRef.current) {
      return;
    }

    // Set up the delay before starting animation
    movementDelayTimerRef.current = setTimeout(() => {
      // Start animation if not already running
      if (!isAnimatingRef.current) {
        isAnimatingRef.current = true;
        animationFrameRef.current = requestAnimationFrame(animateRedPlayer);
      }
    }, MOVEMENT_DELAY_MS);
  }, [animateRedPlayer]);

  // Update red player target position (called when blue player moves)
  const updateRedPlayerTarget = useCallback(
    (newBluePos) => {
      // Calculate where red player should end up (constrained to selected zone)
      const newTarget = calculateRedPlayerTarget(newBluePos, redPlayerTargetRef.current, selectedZone);
      redPlayerTargetRef.current = newTarget;

      // Start the delayed movement toward target
      startDelayedMovement();
    },
    [calculateRedPlayerTarget, startDelayedMovement, selectedZone]
  );

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (movementDelayTimerRef.current) {
        clearTimeout(movementDelayTimerRef.current);
      }
    };
  }, []);

  // When zone changes, immediately reposition red player to the new zone
  useEffect(() => {
    // Update the zone ref so animation can access it
    selectedZoneRef.current = selectedZone;

    const newTarget = calculateRedPlayerTarget(bluePlayer, redPlayer, selectedZone);
    redPlayerTargetRef.current = newTarget;

    // Start animation to move to new zone
    if (!isAnimatingRef.current) {
      isAnimatingRef.current = true;
      animationFrameRef.current = requestAnimationFrame(animateRedPlayer);
    }
  }, [selectedZone]); // Only trigger when zone changes

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
      updateRedPlayerTarget(clampedPos);
    },
    [isDragging, getEventPosition, clampPosition, updateRedPlayerTarget]
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

  // Final safety clamp for both players before rendering
  const safeBluePlayer = clampPosition(bluePlayer);
  const safeRedPlayer = {
    x: Math.max(FIELD_BOUNDS.minX, Math.min(FIELD_BOUNDS.maxX, redPlayer.x)),
    y: Math.max(ZONE_BOUNDS[selectedZone].minY, Math.min(ZONE_BOUNDS[selectedZone].maxY, redPlayer.y)),
  };

  // Calculate current distance for display
  const currentDistancePercent = calculateDistance(safeBluePlayer, safeRedPlayer);
  const currentDistancePixels = percentToPixels(currentDistancePercent);

  // Calculate directions for indicators
  const blueDirection = calculateDirection(safeBluePlayer, safeRedPlayer);
  const redDirection = calculateDirection(safeRedPlayer, safeBluePlayer);

  return (
    <div className="app">
      <ZoneSelector
        selectedZone={selectedZone}
        onZoneChange={setSelectedZone}
      />

      <Instructions
        targetDistance={targetDistance}
        onDistanceChange={setTargetDistance}
      />

      <div className="field-wrapper" ref={fieldRef}>
        <SoccerField selectedZone={selectedZone}>
          <DistanceIndicator
            x1={safeBluePlayer.x}
            y1={safeBluePlayer.y}
            x2={safeRedPlayer.x}
            y2={safeRedPlayer.y}
            targetDistance={targetDistance}
            currentDistance={currentDistancePixels}
          />

          <Player
            x={safeBluePlayer.x}
            y={safeBluePlayer.y}
            color="#3b82f6"
            direction={blueDirection}
            isDraggable={true}
            hasBall={true}
            label="Ball Carrier"
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          />

          <Player
            x={safeRedPlayer.x}
            y={safeRedPlayer.y}
            color="#3b82f6"
            direction={redDirection}
            isReactive={true}
            label="Open Player"
          />

          {/* Goalies */}
          <Player
            x={3}
            y={50}
            color="#3b82f6"
            direction={0}
            label="Goalie"
          />
          <Player
            x={97}
            y={50}
            color="#eab308"
            direction={Math.PI}
            label="Goalie"
          />
        </SoccerField>
      </div>
    </div>
  );
}

export default App;
