import { PLAY_AREA } from './constants';

// Slot positions for balls inside a bag (percentages within container)
// Arranged in a natural pile-like formation
export const BAG_SLOTS = [
  { x: 30, y: 35 },
  { x: 50, y: 30 },
  { x: 70, y: 35 },
  { x: 40, y: 65 },
  { x: 60, y: 65 },
];

// Slot positions for balls inside a cart (percentages within container)
// Ten-frame style: 2 rows of 5
export const CART_SLOTS = [
  { x: 15, y: 30 },
  { x: 32, y: 30 },
  { x: 49, y: 30 },
  { x: 66, y: 30 },
  { x: 83, y: 30 },
  { x: 15, y: 70 },
  { x: 32, y: 70 },
  { x: 49, y: 70 },
  { x: 66, y: 70 },
  { x: 83, y: 70 },
];

/**
 * Generate random position within the play area bounds
 * @param {number} ballSize - Size of the ball in pixels
 * @returns {{ x: number, y: number }} - Position as percentages
 */
export function getRandomPlayAreaPosition(ballSize = 40) {
  // Convert ball size to approximate percentage (assuming 800px width)
  const ballPercent = (ballSize / 800) * 100;

  const x = PLAY_AREA.minX + Math.random() * (PLAY_AREA.maxX - PLAY_AREA.minX - ballPercent);
  const y = PLAY_AREA.minY + Math.random() * (PLAY_AREA.maxY - PLAY_AREA.minY - ballPercent);

  return { x, y };
}

/**
 * Generate multiple random positions with minimum spacing
 * @param {number} count - Number of positions to generate
 * @param {number} minSpacing - Minimum spacing between balls (percentage)
 * @returns {Array<{ x: number, y: number }>} - Array of positions
 */
export function generateBallPositions(count, minSpacing = 5) {
  const positions = [];
  const maxAttempts = 100;

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let position;
    let valid = false;

    while (!valid && attempts < maxAttempts) {
      position = getRandomPlayAreaPosition();
      valid = true;

      // Check distance from existing positions
      for (const existing of positions) {
        const dx = position.x - existing.x;
        const dy = position.y - existing.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minSpacing) {
          valid = false;
          break;
        }
      }

      attempts++;
    }

    // If we couldn't find a valid position, just use the last attempt
    positions.push(position || getRandomPlayAreaPosition());
  }

  return positions;
}

/**
 * Get the slot position for a ball at a given index in a container
 * @param {'bag' | 'cart'} containerType - Type of container
 * @param {number} index - Index of the ball in the container
 * @returns {{ x: number, y: number } | null} - Slot position or null if invalid
 */
export function getSlotPosition(containerType, index) {
  const slots = containerType === 'bag' ? BAG_SLOTS : CART_SLOTS;

  if (index < 0 || index >= slots.length) {
    return null;
  }

  return slots[index];
}

/**
 * Calculate grid positions for containers on the shelf
 * @param {number} containerCount - Number of containers
 * @param {number} shelfWidth - Width of the shelf in pixels
 * @param {number} containerWidth - Width of each container in pixels
 * @returns {Array<number>} - Array of x positions
 */
export function calculateShelfPositions(containerCount, shelfWidth, containerWidth) {
  if (containerCount === 0) return [];

  const padding = 20;
  const availableWidth = shelfWidth - (padding * 2);
  const spacing = Math.min(
    (availableWidth - containerWidth) / Math.max(containerCount - 1, 1),
    containerWidth + 20
  );

  const totalWidth = containerWidth + (spacing * (containerCount - 1));
  const startX = padding + (availableWidth - totalWidth) / 2;

  return Array.from({ length: containerCount }, (_, i) => startX + (i * spacing));
}

/**
 * Check if a point is within a container's bounds
 * @param {{ x: number, y: number }} point - Point to check
 * @param {{ x: number, y: number, width: number, height: number }} bounds - Container bounds
 * @returns {boolean}
 */
export function isPointInBounds(point, bounds) {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}
