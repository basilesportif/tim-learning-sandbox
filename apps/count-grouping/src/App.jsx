import { useReducer, useCallback, useEffect, useRef, useMemo, useState } from 'react';

// Components
import ModeSelector from './components/ModeSelector';
import TargetPanel from './components/TargetPanel';
import PlayArea from './components/PlayArea';
import BuildPlayArea from './components/BuildPlayArea';
import Shelf from './components/Shelf';
import ControlBar from './components/ControlBar';
import CountingDisplay from './components/CountingDisplay';
import HintOverlay from './components/HintOverlay';
import SuccessOverlay from './components/SuccessOverlay';
import ParentGate from './components/ParentGate';

// Utils and data
import { LEVELS, BUILD_LEVELS, getLevel, getPrompt, getTotalPrompts, getFlatPromptIndex } from './lib/levelData';
import { createBallPile, getTotals, evaluateConstraints, calculateExtraBalls } from './lib/gameUtils';
import { BAG_CAPACITY, CART_CAPACITY, MAX_HISTORY } from './lib/constants';

import './App.css';

// ==========================================
// Initial State
// ==========================================

const createInitialState = () => ({
  mode: 'challenge', // 'free' | 'challenge' | 'build'
  levelIndex: 0,
  promptIndex: 0,
  target: {
    text: '',
    total: 0,
    sport: 'soccer',
    constraints: {},
  },
  balls: [],
  containers: {
    bag: {
      capacity: BAG_CAPACITY,
      balls: [],
      accepts: null,
      isLocked: false,
      isComplete: false,
      animating: false,
    },
    cart: {
      capacity: CART_CAPACITY,
      balls: [],
      accepts: null,
      isLocked: false,
      isComplete: false,
      animating: false,
    },
  },
  shelf: {
    bags: 0,
    carts: 0,
    bundles: [],
  },
  ui: {
    dragging: null,
    dragPos: null,
    showTotals: false,
    lastCheck: null,
    hintActive: false,
    hintMessage: null,
  },
  history: [],
  // Build mode state
  buildResources: { carts: [], bags: [], balls: [] },
  answerZone: { carts: [], bags: [], balls: [] },
  showRunningTotal: false,
  buildLevelIndex: 0,
  buildTarget: null,
  buildRequireSpecific: null,
});

// ==========================================
// Action Types
// ==========================================

const ActionTypes = {
  INIT_MODE: 'INIT_MODE',
  INIT_LEVEL: 'INIT_LEVEL',
  RESET_PILE: 'RESET_PILE',
  DRAG_START: 'DRAG_START',
  DRAG_MOVE: 'DRAG_MOVE',
  DRAG_END: 'DRAG_END',
  DROP_IN_CONTAINER: 'DROP_IN_CONTAINER',
  REJECT_DROP: 'REJECT_DROP',
  COMPLETE_CONTAINER: 'COMPLETE_CONTAINER',
  ANIMATION_DONE: 'ANIMATION_DONE',
  COMBINE_BAGS: 'COMBINE_BAGS',
  UNLOCK_CONTAINER: 'UNLOCK_CONTAINER',
  UNDO: 'UNDO',
  CHECK_ANSWER: 'CHECK_ANSWER',
  SHOW_HINT: 'SHOW_HINT',
  HIDE_HINT: 'HIDE_HINT',
  NEXT_PROMPT: 'NEXT_PROMPT',
  SET_SHOW_TOTALS: 'SET_SHOW_TOTALS',
  DISMISS_SUCCESS: 'DISMISS_SUCCESS',
  // Build mode actions
  INIT_BUILD_MODE: 'INIT_BUILD_MODE',
  INIT_BUILD_LEVEL: 'INIT_BUILD_LEVEL',
  BUILD_DRAG_TO_ANSWER: 'BUILD_DRAG_TO_ANSWER',
  BUILD_DRAG_FROM_ANSWER: 'BUILD_DRAG_FROM_ANSWER',
  BUILD_CHECK_ANSWER: 'BUILD_CHECK_ANSWER',
  TOGGLE_RUNNING_TOTAL: 'TOGGLE_RUNNING_TOTAL',
};

// ==========================================
// Helper Functions
// ==========================================

/**
 * Create a snapshot of state for undo
 */
function createSnapshot(state) {
  return {
    balls: state.balls.map((b) => ({ ...b })),
    containers: {
      bag: {
        balls: state.containers.bag.balls.map((b) => ({ ...b })),
        accepts: state.containers.bag.accepts,
        isComplete: state.containers.bag.isComplete,
        isLocked: state.containers.bag.isLocked,
      },
      cart: {
        balls: state.containers.cart.balls.map((b) => ({ ...b })),
        accepts: state.containers.cart.accepts,
        isComplete: state.containers.cart.isComplete,
        isLocked: state.containers.cart.isLocked,
      },
    },
    shelf: {
      bags: state.shelf.bags,
      carts: state.shelf.carts,
      bundles: state.shelf.bundles.map((b) => ({ ...b })),
    },
  };
}

