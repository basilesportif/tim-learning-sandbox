import { BAG_CAPACITY, CART_CAPACITY } from './constants';
import { generateBallPositions } from './layoutUtils';

/**
 * Generate a unique ID
 * @returns {string}
 */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate extra balls to spawn beyond the target
 * Spawns 3-5 extra balls, or 20% more, whichever is greater
 * @param {number} target - The target number of balls
 * @returns {number} - Number of extra balls to add
 */
export function calculateExtraBalls(target) {
  const percentageExtra = Math.ceil(target * 0.2); // 20% extra
  const minExtra = 3;
  const maxExtra = Math.max(5, percentageExtra);
  // Random between minExtra and maxExtra
  return Math.floor(Math.random() * (maxExtra - minExtra + 1)) + minExtra;
}

/**
 * Create an array of ball objects with random positions
 * @param {{ total: number, sport: 'soccer' | 'basketball', extraBalls?: number }} options
 * @returns {Array<{ id: string, type: string, status: string, x: number, y: number }>}
 */
export function createBallPile({ total, sport, extraBalls = 0 }) {
  const totalBalls = total + extraBalls;
  const positions = generateBallPositions(totalBalls);

  return positions.map((pos, index) => ({
    id: generateId(),
    type: sport, // Use 'type' for consistency with PlayArea component
    status: 'loose',
    x: pos.x,
    y: pos.y,
    index,
  }));
}

/**
 * Calculate totals from game state
 * Supports two state shapes:
 * 1. { shelf: { bags: number, carts: number }, balls: Array, containers: { bag: { balls: [] }, cart: { balls: [] } } }
 * 2. { shelf: Array, playArea: Array } (legacy)
 *
 * @param {object} state - Current game state
 * @returns {{ carts: number, bags: number, singles: number, total: number }}
 */
export function getTotals(state) {
  // Handle new state shape (from App.jsx useReducer)
  if (state.shelf && typeof state.shelf.bags === 'number') {
    const { shelf, balls = [], containers = {} } = state;

    // Count bundled balls from shelf
    const cartBalls = shelf.carts * CART_CAPACITY;
    const bagBalls = shelf.bags * BAG_CAPACITY;
    const bundledTotal = cartBalls + bagBalls;

    // Count loose balls (not bundled and not in container)
    const looseBalls = balls.filter((b) => b.status === 'loose').length;

    // Count balls currently in containers (not yet bundled)
    const inContainerBalls = (containers.bag?.balls?.length || 0) + (containers.cart?.balls?.length || 0);

    const singles = looseBalls + inContainerBalls;
    const total = bundledTotal + singles;

    return {
      carts: shelf.carts,
      bags: shelf.bags,
      singles,
      cartBalls,
      bagBalls,
      total,
    };
  }

  // Handle legacy state shape (shelf as array, playArea as array)
  const { shelf = [], playArea = [] } = state;

  let carts = 0;
  let bags = 0;
  let cartBalls = 0;
  let bagBalls = 0;

  for (const container of shelf) {
    if (container.type === 'cart') {
      carts++;
      cartBalls += container.balls?.length || 0;
    } else if (container.type === 'bag') {
      bags++;
      bagBalls += container.balls?.length || 0;
    }
  }

  const singles = playArea.length;
  const total = cartBalls + bagBalls + singles;

  return {
    carts,
    bags,
    singles,
    cartBalls,
    bagBalls,
    total,
  };
}

/**
 * Evaluate if the current state meets the level constraints
 * Supports two state shapes:
 * 1. { shelf: { bags: number, carts: number }, totals, constraints } - new shape
 * 2. { shelf: Array, totals, constraints } - legacy shape
 *
 * @param {{ shelf: object|Array, totals: object, constraints: object }} params
 * @returns {{ ok: boolean, reason: string | null }}
 */
export function evaluateConstraints({ shelf, totals, constraints }) {
  if (!constraints) {
    return { ok: true, reason: null };
  }

  const { minCarts, maxCarts, minBags, maxBags, exactCarts, exactBags, noBags, noCarts } = constraints;

  // Check exact counts
  if (exactCarts !== undefined && totals.carts !== exactCarts) {
    return {
      ok: false,
      reason: `Need exactly ${exactCarts} cart${exactCarts !== 1 ? 's' : ''}, you have ${totals.carts}`,
    };
  }

  if (exactBags !== undefined && totals.bags !== exactBags) {
    return {
      ok: false,
      reason: `Need exactly ${exactBags} bag${exactBags !== 1 ? 's' : ''}, you have ${totals.bags}`,
    };
  }

  // Check minimums
  if (minCarts !== undefined && totals.carts < minCarts) {
    return {
      ok: false,
      reason: `Need at least ${minCarts} cart${minCarts !== 1 ? 's' : ''}, you have ${totals.carts}`,
    };
  }

  if (minBags !== undefined && totals.bags < minBags) {
    return {
      ok: false,
      reason: `Need at least ${minBags} bag${minBags !== 1 ? 's' : ''}, you have ${totals.bags}`,
    };
  }

  // Check maximums
  if (maxCarts !== undefined && totals.carts > maxCarts) {
    return {
      ok: false,
      reason: `Can use at most ${maxCarts} cart${maxCarts !== 1 ? 's' : ''}, you have ${totals.carts}`,
    };
  }

  if (maxBags !== undefined && totals.bags > maxBags) {
    return {
      ok: false,
      reason: `Can use at most ${maxBags} bag${maxBags !== 1 ? 's' : ''}, you have ${totals.bags}`,
    };
  }

  // Check prohibitions
  if (noBags && totals.bags > 0) {
    return {
      ok: false,
      reason: 'Cannot use bags for this challenge',
    };
  }

  if (noCarts && totals.carts > 0) {
    return {
      ok: false,
      reason: 'Cannot use carts for this challenge',
    };
  }

  // Check that all containers on shelf are full (legacy shape only)
  // In the new shape, all items on shelf are already complete (only complete containers get moved to shelf)
  if (Array.isArray(shelf)) {
    for (const container of shelf) {
      const capacity = container.type === 'cart' ? CART_CAPACITY : BAG_CAPACITY;
      const ballCount = container.balls?.length || 0;

      if (ballCount > 0 && ballCount < capacity) {
        return {
          ok: false,
          reason: `${container.type === 'cart' ? 'Cart' : 'Bag'} is not full (${ballCount}/${capacity})`,
        };
      }
    }
  }

  return { ok: true, reason: null };
}

