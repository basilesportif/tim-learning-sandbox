/**
 * Level configuration for the count-grouping game
 *
 * Level progression:
 * - Level 1: Bags only (groups of 5)
 * - Level 2: Carts only (groups of 10)
 * - Level 3: Both containers, no trading
 * - Level 4: Trading enabled (combine 2 bags into 1 cart)
 * - Level 5: Constraints (min/max containers)
 */

export const LEVELS = [
  // ===================
  // LEVEL 1: Bags Only
  // ===================
  {
    id: 'level-1',
    name: 'Level 1: Bags of 5',
    containers: { bag: true, cart: false },
    tradingEnabled: false,
    showTotals: 'on-check',
    prompts: [
      {
        id: 'L1-1',
        text: 'Pack 10 soccer balls using bags of 5',
        total: 10,
        sport: 'soccer',
        constraints: { noCarts: true },
        hint: 'Each bag holds 5 balls. How many bags do you need for 10 balls?',
        initialBundles: null,
      },
      {
        id: 'L1-2',
        text: 'Pack 15 basketballs using bags of 5',
        total: 15,
        sport: 'basketball',
        constraints: { noCarts: true },
        hint: '15 divided by 5 equals how many bags?',
        initialBundles: null,
      },
      {
        id: 'L1-3',
        text: 'Pack 20 soccer balls using bags of 5',
        total: 20,
        sport: 'soccer',
        constraints: { noCarts: true },
        hint: 'Count by 5s: 5, 10, 15, 20. That\'s 4 bags!',
        initialBundles: null,
      },
      {
        id: 'L1-4',
        text: 'Coach wants 25 basketballs. Use bags of 5',
        total: 25,
        sport: 'basketball',
        constraints: { noCarts: true },
        hint: '25 balls, 5 per bag. How many groups of 5?',
        initialBundles: null,
      },
      {
        id: 'L1-5',
        text: 'Pack 30 soccer balls. Bags of 5 only',
        total: 30,
        sport: 'soccer',
        constraints: { noCarts: true },
        hint: '30 = 6 groups of 5. You need 6 bags!',
        initialBundles: null,
      },
    ],
  },

  // ====================
  // LEVEL 2: Carts Only
  // ====================
  {
    id: 'level-2',
    name: 'Level 2: Carts of 10',
    containers: { bag: false, cart: true },
    tradingEnabled: false,
    showTotals: 'on-check',
    prompts: [
      {
        id: 'L2-6',
        text: 'Pack 20 soccer balls using carts of 10',
        total: 20,
        sport: 'soccer',
        constraints: { noBags: true },
        hint: 'Each cart holds 10 balls. 20 = 2 carts!',
        initialBundles: null,
      },
      {
        id: 'L2-7',
        text: 'Pack 30 basketballs using carts of 10',
        total: 30,
        sport: 'basketball',
        constraints: { noBags: true },
        hint: '30 divided by 10 = 3 carts',
        initialBundles: null,
      },
      {
        id: 'L2-8',
        text: 'Pack 40 soccer balls using carts of 10',
        total: 40,
        sport: 'soccer',
        constraints: { noBags: true },
        hint: 'Count by 10s: 10, 20, 30, 40. That\'s 4 carts!',
        initialBundles: null,
      },
      {
        id: 'L2-9',
        text: 'Big practice: pack 60 basketballs using carts of 10',
        total: 60,
        sport: 'basketball',
        constraints: { noBags: true },
        hint: '60 balls, 10 per cart = 6 carts',
        initialBundles: null,
      },
    ],
  },

  // ================================
  // LEVEL 3: Both, No Trading
  // ================================
  {
    id: 'level-3',
    name: 'Level 3: Bags and Carts',
    containers: { bag: true, cart: true },
    tradingEnabled: false,
    showTotals: 'on-check',
    prompts: [
      {
        id: 'L3-10',
        text: 'Pack 27 soccer balls using bags and carts',
        total: 27,
        sport: 'soccer',
        constraints: null,
        hint: '27 = 20 + 5 + 2. Use 2 carts, 1 bag, and 2 singles!',
        initialBundles: null,
      },
      {
        id: 'L3-11',
        text: 'Pack 34 basketballs',
        total: 34,
        sport: 'basketball',
        constraints: null,
        hint: '34 = 30 + 4. That\'s 3 carts and 4 singles!',
        initialBundles: null,
      },
      {
        id: 'L3-12',
        text: 'Pack 45 soccer balls',
        total: 45,
        sport: 'soccer',
        constraints: null,
        hint: '45 = 40 + 5. Use 4 carts and 1 bag!',
        initialBundles: null,
      },
      {
        id: 'L3-13',
        text: 'Pack 58 basketballs',
        total: 58,
        sport: 'basketball',
        constraints: null,
        hint: '58 = 50 + 5 + 3. That\'s 5 carts, 1 bag, and 3 singles!',
        initialBundles: null,
      },
      {
        id: 'L3-14',
        text: 'Pack 63 soccer balls',
        total: 63,
        sport: 'soccer',
        constraints: null,
        hint: '63 = 60 + 3. Use 6 carts and 3 singles!',
        initialBundles: null,
      },
    ],
  },

  // ================================
  // LEVEL 4: Trading Enabled
  // ================================
  {
    id: 'level-4',
    name: 'Level 4: Trading',
    containers: { bag: true, cart: true },
    tradingEnabled: true,
    showTotals: 'on-check',
    prompts: [
      {
        id: 'L4-15',
        text: 'Pack 50 basketballs. Try filling bags first!',
        total: 50,
        sport: 'basketball',
        constraints: null,
        hint: 'Fill 2 bags of 5, then combine them into a cart of 10!',
        initialBundles: null,
        scripted: {
          unlockContainerAfterMs: { cart: 3000 },
        },
      },
      {
        id: 'L4-16',
        text: 'You have 2 bags already. Combine them into a cart!',
        total: 10,
        sport: 'soccer',
        constraints: null,
        hint: 'Drag one bag onto another to combine them into a cart!',
        initialBundles: [
          { type: 'bag', balls: 5, sport: 'soccer' },
          { type: 'bag', balls: 5, sport: 'soccer' },
        ],
      },
      {
        id: 'L4-17',
        text: 'Pack 70 soccer balls with trading',
        total: 70,
        sport: 'soccer',
        constraints: null,
        hint: '70 = 7 carts of 10. Fill bags and combine them!',
        initialBundles: null,
      },
      {
        id: 'L4-18',
        text: 'Pack 96 basketballs with trading',
        total: 96,
        sport: 'basketball',
        constraints: null,
        hint: '96 = 90 + 6 = 9 carts + 1 bag + 1 single',
        initialBundles: null,
      },
    ],
  },

  // ================================
  // LEVEL 5: Constraints
  // ================================
  {
    id: 'level-5',
    name: 'Level 5: Challenges',
    containers: { bag: true, cart: true },
    tradingEnabled: true,
    showTotals: 'on-check',
    prompts: [
      {
        id: 'L5-19',
        text: 'Pack 85 soccer balls using at least 8 carts',
        total: 85,
        sport: 'soccer',
        constraints: { minCarts: 8 },
        hint: '85 = 80 + 5. Use 8 carts and 1 bag!',
        initialBundles: null,
      },
      {
        id: 'L5-20',
        text: 'Pack 92 basketballs using no more than 1 bag',
        total: 92,
        sport: 'basketball',
        constraints: { maxBags: 1 },
        hint: '92 = 90 + 2. Use 9 carts and 2 singles (no bags needed)!',
        initialBundles: null,
      },
    ],
  },
];