/**
 * Restore state from a snapshot
 */
function restoreFromSnapshot(state, snapshot) {
  return {
    ...state,
    balls: snapshot.balls,
    containers: {
      bag: {
        ...state.containers.bag,
        balls: snapshot.containers.bag.balls,
        accepts: snapshot.containers.bag.accepts,
        isComplete: snapshot.containers.bag.isComplete,
        isLocked: snapshot.containers.bag.isLocked,
      },
      cart: {
        ...state.containers.cart,
        balls: snapshot.containers.cart.balls,
        accepts: snapshot.containers.cart.accepts,
        isComplete: snapshot.containers.cart.isComplete,
        isLocked: snapshot.containers.cart.isLocked,
      },
    },
    shelf: snapshot.shelf,
    ui: {
      ...state.ui,
      lastCheck: null,
      showTotals: false,
    },
  };
}

/**
 * Push snapshot to history with limit
 */
function pushHistory(history, snapshot) {
  const newHistory = [...history, snapshot];
  if (newHistory.length > MAX_HISTORY) {
    return newHistory.slice(-MAX_HISTORY);
  }
  return newHistory;
}

/**
 * Initialize level state from level config
 */
function initializeLevelState(state, levelIndex, promptIndex) {
  const level = getLevel(levelIndex);
  const prompt = getPrompt(levelIndex, promptIndex);

  if (!level || !prompt) {
    return state;
  }

  // Create ball pile with extra balls so child must decide when to stop
  const extraBalls = calculateExtraBalls(prompt.total);
  const balls = createBallPile({
    total: prompt.total,
    sport: prompt.sport,
    extraBalls,
  });

  // Determine container locks based on level and prompt
  const bagLocked = !level.containers.bag ||
    (prompt.scripted?.unlockContainerAfterMs?.bag !== undefined);
  const cartLocked = !level.containers.cart ||
    (prompt.scripted?.unlockContainerAfterMs?.cart !== undefined);

  // Initialize shelf from prompt if specified
  let initialBags = 0;
  let initialCarts = 0;
  let initialBundles = [];

  if (prompt.initialBundles && Array.isArray(prompt.initialBundles)) {
    for (const bundle of prompt.initialBundles) {
      if (bundle.type === 'bag') {
        initialBags++;
        initialBundles.push({
          id: `bundle-${Date.now()}-${initialBundles.length}`,
          type: 'bag',
          sport: bundle.sport || prompt.sport,
        });
      } else if (bundle.type === 'cart') {
        initialCarts++;
        initialBundles.push({
          id: `bundle-${Date.now()}-${initialBundles.length}`,
          type: 'cart',
          sport: bundle.sport || prompt.sport,
        });
      }
    }
  }

  return {
    ...state,
    levelIndex,
    promptIndex,
    target: {
      text: prompt.text,
      total: prompt.total,
      sport: prompt.sport,
      constraints: prompt.constraints || {},
    },
    balls,
    containers: {
      bag: {
        capacity: BAG_CAPACITY,
        balls: [],
        accepts: null,
        isLocked: bagLocked,
        isComplete: false,
        animating: false,
      },
      cart: {
        capacity: CART_CAPACITY,
        balls: [],
        accepts: null,
        isLocked: cartLocked,
        isComplete: false,
        animating: false,
      },
    },
    shelf: {
      bags: initialBags,
      carts: initialCarts,
      bundles: initialBundles,
    },
    ui: {
      ...state.ui,
      showTotals: false,
      lastCheck: null,
      hintActive: false,
      hintMessage: null,
    },
    history: [],
  };
}

/**
 * Get random ball count for free play
 */
function getRandomBallCount(min = 30, max = 80) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get flattened build challenges from BUILD_LEVELS
 * BUILD_LEVELS has structure: [{ challenges: [...] }, ...]
 * Returns flat array of all challenges
 */
function getFlatBuildChallenges() {
  const buildLevels = BUILD_LEVELS || [];
  const flat = [];
  for (const level of buildLevels) {
    if (level.challenges && Array.isArray(level.challenges)) {
      for (const challenge of level.challenges) {
        flat.push({ ...challenge, levelName: level.name });
      }
    }
  }
  return flat;
}

/**
 * Initialize build level state from build level config
 */
