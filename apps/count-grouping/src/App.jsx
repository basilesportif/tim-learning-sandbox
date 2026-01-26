import { useReducer, useCallback, useEffect, useRef, useMemo } from 'react';

// Components
import ModeSelector from './components/ModeSelector';
import TargetPanel from './components/TargetPanel';
import PlayArea from './components/PlayArea';
import Shelf from './components/Shelf';
import ControlBar from './components/ControlBar';
import CountingDisplay from './components/CountingDisplay';
import HintOverlay from './components/HintOverlay';
import SuccessOverlay from './components/SuccessOverlay';

// Utils and data
import { LEVELS, getLevel, getPrompt, getTotalPrompts, getFlatPromptIndex } from './lib/levelData';
import { createBallPile, getTotals, evaluateConstraints } from './lib/gameUtils';
import { BAG_CAPACITY, CART_CAPACITY, MAX_HISTORY } from './lib/constants';

import './App.css';

// ==========================================
// Initial State
// ==========================================

const createInitialState = () => ({
  mode: 'challenge', // 'free' | 'challenge'
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

  // Create ball pile
  const balls = createBallPile({
    total: prompt.total,
    sport: prompt.sport,
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

      // Check total matches (all balls should be packed)
      const looseBalls = state.balls.filter((b) => b.status === 'loose').length;
      const inContainerBalls = state.containers.bag.balls.length + state.containers.cart.balls.length;

      // Success requires: no loose balls, no balls in containers (all bundled), and constraints satisfied
      const isSuccess = looseBalls === 0 && inContainerBalls === 0 && result.ok;

      return {
        ...state,
        ui: {
          ...state.ui,
          showTotals: true,
          lastCheck: isSuccess ? 'correct' : 'incorrect',
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

    default:
      return state;
  }
}

// ==========================================
// App Component
// ==========================================

function App() {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
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

  // Initialize game on mount
  useEffect(() => {
    dispatch({ type: ActionTypes.INIT_MODE, payload: { mode: 'challenge' } });
  }, []);

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
    dispatch({ type: ActionTypes.NEXT_PROMPT });
  }, []);

  const handleRetry = useCallback(() => {
    dispatch({ type: ActionTypes.DISMISS_SUCCESS });
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
            />
          )}
          {state.mode === 'free' && (
            <div className="free-play-prompt">
              <p className="free-play-text">{state.target.text}</p>
            </div>
          )}
        </div>
        <div className="header-right">
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
      </main>

      <footer className="app-footer">
        <ControlBar
          onHint={handleHint}
          onUndo={handleUndo}
          onCheck={handleCheck}
          hintDisabled={false}
          undoDisabled={state.history.length === 0}
          checkDisabled={false}
        />
        <CountingDisplay
          carts={state.shelf.carts}
          bags={state.shelf.bags}
          singles={totals.singles}
          total={totals.total}
          visible={state.ui.showTotals}
        />
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
            ? 'You packed all the balls!'
            : 'Keep trying! Make sure all balls are in bags or carts.'
        }
        onNext={handleNextPrompt}
        onRetry={handleRetry}
        visible={state.ui.lastCheck !== null}
      />
    </div>
  );
}

export default App;