/**
 * Get a level by its ID
 * @param {string} levelId
 * @returns {object | undefined}
 */
export function getLevelById(levelId) {
  return LEVELS.find((level) => level.id === levelId);
}

/**
 * Get a level by index (0-based)
 * @param {number} levelIndex
 * @returns {object | null}
 */
export function getLevel(levelIndex) {
  return LEVELS[levelIndex] || null;
}

/**
 * Get a prompt by its ID across all levels
 * @param {string} promptId
 * @returns {{ level: object, prompt: object } | null}
 */
export function getPromptById(promptId) {
  for (const level of LEVELS) {
    const prompt = level.prompts.find((p) => p.id === promptId);
    if (prompt) {
      return { level, prompt };
    }
  }
  return null;
}

/**
 * Get prompt by level and prompt index
 * @param {number} levelIndex
 * @param {number} promptIndex
 * @returns {object | null}
 */
export function getPrompt(levelIndex, promptIndex) {
  const level = LEVELS[levelIndex];
  if (!level) return null;
  return level.prompts[promptIndex] || null;
}

/**
 * Get the next prompt after the current one
 * @param {string} currentPromptId
 * @returns {{ level: object, prompt: object } | null}
 */
export function getNextPrompt(currentPromptId) {
  let foundCurrent = false;

  for (const level of LEVELS) {
    for (let i = 0; i < level.prompts.length; i++) {
      if (foundCurrent) {
        return { level, prompt: level.prompts[i] };
      }
      if (level.prompts[i].id === currentPromptId) {
        // Check if there's another prompt in this level
        if (i + 1 < level.prompts.length) {
          return { level, prompt: level.prompts[i + 1] };
        }
        foundCurrent = true;
      }
    }
  }

  // Check if there's a next level
  if (foundCurrent) {
    return null; // No more prompts, game complete
  }

  return null;
}