function initializeBuildLevelState(state, challengeIndex) {
  const challenges = getFlatBuildChallenges();
  const challenge = challenges[challengeIndex];

  if (!challenge) {
    return state;
  }

  // Create resource items with unique IDs
  const carts = [];
  const bags = [];
  const balls = [];

  // Create cart resources
  for (let i = 0; i < (challenge.resources?.carts || 0); i++) {
    carts.push({ id: `cart-${Date.now()}-${i}`, type: 'cart' });
  }

  // Create bag resources
  for (let i = 0; i < (challenge.resources?.bags || 0); i++) {
    bags.push({ id: `bag-${Date.now()}-${i}`, type: 'bag' });
  }

  // Create ball resources
  for (let i = 0; i < (challenge.resources?.balls || 0); i++) {
    balls.push({ id: `ball-${Date.now()}-${i}`, type: 'ball' });
  }

  return {
    ...state,
    mode: 'build',
    buildLevelIndex: challengeIndex,
    buildTarget: challenge.target,
    buildRequireSpecific: challenge.requireSpecific || null,
    buildResources: { carts, bags, balls },
    answerZone: { carts: [], bags: [], balls: [] },
    target: {
      text: challenge.prompt || `Build the number ${challenge.target}`,
      total: challenge.target,
      sport: 'soccer',
      constraints: {},
    },
    ui: {
      ...state.ui,
      showTotals: false,
      lastCheck: null,
      hintActive: false,
      hintMessage: null,
    },
  };
}

/**
 * Calculate total value in answer zone for build mode
 */
function calculateBuildTotal(answerZone) {
  return (
    answerZone.carts.length * 10 +
    answerZone.bags.length * 5 +
    answerZone.balls.length
  );
}

// ==========================================
// Reducer
// ==========================================