/**
 * Check if a container can accept a ball of a given type
 * @param {{ type: string, balls: Array, sport?: string }} container
 * @param {string} ballSport - The sport type of the ball being added
 * @returns {boolean}
 */
export function containerCanAcceptBall(container, ballSport) {
  const capacity = container.type === 'cart' ? CART_CAPACITY : BAG_CAPACITY;
  const currentCount = container.balls?.length || 0;

  // Check capacity
  if (currentCount >= capacity) {
    return false;
  }

  // Check sport type consistency (if container has balls, new ball must match)
  if (container.balls && container.balls.length > 0) {
    const containerSport = container.balls[0].sport;
    if (containerSport !== ballSport) {
      return false; // Can't mix sports in a container
    }
  }

  return true;
}

/**
 * Determine the sport type of balls in a container's slots
 * @param {Array} slots - Array of slot references (unused, kept for API compatibility)
 * @param {Array} balls - Array of ball objects
 * @returns {'soccer' | 'basketball' | 'mixed' | null}
 */
export function getBundleSport(slots, balls) {
  if (!balls || balls.length === 0) {
    return null;
  }

  const sports = new Set(balls.map((ball) => ball.sport));

  if (sports.size === 0) {
    return null;
  }

  if (sports.size === 1) {
    return [...sports][0];
  }

  return 'mixed';
}

/**
 * Check if a container is full
 * @param {{ type: string, balls: Array }} container
 * @returns {boolean}
 */
export function isContainerFull(container) {
  const capacity = container.type === 'cart' ? CART_CAPACITY : BAG_CAPACITY;
  return (container.balls?.length || 0) >= capacity;
}

/**
 * Check if a container is empty
 * @param {{ balls: Array }} container
 * @returns {boolean}
 */
export function isContainerEmpty(container) {
  return !container.balls || container.balls.length === 0;
}

/**
 * Get the capacity of a container type
 * @param {'bag' | 'cart'} type
 * @returns {number}
 */
export function getContainerCapacity(type) {
  return type === 'cart' ? CART_CAPACITY : BAG_CAPACITY;
}

/**
 * Create a new container object
 * @param {'bag' | 'cart'} type
 * @param {string} [sport] - Optional sport type for the container
 * @returns {{ id: string, type: string, balls: Array, sport?: string }}
 */
export function createContainer(type, sport) {
  return {
    id: generateId(),
    type,
    balls: [],
    sport: sport || null,
  };
}

/**
 * Add a ball to a container
 * @param {{ balls: Array }} container
 * @param {{ id: string, sport: string }} ball
 * @returns {{ balls: Array }} - New container with ball added
 */
export function addBallToContainer(container, ball) {
  return {
    ...container,
    balls: [...(container.balls || []), ball],
    sport: container.sport || ball.sport,
  };
}

/**
 * Remove a ball from a container by ID
 * @param {{ balls: Array }} container
 * @param {string} ballId
 * @returns {{ container: object, ball: object | null }}
 */
export function removeBallFromContainer(container, ballId) {
  const ball = container.balls?.find((b) => b.id === ballId);

  if (!ball) {
    return { container, ball: null };
  }

  const newBalls = container.balls.filter((b) => b.id !== ballId);

  return {
    container: {
      ...container,
      balls: newBalls,
      sport: newBalls.length > 0 ? container.sport : null,
    },
    ball,
  };
}

/**
 * Check if trading (combining bags into carts) is valid
 * @param {Array} bags - Array of bag containers to combine
 * @returns {{ valid: boolean, reason?: string }}
 */
export function canTradeBagsForCart(bags) {
  if (!bags || bags.length !== 2) {
    return { valid: false, reason: 'Need exactly 2 bags to trade for a cart' };
  }

  // Both bags must be full
  for (const bag of bags) {
    if (!isContainerFull(bag)) {
      return { valid: false, reason: 'Both bags must be full to trade' };
    }
  }

  // Both bags must have the same sport
  const sport1 = getBundleSport(null, bags[0].balls);
  const sport2 = getBundleSport(null, bags[1].balls);

  if (sport1 !== sport2) {
    return { valid: false, reason: 'Cannot combine bags with different ball types' };
  }

  return { valid: true };
}

/**
 * Perform the trade: combine 2 bags into 1 cart
 * @param {Array} bags - Two full bag containers
 * @returns {{ cart: object, removedBagIds: string[] }}
 */
export function tradeBagsForCart(bags) {
  const allBalls = [...bags[0].balls, ...bags[1].balls];
  const sport = allBalls[0].sport;

  const cart = {
    id: generateId(),
    type: 'cart',
    balls: allBalls,
    sport,
  };

  return {
    cart,
    removedBagIds: bags.map((b) => b.id),
  };
}