/**
 * Get the first prompt of a level
 * @param {string} levelId
 * @returns {{ level: object, prompt: object } | null}
 */
export function getFirstPromptOfLevel(levelId) {
  const level = getLevelById(levelId);
  if (!level || level.prompts.length === 0) {
    return null;
  }
  return { level, prompt: level.prompts[0] };
}

/**
 * Get total number of prompts across all levels
 * @returns {number}
 */
export function getTotalPromptCount() {
  return LEVELS.reduce((sum, level) => sum + level.prompts.length, 0);
}

/**
 * Alias for getTotalPromptCount for compatibility
 * @returns {number}
 */
export function getTotalPrompts() {
  return getTotalPromptCount();
}

/**
 * Get the index (1-based) of a prompt across all levels
 * @param {string} promptId
 * @returns {number} - 1-based index, or 0 if not found
 */
export function getPromptIndex(promptId) {
  let index = 0;
  for (const level of LEVELS) {
    for (const prompt of level.prompts) {
      index++;
      if (prompt.id === promptId) {
        return index;
      }
    }
  }
  return 0;
}

/**
 * Get flat index of a prompt (for progress tracking)
 * @param {number} levelIndex
 * @param {number} promptIndex
 * @returns {number}
 */
export function getFlatPromptIndex(levelIndex, promptIndex) {
  let index = 0;
  for (let i = 0; i < levelIndex; i++) {
    index += LEVELS[i].prompts.length;
  }
  return index + promptIndex;
}

/**
 * Check if a prompt is the last one in the game
 * @param {string} promptId
 * @returns {boolean}
 */
export function isLastPrompt(promptId) {
  return getNextPrompt(promptId) === null;
}

/**
 * Get all prompts as a flat array
 * @returns {Array<{ level: object, prompt: object }>}
 */
export function getAllPrompts() {
  const result = [];
  for (const level of LEVELS) {
    for (const prompt of level.prompts) {
      result.push({ level, prompt });
    }
  }
  return result;
}

/**
 * BUILD LEVELS - "Build Numbers" challenge mode
 *
 * Players are given a target number and limited resources.
 * They must build the number using the available carts, bags, and balls.
 *
 * Level progression:
 * - Level 1: Carts + loose balls only
 * - Level 2: Bags + loose balls only
 * - Level 3: Carts + bags + loose balls
 * - Level 4: Constraints (specific decomposition required)
 */