function gameReducer(state, action) {
  switch (action.type) {
    case ActionTypes.INIT_MODE: {
      const { mode } = action.payload;
      if (mode === 'free') {
        // Free play: random ball count, both containers available
        const total = getRandomBallCount();
        const balls = createBallPile({ total, sport: 'soccer' });

        return {
          ...createInitialState(),
          mode: 'free',
          target: {
            text: `Pack ${total} soccer balls any way you like!`,
            total,
            sport: 'soccer',
            constraints: {},
          },
          balls,
          containers: {
            bag: {
              capacity: BAG_CAPACITY,
              balls: [],
              accepts: null,
              isLocked: false,
              isComplete: false,
              animating: false,
            },
            cart: {
              capacity: CART_CAPACITY,
              balls: [],
              accepts: null,
              isLocked: false,
              isComplete: false,
              animating: false,
            },
          },
        };
      } else if (mode === 'build') {
        // Build mode: start at build level 0
        const newState = {
          ...createInitialState(),
          mode: 'build',
        };
        return initializeBuildLevelState(newState, 0);
      } else {
        // Challenge mode: start at level 0, prompt 0
        const newState = {
          ...createInitialState(),
          mode: 'challenge',
        };
        return initializeLevelState(newState, 0, 0);
      }
    }

    case ActionTypes.INIT_LEVEL: {
      const { levelIndex, promptIndex } = action.payload;
      return initializeLevelState(state, levelIndex, promptIndex);
    }

    case ActionTypes.RESET_PILE: {
      const { total, sport } = action.payload;
      const balls = createBallPile({ total, sport });

      return {
        ...state,
        balls,
        containers: {
          bag: { ...state.containers.bag, balls: [], accepts: null, isComplete: false },
          cart: { ...state.containers.cart, balls: [], accepts: null, isComplete: false },
        },
        shelf: { bags: 0, carts: 0, bundles: [] },
        ui: { ...state.ui, lastCheck: null, showTotals: false },
        history: [],
      };
    }

    case ActionTypes.DRAG_START: {
      const { ball, startPos } = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          dragging: { ball, startPos },
          dragPos: startPos,
        },
      };
    }

    case ActionTypes.DRAG_MOVE: {
      const { x, y } = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          dragPos: { x, y },
        },
      };
    }

    case ActionTypes.DRAG_END: {
      return {
        ...state,
        ui: {
          ...state.ui,
          dragging: null,
          dragPos: null,
        },
      };
    }

    case ActionTypes.DROP_IN_CONTAINER: {
      const { ballId, containerType } = action.payload;
      const container = state.containers[containerType];

      if (!container || container.isLocked) {
        return state;
      }

      // Find the ball
      const ball = state.balls.find((b) => b.id === ballId);
      if (!ball || ball.status !== 'loose') {
        return state;
      }

      // Check capacity
      if (container.balls.length >= container.capacity) {
        return state;
      }

      // Create snapshot before mutation
      const snapshot = createSnapshot(state);

      // Update ball status
      const newBalls = state.balls.map((b) =>
        b.id === ballId ? { ...b, status: 'in-container' } : b
      );

      // Add ball to container
      const newContainer = {
        ...container,
        balls: [...container.balls, ball],
        accepts: container.accepts || ball.type,
      };

      // Check if container is now full
      const isNowComplete = newContainer.balls.length >= newContainer.capacity;

      return {
        ...state,
        balls: newBalls,
        containers: {
          ...state.containers,
          [containerType]: {
            ...newContainer,
            isComplete: isNowComplete,
            animating: isNowComplete,
          },
        },
        history: pushHistory(state.history, snapshot),
      };
    }

    case ActionTypes.REJECT_DROP: {
      // Ball bounces back - no state change needed, animation handled in component
      return state;
    }

    case ActionTypes.COMPLETE_CONTAINER: {
      const { containerType } = action.payload;
      const container = state.containers[containerType];

      if (!container || !container.isComplete) {
        return state;
      }

      // Determine bundle sport
      const bundleSport = container.accepts || state.target.sport;

      // Create new bundle
      const newBundle = {
        id: `bundle-${Date.now()}`,
        type: containerType,
        sport: bundleSport,
      };

      // Update shelf counts
      const newShelf = {
        ...state.shelf,
        bags: containerType === 'bag' ? state.shelf.bags + 1 : state.shelf.bags,
        carts: containerType === 'cart' ? state.shelf.carts + 1 : state.shelf.carts,
        bundles: [...state.shelf.bundles, newBundle],
      };

      // Mark balls as bundled
      const ballIdsInContainer = container.balls.map((b) => b.id);
      const newBalls = state.balls.map((b) =>
        ballIdsInContainer.includes(b.id) ? { ...b, status: 'bundled' } : b
      );

      // Reset container
      const newContainer = {
        ...container,
        balls: [],
        accepts: null,
        isComplete: false,
        animating: false,
      };

      return {
        ...state,
        balls: newBalls,
        containers: {
          ...state.containers,
          [containerType]: newContainer,
        },
        shelf: newShelf,
      };
    }

    case ActionTypes.ANIMATION_DONE: {
      const { containerType } = action.payload;
      return {
        ...state,
        containers: {
          ...state.containers,
          [containerType]: {
            ...state.containers[containerType],
            animating: false,
          },
        },
      };
    }

    case ActionTypes.COMBINE_BAGS: {
      // Check if we have at least 2 bags
      if (state.shelf.bags < 2) {
        return state;
      }

      // Check if trading is enabled for this level
      const level = getLevel(state.levelIndex);
      if (!level?.tradingEnabled && state.mode === 'challenge') {
        return state;
      }

      // Create snapshot before mutation
      const snapshot = createSnapshot(state);

      // Trade 2 bags for 1 cart
      const newBundle = {
        id: `bundle-${Date.now()}`,
        type: 'cart',
        sport: state.target.sport,
      };

      return {
        ...state,
        shelf: {
          ...state.shelf,
          bags: state.shelf.bags - 2,
          carts: state.shelf.carts + 1,
          bundles: [
            ...state.shelf.bundles.filter((b) => b.type !== 'bag').slice(0, -2),
            newBundle,
          ],
        },
        history: pushHistory(state.history, snapshot),
      };
    }

    case ActionTypes.UNLOCK_CONTAINER: {
      const { containerType } = action.payload;
      return {
        ...state,
        containers: {
          ...state.containers,
          [containerType]: {
            ...state.containers[containerType],
            isLocked: false,
          },
        },
      };
    }

    case ActionTypes.UNDO: {
      if (state.history.length === 0) {
        return state;
      }

      const lastSnapshot = state.history[state.history.length - 1];
      const newHistory = state.history.slice(0, -1);

      return {
        ...restoreFromSnapshot(state, lastSnapshot),
        history: newHistory,
      };
    }

    case ActionTypes.CHECK_ANSWER: {
      // Calculate totals
      const totals = getTotals(state);

      // For free play, just show totals
      if (state.mode === 'free') {
        return {
          ...state,
          ui: {
            ...state.ui,
            showTotals: true,
            lastCheck: 'correct', // Always "success" in free play
          },
        };
      }

      // Evaluate constraints
      const result = evaluateConstraints({
        shelf: state.shelf,
        totals,
        constraints: state.target.constraints,
      });

      // Check if the correct number of balls have been packed
      const inContainerBalls = state.containers.bag.balls.length + state.containers.cart.balls.length;
      const bundledBalls = state.balls.filter((b) => b.status === 'bundled').length;
      const totalPacked = bundledBalls + inContainerBalls;
      const targetTotal = state.target.total;

      // Success requires: packed exactly the target amount, no balls in containers (all bundled), and constraints satisfied
      const isSuccess = totalPacked === targetTotal && inContainerBalls === 0 && result.ok;

      // Generate a helpful message for incorrect attempts
      let checkMessage = null;
      if (!isSuccess) {
        if (inContainerBalls > 0) {
          checkMessage = 'Finish filling your container first!';
        } else if (totalPacked < targetTotal) {
          checkMessage = `You packed ${totalPacked} balls but need ${targetTotal}. Pack more!`;
        } else if (totalPacked > targetTotal) {
          checkMessage = `You packed ${totalPacked} balls but only need ${targetTotal}. That's too many!`;
        } else if (!result.ok) {
          checkMessage = result.reason || 'Check the requirements and try again.';
        }
      }

      return {
        ...state,
        ui: {
          ...state.ui,
          showTotals: true,
          lastCheck: isSuccess ? 'correct' : 'incorrect',
          checkMessage,
        },
      };
    }

    case ActionTypes.SHOW_HINT: {
      const { message } = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          hintActive: true,
          hintMessage: message,
        },
      };
    }

    case ActionTypes.HIDE_HINT: {
      return {
        ...state,
        ui: {
          ...state.ui,
          hintActive: false,
          hintMessage: null,
        },
      };
    }

    case ActionTypes.NEXT_PROMPT: {
      // Handle build mode progression
      if (state.mode === 'build') {
        const challenges = getFlatBuildChallenges();
        if (state.buildLevelIndex + 1 < challenges.length) {
          return initializeBuildLevelState(state, state.buildLevelIndex + 1);
        }
        // Build mode complete - stay on last level
        return {
          ...state,
          ui: {
            ...state.ui,
            lastCheck: null,
          },
        };
      }

      const level = getLevel(state.levelIndex);
      if (!level) return state;

      // Check if there are more prompts in this level
      if (state.promptIndex + 1 < level.prompts.length) {
        return initializeLevelState(state, state.levelIndex, state.promptIndex + 1);
      }

      // Check if there's a next level
      if (state.levelIndex + 1 < LEVELS.length) {
        return initializeLevelState(state, state.levelIndex + 1, 0);
      }

      // Game complete - stay on last prompt
      return {
        ...state,
        ui: {
          ...state.ui,
          lastCheck: null,
        },
      };
    }

    case ActionTypes.SET_SHOW_TOTALS: {
      return {
        ...state,
        ui: {
          ...state.ui,
          showTotals: action.payload,
        },
      };
    }

    case ActionTypes.DISMISS_SUCCESS: {
      return {
        ...state,
        ui: {
          ...state.ui,
          lastCheck: null,
          showTotals: false,
        },
      };
    }

    // ==========================================
    // Build Mode Actions
    // ==========================================

    case ActionTypes.INIT_BUILD_MODE: {
      const newState = {
        ...createInitialState(),
        mode: 'build',
      };
      return initializeBuildLevelState(newState, 0);
    }

    case ActionTypes.INIT_BUILD_LEVEL: {
      const { levelIndex } = action.payload;
      return initializeBuildLevelState(state, levelIndex);
    }

    case ActionTypes.BUILD_DRAG_TO_ANSWER: {
      const { itemId, itemType } = action.payload;

      // Find and remove item from resources
      const resourceKey = itemType === 'cart' ? 'carts' : itemType === 'bag' ? 'bags' : 'balls';
      const item = state.buildResources[resourceKey].find((i) => i.id === itemId);

      if (!item) return state;

      const newResources = {
        ...state.buildResources,
        [resourceKey]: state.buildResources[resourceKey].filter((i) => i.id !== itemId),
      };

      const newAnswerZone = {
        ...state.answerZone,
        [resourceKey]: [...state.answerZone[resourceKey], item],
      };

      return {
        ...state,
        buildResources: newResources,
        answerZone: newAnswerZone,
      };
    }

    case ActionTypes.BUILD_DRAG_FROM_ANSWER: {
      const { itemId, itemType } = action.payload;

      // Find and remove item from answer zone
      const resourceKey = itemType === 'cart' ? 'carts' : itemType === 'bag' ? 'bags' : 'balls';
      const item = state.answerZone[resourceKey].find((i) => i.id === itemId);

      if (!item) return state;

      const newAnswerZone = {
        ...state.answerZone,
        [resourceKey]: state.answerZone[resourceKey].filter((i) => i.id !== itemId),
      };

      const newResources = {
        ...state.buildResources,
        [resourceKey]: [...state.buildResources[resourceKey], item],
      };

      return {
        ...state,
        buildResources: newResources,
        answerZone: newAnswerZone,
      };
    }

    case ActionTypes.BUILD_CHECK_ANSWER: {
      const total = calculateBuildTotal(state.answerZone);
      const target = state.buildTarget;

      // Check if total matches target
      if (total !== target) {
        return {
          ...state,
          ui: {
            ...state.ui,
            showTotals: true,
            lastCheck: 'incorrect',
            checkMessage: `You built ${total}, but need ${target}`,
          },
        };
      }

      // Check requireSpecific if applicable
      if (state.buildRequireSpecific) {
        const req = state.buildRequireSpecific;
        const ans = state.answerZone;

        if (
          (req.carts !== undefined && ans.carts.length !== req.carts) ||
          (req.bags !== undefined && ans.bags.length !== req.bags) ||
          (req.balls !== undefined && ans.balls.length !== req.balls)
        ) {
          const expectedParts = [];
          if (req.carts !== undefined) expectedParts.push(`${req.carts} cart${req.carts !== 1 ? 's' : ''}`);
          if (req.bags !== undefined) expectedParts.push(`${req.bags} bag${req.bags !== 1 ? 's' : ''}`);
          if (req.balls !== undefined) expectedParts.push(`${req.balls} ball${req.balls !== 1 ? 's' : ''}`);

          return {
            ...state,
            ui: {
              ...state.ui,
              showTotals: true,
              lastCheck: 'incorrect',
              checkMessage: `Use exactly ${expectedParts.join(', ')}`,
            },
          };
        }
      }

      // Success!
      return {
        ...state,
        ui: {
          ...state.ui,
          showTotals: true,
          lastCheck: 'correct',
          checkMessage: null,
        },
      };
    }

    case ActionTypes.TOGGLE_RUNNING_TOTAL: {
      return {
        ...state,
        showRunningTotal: !state.showRunningTotal,
      };
    }

    default:
      return state;
  }
}

// ==========================================
// App Component
// ==========================================

function App() {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
  const [showSkipGate, setShowSkipGate] = useState(false);
  const unlockTimeoutRef = useRef(null);

  // Get current level and prompt
  const currentLevel = useMemo(() => getLevel(state.levelIndex), [state.levelIndex]);
  const currentPrompt = useMemo(
    () => getPrompt(state.levelIndex, state.promptIndex),
    [state.levelIndex, state.promptIndex]
  );

  // Calculate totals
  const totals = useMemo(() => getTotals(state), [state]);

  // Calculate progress
  const flatPromptIndex = useMemo(
    () => getFlatPromptIndex(state.levelIndex, state.promptIndex) + 1,
    [state.levelIndex, state.promptIndex]
  );
  const totalPrompts = useMemo(() => getTotalPrompts(), []);

  // Initialize game on mount - restore progress if available
  useEffect(() => {
    const saved = localStorage.getItem('countGrouping_progress');
    if (saved) {
      try {
        const { levelIndex, promptIndex, mode } = JSON.parse(saved);
        if (mode === 'challenge' && levelIndex !== undefined && promptIndex !== undefined) {
          dispatch({ type: ActionTypes.INIT_LEVEL, payload: { levelIndex, promptIndex } });
          return;
        }
      } catch (e) {
        // Invalid saved data, start fresh
      }
    }
    dispatch({ type: ActionTypes.INIT_MODE, payload: { mode: 'challenge' } });
  }, []);

  // Save progress to localStorage when level/prompt changes in challenge mode
  useEffect(() => {
    if (state.mode === 'challenge') {
      localStorage.setItem('countGrouping_progress', JSON.stringify({
        levelIndex: state.levelIndex,
        promptIndex: state.promptIndex,
        mode: state.mode,
        timestamp: Date.now()
      }));
    }
  }, [state.levelIndex, state.promptIndex, state.mode]);

  // Handle scripted container unlock (e.g., L4-15)
  useEffect(() => {
    // Clear any existing timeout
    if (unlockTimeoutRef.current) {
      clearTimeout(unlockTimeoutRef.current);
      unlockTimeoutRef.current = null;
    }

    // Check if current prompt has a scripted unlock
    if (currentPrompt?.scripted?.unlockContainerAfterMs) {
      const unlockConfig = currentPrompt.scripted.unlockContainerAfterMs;

      // Handle both old format { container: 'cart', ms: 3000 } and new format { cart: 3000 }
      let containerType, delayMs;

      if (unlockConfig.container) {
        containerType = unlockConfig.container;
        delayMs = unlockConfig.ms;
      } else {
        // New format: { cart: 3000 } or { bag: 3000 }
        const keys = Object.keys(unlockConfig);
        if (keys.length > 0) {
          containerType = keys[0];
          delayMs = unlockConfig[containerType];
        }
      }

      if (containerType && delayMs) {
        unlockTimeoutRef.current = setTimeout(() => {
          dispatch({
            type: ActionTypes.UNLOCK_CONTAINER,
            payload: { containerType },
          });
        }, delayMs);
      }
    }

    // Cleanup on unmount or prompt change
    return () => {
      if (unlockTimeoutRef.current) {
        clearTimeout(unlockTimeoutRef.current);
      }
    };
  }, [currentPrompt]);

  // ==========================================
  // Event Handlers
  // ==========================================

  const handleModeChange = useCallback((mode) => {
    // Clear saved progress when switching to free play
    if (mode === 'free') {
      localStorage.removeItem('countGrouping_progress');
    }
    dispatch({ type: ActionTypes.INIT_MODE, payload: { mode } });
  }, []);

  const handleDragStart = useCallback((ball, startPos) => {
    dispatch({
      type: ActionTypes.DRAG_START,
      payload: { ball, startPos },
    });
  }, []);

  const handleDragMove = useCallback((pos) => {
    dispatch({ type: ActionTypes.DRAG_MOVE, payload: pos });
  }, []);

  const handleDragEnd = useCallback(() => {
    dispatch({ type: ActionTypes.DRAG_END });
  }, []);

  const handleDrop = useCallback((dropTarget) => {
    if (!state.ui.dragging?.ball) return;

    const ballId = state.ui.dragging.ball.id;

    if (dropTarget === 'bag' || dropTarget === 'cart') {
      const container = state.containers[dropTarget];

      // Check if container can accept the ball
      if (
        container.isLocked ||
        container.balls.length >= container.capacity ||
        (container.accepts && container.accepts !== state.ui.dragging.ball.type)
      ) {
        dispatch({ type: ActionTypes.REJECT_DROP, payload: { ballId } });
        return;
      }

      dispatch({
        type: ActionTypes.DROP_IN_CONTAINER,
        payload: { ballId, containerType: dropTarget },
      });

      // Check if container is now complete
      const newBallCount = container.balls.length + 1;
      if (newBallCount >= container.capacity) {
        // Delay the complete action slightly for animation
        setTimeout(() => {
          dispatch({
            type: ActionTypes.COMPLETE_CONTAINER,
            payload: { containerType: dropTarget },
          });
        }, 300);
      }
    } else {
      // Dropped outside containers
      dispatch({ type: ActionTypes.REJECT_DROP, payload: { ballId } });
    }
  }, [state.ui.dragging, state.containers]);

  const handleHint = useCallback(() => {
    const hintMessage = currentPrompt?.hint || 'Try filling containers to group the balls!';
    dispatch({ type: ActionTypes.SHOW_HINT, payload: { message: hintMessage } });
  }, [currentPrompt]);

  const handleHintDismiss = useCallback(() => {
    dispatch({ type: ActionTypes.HIDE_HINT });
  }, []);

  const handleUndo = useCallback(() => {
    dispatch({ type: ActionTypes.UNDO });
  }, []);

  const handleCheck = useCallback(() => {
    dispatch({ type: ActionTypes.CHECK_ANSWER });
  }, []);

  const handleCombine = useCallback(() => {
    dispatch({ type: ActionTypes.COMBINE_BAGS });
  }, []);

  const handleSkipCount = useCallback((bundle) => {
    // Visual skip count - just for feedback, no state change needed
    console.log('Skip count:', bundle);
  }, []);

  const handleNextPrompt = useCallback(() => {
    // Check if this is the last prompt - if so, clear progress
    const level = getLevel(state.levelIndex);
    const isLastPromptInLevel = state.promptIndex + 1 >= (level?.prompts.length || 0);
    const isLastLevel = state.levelIndex + 1 >= LEVELS.length;

    if (isLastPromptInLevel && isLastLevel) {
      // User completed all levels - clear saved progress
      localStorage.removeItem('countGrouping_progress');
    }

    dispatch({ type: ActionTypes.NEXT_PROMPT });
  }, [state.levelIndex, state.promptIndex]);

  const handleRetry = useCallback(() => {
    dispatch({ type: ActionTypes.DISMISS_SUCCESS });
  }, []);

  const handleSkipClick = useCallback(() => {
    setShowSkipGate(true);
  }, []);

  const handleSkipSuccess = useCallback(() => {
    setShowSkipGate(false);
    dispatch({ type: ActionTypes.NEXT_PROMPT });
  }, []);

  const handleSkipCancel = useCallback(() => {
    setShowSkipGate(false);
  }, []);

  // ==========================================
  // Build Mode Event Handlers
  // ==========================================

  const handleBuildDragToAnswer = useCallback((itemId, itemType) => {
    dispatch({
      type: ActionTypes.BUILD_DRAG_TO_ANSWER,
      payload: { itemId, itemType },
    });
  }, []);

  const handleBuildDragFromAnswer = useCallback((itemId, itemType) => {
    dispatch({
      type: ActionTypes.BUILD_DRAG_FROM_ANSWER,
      payload: { itemId, itemType },
    });
  }, []);

  const handleBuildCheck = useCallback(() => {
    dispatch({ type: ActionTypes.BUILD_CHECK_ANSWER });
  }, []);

  const handleToggleRunningTotal = useCallback(() => {
    dispatch({ type: ActionTypes.TOGGLE_RUNNING_TOTAL });
  }, []);

  // ==========================================
  // Derived Values
  // ==========================================

  // Format constraints for display
  const constraintsText = useMemo(() => {
    if (!state.target.constraints) return null;
    const c = state.target.constraints;
    const parts = [];

    if (c.minCarts !== undefined) parts.push(`At least ${c.minCarts} carts`);
    if (c.maxBags !== undefined) parts.push(`No more than ${c.maxBags} bag${c.maxBags !== 1 ? 's' : ''}`);
    if (c.noBags) parts.push('No bags allowed');
    if (c.noCarts) parts.push('No carts allowed');

    return parts.length > 0 ? parts.join(', ') : null;
  }, [state.target.constraints]);

  // Check if trading is enabled
  const tradingEnabled = useMemo(() => {
    if (state.mode === 'free') return true;
    return currentLevel?.tradingEnabled || false;
  }, [state.mode, currentLevel]);

  // Build mode running total
  const buildRunningTotal = useMemo(() => {
    if (state.mode !== 'build') return 0;
    return calculateBuildTotal(state.answerZone);
  }, [state.mode, state.answerZone]);

  // Build mode progress
  const buildProgress = useMemo(() => {
    if (state.mode !== 'build') return { current: 0, total: 0 };
    const challenges = getFlatBuildChallenges();
    return {
      current: state.buildLevelIndex + 1,
      total: challenges.length,
    };
  }, [state.mode, state.buildLevelIndex]);

  // ==========================================
  // Render
  // ==========================================

  return (
    <div className="app no-select">
      <header className="app-header">
        <div className="header-left">
          <ModeSelector mode={state.mode} onModeChange={handleModeChange} />
          {state.mode === 'challenge' && currentLevel && (
            <TargetPanel
              promptText={state.target.text}
              constraints={constraintsText}
              currentPrompt={flatPromptIndex}
              totalPrompts={totalPrompts}
              levelName={currentLevel.name}
              onSkip={handleSkipClick}
            />
          )}
          {state.mode === 'free' && (
            <div className="free-play-prompt">
              <p className="free-play-text">{state.target.text}</p>
            </div>
          )}
          {state.mode === 'build' && (
            <div className="build-mode-prompt">
              <p className="build-mode-text">{state.target.text}</p>
              <span className="build-progress">
                {buildProgress.current} / {buildProgress.total}
              </span>
            </div>
          )}
        </div>
        <div className="header-right">
          {state.mode === 'build' && (
            <button
              className="settings-toggle"
              onClick={handleToggleRunningTotal}
              title="Toggle running total"
              aria-label="Toggle running total display"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </button>
          )}
          <Shelf
            bags={state.shelf.bags}
            carts={state.shelf.carts}
            bundles={state.shelf.bundles}
            tradingEnabled={tradingEnabled}
            onCombine={handleCombine}
            onSkipCount={handleSkipCount}
          />
        </div>
      </header>

      <main className="app-main">
        {state.mode === 'build' ? (
          <BuildPlayArea
            resources={state.buildResources}
            answerZone={state.answerZone}
            target={state.buildTarget}
            showRunningTotal={state.showRunningTotal}
            runningTotal={buildRunningTotal}
            onDragToAnswer={handleBuildDragToAnswer}
            onDragFromAnswer={handleBuildDragFromAnswer}
          />
        ) : (
          <PlayArea
            balls={state.balls}
            containers={state.containers}
            dragState={{
              dragging: state.ui.dragging !== null,
              ball: state.ui.dragging?.ball,
              position: state.ui.dragPos,
            }}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
          />
        )}
      </main>

      <footer className="app-footer">
        <ControlBar
          onHint={handleHint}
          onUndo={handleUndo}
          onCheck={state.mode === 'build' ? handleBuildCheck : handleCheck}
          hintDisabled={state.mode === 'build'}
          undoDisabled={state.mode === 'build' || state.history.length === 0}
          checkDisabled={false}
        />
        {state.mode === 'build' ? (
          <CountingDisplay
            carts={state.answerZone.carts.length}
            bags={state.answerZone.bags.length}
            singles={state.answerZone.balls.length}
            total={buildRunningTotal}
            visible={state.ui.showTotals || state.showRunningTotal}
          />
        ) : (
          <CountingDisplay
            carts={state.shelf.carts}
            bags={state.shelf.bags}
            singles={totals.singles}
            total={totals.total}
            visible={state.ui.showTotals}
          />
        )}
      </footer>

      <HintOverlay
        message={state.ui.hintMessage}
        visible={state.ui.hintActive}
        onDismiss={handleHintDismiss}
      />

      <SuccessOverlay
        isSuccess={state.ui.lastCheck === 'correct'}
        message={
          state.ui.lastCheck === 'correct'
            ? state.mode === 'build'
              ? `You built ${state.buildTarget}!`
              : `You packed exactly ${state.target.total} balls!`
            : state.ui.checkMessage || 'Keep trying!'
        }
        onNext={handleNextPrompt}
        onRetry={handleRetry}
        visible={state.ui.lastCheck !== null}
      />

      <ParentGate
        visible={showSkipGate}
        onSuccess={handleSkipSuccess}
        onCancel={handleSkipCancel}
      />
    </div>
  );
}

export default App;