export const BUILD_LEVELS = [
  // ===================================
  // LEVEL 1: Carts + Loose Balls Only
  // ===================================
  {
    id: 'build-level-1',
    name: 'Level 1: Carts and Singles',
    challenges: [
      {
        target: 23,
        prompt: 'Build 23',
        resources: { carts: 4, bags: 0, balls: 15 },
        requireSpecific: false,
      },
      {
        target: 47,
        prompt: 'Build 47',
        resources: { carts: 6, bags: 0, balls: 12 },
        requireSpecific: false,
      },
      {
        target: 61,
        prompt: 'Build 61',
        resources: { carts: 8, bags: 0, balls: 10 },
        requireSpecific: false,
      },
      {
        target: 35,
        prompt: 'Build 35',
        resources: { carts: 5, bags: 0, balls: 10 },
        requireSpecific: false,
      },
      {
        target: 19,
        prompt: 'Build 19',
        resources: { carts: 3, bags: 0, balls: 15 },
        requireSpecific: false,
      },
    ],
  },

  // ===================================
  // LEVEL 2: Bags + Loose Balls Only
  // ===================================
  {
    id: 'build-level-2',
    name: 'Level 2: Bags and Singles',
    challenges: [
      {
        target: 17,
        prompt: 'Build 17',
        resources: { carts: 0, bags: 5, balls: 10 },
        requireSpecific: false,
      },
      {
        target: 33,
        prompt: 'Build 33',
        resources: { carts: 0, bags: 8, balls: 8 },
        requireSpecific: false,
      },
      {
        target: 28,
        prompt: 'Build 28',
        resources: { carts: 0, bags: 7, balls: 10 },
        requireSpecific: false,
      },
      {
        target: 12,
        prompt: 'Build 12',
        resources: { carts: 0, bags: 4, balls: 8 },
        requireSpecific: false,
      },
      {
        target: 24,
        prompt: 'Build 24',
        resources: { carts: 0, bags: 6, balls: 10 },
        requireSpecific: false,
      },
    ],
  },

  // ==========================================
  // LEVEL 3: Carts + Bags + Loose Balls
  // ==========================================
  {
    id: 'build-level-3',
    name: 'Level 3: All Containers',
    challenges: [
      {
        target: 52,
        prompt: 'Build 52',
        resources: { carts: 6, bags: 4, balls: 12 },
        requireSpecific: false,
      },
      {
        target: 66,
        prompt: 'Build 66',
        resources: { carts: 8, bags: 5, balls: 10 },
        requireSpecific: false,
      },
      {
        target: 89,
        prompt: 'Build 89',
        resources: { carts: 10, bags: 6, balls: 12 },
        requireSpecific: false,
      },
      {
        target: 43,
        prompt: 'Build 43',
        resources: { carts: 5, bags: 3, balls: 8 },
        requireSpecific: { carts: 4, bags: 0, balls: 3 },
      },
      {
        target: 77,
        prompt: 'Build 77',
        resources: { carts: 9, bags: 5, balls: 10 },
        requireSpecific: false,
      },
    ],
  },

  // ===================================
  // LEVEL 4: Constraints
  // ===================================
  {
    id: 'build-level-4',
    name: 'Level 4: Constraints',
    challenges: [
      {
        target: 27,
        prompt: 'Build 27 using exactly 2 carts',
        resources: { carts: 4, bags: 3, balls: 10 },
        requireSpecific: { carts: 2, bags: 1, balls: 2 },
      },
      {
        target: 45,
        prompt: 'Build 45 using exactly 4 carts',
        resources: { carts: 6, bags: 4, balls: 10 },
        requireSpecific: { carts: 4, bags: 1, balls: 0 },
      },
      {
        target: 38,
        prompt: 'Build 38 using exactly 3 bags',
        resources: { carts: 5, bags: 5, balls: 10 },
        requireSpecific: { carts: 2, bags: 3, balls: 3 },
      },
      {
        target: 56,
        prompt: 'Build 56 with no bags',
        resources: { carts: 7, bags: 0, balls: 10 },
        requireSpecific: { carts: 5, bags: 0, balls: 6 },
      },
      {
        target: 73,
        prompt: 'Build 73 using exactly 7 carts',
        resources: { carts: 9, bags: 4, balls: 8 },
        requireSpecific: { carts: 7, bags: 0, balls: 3 },
      },
    ],
  },
];

export default LEVELS;
